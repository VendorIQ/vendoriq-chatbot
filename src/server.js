require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// Optional: local tessdata for native Tesseract or tesseract.js langPath
const TESSDATA_DIR = path.join(__dirname, "tessdata");
if (fs.existsSync(TESSDATA_DIR)) {
  process.env.TESSDATA_PREFIX = TESSDATA_DIR; // used by native tesseract (CLI)
}
const TESS_OPTS = fs.existsSync(TESSDATA_DIR) ? { langPath: TESSDATA_DIR } : {};

const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
// Optional-safe import: server won't crash if mammoth is missing
let mammoth;
try {
  mammoth = require("mammoth");
} catch (e) {
  console.warn(
    "⚠️ 'mammoth' not installed; .docx files will return empty text. Run: npm i mammoth",
  );
}
// ==== i18n tokenization + coverage helpers (multilingual, Thai-aware) ====

// Map UI values (e.g., "Thai") to Tesseract/lang codes we use consistently
const LANG_MAP = {
  en: "eng",
  eng: "eng",
  english: "eng",
  id: "ind",
  ind: "ind",
  indonesia: "ind",
  indonesian: "ind",
  th: "tha",
  tha: "tha",
  thai: "tha",
  ไทย: "tha",
  vi: "vie",
  vie: "vie",
  vietnamese: "vie",
  // add more if needed
};
function resolveLang(ocrLang) {
  if (!ocrLang) return { ui: "en", tess: "eng" };
  const key = String(ocrLang).toLowerCase();
  for (const k of [key, key.slice(0, 2)]) {
    if (LANG_MAP[k]) return { ui: k, tess: LANG_MAP[k] };
  }
  // fall back to English safely
  return { ui: "en", tess: LANG_MAP.en };
}
const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tif",
  "tiff",
]);
// Script sniffers (cheap)
const hasLatin = (s) => /[A-Za-z]/.test(String(s || ""));
const hasThai = (s) => /[\u0E00-\u0E7F]/.test(String(s || ""));

// Word segmenter (uses ICU in Node; falls back to regex)
function segmenterFor(locale) {
  try {
    return new Intl.Segmenter(locale || "en", { granularity: "word" });
  } catch {
    return null;
  }
}

function tokenize(text, localeHint) {
  const s = String(text || "");
  const seg = segmenterFor(localeHint);
  if (seg) {
    const out = [];
    for (const it of seg.segment(s)) {
      if (!it.isWordLike) continue;
      const w = it.segment.toLowerCase().trim();
      if (w) out.push(w);
    }
    if (out.length) return out;
  }
  // Unicode-safe fallback
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const STOP_EN = new Set([
  "the",
  "and",
  "of",
  "for",
  "to",
  "a",
  "an",
  "in",
  "on",
  "by",
  "with",
  "at",
  "as",
  "is",
  "are",
  "be",
  "this",
  "that",
]);
const STOP_ID = new Set([
  "dan",
  "yang",
  "untuk",
  "dengan",
  "pada",
  "ini",
  "itu",
  "di",
  "ke",
  "dari",
]);
const STOP_TH = new Set([
  "และ",
  "ของ",
  "ได้",
  "ใน",
  "ที่",
  "ด้วย",
  "เป็น",
  "มี",
  "ให้",
  "การ",
  "ว่า",
  "ซึ่ง",
]); // small set

function stopFilter(lang, token) {
  const t = token.trim();
  if (t.length <= 1) return false;
  if (lang === "th") return !STOP_TH.has(t);
  if (lang === "id") return !STOP_ID.has(t) && !STOP_EN.has(t);
  return !STOP_EN.has(t);
}

// Minimal bilingual synonym packs (bridge English labels ↔ Thai docs)
const SYN_EN = {
  policy: ["procedure", "sop", "standard", "guideline"],
  communicate: [
    "communication",
    "announce",
    "notice",
    "email",
    "board",
    "induction",
    "briefing",
    "training",
    "orientation",
  ],
  training: ["induction", "briefing", "orientation", "sosialisasi"],
};
const SYN_TH = {
  policy: ["นโยบาย", "ความปลอดภัย", "อาชีวอนามัย", "สภาพแวดล้อม"],
  communicate: [
    "สื่อสาร",
    "ประชาสัมพันธ์",
    "ประกาศ",
    "แจ้ง",
    "ป้ายประกาศ",
    "บอร์ด",
    "อีเมล",
    "ปฐมนิเทศ",
    "อบรม",
    "ฝึกอบรม",
  ],
  training: ["อบรม", "ฝึกอบรม", "ปฐมนิเทศ", "ชี้แจง"],
};

function expandLabelTokens(label, effectiveLang) {
  // tokens from the label itself
  const base = tokenize(label, effectiveLang).filter((t) =>
    stopFilter(effectiveLang, t),
  );
  const extra = [];
  for (const t of base) {
    if (SYN_EN[t]) extra.push(...SYN_EN[t]);
    if (SYN_TH[t]) extra.push(...SYN_TH[t]);
  }
  // also map a few key English stems to Thai synonyms when language is Thai
  if (effectiveLang === "th") {
    if (base.includes("policy")) extra.push(...SYN_TH.policy);
    if (base.includes("communicate") || base.includes("communication"))
      extra.push(...SYN_TH.communicate);
    if (base.includes("training")) extra.push(...SYN_TH.training);
  }
  return Array.from(new Set([...base, ...extra]));
}

function coverage(label, text, effectiveLang) {
  const K = expandLabelTokens(label, effectiveLang);
  if (!K.length) return { score: 0, hits: [] };
  const T = new Set(
    tokenize(text, effectiveLang).filter((t) => stopFilter(effectiveLang, t)),
  );
  const hits = K.filter((k) => T.has(k));
  return { score: hits.length / K.length, hits };
}

// >>> INSERT START (shared concept helpers go right here) >>>
//
// ==== Concept dictionaries & helpers (shared) ====
// used by /validate and /process so scoring stays consistent and synonym-aware
const POLICY_TH = ["นโยบาย", "อาชีวอนามัย", "ความปลอดภัย", "สภาพแวดล้อม"];
const COMM_TH = [
  "สื่อสาร",
  "ประชาสัมพันธ์",
  "ประกาศ",
  "แจ้ง",
  "ป้ายประกาศ",
  "บอร์ด",
  "อีเมล",
  "ปฐมนิเทศ",
  "อบรม",
  "ฝึกอบรม",
];
const POLICY_EN = ["policy", "ohs", "occupational", "health", "safety"];
const COMM_EN = [
  "communicate",
  "communication",
  "announced",
  "announce",
  "notice",
  "email",
  "board",
  "training",
  "induction",
  "orientation",
  "briefing",
];

function labelConcept(label) {
  const s = String(label || "").toLowerCase();
  if (
    /(communicat|notice|email|training|induction|orientation|briefing|board)/.test(
      s,
    )
  )
    return "policy_comms";
  if (/policy/.test(s)) return "policy_doc";
  return "generic";
}

function conceptHits(text, lang) {
  const bag = new Set(tokenize(text, lang).filter((t) => stopFilter(lang, t)));
  const got = (arr) => arr.some((w) => bag.has(w));
  const evid = (arr) => arr.filter((w) => bag.has(w));
  const hasPolicy = got(POLICY_TH) || got(POLICY_EN);
  const hasComms = got(COMM_TH) || got(COMM_EN);
  const evidence = [
    ...evid(POLICY_TH),
    ...evid(COMM_TH),
    ...evid(POLICY_EN),
    ...evid(COMM_EN),
  ].slice(0, 8);
  return { hasPolicy, hasComms, evidence };
}
// <<< INSERT END (shared concept helpers go right here) <<<
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");

const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const Redis = require("ioredis");

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
// --- CORS (must be before routes) ---
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || "https://vendoriq-chatbot.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.DEV_EXTRA_ORIGIN || "",
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman
    let ok = allowedOrigins.includes(origin);
    if (!ok) {
      try {
        ok = /\.vercel\.app$/i.test(new URL(origin).hostname);
      } catch {
        ok = false;
      }
    }
    if (!ok) console.warn("CORS blocked origin:", origin);
    cb(null, ok);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: false,
  // allow common client/supabase headers; adjust if you prefer reflection
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Client-Info",
    "apikey",
    "Range",
  ],
  exposedHeaders: ["Content-Range", "Range"],
};

app.set("trust proxy", true); // trust first proxy chain; needed for correct IPs behind CDNs/LBs
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "1mb" })); // keep under control for long explanations

// === Shared rate-limit store (Redis) ===
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});
redis.on("error", (err) => console.error("Redis error:", err));

const sharedStore = new RedisStore({
  sendCommand: (...args) => redis.call(...args),
});

// === Rate limiters ===

// heavy AI endpoints: 30 req/min per IP
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  store: sharedStore, // shared Redis store
  keyGenerator: (req) => {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) {
      return (
        "u:" +
        crypto
          .createHash("sha256")
          .update(auth.slice(7))
          .digest("hex")
          .slice(0, 16)
      );
    }
    return "ip:" + (req.ip || req.connection?.remoteAddress || "0.0.0.0");
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please slow down and try again shortly.",
  },
});

// login key: IP + username/email
function loginKey(req) {
  const ip = req.ip || req.connection?.remoteAddress || "0.0.0.0";
  const u = (req.body?.username || req.body?.email || "")
    .toString()
    .trim()
    .toLowerCase();
  return u ? `${ip}:${u}` : ip;
}

// 10 attempts / 15 mins
const loginBurstLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginKey,
  store: sharedStore,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  handler: (req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: "Too many login attempts. Please wait and try again.",
    });
  },
});

// 50 attempts / 24h
const loginDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginKey,
  store: sharedStore,
  message: { error: "Too many login attempts today. Try again tomorrow." },
});

const fetch =
  typeof globalThis.fetch === "function"
    ? (...args) => globalThis.fetch(...args)
    : (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
// ===== Backoffice auth (admin or auditor) via Supabase profiles.role =====
const AUDITOR_JWT_SECRET =
  process.env.AUDITOR_JWT_SECRET ||
  process.env.ADMIN_JWT_SECRET ||
  "change_me_auditor";

function verifyWithAnySecret(token) {
  const secrets = [process.env.ADMIN_JWT_SECRET, AUDITOR_JWT_SECRET].filter(
    Boolean,
  );
  for (const s of secrets) {
    try {
      return jwt.verify(token, s);
    } catch (_) {}
  }
  return null;
}

/**
 * Accepts:
 * 1) Legacy app tokens (signed with ADMIN_JWT_SECRET/AUDITOR_JWT_SECRET) containing { role }
 * 2) Supabase Auth access tokens (from the frontend). We validate them and read role from profiles.
 */
function requireRole(roles = ["admin"]) {
  return async (req, res, next) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Missing token" });

      // 1) Try legacy app token first (keeps your current admin login working)
      const legacy = verifyWithAnySecret(token);
      if (legacy && roles.includes(legacy.role)) {
        req.user = legacy;
        return next();
      }

      // 2) Fallback to Supabase Auth token: validate and look up profiles.role
      const { data: u, error: uErr } = await supabase.auth.getUser(token);
      if (uErr || !u?.user)
        return res.status(401).json({ error: "Invalid Supabase token" });

      const uid = u.user.id;
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id,email,role")
        .eq("id", uid)
        .single();

      if (pErr || !prof)
        return res.status(403).json({ error: "Profile not found" });
      if (!roles.includes(prof.role))
        return res.status(403).json({ error: "Forbidden" });

      req.user = { id: prof.id, email: prof.email, role: prof.role };
      return next();
    } catch (e) {
      return res.status(401).json({ error: "Auth error" });
    }
  };
}

// Auditors need to view user-uploaded docs → signed URLs from storage
async function signFile(storagePath) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from("uploads")
      .createSignedUrl(storagePath, 60 * 60);
    if (error) return null;
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

// ===== Backoffice auth (admin or auditor) + signed URL helper =====
// Admin creds (server-only)
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "change_me_please";
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD must be set in the environment.");
}

// helpers
function signAdminToken() {
  // short-lived (e.g., 2 hours)
  return jwt.sign({ role: "admin" }, ADMIN_JWT_SECRET, { expiresIn: "2h" });
}

function requireAdmin(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : "";
    const payload = jwt.verify(token, ADMIN_JWT_SECRET);
    if (payload?.role !== "admin") throw new Error("not admin");
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ---------- Setup ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY, // fallback if you haven't renamed yet
);
if (!process.env.SUPABASE_SERVICE_ROLE) {
  console.warn(
    "⚠️ SUPABASE_SERVICE_ROLE not set – using SUPABASE_KEY. For server code, prefer the service role key.",
  );
}
// ─── Supabase user-only auth helpers ───────────────────────────────────────────
async function getSupabaseUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const { data: u, error } = await supabase.auth.getUser(token);
  if (error || !u?.user) return null;
  return u.user; // { id, email, ... }
}

function emailsEqual(a, b) {
  return (
    String(a || "")
      .trim()
      .toLowerCase() ===
    String(b || "")
      .trim()
      .toLowerCase()
  );
}

/**
 * requireUser():
 * - Accepts ONLY a Supabase access token (no legacy JWTs).
 * - Optionally matches any provided email (body or query) to token email.
 * - Canonicalizes req.body.email / req.query.email to token email to avoid spoofing.
 */
function requireUser({ matchEmail = true } = {}) {
  return async (req, res, next) => {
    try {
      const user = await getSupabaseUserFromAuthHeader(req);
      if (!user)
        return res.status(401).json({ error: "Supabase token required" });

      req.authUser = user; // use this in handlers

      if (matchEmail) {
        const supplied = req.body?.email ?? req.query?.email;
        if (supplied && !emailsEqual(supplied, user.email)) {
          return res.status(403).json({ error: "Forbidden: email mismatch" });
        }
        // Canonicalize so downstream code is safe
        if (req.body) req.body.email = user.email;
        if (req.query) req.query.email = user.email;
      }
      next();
    } catch (_) {
      res.status(401).json({ error: "Auth error" });
    }
  };
}

// Ensure tmp dir exists for multer + temp files
if (!fs.existsSync("tmp")) fs.mkdirSync("tmp", { recursive: true });
// --- Upload hardening helpers (TOP-LEVEL, not inside any function) ---
const SAFE_MIMES = new Map(
  Object.entries({
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
  }),
);

function sanitizeFilename(name) {
  const base = path.basename(String(name || ""));
  let clean = base
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  clean = clean.replace(/[^A-Za-z0-9._ -]/g, "");
  if (!clean || clean.startsWith(".")) clean = "upload";
  if (clean.length > 120) clean = clean.slice(-120);
  return clean;
}

async function sniffFileMagic(filePath) {
  const { fileTypeFromFile } = await import("file-type");
  try {
    const res = await fileTypeFromFile(filePath);
    return res ? res.mime : null;
  } catch {
    return null;
  }
}

function mimeAllowedByExt(ext, mime) {
  const expect = SAFE_MIMES.get(ext);
  if (!expect) return false;
  return mime ? mime.toLowerCase().startsWith(expect.toLowerCase()) : true;
}

const upload = multer({
  dest: "tmp",
  limits: { fileSize: 15 * 1024 * 1024, fields: 30 },
  fileFilter: (_req, file, cb) => {
    // basic extension gate first
    const safeName = sanitizeFilename(file.originalname);
    const ext = (safeName.split(".").pop() || "").toLowerCase();
    const okExt = /\.(pdf|docx|txt|png|jpe?g|webp|tiff?)$/i.test(safeName);
    if (!okExt || !SAFE_MIMES.has(ext)) {
      return cb(new Error("Unsupported file type"), false);
    }
    // pass; we will **also** sniff magic bytes after write (route-level)
    cb(null, true);
  },
});

// ---------- Embedded Questions & Scoring ----------
const questionData = [
  {
    number: 1,
    text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    scoring: {
      stretch:
        "Policy includes beyond-compliance elements, communicated widely including external partners.",
      commitment:
        "Policy is approved and communicated effectively to internal staff.",
      robust: "Policy exists and is approved, but limited communication.",
      warning: "Policy exists but is outdated or lacks clear communication.",
      offtrack: "No written policy or evidence of communication.",
    },
  },
  {
    number: 2,
    text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
    scoring: {
      stretch:
        "No infringements, with proactive legal tracking and transparent processes.",
      commitment:
        "No infringements and system for monitoring legal compliance exists.",
      robust: "No major infringements, basic legal compliance process.",
      warning: "Past issues with weak documentation.",
      offtrack: "Current investigations or multiple recent breaches.",
    },
  },
  {
    number: 3,
    text: "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
    scoring: {
      stretch:
        "Digital system integrated with real-time reporting and thorough root cause analysis.",
      commitment: "Formal documented system used consistently.",
      robust: "Procedure exists but lacks consistency in use or documentation.",
      warning: "Manual or informal process, missing elements.",
      offtrack: "No structured process for reporting and investigation.",
    },
  },
];

// ---------- AI Helpers ----------
async function callGroq(
  prompt,
  systemPrompt = "You are an OHS compliance auditor.",
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30000); // 30s

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data?.error?.message ||
          data?.error ||
          JSON.stringify(data) ||
          "Groq API error",
      );
    }
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(t);
  }
}

function getScoringGuide(qNumber) {
  const q = questionData.find((q) => q.number === qNumber);
  if (!q) return "";
  return Object.entries(q.scoring)
    .map(([band, desc]) => `- ${band.toUpperCase()}: ${desc}`)
    .join("\n");
}
function getQuestionText(qNumber) {
  return questionData.find((q) => q.number === qNumber)?.text || "";
}

// ---------- Text Extraction ----------
async function extractText(localPath, originalName, ocrLang = "eng") {
  const ext = (originalName.split(".").pop() || "").toLowerCase(); // <- moved up

  if (ext === "doc") {
    console.warn(
      "Legacy .doc not supported – ask user to convert to PDF or DOCX.",
    );
    return "";
  }

  if (!fs.existsSync(localPath))
    throw new Error(`File does not exist: ${localPath}`);

  const stats = fs.statSync(localPath);
  if (stats.size === 0)
    throw new Error(`Uploaded file is empty: ${originalName}`);

  try {
    if (ext === "pdf") {
      // Try to extract text directly
      try {
        const data = await pdfParse(fs.readFileSync(localPath));
        if (data.text && data.text.trim().length > 10) {
          return data.text;
        }
      } catch {
        /* ignore */
      }

      // Fallback: OCR the first few pages by rendering to JPEG via Poppler, then Tesseract
      try {
        const ocrText = await ocrPdfFileToText(localPath, ocrLang, {
          dpi: 220,
          maxPages: 5,
        });
        if (ocrText && ocrText.length > 20) return ocrText;
      } catch {
        /* ignore */
      }

      // Still nothing
      return "";
    }

    if (IMAGE_EXTS.has(ext)) {
      try {
        const { data: t } = await Tesseract.recognize(
          localPath,
          ocrLang,
          TESS_OPTS,
        );
        return t.text || "";
      } catch {
        return "";
      }
    }
    if (ext === "txt") {
      return fs.readFileSync(localPath, "utf-8");
    }
    if (ext === "docx") {
      if (!mammoth) {
        console.warn("DOCX uploaded but 'mammoth' is not installed.");
        return "";
      }
      try {
        const { value } = await mammoth.extractRawText({ path: localPath });
        return value || "";
      } catch {
        return "";
      }
    }

    // Unsupported types: return empty
    return "";
  } catch (err) {
    return "";
  }
}

// For storage downloads (buffers): write to tmp then reuse extractText
async function extractTextFromBuffer(buf, originalName, ocrLang = "eng") {
  const safeBase =
    String(Date.now()) + "-" + sanitizeFilename(originalName || "file");
  const tmpPath = path.join("tmp", safeBase);
  fs.writeFileSync(tmpPath, buf);
  try {
    return await extractText(tmpPath, originalName, ocrLang);
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}
const { execFile } = require("child_process");
function ensurePdftoppm() {
  return new Promise((resolve) => {
    execFile("pdftoppm", ["-v"], (err) => {
      if (err)
        console.warn(
          "⚠️ pdftoppm not found. Install poppler-utils (Replit: add pkgs.poppler_utils to replit.nix).",
        );
      resolve();
    });
  });
}
ensurePdftoppm();

// Convert a PDF into images with Poppler, then OCR each image.
// Returns concatenated text. Keeps it safe/fast with caps.
async function ocrPdfFileToText(localPath, tessLang = "eng", opts = {}) {
  const dpi = opts.dpi || 200; // 200–300 is usually enough
  const maxPages = opts.maxPages || 5; // cap for prototype to avoid timeouts
  const base = path.join(
    "tmp",
    `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  // 1) Render first N pages as JPEG
  const args = [
    "-jpeg",
    "-r",
    String(dpi),
    "-f",
    "1",
    "-l",
    String(maxPages),
    localPath,
    base,
  ];
  await new Promise((resolve, reject) => {
    execFile("pdftoppm", args, (err) => (err ? reject(err) : resolve()));
  });

  // 2) Collect generated images: base-1.jpg .. base-N.jpg
  const dir = path.dirname(base);
  const prefix = path.basename(base);
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix + "-") && n.endsWith(".jpg"))
    .sort((a, b) => {
      const ai = parseInt(a.split("-").pop(), 10);
      const bi = parseInt(b.split("-").pop(), 10);
      return ai - bi;
    })
    .map((n) => path.join(dir, n));

  // 3) OCR each page
  let out = "";
  for (const img of files) {
    try {
      const { data } = await Tesseract.recognize(img, tessLang, TESS_OPTS);
      if (data?.text) out += "\n" + data.text;
    } catch {
      /* ignore page OCR errors */
    }
    try {
      fs.unlinkSync(img);
    } catch {}
  }
  return out.trim();
}

// ---------- Normalizers ----------
// keep non-Latin scripts (Thai, etc.) during normalization
function normalize(str) {
  return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
}
function normalizeCompanyName(str) {
  return (
    (str || "")
      .toLowerCase()
      // drop common English suffixes if present
      .replace(/\b(private|pvt|limited|ltd|inc|corp|company|co|plc)\b/g, "")
      // remove spaces, punctuation, symbols (keep letters/digits in any script)
      .replace(/[\p{Z}\p{P}\p{S}]/gu, "")
      .trim()
  );
}

// --- Company-name helpers (brand-core) ---
const COMPANY_STOP_WORDS = new Set([
  "co",
  "company",
  "limited",
  "ltd",
  "inc",
  "corp",
  "corporation",
  "plc",
  "pte",
  "sdn",
  "bhd",
  "llc",
  "llp",
  "holdings",
  "group",
  "international",
  "global",
  "services",
  "service",
  "technology",
  "technologies",
  "thailand",
  "vietnam",
  "indonesia",
  "singapore",
  "myanmar",
  "malaysia",
  "philippines",
]);

function coreCompanyTokens(name) {
  const clean = String(name || "").replace(/\(.*?\)/g, " ");
  const toks = tokenize(clean, "en").filter(
    (t) => t.length >= 3 && !COMPANY_STOP_WORDS.has(t),
  );
  return Array.from(new Set(toks)).sort((a, b) => b.length - a.length);
}

// returns {hit:boolean, line?:string, matchType:"normalized"|"plain"|"brand-core"}
function lineHasCompany(line, official) {
  const normalizedAuth = normalizeCompanyName(official);
  const nLine = normalizeCompanyName(line);

  // strict normalized
  if (
    normalizedAuth &&
    nLine &&
    (nLine.includes(normalizedAuth) || normalizedAuth.includes(nLine))
  ) {
    return { hit: true, line, matchType: "normalized" };
  }
  // plain (case-insensitive raw)
  if (line.toLowerCase().includes(official.toLowerCase())) {
    return { hit: true, line, matchType: "plain" };
  }
  // brand-core fallback (for variants like "(Thailand)")
  const core = coreCompanyTokens(official);
  if (core.length) {
    const lineToks = new Set(tokenize(line, "en"));
    const longHit = core.find((t) => t.length >= 4 && lineToks.has(t));
    const medHits = core.filter((t) => t.length >= 3 && lineToks.has(t));
    if (longHit || medHits.length >= 2) {
      return { hit: true, line, matchType: "brand-core" };
    }
  }
  return { hit: false };
}

// ---------- Utilities ----------
function extractAllScores(feedbackText) {
  const scores = [];
  if (!feedbackText) return scores;

  // Accept both "Score: Robust (3/5)" and "Score: [Robust (3/5)]"
  const regex =
    /Score:\s*\[?\s*(?:Stretch|Commitment|Robust|Warning|Offtrack|Fully\s+Compliant|Strong|Moderate|Weak|Not\s+Compliant)?\s*\((\d)\s*\/\s*5\)\s*\]?/gi;

  let match;
  while ((match = regex.exec(feedbackText))) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) scores.push(n);
  }
  return scores;
}
const blobOrStreamToBuffer = async (data) => {
  if (data && typeof data.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer());
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    data.on("data", (c) => chunks.push(c));
    data.on("end", () => resolve(Buffer.concat(chunks)));
    data.on("error", reject);
  });
};

// ---------- Routes ----------

// Health
app.get("/healthz", (_, res) => res.json({ ok: true }));

// Get all answers (⚠️ consider gating this for auditors only)
app.get(
  "/api/all-answers",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("answers")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error)
        return res.status(500).json({ error: "Failed to fetch answers." });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);
// --- Admin login (server checks env user/pass, returns admin JWT) ---
app.post(
  "/api/admin/login",
  loginDailyLimiter,
  loginBurstLimiter,
  async (req, res) => {
    const { username, password } = req.body || {};
    if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!process.env.ADMIN_PASSWORD) {
      return res
        .status(503)
        .json({ error: "Admin login disabled (missing ADMIN_PASSWORD)" });
    }

    return res.json({ token: signAdminToken() });
  },
);

// --- Auditor login (separate creds + role: 'auditor') ---
const AUDITOR_USER = process.env.AUDITOR_USER || "auditor";
const AUDITOR_PASSWORD = process.env.AUDITOR_PASSWORD || "";
if (!AUDITOR_PASSWORD) {
  throw new Error("AUDITOR_PASSWORD must be set in the environment.");
}

function signAuditorToken() {
  return jwt.sign({ role: "auditor" }, AUDITOR_JWT_SECRET, { expiresIn: "2h" });
}
// Save simple Yes/No answer (Q2/Q3 aware placeholders)
app.post("/api/save-answer", requireUser(), async (req, res) => {
  try {
    const { email, questionNumber, answer } = req.body;
    if (!email || !questionNumber || !answer) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const qNum = parseInt(questionNumber, 10);
    const ans = String(answer).toLowerCase();
    let upload_feedback = null;

    switch (qNum) {
      case 2:
        // Q2: "Has your Company committed any infringements...?"
        if (ans === "no") {
          upload_feedback =
            "Score: Commitment (4/5)\n" +
            "Summary: Supplier states there are no OHS infringements in the last 3 years and no current investigations. (Self-declared; subject to evidence.)";
        } else if (ans === "yes") {
          upload_feedback =
            "Score: Warning (2/5)\n" +
            "Summary: Supplier acknowledges past infringements and/or a current investigation. Provide details, corrective actions and closure evidence to improve.";
        }
        break;

      case 3:
        // Q3: "Does the company have a process for Incident Reporting & Investigation...?"
        if (ans === "yes") {
          upload_feedback =
            "Score: Robust (3/5)\n" +
            "Summary: Supplier states there is a documented incident reporting & investigation process and a system for recording incidents. (Self-declared; subject to evidence.)";
        } else if (ans === "no") {
          upload_feedback =
            "Score: Offtrack (1/5)\n" +
            "Summary: No structured process/system for incident reporting and investigation.";
        }
        break;

      default:
        // Generic fallback for other questions (unchanged)
        if (ans === "no") {
          upload_feedback =
            "Score: Offtrack (1/5)\nSummary: User answered 'No'.";
        } else if (ans === "yes") {
          upload_feedback =
            "Score: Robust (3/5)\nSummary: User answered 'Yes'. (Pending document review may adjust.)";
        }
        break;
    }

    const { error } = await supabase.from("answers").upsert(
      {
        email,
        question_number: qNum,
        answer,
        upload_feedback,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email,question_number" },
    );
    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error("Save answer error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Review a question (used by frontend) — now stores ai_score and handles brackets
app.post("/api/review-question", aiLimiter, requireUser(), async (req, res) => {
  try {
    const {
      email,
      questionNumber,
      files = [],
      companyProfile,
      ocrLang = "eng",
    } = req.body;
    if (!email || !questionNumber) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const { tess: tessLang } = resolveLang(ocrLang);

    // 1) Download & OCR/parse
    let allText = "";
    const filePaths = Array.isArray(files)
      ? files.filter((p) => typeof p === "string" && p.trim())
      : [];
    for (const storagePath of filePaths) {
      try {
        const dl = await supabase.storage.from("uploads").download(storagePath);
        if (dl.error) continue;
        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = (storagePath.split(".").pop() || "bin").toLowerCase();
        const text = await extractTextFromBuffer(buf, `file.${ext}`, tessLang);
        if (text?.trim())
          allText += `\n\n--- FILE: ${storagePath} ---\n${text}`;
      } catch (_) {}
    }

    if (!allText.trim()) {
      const feedback =
        "No readable content found in uploaded files. Please upload a clear PDF/IMG/TXT/DOCX with relevant content.";
      await supabase.from("answers").upsert(
        {
          email,
          question_number: Number(questionNumber),
          upload_feedback: feedback,
          ai_score: 1,
          status: "awaiting_user",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );
      return res.json({ feedback, score: 1 });
    }
    const qNum = Number(questionNumber);
    if (!Number.isFinite(qNum) || qNum <= 0) {
      return res.status(400).json({ error: "Invalid question number." });
    }

    // 2) Ask the model (unchanged prompt)
    const prompt = `
You are an OHS compliance auditor.

QUESTION:
${getQuestionText(qNum)}

SCORING GUIDE:
${getScoringGuide(qNum)}

COMPANY PROFILE (may be partial):
${JSON.stringify(companyProfile || {}, null, 2)}

DOCUMENTS TEXT (merged):
${allText}

Return this format:
Summary: ...
Missing: ...
Score: [Stretch (5/5) | Commitment (4/5) | Robust (3/5) | Warning (2/5) | Offtrack (1/5)]
Recommendation: ...
`;
    const feedback = await callGroq(prompt);

    // 3) Parse a numeric score (accept bracketed)
    const m = feedback.match(
      /Score:\s*\[?\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\s*\/\s*5\)\s*\]?/i,
    );
    const score = m ? parseInt(m[2], 10) : null;

    // 4) Save (store ai_score so Progress updates immediately)
    await supabase.from("answers").upsert(
      {
        email,
        question_number: qNum,
        upload_feedback: feedback,
        ai_score: score, // <-- store it
        updated_at: new Date().toISOString(),
        status: "ai-reviewed",
      },
      { onConflict: "email,question_number" },
    );

    return res.json({ feedback, score });
  } catch (err) {
    console.error("review-question error:", err);
    return res.status(500).json({ error: "AI review failed" });
  }
});

// Session summary
app.post("/api/session-summary", requireUser(), async (req, res) => {
  try {
    const email = req.authUser?.email;
    if (!email) return res.status(401).json({ feedback: "Unauthorized" });

    const { data: answers, error } = await supabase
      .from("answers")
      .select("*")
      .eq("email", email)
      .order("question_number", { ascending: true });

    if (error || !answers || answers.length === 0) {
      return res
        .status(422)
        .json({ feedback: "No answer data found for this email." });
    }

    // Calc overall as % of (1..5)
    let total = 0;
    let count = 0;
    for (const ans of answers) {
      const scores = extractAllScores(ans.upload_feedback);
      for (const s of scores) {
        total += s;
        count++;
      }
    }
    const maxPossible = count * 5;
    const overallScore = count ? Math.round((total / maxPossible) * 100) : 0;

    let prompt = `You are a supplier compliance auditor. Here is a supplier's interview session:\n\n`;
    for (const ans of answers) {
      prompt += `Question ${ans.question_number}: ${getQuestionText(ans.question_number)}\n`;
      prompt += `Answer: ${ans.answer}\n`;
      if (ans.upload_feedback)
        prompt += `Document Review: ${ans.upload_feedback}\n`;
      if (ans.skip_reason) prompt += `Skipped/Reason: ${ans.skip_reason}\n`;
      prompt += `\n`;
    }
    prompt += `
Summarize this supplier's OHS compliance in under 10 sentences.

- List "strengths" (>=1 or "None").
- List "weaknesses" (>=1 or "None").
- List "recommendations" (>=1 or "None").
- Give a score (0-100).

Return JSON:
{
  "feedback": {
    "strengths": [ ... ],
    "weaknesses": [ ... ],
    "recommendations": [ ... ]
  },
  "score": <number>
}
`;

    const aiText = await callGroq(prompt);

    // Build final feedback (markdown) from JSON if possible
    let feedback = "";
    let aiScore = overallScore;
    try {
      const match = aiText.match(/\{[\s\S]*\}/m);
      if (match) {
        const json = JSON.parse(match[0]);
        const strengths = json.feedback?.strengths || json.strengths || [];
        const weaknesses = json.feedback?.weaknesses || json.weaknesses || [];
        const recos =
          json.feedback?.recommendations ||
          json.feedback?.suggestions ||
          json.recommendations ||
          json.suggestions ||
          [];

        const sec = [
          "**Strengths:**\n" +
            (Array.isArray(strengths) && strengths.length
              ? strengths.map((s) => "- " + s).join("\n")
              : "_No data provided._"),
          "**Weaknesses:**\n" +
            (Array.isArray(weaknesses) && weaknesses.length
              ? weaknesses.map((w) => "- " + w).join("\n")
              : "_No data provided._"),
          "**Recommendations:**\n" +
            (Array.isArray(recos) && recos.length
              ? recos.map((r) => "- " + r).join("\n")
              : "_No data provided._"),
        ];
        feedback = sec.join("\n\n").trim();

        if (typeof json.score === "number") aiScore = json.score;
      }
      if (!feedback) feedback = aiText.trim();
    } catch {
      feedback = aiText.trim();
    }
    if (!feedback) feedback = "No summary available.";

    // Upsert sessions row keyed by email
    await supabase.from("sessions").upsert(
      {
        email,
        summary_text: feedback,
        summary_score: aiScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    // Build detailedScores for UI
    const detailedScores = answers.map((ans) => {
      const matches = extractAllScores(ans.upload_feedback);
      return {
        questionNumber: ans.question_number,
        answer: ans.answer,
        requirementScores: matches,
        upload_feedback: ans.upload_feedback,
      };
    });

    return res.json({ feedback, score: aiScore, detailedScores });
  } catch (err) {
    console.error("ERROR in /api/session-summary:", err);
    return res.status(500).json({ feedback: "Failed to generate summary." });
  }
});

// Supplier name helpers
app.post("/api/set-supplier-name", requireUser(), async (req, res) => {
  const { email, supplierName } = req.body;
  if (!email || !supplierName) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }
  try {
    await supabase.from("supplier_names").upsert(
      {
        email,
        supplier_name: supplierName,
        extracted_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    res.json({ success: true, supplierName });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to set supplier name." });
  }
});
app.get("/api/get-supplier-name", requireUser(), async (req, res) => {
  const email = req.authUser.email; // canonical from token
  if (!email) return res.status(400).json({ supplierName: "" });

  const { data } = await supabase
    .from("supplier_names")
    .select("supplier_name")
    .eq("email", email)
    .maybeSingle();
  res.json({ supplierName: data?.supplier_name || "" });
});

// Check file (per requirement upload)
app.post(
  "/api/check-file",
  aiLimiter,
  requireUser(),
  upload.single("file"),
  async (req, res) => {
    const cleanup = () => {
      if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    };

    try {
      const { email, questionNumber, userExplanation, ocrLang } = req.body;

      // map UI OCR language to Tesseract code (eng/tha/ind/...)
      const { tess: lang } = resolveLang(ocrLang || "eng");

      if (!req.file)
        return res.json({ success: false, feedback: "No file uploaded." });

      const qNum = parseInt(questionNumber, 10);
      if (!Number.isFinite(qNum) || qNum <= 0) {
        cleanup();
        return res
          .status(400)
          .json({ success: false, feedback: "Invalid question number." });
      }

      // block legacy .doc
      const extUp = (
        req.file.originalname.split(".").pop() || ""
      ).toLowerCase();
      if (extUp === "doc") {
        cleanup();
        return res.json({
          success: false,
          feedback:
            "Legacy .doc files aren’t supported. Please convert to PDF or DOCX and re-upload.",
          requireFileRetry: true,
        });
      }
      // verify magic mime matches extension
      const safeName = sanitizeFilename(req.file.originalname);
      const ext = (safeName.split(".").pop() || "").toLowerCase();
      let magic = null;
      try {
        magic = await sniffFileMagic(req.file.path);
      } catch {}
      if (!mimeAllowedByExt(ext, magic || "")) {
        cleanup();
        return res.json({
          success: false,
          feedback: `File content type (${magic || "unknown"}) does not match the file extension .${ext}. Please export a clean ${ext.toUpperCase()} and re-upload.`,
          requireFileRetry: true,
        });
      }

      // company name from profile
      const { data: sn, error: snErr } = await supabase
        .from("supplier_names")
        .select("supplier_name")
        .eq("email", email)
        .single();

      if (snErr) {
        cleanup();
        return res.json({
          success: false,
          feedback: "Could not look up your registered supplier name.",
          requireFileRetry: false,
        });
      }
      const officialCompanyName = sn?.supplier_name?.trim();
      if (!officialCompanyName) {
        cleanup();
        return res.json({
          success: false,
          feedback:
            "No official supplier/company name found from your login/profile. Please contact support or update your profile.",
        });
      }

      // Extract text using mapped OCR language
      let text = "";
      try {
        text = await extractText(req.file.path, req.file.originalname, lang);
      } catch {
        cleanup();
        return res.json({
          success: false,
          feedback:
            "Could not read or process your file. Please upload a clear, readable PDF, DOCX, TXT, or image.",
          requireFileRetry: true,
        });
      }
      cleanup();

      if (!text?.trim()) {
        return res.json({
          success: false,
          feedback:
            "Your document could not be read. Please upload a clear, readable file (PDF, DOCX, or image) with visible content.",
          requireFileRetry: true,
        });
      }

      // Company name presence check (Unicode-safe)
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 4);

      let foundMatchingLine = null;
      for (const l of lines) {
        const chk = lineHasCompany(l, officialCompanyName);
        if (chk.hit) {
          foundMatchingLine = chk.line;
          break;
        }
      }

      if (!foundMatchingLine) {
        return res.json({
          success: true,
          score: 1,
          feedback: `❌ **Company Name Mismatch**\n\nDocument does not clearly mention the registered company name: "${officialCompanyName}".\n\n**Score: Offtrack (1/5)**\nSummary: Uploaded document does not match the registered supplier. Please re-upload a document that contains your registered company name as shown in your profile.`,
          requireCompanyNameConfirmation: true,
          detectedCompanyName: "",
          expectedCompanyName: officialCompanyName,
        });
      }

      // Continue with AI review
      const questionText = getQuestionText(qNum);
      const scoringGuide = getScoringGuide(qNum);
      const explanationSection = userExplanation
        ? `\n---\n**User Explanation:**\n${userExplanation}\n`
        : "";

      const prompt = `
You are an OHS compliance auditor. For the following question, review the vendor's uploaded document${
        userExplanation ? " and user explanation" : ""
      } and provide:

- A concise summary of the document's compliance with the requirement.
- Identify any missing elements, weaknesses, or best practices.
- Assign a score using ONLY: Stretch (5/5), Commitment (4/5), Robust (3/5), Warning (2/5), Offtrack (1/5)
- Use this format:
Summary: ...
Missing: ...
Score: ...
Recommendation: ...

QUESTION:
${questionText}

SCORING GUIDE:
${scoringGuide}
${explanationSection}
COMPANY NAME (from user profile/auth): ${officialCompanyName}

DOCUMENT TEXT:
${text}
`;

      const feedback = await callGroq(prompt);

      let score = null;
      const match = feedback.match(
        /Score:\s*\[?\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\s*\/\s*5\)\s*\]?/i,
      );

      if (match) score = parseInt(match[2], 10);

      await supabase.from("answers").upsert(
        {
          email,
          question_number: qNum,
          upload_feedback: feedback,
          ai_score: score ?? null,
          status: "ai-reviewed",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );

      res.json({ success: true, score, feedback });
    } catch (err) {
      if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
      res.status(500).json({
        error: err.message || String(err),
        feedback: "Server error. Please try again or contact support.",
        requireFileRetry: true,
      });
    }
  },
);

// ========== New multi-file audit flow ==========

// Save both file storage paths (r1 & r2) for a question
// POST /api/audit/:questionNumber/save-files
// body: { email, r1Path, r2Path }
app.post(
  "/api/audit/:questionNumber/save-files",
  requireUser(),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const { email, r1Path, r2Path } = req.body || {};
      if (!email || !qNum || !r1Path || !r2Path) {
        return res
          .status(400)
          .json({ error: "Missing fields: email, r1Path, r2Path" });
      }

      const { error } = await supabase.from("answers").upsert(
        {
          email,
          question_number: qNum,
          r1_path: r1Path,
          r2_path: r2Path,
          validation_status: "pending",
          status: "in_progress",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );
      if (error) return res.status(500).json({ error: error.message });

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Validate that r1 & r2 look like the right documents
// POST /api/audit/:questionNumber/validate
// Validate uploaded docs against N requirement labels (multilingual + concept-aware + SAFE NUMBERS)
app.post(
  "/api/audit/:questionNumber/validate",
  aiLimiter,
  requireUser(),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const {
        ocrLang = "eng",
        debug = false,
        strictMapping = false,
        requireCompanyName = false,
      } = req.body || {};

      const email = req.authUser?.email;
      if (!email || !qNum) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // map UI OCR language to Tesseract code (eng/tha/ind/...)
      const { tess: tessLang } = resolveLang(ocrLang);

      // ---------- inputs ----------
      const requirementLabels = Array.isArray(req.body?.requirementLabels)
        ? req.body.requirementLabels
        : [];
      const totalRequirements = Number.isFinite(+req.body?.totalRequirements)
        ? +req.body.totalRequirements
        : requirementLabels.length || 0;

      const normalizeSet = (arr, N) => [
        ...new Set(
          (arr || [])
            .map((n) => +n)
            .filter((n) => Number.isFinite(n) && n >= 0 && n < N),
        ),
      ];

      const N = totalRequirements || requirementLabels.length || 0;

      let requiredIndices = normalizeSet(req.body?.requiredIndices, N);
      let optionalIndices = normalizeSet(req.body?.optionalIndices, N);
      if (!requiredIndices.length && !optionalIndices.length) {
        requiredIndices = Array.from({ length: N }, (_, i) => i);
      } else if (!requiredIndices.length && optionalIndices.length) {
        const opt = new Set(optionalIndices);
        requiredIndices = Array.from({ length: N }, (_, i) => i).filter(
          (i) => !opt.has(i),
        );
      }

      const CROSS_OK = 0.7;

      // files: [{ path, requirementIndex? }, ...]
      let files = Array.isArray(req.body.files)
        ? req.body.files
            .filter((f) => f && typeof f.path === "string")
            .map((f, i) => ({
              path: f.path,
              requirementIndex: Number.isFinite(+f.requirementIndex)
                ? +f.requirementIndex
                : i,
            }))
        : [];

      if (!files.length) {
        return res.json({
          overall: {
            status: "fail",
            errors: ["Please upload at least one document."],
          },
          requirements: [],
          crossRequirement: [],
          feedback: "No files provided.",
          requiredIndices,
          optionalIndices,
        });
      }

      // ---------- download & OCR (with image-only second pass) ----------
      const texts = [];
      for (let i = 0; i < files.length; i++) {
        const storagePath = files[i].path;
        const dl = await supabase.storage.from("uploads").download(storagePath);
        if (dl.error) {
          texts.push("");
          continue;
        }

        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = (storagePath.split(".").pop() || "bin").toLowerCase();
        // magic sniff on buffer (skip if unknown)
        try {
          const { fileTypeFromBuffer } = await import("file-type");
          const t = await fileTypeFromBuffer(buf);
          const magic = t?.mime || null;
          if (!mimeAllowedByExt(ext, magic || "")) {
            // treat as unreadable/mismatch, but keep going so user sees which one failed
            texts.push("");
            continue;
          }
        } catch {}

        // 1) First pass: use our extractor (handles PDF/DOCX/TXT; returns "" for scanned PDFs)
        let text = await extractTextFromBuffer(buf, `file.${ext}`, tessLang);

        // 2) Second pass OCR: ONLY for real images — never for PDFs
        const isImage = IMAGE_EXTS.has(ext);
        if (isImage) {
          const tmpPath = path.join("tmp", `ocr-${Date.now()}-${i}.${ext}`);
          fs.writeFileSync(tmpPath, buf);
          try {
            const { data: t } = await Tesseract.recognize(
              tmpPath,
              tessLang,
              TESS_OPTS,
            );
            if (t?.text) text += `\n${t.text}`;
          } catch {
            // ignore OCR errors
          } finally {
            fs.unlink(tmpPath, () => {});
          }
        }

        texts.push(text || "");
      }

      // choose matching language
      const effectiveLang =
        texts.some(hasThai) || tessLang === "tha"
          ? "th"
          : texts.some(hasLatin)
            ? "en"
            : "en";

      const MEET = effectiveLang === "th" ? 0.18 : 0.28;
      const LONG_BONUS_LEN = 500;
      const LONG_BONUS_MET = effectiveLang === "th" ? 0.12 : 0.18;

      // optional company-name warning / gate (Unicode-safe)
      const { data: sn } = await supabase
        .from("supplier_names")
        .select("supplier_name")
        .eq("email", email)
        .maybeSingle();

      const official = (sn?.supplier_name || "").trim();
      let mentionsCompany = false;
      let companyEvidence = null; // { file, line, matchType }

      if (official) {
        for (let i = 0; i < texts.length && !mentionsCompany; i++) {
          const lines = String(texts[i] || "")
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 4);
          for (const l of lines) {
            const r = lineHasCompany(l, official);
            if (r.hit) {
              mentionsCompany = true;
              companyEvidence = {
                file: files[i]?.path || "",
                line: r.line,
                matchType: r.matchType,
              };
              break;
            }
          }
        }
      }

      // second-chance OCR for company name (logos / images only)
      if (!mentionsCompany && official) {
        for (let i = 0; i < files.length && !mentionsCompany; i++) {
          try {
            const dl = await supabase.storage
              .from("uploads")
              .download(files[i].path);
            if (dl.error) continue;
            const buf = await blobOrStreamToBuffer(dl.data);
            const ext = (files[i].path.split(".").pop() || "bin").toLowerCase();
            const isImage = IMAGE_EXTS.has(ext);
            if (!isImage) continue;

            const tmpFile = path.join("tmp", `${Date.now()}-${i}-ocr.${ext}`);
            fs.writeFileSync(tmpFile, buf);
            try {
              const { data: t } = await Tesseract.recognize(
                tmpFile,
                tessLang,
                TESS_OPTS,
              );
              const ocrLines = String(t.text || "")
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length > 4);

              for (const l of ocrLines) {
                const r = lineHasCompany(l, official);
                if (r.hit) {
                  mentionsCompany = true;
                  companyEvidence = {
                    file: files[i].path,
                    line: r.line,
                    matchType: `ocr:${r.matchType}`,
                  };
                  break;
                }
              }
            } finally {
              fs.unlink(tmpFile, () => {});
            }
          } catch {}
        }
      }

      // ---------- per-file checks ----------
      const reqDebug = [];
      const requirements = files.map((f, i) => {
        const txt = texts[i] || "";
        const label =
          requirementLabels[f.requirementIndex] ||
          requirementLabels[i] ||
          `Requirement ${f.requirementIndex + 1}`;

        const concept = labelConcept(label);
        const ch = conceptHits(txt, effectiveLang);
        const { score, hits } = coverage(label, txt, effectiveLang);

        let meets;
        if (concept === "policy_doc") meets = ch.hasPolicy;
        else if (concept === "policy_comms")
          meets = ch.hasPolicy && ch.hasComms;
        else
          meets =
            score >= MEET ||
            (score >= LONG_BONUS_MET && txt.length > LONG_BONUS_LEN);

        const confidence = (() => {
          if (concept === "policy_doc" && ch.hasPolicy) return 0.72;
          if (concept === "policy_comms" && ch.hasPolicy && ch.hasComms)
            return 0.78;
          return Math.max(0.3, +Number(score || 0).toFixed(3));
        })();

        let evidence = ch.evidence.length ? ch.evidence : hits.slice(0, 12);
        if (concept === "policy_doc") {
          const WHITELIST = new Set([...POLICY_TH, ...POLICY_EN]);
          evidence = evidence.filter((w) => WHITELIST.has(w));
          if (!evidence.length) {
            evidence = hits.filter((w) => WHITELIST.has(w)).slice(0, 8);
          }
        }

        reqDebug.push({
          file: f.path,
          reqIdx: f.requirementIndex,
          label,
          concept,
          score: +Number(score || 0).toFixed(3),
          textLen: texts[i]?.length || 0,
          hits: evidence,
          confidence,
        });

        return {
          index: f.requirementIndex,
          sourcePath: f.path,
          readable: !!txt.trim(),
          readability: null,
          alignment: { meets, confidence, evidence },
          missing: meets ? [] : [label],
          moreSuggested: [],
        };
      });

      // ---------- cross-coverage ----------
      const crossRequirement = [];
      for (let i = 0; i < files.length; i++) {
        const txt = texts[i] || "";
        for (let j = 0; j < N; j++) {
          const labelJ = requirementLabels[j] || `Requirement ${j + 1}`;
          if (j === files[i].requirementIndex) continue;

          const conceptJ = labelConcept(labelJ);
          const ch = conceptHits(txt, effectiveLang);
          const { score } = coverage(labelJ, txt, effectiveLang);

          const byConcept =
            (conceptJ === "policy_doc" && ch.hasPolicy) ||
            (conceptJ === "policy_comms" && ch.hasPolicy && ch.hasComms);

          if (byConcept || score >= 0.4) {
            const cov = byConcept
              ? conceptJ === "policy_comms"
                ? 0.78
                : 0.72
              : +Number(score || 0.01).toFixed(3);
            crossRequirement.push({
              sourceIndex: i,
              sourcePath: files[i].path,
              targetRequirementIndex: j,
              coverageScore: cov,
            });
          }
        }
      }

      // ---------- overall using REQUIRED indices only ----------
      const satisfied = new Set();

      // direct alignment always satisfies its requirement
      for (const r of requirements) {
        if (r.readable && r.alignment?.meets) satisfied.add(r.index);
      }

      // cross-coverage satisfies only when NOT strict
      if (!strictMapping) {
        for (const cr of crossRequirement) {
          if ((cr.coverageScore || 0) >= CROSS_OK) {
            satisfied.add(cr.targetRequirementIndex);
          }
        }
      }

      const requiredMissingIdxs = requiredIndices.filter(
        (i) => !satisfied.has(i),
      );
      const unreadableRequired = requirements
        .filter(
          (r) => requiredIndices.includes(r.index) && r.readable === false,
        )
        .map((r) => r.index);

      // company-name gate: hard fail only when flag is ON
      const failByCompany = requireCompanyName && official && !mentionsCompany;

      const errors = [];
      if (unreadableRequired.length)
        errors.push("Some required files are unreadable.");
      if (requiredMissingIdxs.length)
        errors.push(
          "Some required documents don’t match their requirement(s).",
        );
      if (failByCompany) errors.push("Company name not detected.");

      const overall = errors.length
        ? { status: "fail", errors }
        : {
            status: "ok",
            warnings:
              !failByCompany && official && !mentionsCompany
                ? ["Company name not detected."]
                : [],
          };

      const feedback = errors.length
        ? "Required items need attention. Re-upload or continue at your own risk."
        : "Looks aligned. Continue to audit?";

      // Reconcile requirement cards with cross-coverage before persisting/returning
      const coveredBy = (idx) =>
        crossRequirement
          .filter(
            (cr) =>
              cr.targetRequirementIndex === idx &&
              (cr.coverageScore || 0) >= CROSS_OK,
          )
          .map((cr) => ({
            sourcePath: cr.sourcePath,
            coverageScore: cr.coverageScore,
          }));

      for (const r of requirements) {
        const lbl = requirementLabels[r.index] || `Requirement ${r.index + 1}`;
        if (satisfied.has(r.index)) {
          r.missing = [];
          if (r.alignment && !r.alignment.meets) {
            r.alignment.note = "Covered by other file";
            r.alignment.coveredBy = coveredBy(r.index);
          }
        } else {
          r.missing = [lbl];
        }
      }

      // persist validation state
      await supabase.from("answers").upsert(
        {
          email,
          question_number: qNum,
          validation_status: overall.status === "ok" ? "valid" : "invalid",
          validation_feedback: feedback,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );

      const payload = {
        overall,
        requirements,
        crossRequirement,
        feedback,
        requiredIndices,
        optionalIndices,
        companyEvidence,
        gate: { strictMapping, requireCompanyName },
      };

      if (debug)
        payload.__debug = {
          effectiveLang,
          tessLang,
          thresholds: { MEET, LONG_BONUS_LEN, LONG_BONUS_MET, CROSS_OK },
          reqDebug,
        };

      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
);

// Process audit for N requirements with concept-aware gate (multilingual) + strict LLM mapping
app.post(
  "/api/audit/:questionNumber/process",
  aiLimiter,
  requireUser(),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const {
        insist = false,
        companyProfile,
        ocrLang = "eng",
        debug = false,
      } = req.body || {};
      const email = req.authUser?.email;
      if (!email || !qNum)
        return res.status(400).json({ error: "Missing fields" });

      const requirementLabels = Array.isArray(req.body?.requirementLabels)
        ? req.body.requirementLabels
        : [];
      const totalRequirements = Number.isFinite(+req.body?.totalRequirements)
        ? +req.body.totalRequirements
        : requirementLabels.length || 0;

      const N = totalRequirements || requirementLabels.length || 0;

      // parse required/optional (0-based); defaults = all required
      const normalizeSet = (arr, N) => [
        ...new Set(
          (arr || [])
            .map((n) => +n)
            .filter((n) => Number.isFinite(n) && n >= 0 && n < N),
        ),
      ];
      let requiredIndices = normalizeSet(req.body?.requiredIndices, N);
      let optionalIndices = normalizeSet(req.body?.optionalIndices, N);
      if (!requiredIndices.length && !optionalIndices.length) {
        requiredIndices = Array.from({ length: N }, (_, i) => i);
      } else if (!requiredIndices.length && optionalIndices.length) {
        const opt = new Set(optionalIndices);
        requiredIndices = Array.from({ length: N }, (_, i) => i).filter(
          (i) => !opt.has(i),
        );
      }

      let files = Array.isArray(req.body.files)
        ? req.body.files
            .filter((f) => f && typeof f.path === "string")
            .map((f, i) => ({
              path: f.path,
              requirementIndex: Number.isFinite(+f.requirementIndex)
                ? +f.requirementIndex
                : i,
            }))
        : [];
      if (!files.length)
        return res
          .status(400)
          .json({ error: "Please upload documents mapped to requirements." });

      const { tess: tessLang } = resolveLang(ocrLang);
      // use top-level helpers: hasThai, hasLatin, tokenize, stopFilter, coverage,
      // and the shared labelConcept/conceptHits from Step 1

      // --- extract text & merge ---
      const texts = [];
      let allText = "";
      for (const f of files) {
        const dl = await supabase.storage.from("uploads").download(f.path);
        if (dl.error) {
          texts.push("");
          continue;
        }
        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = (f.path.split(".").pop() || "bin").toLowerCase();
        try {
          const { fileTypeFromBuffer } = await import("file-type");
          const t = await fileTypeFromBuffer(buf);
          const magic = t?.mime || null;
          if (!mimeAllowedByExt(ext, magic || "")) {
            texts.push(""); // treat as unreadable/mismatch
            continue;
          }
        } catch {}

        const t = await extractTextFromBuffer(buf, `file.${ext}`, tessLang);
        texts.push(t || "");
        if ((t || "").trim()) allText += `\n\n--- FILE: ${f.path} ---\n${t}`;
      }
      if (!allText.trim()) {
        const feedback = "No readable content found in uploaded files.";
        await supabase.from("answers").upsert(
          {
            email,
            question_number: qNum,
            upload_feedback: feedback,
            ai_score: 1,
            status: "awaiting_user",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,question_number" },
        );
        return res.json({ score: 1, feedback });
      }

      const effectiveLang =
        texts.some(hasThai) || tessLang === "tha"
          ? "th"
          : texts.some(hasLatin)
            ? "en"
            : "en";
      const HARD_THRESH = effectiveLang === "th" ? 0.18 : 0.2;
      const AUTO_THRESH = effectiveLang === "th" ? 0.6 : 0.65;

      // group files by assigned requirement
      const filesByReq = new Map();
      files.forEach((f, i) => {
        const arr = filesByReq.get(f.requirementIndex) || [];
        arr.push(i);
        filesByReq.set(f.requirementIndex, arr);
      });

      const misses = []; // required only
      const autoMaps = []; // for prompt
      const gateDebug = [];

      for (let ri = 0; ri < N; ri++) {
        const label = requirementLabels[ri] || `Requirement ${ri + 1}`;
        const concept = labelConcept(label);
        const assigned = (filesByReq.get(ri) || [])[0];

        const acceptByConcept = (idx) => {
          const ch = conceptHits(texts[idx] || "", effectiveLang);
          if (concept === "policy_doc") return ch.hasPolicy;
          if (concept === "policy_comms") return ch.hasPolicy && ch.hasComms;
          return false;
        };

        // evaluate mapping (we still compute best to show in prompt)
        if (typeof assigned === "number") {
          const conceptOK = acceptByConcept(assigned);
          const { score } = coverage(
            label,
            texts[assigned] || "",
            effectiveLang,
          );
          gateDebug.push({
            ri,
            label,
            concept,
            assignedFile: files[assigned]?.path,
            conceptOK,
            ratio: +score.toFixed(3),
          });
          if (requiredIndices.includes(ri) && !conceptOK && score < HARD_THRESH)
            misses.push(label);
        } else {
          // no direct mapping → try auto map
          let best = { idx: -1, ratio: 0, conceptOK: false };
          for (let i = 0; i < texts.length; i++) {
            const conceptOK = acceptByConcept(i);
            const { score } = coverage(label, texts[i] || "", effectiveLang);
            if (conceptOK || score > best.ratio)
              best = { idx: i, ratio: score, conceptOK };
          }
          gateDebug.push({
            ri,
            label,
            concept,
            assignedFile: null,
            bestFile: files[best.idx]?.path,
            conceptOK: best.conceptOK,
            bestRatio: +best.ratio.toFixed(3),
          });

          if (best.conceptOK || best.ratio >= AUTO_THRESH) {
            autoMaps.push({
              requirementIndex: ri,
              fromFileIdx: best.idx,
              score: +best.ratio.toFixed(3),
              conceptOK: best.conceptOK,
            });
          } else if (requiredIndices.includes(ri)) {
            misses.push(label);
          }
        }
      }

      if (misses.length && !insist) {
        const feedback = `Missing clear evidence for required items: ${misses.join("; ")}. Upload docs that match each requirement (titles/sections that reflect the label).`;
        await supabase.from("answers").upsert(
          {
            email,
            question_number: qNum,
            upload_feedback: feedback,
            ai_score: 1,
            status: "awaiting_user",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,question_number" },
        );
        const resp = { score: 1, feedback };
        if (debug)
          resp.__debug = {
            effectiveLang,
            tessLang,
            thresholds: { HARD_THRESH, AUTO_THRESH },
            gateDebug,
            requiredIndices,
            optionalIndices,
          };
        return res.json(resp);
      }

      // mapping text for LLM (show all, including optional; that’s fine)
      const mappingLines = [];
      for (let ri = 0; ri < N; ri++) {
        const label = requirementLabels[ri] || `Requirement ${ri + 1}`;
        const assigned = (filesByReq.get(ri) || [])[0];
        if (typeof assigned === "number") {
          mappingLines.push(
            `- r${ri + 1} (${label}) => ${files[assigned].path}`,
          );
        } else {
          const auto = autoMaps.find((a) => a.requirementIndex === ri);
          mappingLines.push(
            auto
              ? `- r${ri + 1} (${label}) => AUTO-MAPPED to ${files[auto.fromFileIdx].path} (${auto.conceptOK ? "concept match" : `ratio ${auto.score}`})`
              : `- r${ri + 1} (${label}) => UNASSIGNED`,
          );
        }
      }
      const mappingText = mappingLines.join("\n");

      const prompt = `
You are an OHS compliance auditor.

QUESTION:
${getQuestionText(qNum)}

FILES & REQUIREMENT MAPPING:
${mappingText}

Rules:
- For each requirement r1..rN, cite at least one short verbatim quote (≤25 words) from the CORRESPONDING FILE section (look for lines starting with "--- FILE: <path> ---").
- If a requirement is UNASSIGNED and there is no obvious content in any file, list it under "Missing" and cap the overall score at Offtrack (1/5).
- If a requirement is AUTO-MAPPED, you may quote from the indicated file; still list as Missing if no direct evidence.

SCORING GUIDE:
${getScoringGuide(qNum)}

COMPANY PROFILE (may be partial):
${JSON.stringify(companyProfile || {}, null, 2)}

DOCUMENTS TEXT (merged with file headers):
${allText}

Return exactly this format:
Summary: .
Missing: .
Score: [Stretch (5/5) | Commitment (4/5) | Robust (3/5) | Warning (2/5) | Offtrack (1/5)]
Recommendation: .
`;

      const feedback = await callGroq(prompt);
      let score = null;
      const m = String(feedback || "").match(
        /Score:\s*\[?\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\s*\/\s*5\)\s*\]?/i,
      );
      if (m) score = parseInt(m[2], 10);

      await supabase.from("answers").upsert(
        {
          email,
          question_number: qNum,
          upload_feedback: feedback,
          ai_score: score,
          status: "awaiting_user",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );

      const resp = { score, feedback, requiredIndices, optionalIndices };
      if (debug)
        resp.__debug = {
          effectiveLang,
          tessLang,
          thresholds: { HARD_THRESH, AUTO_THRESH },
          mapping: mappingLines,
        };
      res.json(resp);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Agree & lock the score (copy ai_score -> final_score)
app.post(
  "/api/audit/:questionNumber/agree",
  requireUser(),
  async (req, res) => {
    const qNum = Number(req.params.questionNumber);
    const email = req.authUser?.email;
    if (!email || !qNum)
      return res.status(400).json({ error: "Missing fields" });

    const { data: row } = await supabase
      .from("answers")
      .select("ai_score")
      .eq("email", email)
      .eq("question_number", qNum)
      .single();

    if (row?.ai_score == null) {
      return res.status(400).json({ error: "No AI score to finalize yet" });
    }
    const finalScore = row.ai_score;
    await supabase
      .from("answers")
      .update({
        final_score: finalScore,
        status: "finalized",
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .eq("question_number", qNum);

    res.json({ ok: true });
  },
);

// Disagree: up to 2 times, then escalate to human auditor
// body: { email, userArgument, userFileUrl? }
app.post(
  "/api/audit/:questionNumber/disagree",
  requireUser(),
  async (req, res) => {
    const qNum = Number(req.params.questionNumber);
    const { userArgument, userFileUrl } = req.body || {};
    const email = req.authUser?.email;
    if (!email || !qNum || !userArgument) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // 1) Log disagreement
    await supabase.from("disagreements").insert({
      email,
      question_number: qNum,
      requirement: getQuestionText(qNum),
      disagree_reason: userArgument,
      ai_feedback: null,
      created_at: new Date().toISOString(),
    });

    // 2) Increment counter
    const { data: ans } = await supabase
      .from("answers")
      .select("user_disagreement_count")
      .eq("email", email)
      .eq("question_number", qNum)
      .single();

    const nextCount = (ans?.user_disagreement_count || 0) + 1;

    if (nextCount >= 2) {
      // Escalate
      await supabase
        .from("answers")
        .update({
          user_disagreement_count: nextCount,
          escalated: true,
          status: "awaiting_human",
          ai_score: null,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("question_number", qNum);

      // Optional queue row (ignore if table doesn't exist)
      try {
        await supabase.from("auditor_requests").insert({
          email,
          question_number: qNum,
          requirement: "Disagreement escalation",
          user_argument: userArgument,
          user_file_url: userFileUrl || null,
          status: "pending",
          created_at: new Date().toISOString(),
        });
      } catch {}

      return res.json({
        escalated: true,
        message: "Escalated to Human Auditor.",
      });
    }

    await supabase
      .from("answers")
      .update({
        user_disagreement_count: nextCount,
        status: "awaiting_user",
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .eq("question_number", qNum);

    res.json({ escalated: false, remainingAppeals: 2 - nextCount });
  },
); // end of /api/audit/:questionNumber/disagree

// ===== Admin auditor endpoints =====

// List items waiting for human review (auditor inbox)
app.get(
  "/api/audit/pending-human",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    try {
      const { data: rows, error } = await supabase
        .from("answers")
        .select(
          "email,question_number,r1_path,r2_path,validation_status,validation_feedback,ai_score,upload_feedback,user_disagreement_count,updated_at",
        )
        .eq("status", "awaiting_human")
        .order("updated_at", { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      // Sign URLs so auditors can open the user uploads
      const items = await Promise.all(
        (rows || []).map(async (r) => ({
          ...r,
          r1_url: await signFile(r.r1_path),
          r2_url: await signFile(r.r2_path),
        })),
      );

      res.json({ items });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Detail view for a specific item (with disagreements history)
app.get(
  "/api/audit/:questionNumber/audit-detail",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const email = String(req.query.email || "");
      if (!email || !qNum)
        return res
          .status(400)
          .json({ error: "Missing email or questionNumber" });

      const { data: ans, error: ansErr } = await supabase
        .from("answers")
        .select("*")
        .eq("email", email)
        .eq("question_number", qNum)
        .maybeSingle();
      if (ansErr || !ans)
        return res.status(404).json({ error: "Item not found" });

      const { data: disagreements } = await supabase
        .from("disagreements")
        .select("*")
        .eq("email", email)
        .eq("question_number", qNum)
        .order("created_at", { ascending: true });

      const r1_url = await signFile(ans.r1_path);
      const r2_url = await signFile(ans.r2_path);

      res.json({
        item: { ...ans, r1_url, r2_url },
        disagreements: disagreements || [],
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Human auditor finalizes an escalated item
// body: { email, finalScore: number, auditorComment?: string }
app.post(
  "/api/audit/:questionNumber/human-finalize",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const { email, finalScore, auditorComment } = req.body || {};
      if (!email || !qNum || typeof finalScore !== "number") {
        return res.status(400).json({
          error: "Missing fields (email, questionNumber, finalScore)",
        });
      }

      // Update the answer row: clear escalation, set final score, finalize
      const { error: upErr } = await supabase
        .from("answers")
        .update({
          final_score: finalScore,
          status: "finalized",
          escalated: false,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("question_number", qNum);
      if (upErr) return res.status(500).json({ error: upErr.message });

      // Close any pending auditor request (ignore if table/columns differ)
      try {
        await supabase
          .from("auditor_requests")
          .update({
            auditor_comment: auditorComment || null,
            auditor_score: String(finalScore),
            status: "resolved",
            resolved_at: new Date().toISOString(),
          })
          .eq("email", email)
          .eq("question_number", qNum)
          .eq("status", "pending");
      } catch {}

      // Log action (ignore if audit_logs schema differs)
      try {
        await supabase.from("audit_logs").insert({
          email,
          question_number: qNum,
          action: "Human Finalize",
          new_score: String(finalScore),
          comment: auditorComment || null,
          created_at: new Date().toISOString(),
        });
      } catch {}

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Auditor approve: finalize with the current AI score (no escalation needed)
// body: { email, note?: string }
app.post(
  "/api/audit/:questionNumber/auditor-approve",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const { email, note } = req.body || {};
      if (!email || !qNum)
        return res
          .status(400)
          .json({ error: "Missing fields (email, questionNumber)" });

      const { data: row, error: selErr } = await supabase
        .from("answers")
        .select("ai_score,final_score")
        .eq("email", email)
        .eq("question_number", qNum)
        .single();
      if (selErr) return res.status(404).json({ error: "Item not found" });
      if (row?.final_score != null)
        return res.status(400).json({ error: "Already finalized" });
      if (row?.ai_score == null)
        return res.status(400).json({ error: "No AI score to approve" });

      const { error: upErr } = await supabase
        .from("answers")
        .update({
          final_score: row.ai_score,
          status: "finalized",
          escalated: false,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("question_number", qNum);
      if (upErr) return res.status(500).json({ error: upErr.message });

      try {
        await supabase.from("audit_logs").insert({
          email,
          question_number: qNum,
          action: "Auditor Approve (AI score)",
          new_score: String(row.ai_score),
          comment: note || null,
          created_at: new Date().toISOString(),
        });
      } catch {}

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Missing-feedback (user has no doc)
app.post(
  "/api/missing-feedback",
  aiLimiter,
  requireUser(),
  upload.none(),
  async (req, res) => {
    const email = req.authUser?.email;
    const { questionNumber, requirementText, missingReason } = req.body;
    if (!email)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const prompt = `A supplier was asked to submit the following requirement:
"${requirementText}"

However, they responded that they don't have it. Their reason was:
"${missingReason}"

As an AI compliance evaluator, you must:
1. Decide if the reason reasonably justifies the absence of the document.
2. Provide a temporary compliance score using ONLY: Fully Compliant (5/5), Strong (4/5), Moderate (3/5), Weak (2/5), Not Compliant (1/5)
3. Give a short recommendation to improve.

Format:
Score: [exactly one of the allowed scores]
Justification: [your decision]
Suggestion: [1-2 sentence recommendation]
`;

    try {
      const aiReply = await callGroq(prompt);

      // try to extract (x/5) if the model returns bands like "Fully Compliant (5/5)"
      const m = aiReply.match(/\((\d)\s*\/\s*5\)/);
      const aiScore = m ? parseInt(m[1], 10) : null;
      await supabase.from("answers").upsert(
        {
          email,
          question_number: Number(questionNumber),
          answer: "No Document - AI Reviewed",
          upload_feedback: aiReply,
          ai_score: aiScore,
          status: "ai-reviewed",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,question_number" },
      );

      return res.json({ success: true, feedback: aiReply });
    } catch (err) {
      console.error("AI justification error:", err);
      return res
        .status(500)
        .json({ success: false, message: "AI evaluation failed." });
    }
  },
);

// Quick placeholder that returns 5-band value (no "Score: 70" nonsense)
app.post("/api/check-missing-reason", requireUser(), async (req, res) => {
  const { reason, requirement, email, questionNumber } = req.body;
  const feedback = `✅ AI Feedback:
Reason given: ${reason}
Requirement: ${requirement}
Score: Moderate (3/5)
Suggestion: Please upload supporting justification or request auditor review.`;
  res.json({ feedback });
});

// Manual score override
app.post(
  "/api/manual-score",
  requireRole(["admin", "auditor"]),
  async (req, res) => {
    const { email, questionNumber, newScore, comment, auditor } = req.body;
    const ns = Number(newScore);
    if (!email || !questionNumber || !Number.isFinite(ns) || ns < 1 || ns > 5) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid inputs (score must be 1..5)" });
    }
    try {
      const { data: existing } = await supabase
        .from("answers")
        .select("upload_feedback")
        .eq("email", email)
        .eq("question_number", questionNumber)
        .single();

      await supabase
        .from("answers")
        .update({
          final_score: ns,
          status: "auditor-final",
          review_mode: false,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("question_number", questionNumber);

      await supabase.from("audit_logs").insert({
        email,
        question_number: questionNumber,
        action: "Manual Score Override",
        old_score: existing?.upload_feedback || null,
        new_score: newScore,
        comment,
        auditor,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("❌ Manual scoring failed:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// Disagreement flow
app.post(
  "/api/disagree-feedback",
  aiLimiter,
  requireUser(),
  upload.array("evidence[]", 6),
  async (req, res) => {
    try {
      const email = req.authUser?.email;
      const { questionNumber, requirement, disagreeReason } = req.body;
      const { tess: tessLang } = resolveLang(req.body.ocrLang || "eng");
      if (!email) return res.status(401).json({ error: "Unauthorized" });
      let fileText = "";
      if (Array.isArray(req.files) && req.files.length) {
        const parts = [];
        for (const f of req.files) {
          try {
            try {
              const { fileTypeFromFile } = await import("file-type");
              const ft = await fileTypeFromFile(f.path);
              const ext = (f.originalname.split(".").pop() || "").toLowerCase();
              if (ft && !mimeAllowedByExt(ext, ft.mime)) {
                parts.push(""); // keep index parity
                continue;
              }
            } catch {}
            const txt = await extractText(f.path, f.originalname, tessLang);
            parts.push(txt || "");
          } catch {
            parts.push("");
          } finally {
            try {
              fs.unlinkSync(f.path);
            } catch {}
          }
        }
        fileText = parts.filter(Boolean).join("\n\n---\n");
      }

      const prompt = `
You are an OHS compliance auditor reviewing a supplier's disagreement with the AI's feedback.

Requirement: ${requirement}
Disagreement Reason: ${disagreeReason}
${fileText ? `File Content:\n${fileText}` : ""}

- Assess if the supplier's argument and/or additional file support compliance.
- Give a new score using ONLY: Stretch (5/5), Commitment (4/5), Robust (3/5), Warning (2/5), Offtrack (1/5)
- Give a short summary and suggestion.

IMPORTANT SCORING INSTRUCTIONS:
- If the supplier's disagreement is only opinion/feeling without evidence, assign Offtrack (1/5).
- Be evidence-based. Politeness/willingness does not change the score.
- Use the lowest score unless real evidence is present.

Format:
Score: [exactly one of above]
Summary: [short]
Suggestions: [bullets, or 'None']
`;

      const feedback = await callGroq(prompt);
      await supabase.from("disagreements").insert({
        email,
        question_number: Number(questionNumber),
        requirement,
        disagree_reason: disagreeReason,
        ai_feedback: feedback,
        created_at: new Date().toISOString(),
      });

      res.json({ feedback });
    } catch (err) {
      console.error("ERROR in /api/disagree-feedback:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// Skip requirement
app.post("/api/skip-requirement", requireUser(), async (req, res) => {
  const email = req.authUser?.email;
  const { questionNumber /*, requirementIdx*/ } = req.body;
  if (!email || !questionNumber) {
    return res.status(400).json({ error: "Missing fields" });
  }

  await supabase.from("answers").upsert(
    {
      email,
      question_number: parseInt(questionNumber, 10),
      answer: "Skipped",
      upload_feedback: `Score: Offtrack (1/5)\nSummary: Requirement skipped.`,
      ai_score: 1,
      status: "ai-reviewed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email,question_number" },
  );
  res.json({ success: true });
});

console.log("GROQ_API_KEY exists?", !!process.env.GROQ_API_KEY);
console.log("GROQ_MODEL is", process.env.GROQ_MODEL);

// --- Auditor login (server checks env user/pass, returns Auditor JWT) ---
app.post(
  "/api/auditor/login",
  loginDailyLimiter,
  loginBurstLimiter,
  async (req, res) => {
    const { username, password } = req.body || {};
    if (username !== AUDITOR_USER || password !== AUDITOR_PASSWORD) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    return res.json({ token: signAuditorToken() });
  },
);
// --- List profiles (search optional) ---
app.get("/api/admin/profiles", requireRole(["admin"]), async (req, res) => {
  const search = (req.query.search || "").trim();
  let query = supabase
    .from("profiles")
    .select("id,email,company_name,role")
    .order("email");
  if (search) {
    // Escape commas and asterisks so user input can't break the filter
    const safe = search.replace(/([,*])/g, "\\$1");
    query = query.or(`email.ilike.*${safe}*,company_name.ilike.*${safe}*`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// --- Update one profile (company_name / role) ---
app.put("/api/admin/profiles/:id", requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { company_name, role } = req.body || {};
  const payload = {};
  if (typeof company_name === "string") payload.company_name = company_name;
  if (typeof role === "string") payload.role = role;

  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", id)
    .select("id,email,company_name,role")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- Create a new user + profile (optional) ---
app.post("/api/admin/create-user", requireRole(["admin"]), async (req, res) => {
  const { email, password, company_name, role = "user" } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  // Create auth user (service role required; you already use service role on server)
  const { data: created, error: createErr } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr) return res.status(500).json({ error: createErr.message });

  const userId = created?.user?.id;
  if (!userId)
    return res.status(500).json({ error: "Failed to get new user id" });

  // Ensure a profile row
  const { error: profErr } = await supabase.from("profiles").upsert({
    id: userId,
    email,
    company_name: company_name || "",
    role,
  });
  if (profErr) return res.status(500).json({ error: profErr.message });

  res.json({ ok: true, userId });
});
// Centralized error handler (last middleware)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (err?.code === "LIMIT_UNEXPECTED_FILE") {
    return res
      .status(400)
      .json({ error: "Too many files uploaded for this field" });
  }
  if (err?.message === "Unsupported file type") {
    return res.status(400).json({ error: err.message });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large (max 15MB)" });
  }
  res.status(500).json({ error: "Internal server error" });
});
// ---------- Start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`VendorIQ Groq API listening on port ${PORT}`);
});

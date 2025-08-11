require("dotenv").config();
const fs = require("fs");
const path = require("path");
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

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
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

const upload = multer({
  dest: "tmp",
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const app = express();

// --- CORS (must be before routes) ---
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || "https://vendoriq-chatbot.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.DEV_EXTRA_ORIGIN || "",
].filter(Boolean);

// Reuse the same options for both middleware and preflight
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman
    cb(null, allowedOrigins.includes(origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: false,
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// 🚨 Express 5 needs a RegExp here — do NOT quote it
app.options(/.*/, cors(corsOptions));

app.use(express.json());
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
      try {
        const data = await pdfParse(fs.readFileSync(localPath));
        if (data.text && data.text.trim().length > 10) return data.text;
        // fallback to OCR
        const { data: t } = await Tesseract.recognize(localPath, ocrLang);
        return t.text || "";
      } catch {
        const { data: t } = await Tesseract.recognize(localPath, ocrLang);
        return t.text || "";
      }
    }
    if (["jpg", "jpeg", "png"].includes(ext)) {
      try {
        const { data: t } = await Tesseract.recognize(localPath, ocrLang);
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
  const safeBase = String(Date.now()) + "-" + (originalName || "file");
  const tmpPath = path.join("tmp", safeBase);
  fs.writeFileSync(tmpPath, buf);
  try {
    return await extractText(tmpPath, originalName, ocrLang);
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

// ---------- Normalizers ----------
function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeCompanyName(str) {
  return (str || "")
    .toLowerCase()
    .replace(/(private|pvt|limited|ltd|inc|corp|company|co|plc)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/\s+/g, "");
}

// ---------- Utilities ----------
function extractAllScores(feedbackText) {
  const scores = [];
  if (!feedbackText) return scores;

  // Match either banded words or just the (X/5)
  // Includes: Stretch/Commitment/Robust/Warning/Offtrack
  // and: Fully Compliant/Strong/Moderate/Weak/Not Compliant
  const regex =
    /Score:\s*(?:Stretch|Commitment|Robust|Warning|Offtrack|Fully\s+Compliant|Strong|Moderate|Weak|Not\s+Compliant)?\s*\((\d)\s*\/\s*5\)/gi;

  let match;
  while ((match = regex.exec(feedbackText))) {
    if (match[1]) scores.push(Number(match[1]));
  }
  return scores;
}
const blobOrStreamToBuffer = async (data) => {
  if (data && typeof data.arrayBuffer === "function") {
    // Blob-like (browser/undici)
    return Buffer.from(await data.arrayBuffer());
  }
  // Node stream fallback
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

// Save simple Yes/No answer
app.post("/api/save-answer", requireUser(), async (req, res) => {
  try {
    const { email, questionNumber, answer } = req.body;
    if (!email || !questionNumber || !answer) {
      return res.status(400).json({ error: "Missing fields" });
    }

    let upload_feedback = null;
    if (answer === "No") {
      upload_feedback = "Score: Offtrack (1/5)\nSummary: User answered 'No'.";
    }

    const { error } = await supabase.from("answers").upsert(
      {
        email,
        question_number: parseInt(questionNumber),
        answer,
        upload_feedback,
        updated_at: new Date().toISOString(),
      },
      { onConflict: ["email", "question_number"] }, // requires unique constraint
    );
    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error("Save answer error:", err);
    res.status(500).json({ error: err.message });
  }
});

// NEW: Review a question (used by frontend)
app.post("/api/review-question", requireUser(), async (req, res) => {
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

    // 1) Download & extract text for each storage path
    let allText = "";

    const filePaths = Array.isArray(files)
      ? files.filter((p) => typeof p === "string" && p.trim())
      : [];
    for (const storagePath of filePaths) {
      try {
        const dl = await supabase.storage.from("uploads").download(storagePath);
        if (dl.error) {
          console.error(`[storage.download] ${storagePath}:`, dl.error);
          // If you *ever* see 401/403 here, your server is not using SERVICE_ROLE.
          continue;
        }

        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = storagePath.split(".").pop() || "bin";
        const text = await extractTextFromBuffer(buf, `file.${ext}`, ocrLang);
        if (text?.trim()) {
          allText += `\n\n--- FILE: ${storagePath} ---\n${text}`;
        }
      } catch (e) {
        // skip file errors, continue
      }
    }

    if (!allText.trim()) {
      return res.json({
        feedback:
          "No readable content found in uploaded files. Please upload a clear PDF/IMG/TXT/DOCX with relevant content.",
        score: 1,
      });
    }

    // 2) Prompt
    const qNum = Number(questionNumber);

    // 🔐 validate question number (mirror /api/check-file)
    if (!Number.isFinite(qNum) || qNum <= 0) {
      return res.status(400).json({ error: "Invalid question number." });
    }

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

    // 3) Extract score
    let score = null;
    const m = feedback.match(
      /Score:\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\/5\)/i,
    );
    if (m) score = parseInt(m[2], 10);

    // 4) Save
    await supabase.from("answers").upsert(
      {
        email,
        question_number: qNum,
        upload_feedback: feedback,
        updated_at: new Date().toISOString(),
        status: "ai-reviewed",
      },
      { onConflict: ["email", "question_number"] },
    );

    const safeScore =
      typeof score === "number" && score >= 1 && score <= 5 ? score : null;
    return res.json({ feedback, score: safeScore });
  } catch (err) {
    console.error("review-question error:", err);
    return res.status(500).json({ error: "AI review failed" });
  }
});

// Session summary
app.post("/api/session-summary", requireUser(), async (req, res) => {
  try {
    const { email /*, sessionId*/ } = req.body;
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
        gemini_summary: feedback,
        gemini_score: aiScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: ["email"] },
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
      { onConflict: ["email"] },
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
    .single();
  res.json({ supplierName: data?.supplier_name || "" });
});

// Check file (per requirement upload)
app.post(
  "/api/check-file",
  requireUser(),
  upload.single("file"),
  async (req, res) => {
    const cleanup = () => {
      if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
    };

    try {
      const { email, questionNumber, userExplanation, ocrLang } = req.body;
      const lang = ocrLang || "eng";
      if (!req.file)
        return res.json({ success: false, feedback: "No file uploaded." });

      const qNum = parseInt(questionNumber);
      // 🔐 validate question number
      if (!Number.isFinite(qNum) || qNum <= 0) {
        cleanup();
        return res
          .status(400)
          .json({ success: false, feedback: "Invalid question number." });
      }
      // 🛑 Explicitly block legacy .doc
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

      // 🔎 Fetch the registered supplier/company name for this email
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

      // Extract text
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

      // Check company name occurrence
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 4);

      const normalizedAuth = normalizeCompanyName(officialCompanyName);
      const foundMatchingLine = lines.find((l) => {
        const n = normalizeCompanyName(l);
        return n.includes(normalizedAuth) || normalizedAuth.includes(n);
      });

      if (!foundMatchingLine) {
        return res.json({
          success: true,
          score: 1,
          feedback: `❌ **Company Name Mismatch**\n\nDocument does not clearly mention the registered company name: "${officialCompanyName}".\n\n**Score: Offtrack (1/5)**\nSummary: Uploaded document does not match the registered supplier. Please re-upload a document that contains your registered company name as shown in your profile.`,
          requireCompanyNameConfirmation: true,
          detectedCompanyName: "", // for backward compat; not actually detected
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
        /Score:\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\/5\)/i,
      );
      if (match) score = parseInt(match[2], 10);

      await supabase.from("answers").upsert(
        {
          email,
          question_number: qNum,
          upload_feedback: feedback,
          updated_at: new Date().toISOString(),
        },
        { onConflict: ["email", "question_number"] },
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
        { onConflict: ["email", "question_number"] },
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
// body: { email, ocrLang? }
app.post(
  "/api/audit/:questionNumber/validate",
  requireUser(),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const { ocrLang = "eng" } = req.body || {};
      const email = req.authUser?.email;
      if (!email || !qNum)
        return res.status(400).json({ error: "Missing fields" });

      const { data: ans, error: ansErr } = await supabase
        .from("answers")
        .select("r1_path,r2_path")
        .eq("email", email)
        .eq("question_number", qNum)
        .maybeSingle();
      if (ansErr) return res.status(500).json({ error: ansErr.message });

      // NEW: prefer posted files if provided
      const postedFiles = Array.isArray(req.body.files)
        ? req.body.files.map((f) => f?.path).filter(Boolean)
        : [];

      if ((!ans?.r1_path || !ans?.r2_path) && postedFiles.length === 0) {
        await supabase
          .from("answers")
          .update({
            validation_status: "invalid",
            validation_feedback: "Please upload both r1 and r2.",
          })
          .eq("email", email)
          .eq("question_number", qNum);
        return res.json({
          overall: {
            status: "fail",
            errors: ["Please upload both r1 and r2."],
          },
          requirements: [],
          crossRequirement: [],
          feedback: "Please upload both r1 and r2.",
        });
      }

      // Get registered supplier/company name
      const { data: sn } = await supabase
        .from("supplier_names")
        .select("supplier_name")
        .eq("email", email)
        .single();
      const official = (sn?.supplier_name || "").trim();
      if (!official) {
        await supabase
          .from("answers")
          .update({
            validation_status: "invalid",
            validation_feedback:
              "No registered company name on file. Set it first.",
          })
          .eq("email", email)
          .eq("question_number", qNum);
        return res.json({
          overall: {
            status: "fail",
            errors: [
              "No registered company name on file. Please set it before proceeding.",
            ],
          },
          requirements: [],
          crossRequirement: [],
          feedback:
            "No registered company name on file. Please set it before proceeding.",
        });
      }

      // Download & OCR helper
      const downloadText = async (storagePath) => {
        const dl = await supabase.storage.from("uploads").download(storagePath);
        if (dl.error) throw dl.error;
        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = storagePath.split(".").pop() || "bin";
        return await extractTextFromBuffer(buf, `file.${ext}`, ocrLang);
      };
      const filePaths = postedFiles.length
        ? postedFiles
        : [ans.r1_path, ans.r2_path].filter(Boolean);
      const texts = await Promise.all(filePaths.map(downloadText));
      const merged = texts
        .join("\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const normalizedAuth = normalizeCompanyName(official);
      const found = merged.some((l) => {
        const n = normalizeCompanyName(l);
        return n.includes(normalizedAuth) || normalizedAuth.includes(n);
      });

      const isValid = !!found;
      const feedback = isValid
        ? "Looks like the right documents. Continue to audit?"
        : `Document set does not clearly mention the registered company name: "${official}". Re-upload, or continue anyway.`;

      await supabase
        .from("answers")
        .update({
          validation_status: isValid ? "valid" : "invalid",
          validation_feedback: feedback,
          updated_at: new Date().toISOString(),
        })
        .eq("email", email)
        .eq("question_number", qNum);

      // Normalized response the UI expects
      const overall = isValid
        ? { status: "ok", warnings: [] }
        : { status: "fail", errors: [feedback] };
      const requirements = filePaths.map((_, i) => ({
        index: i,
        readable: true,
        readability: null,
        alignment: {
          meets: isValid,
          confidence: isValid ? 0.7 : 0.2,
          evidence: [],
        },
        missing: [],
        moreSuggested: [],
      }));
      res.json({ overall, requirements, crossRequirement: [], feedback });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Run the audit on r1+r2 (optionally proceed even if invalid by passing {insist:true})
// POST /api/audit/:questionNumber/process
// body: { email, insist?: boolean, companyProfile?, ocrLang? }
app.post(
  "/api/audit/:questionNumber/process",
  requireUser(),
  async (req, res) => {
    try {
      const qNum = Number(req.params.questionNumber);
      const {
        insist = false,
        companyProfile,
        ocrLang = "eng",
      } = req.body || {};
      const email = req.authUser?.email;
      if (!email || !qNum)
        return res.status(400).json({ error: "Missing fields" });

      const { data: row, error: rowErr } = await supabase
        .from("answers")
        .select("validation_status,r1_path,r2_path")
        .eq("email", email)
        .eq("question_number", qNum)
        .maybeSingle();
      if (rowErr) return res.status(500).json({ error: rowErr.message });

      const postedFiles = Array.isArray(req.body.files)
        ? req.body.files.map((f) => f?.path).filter(Boolean)
        : [];

      // If client passed files[] now, we don’t block on a previous "invalid"
      const wasValidatedInvalid = row?.validation_status === "invalid";
      if (wasValidatedInvalid && !insist && postedFiles.length === 0) {
        return res.status(400).json({
          error: "Docs not validated. Pass insist=true or provide files[].",
        });
      }

      const files = postedFiles.length
        ? postedFiles
        : [row?.r1_path, row?.r2_path].filter(Boolean);

      if (files.length === 0) {
        return res
          .status(400)
          .json({ error: "No files to process. Upload first." });
      }

      let allText = "";
      for (const storagePath of files) {
        const dl = await supabase.storage.from("uploads").download(storagePath);
        if (dl.error) continue;
        const buf = await blobOrStreamToBuffer(dl.data);
        const ext = storagePath.split(".").pop() || "bin";
        const t = await extractTextFromBuffer(buf, `file.${ext}`, ocrLang);
        if (t?.trim()) allText += `\n\n--- FILE: ${storagePath} ---\n${t}`;
      }

      if (!allText.trim()) {
        await supabase
          .from("answers")
          .update({
            upload_feedback: "No readable content found in uploaded files.",
            ai_score: 1,
            status: "ai-reviewed",
            updated_at: new Date().toISOString(),
          })
          .eq("email", email)
          .eq("question_number", qNum);
        return res.json({
          score: 1,
          feedback: "No readable content found in uploaded files.",
        });
      }

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
Summary: .
Missing: .
Score: [Stretch (5/5) | Commitment (4/5) | Robust (3/5) | Warning (2/5) | Offtrack (1/5)]
Recommendation: .
`;
      const feedback = await callGroq(prompt);

      // Extract numeric score
      let score = null;
      const m = feedback.match(
        /Score:\s*(Stretch|Commitment|Robust|Warning|Offtrack)\s*\((\d)\/5\)/i,
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
        { onConflict: ["email", "question_number"] },
      );

      const safeScore =
        typeof score === "number" && score >= 1 && score <= 5 ? score : null;
      res.json({ score: safeScore, feedback });
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
    const { email } = req.body || {};
    if (!email || !qNum)
      return res.status(400).json({ error: "Missing fields" });

    const { data: row } = await supabase
      .from("answers")
      .select("ai_score")
      .eq("email", email)
      .eq("question_number", qNum)
      .single();

    const finalScore = row?.ai_score ?? null;
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
      if (ansErr) return res.status(404).json({ error: "Item not found" });

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
  requireUser(),
  upload.none(),
  async (req, res) => {
    const { email, questionNumber, requirementText, missingReason } = req.body;
    if (!email || !questionNumber || !requirementText || !missingReason) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

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

      await supabase.from("answers").insert({
        email,
        question_number: Number(questionNumber),
        answer: "No Document - AI Reviewed",
        upload_feedback: aiReply, // <-- fixed column
        updated_at: new Date().toISOString(),
      });

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
          final_score: Number(newScore),
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
  requireUser(),
  upload.array("evidence[]", 6),
  async (req, res) => {
    try {
      const { email, questionNumber, requirement, disagreeReason } = req.body;

      let fileText = "";
      if (Array.isArray(req.files) && req.files.length) {
        const parts = [];
        for (const f of req.files) {
          const txt = await extractText(
            f.path,
            f.originalname,
            req.body.ocrLang || "eng",
          );
          parts.push(txt || "");
          try {
            fs.unlinkSync(f.path);
          } catch {}
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
  const { email, questionNumber /*, requirementIdx*/ } = req.body;
  if (!email || !questionNumber) {
    return res.status(400).json({ error: "Missing fields" });
  }

  await supabase.from("answers").upsert(
    {
      email,
      question_number: parseInt(questionNumber),
      answer: "Skipped",
      upload_feedback: `Score: Offtrack (1/5)\nSummary: Requirement skipped.`,
      updated_at: new Date().toISOString(),
    },
    { onConflict: ["email", "question_number"] },
  );
  res.json({ success: true });
});

console.log("GROQ_API_KEY exists?", !!process.env.GROQ_API_KEY);
console.log("GROQ_MODEL is", process.env.GROQ_MODEL);

// --- Admin login (server checks env user/pass, returns admin JWT) ---
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  return res.json({ token: signAdminToken() });
});
// --- Auditor login (separate creds + role: 'auditor') ---
const AUDITOR_USER = process.env.AUDITOR_USER || "auditor";
const AUDITOR_PASSWORD = process.env.AUDITOR_PASSWORD || "";

function signAuditorToken() {
  return jwt.sign({ role: "auditor" }, AUDITOR_JWT_SECRET, { expiresIn: "2h" });
}

app.post("/api/auditor/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (username !== AUDITOR_USER || password !== AUDITOR_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  return res.json({ token: signAuditorToken() });
});
// --- List profiles (search optional) ---
app.get("/api/admin/profiles", requireRole(["admin"]), async (req, res) => {
  const search = (req.query.search || "").trim();
  let query = supabase
    .from("profiles")
    .select("id,email,company_name,role")
    .order("email");
  if (search) {
    // simple OR search
    query = query.or(`email.ilike.%${search}%,company_name.ilike.%${search}%`);
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
  res.status(500).json({ error: "Internal server error" });
});
// ---------- Start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`VendorIQ Groq API listening on port ${PORT}`);
});

import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminPage from "./Admin/AdminPage.jsx";
import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import "./App.css"; // <-- Make sure to create/import this!
import AuditorReviewPanel from "./AuditorReviewPanel";
import AuthPage from "./AuthPage";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";


// --- SUPABASE ---
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);
// Attach Supabase access token automatically to API requests
async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || "";
}

async function apiFetch(
  path,
  { method = "POST", json, formData, headers = {} } = {}
) {
  const token = await getAccessToken();
  const allHeaders = { ...headers };
  if (token) allHeaders.Authorization = `Bearer ${token}`; // ← only if present

  if (json) {
    allHeaders["Content-Type"] = "application/json";
    return fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: allHeaders,
      body: JSON.stringify(json),
    });
  }
  if (formData) {
    // don't set Content-Type for FormData
    return fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: allHeaders,
      body: formData,
    });
  }
  return fetch(`${BACKEND_URL}${path}`, { method, headers: allHeaders });
}

// --- CONSTANTS ---
const botAvatar = process.env.PUBLIC_URL + "/bot-avatar.png";
const BACKEND_URL = "https://4d66d45e-0288-4203-935e-1c5d2a182bde-00-38ratc2twzear.pike.replit.dev";

// --- QUESTIONS ---
const questions = [
  {
    number: 1,
    text:
      "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    disqualifiesIfNo: true,
    requirements: [
      "A copy of the OHS Policy.",
      "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards).",
    ],
  },
  {
    number: 2,
    text:
      "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
    disqualifiesIfNo: false,
    requirements: [
      "A declaration from your top management that your company has not committed any infringements to the laws or regulations or is not under any current investigation by any regulatory authority in respect of any OHS matters (Statement should be signed off by CEO with official letterhead, stamp, etc.)",
      "A copy of the documented process or the systematic identification and assessment of legal applicable laws and regulations (i.e. procedure, instruction)",
      "A list of all OHS requirements including laws and regulations that the Company has identified as applicable",
      "A report of the legal compliance check conducted within the last twelve (12) months and corrective action plan to close any gaps identified",
    ],
  },
  {
    number: 3,
    text:
      "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
    disqualifiesIfNo: false,
    requirements: [
      "A copy of the documented process (i.e. procedure, instruction).",
      "Evidence of how the process has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards).",
      "Evidence of investigations, identified root causes and action plans for incidents and near misses (i.e. investigation reports) (excluding personal identifiable information).",
      `Records if the Company had any work-related fatality and/or incidents (internal employee, sub-contractors, or external party) that caused permanent disability or absence of over thirty (30) days in the last three (03) years.
      Evidence requested includes:
        1. If yes, the Company must provide the investigation report/s, and corrective action plans to prevent re-occurrence, including a status report on the corrective actions.
        2. If not, the Company must provide a declaration from its top management that there has not been any work-related fatality and/or incident that caused permanent disability or absence of over thirty (30) days in the last three (03) years.`,
      "Last three (03) years statistics including incidents, near misses, fatalities, work related illness.",
    ],
  },
];

function formatSummary(summary) {
  if (!summary) return "";

  // Handle case where summary is already an object with strengths/weaknesses
  if (typeof summary === "object") {
    let str = "";
    if (Array.isArray(summary.strengths) && summary.strengths.length) {
      str += "**Strengths:**\n";
      for (const s of summary.strengths) str += `- ${s}\n`;
    }
    if (Array.isArray(summary.weaknesses) && summary.weaknesses.length) {
      if (str) str += "\n";
      str += "**Weaknesses:**\n";
      for (const w of summary.weaknesses) str += `- ${w}\n`;
    }
    if (str) return str.trim();
    return JSON.stringify(summary, null, 2); // fallback
  }
  // Otherwise, it's just a string
  return summary;
}
	  
// =============== MAIN APP COMPONENT ===============
function ChatApp() {
  const [reportBreakdown, setReportBreakdown] = useState([]); // NEW
  const [bubblesComplete, setBubblesComplete] = useState(false); // <--- ADD THIS IF NOT DECLARED
  const sendBubblesSequentially = (messagesArray, from = "bot", delay = 650, callback) => {
  setTyping(true); // <--- Mark as typing at start
  setBubblesComplete(false);
  // ⬇️ Guard for empty arrays
  if (!messagesArray?.length) {
    setTyping(false);
    setBubblesComplete(true);
    if (typeof callback === "function") callback(); // optional
    return;
  }
  let idx = 0;
  function sendNext() {
    let i = 0;
    setMessages(prev => [...prev, { from, text: "" }]);
    const interval = setInterval(() => {
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1] = {
          ...newMsgs[newMsgs.length - 1],
          text: messagesArray[idx].slice(0, i + 1)
        };
        return newMsgs;
      });
      i++;
      if (i >= messagesArray[idx].length) {
        clearInterval(interval);
        setTimeout(() => {
          idx++;
          if (idx < messagesArray.length) {
            setTimeout(sendNext, delay);
          } else if (callback) {
            setTimeout(() => {
              setTyping(false); // <--- Typing finished!
              setBubblesComplete(true);
              callback();
            }, delay);
          } else {
            setTimeout(() => {
              setTyping(false); // <--- Typing finished!
              setBubblesComplete(true);
            }, delay);
          }
        }, 350);
      }
    }, 12);
  }
  sendNext();
};


//================ AKA useState ===========================
  const [uploadedFiles, setUploadedFiles] = useState({}); // { questionNumber: [filePath, filePath] }
  const [showMultiUpload, setShowMultiUpload] = useState(false); // NEW: gate for multi-upload
  const [precheck, setPrecheck] = useState(null);                // NEW: {feedback, score} from pre-check
  const [auditResult, setAuditResult] = useState(null);          // NEW: {feedback, score} after audit
  const [focusReqIdx, setFocusReqIdx] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [step, setStep] = useState(-1);
  const [justAnswered, setJustAnswered] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showIntro, setShowIntro] = useState(false);
  const [summary, setSummary] = useState("");
  const [score, setScore] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [reviewMode, setReviewMode] = useState(false);
  const chatEndRef = useRef(null);
  const [companyName, setCompanyName] = useState("");


  const [user, setUser] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  const [profile, setProfile] = useState(null);
  const [results, setResults] = useState(
    questions.map(q => ({
      answer: null,
      questionScore: null,   // (optional, for future)
      requirements: q.requirements.map(() => ({
        aiScore: null,       // store AI score if available
        aiFeedback: ""       // store AI feedback
      }))
    }))
  );
async function fetchSummary() {
        setTyping(true);
try {
  const response = await apiFetch(`/api/session-summary`, {
    json: {} // backend will inject email from token
  });

          const result = await response.json();
		  
		  console.log("Session summary API response:", result);
          
  if (typeof result?.feedback === "string") {
  setSummary(result.feedback);
} else if (typeof result?.feedback === "object") {
  setSummary(result.feedback); // <--- pass as object
} else {
  setSummary("No summary found.");
}
		  setScore(result?.score ?? 0);
          setReportBreakdown(result?.detailedScores ?? []);

        } catch (err) {
          setSummary("Failed to generate summary. Please contact support.");
        }
        setTyping(false);
        }

	  
function ProgressPopup({ results, questions, onJump, onClose }) {
  return (
    <div style={{
      position: "fixed",
      top: 80,
      right: 22,
      background: "#fff",
      borderRadius: 12,
      boxShadow: "0 2px 8px #0002",
      padding: 16,
      minWidth: 240,
      zIndex: 9999,
      border: "1.5px solid #229cf9"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ color: "#0085CA", margin: 0 }}>Progress</h4>
        <button onClick={onClose}
          style={{ background: "none", border: "none", fontSize: "0.9rem", color: "#aaa", cursor: "pointer", marginLeft: 8 }}>
          ×
        </button>
      </div>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        {questions.map((q, i) => (
          <li key={q.number} style={{ marginBottom: 14 }}>
            <b>Q{i + 1}:</b>
            <span style={{
              color: results[i]?.answer ? "#157A4A" : "#a00",
              fontWeight: 500,
              marginLeft: 8
            }}>
              {results[i]?.answer ? "✔️" : "⏳"}
            </span>
            <button
              onClick={() => onJump(i)}
              style={{ marginLeft: 10, fontSize: "0.9rem", cursor: "pointer" }}
            >
              Go
            </button>
            {/* Requirement Progress as Text */}
            {results[i]?.answer === "Yes" && Array.isArray(q.requirements) && (
              <ul style={{ marginLeft: 18, marginTop: 4, marginBottom: 2, paddingLeft: 0 }}>
                {q.requirements.map((req, ridx) => {
                  const feedback = results[i].requirements[ridx]?.aiFeedback;
                  let status = "Not started";
                  let color = "#aaa";
                  if (feedback) {
                    if (feedback === "Skipped") {
                      status = "Skipped";
                      color = "#f39c12";
                    } else {
                      status = "Uploaded";
                      color = "#157A4A";
                    }
                  }
                  return (
      <li
        key={ridx}
        style={{
          fontSize: "0.9rem",
          color,
          fontWeight: 600,
          marginBottom: 1,
          listStyle: "none",
          cursor: "pointer", // add pointer
          textDecoration: "underline dotted", // optional, to show it's clickable
        }}
        onClick={() => onJump(i, ridx)} // pass requirement index too!
        title="Jump to this requirement"
      >
        Requirement {ridx + 1}: {status}
      </li>
    );
  })}
</ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

useEffect(() => {
  // Get current session on load
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) setUser(session.user);
  });
}, []);

useEffect(() => {
  if (user) {
    supabase
      .from('profiles')
      .select('company_name, location_id, country, customer_unit, market_area')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Profile fetch error', error);
        } else {
          setProfile(data);
        }
      });
  }
}, [user]);

useEffect(() => {
    // If user just logged in and there are no messages, show intro
    if (user && messages.length === 0 && step === -1) {
      setShowIntro(true);
      const introMsgs = getBotMessage({ step: -1 });
      sendBubblesSequentially(introMsgs, "bot", 650, () => {
        setShowIntro(false);
        setStep(0); // Show first question after intro
      });
    }
    // eslint-disable-next-line
  }, [user]);
  useEffect(() => {
    if (user && !sessionId) {
      setSessionId(user.id); // Or use a UUID if you want a new session each time
    }
    // eslint-disable-next-line
  }, [user]);
   

  // --- Dialog logic ---
  function getBotMessage({ step, answer, justAnswered }) {
    if (step < 0) {
      return [
        "Hi there! Welcome to the VendorIQ Supplier Compliance Interview.",
        "I’ll be your guide today—just answer a few questions, and I’ll help you every step of the way.",
        "Let's begin!",
      ];
    }
    const q = questions[step];
    if (!justAnswered) {
      return [
        "Let's talk about your company's safety practices.",
        `**Question ${q.number}:** ${q.text}`,
      ];
    }
    if (answer === "Yes") {
      return [
        "Awesome, thanks for letting me know!",
        "Since you answered yes, could you please upload the required documents? (You can drag and drop your files or click to upload.)",
      ];
    }
    if (answer === "No" && q.disqualifiesIfNo) {
      return [
        "Thanks for your honesty!",
        "Just so you know, having a written OHS Policy is an important requirement. Let's continue.",
      ];
    }
    return [
      "Thanks for your response!",
      "Let's move on to the next question.",
    ];
  }

// --- Save answer to backend ---
const saveAnswerToBackend = async (questionNumber, answer) => {
  try {
    await apiFetch(`/api/save-answer`, {
      json: { questionNumber, answer }
    });

 } catch (err) {
    console.error("Failed to save answer:", err);
  }
};

  // --- Auto-scroll chat to bottom whenever messages or typing changes ---
  useEffect(() => {
    if (chatEndRef.current) {
		 setTimeout(() => {
      chatEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50); // slight delay helps avoid nav clipping
    }
  }, [messages, typing]);

  // --- Ask next question only when appropriate ---
  useEffect(() => {
if ( step >= 0 && step < questions.length && !justAnswered && !showMultiUpload && !showIntro ) {
      sendBubblesSequentially(
        [`**Question ${questions[step].number}:** ${questions[step].text}`],
        "bot"
      );
    }
    // eslint-disable-next-line
   }, [step, showMultiUpload, showIntro, justAnswered]);


  // --- Show review card before summary ---
  const showReview = !showSummary && step >= questions.length && !reviewMode;

  // --- Show summary when done ---
  useEffect(() => {
    if (showSummary && step >= questions.length && user?.email) {
     fetchSummary();
    }
     }, [showSummary, user]);

  // --- Handle answer ---


  const handleAnswer = (answer) => {
  setMessages((prev) => [...prev, { from: "user", text: answer }]);
  setAnswers((prev) => {
    const updated = [...prev];
    updated[step] = answer;
    return updated;
  });
  setResults(prev => prev.map((res, idx) =>
    idx === step
      ? { ...res, answer }
      : res
  ));
  const questionNumber = questions[step].number;
saveAnswerToBackend(questionNumber, answer); // token supplies email


  const botMsgs = getBotMessage({ step, answer, justAnswered: true });
  sendBubblesSequentially(botMsgs, "bot", 650, () => {
      if (answer === "Yes" && questions[step].requirements.length > 0) {
	  setFocusReqIdx(null);          // <— add this line
      setShowMultiUpload(true);   // NEW
         } else {
      setTimeout(() => {
        if (reviewMode) {
          setReviewMode(false);
          setStep(questions.length);
        } else {
          setStep((prev) => prev + 1);
        }
        setJustAnswered(false);
      }, 350);
    }
  });
  setJustAnswered(true);
};
if (!user) {
  return (
    <AuthPage
      onAuth={(userObj, company) => {
        setUser(userObj);
        setCompanyName(company);
      }}
    />
  );
}


  // --- RENDER ---
  return (
    <div
      style={{
        maxWidth: 700,
        margin: "0px auto",
		paddingTop: 40,
        fontFamily: "Inter, sans-serif",
        background: "transparent",   // GPT gray
        minHeight: "100vh",
      }}
    >
<nav
  style={{
    background: "#222",      // dark navbar
    color: "#fff",
    padding: "14px 20px",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: "1.1rem",
    display: "flex",
    alignItems: "center",
    gap: 18,
    justifyContent: "space-between"
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
    <img
      src={botAvatar}
      alt="Bot"
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "#fff",
        marginRight: 12,
      }}
    />
    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
      VendorIQ{companyName ? " | " + companyName : ""}
    </span>
  </div>
  <span style={{ color: "#fff", fontWeight: 400, fontSize: "0.95rem", marginLeft: "auto" }}>
    {user.email}
  </span>
  <button
  style={{
    background: "#229cf9",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "6px 16px",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    marginLeft: 14,
  }}
  onClick={() => setShowProgress(true)}
>
  📊 Progress
</button>

  <button
    style={{
      background: "#1976D2",
      color: "#fff",
      border: "none",
      borderRadius: 7,
      padding: "6px 18px",
      fontSize: "0.9rem",
      fontWeight: 500,
      cursor: "pointer",
      marginLeft: 18,
    }}
    onClick={async () => {
      await supabase.auth.signOut();
      setUser(null);
    }}
  >
    Log Out
  </button>
</nav>


    
{showProgress && (
  <ProgressPopup
  results={results}
  questions={questions}
  onJump={(qIdx, reqIdx) => {
    setStep(qIdx);
    setShowMultiUpload(results[qIdx]?.answer === "Yes");
    setShowSummary(false);
    setReviewMode(false);
    setMessages([]);
    setShowProgress(false); // Hide popup after jump
	setFocusReqIdx(typeof reqIdx === "number" ? reqIdx : null);
  }}
  onClose={() => setShowProgress(false)}
/>
)}

      {/* CHAT HISTORY */}
      <div
        style={{
          maxHeight: 800,
          overflowY: "auto",
          padding: "1px 0 10px 0",
          background: "transparent",
        }}
      >
	  {reviewMode && <AuditorReviewPanel />}
{messages.map((msg, idx) => {
  // User message: right-aligned orange chat bubble, white text
  if (msg.from === "user") {
    return (
      <div
        key={idx}
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: "100%",
          margin: "18px 0",
        }}
      >
        <div
          style={{
            background: "#323232",
            color: "#fff",
            borderRadius: "20px",
            padding: "1px 26px",
            fontSize: "0.90rem",
            fontWeight: 600,
            minWidth: "20px",
            maxWidth: "340px",
            textAlign: "center",
          }}
        >
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // Bot message: plain, dark gray, no bubble
  if (msg.from === "bot") {
    return (
      <div
        key={idx}
        style={{
		  maxWidth: 1000,  
          margin: "10px 0 0 20px", //x,x,x,margin right
          padding: "0 0 0", //
          fontSize: "0.9rem",
          color: "#fff", // dark GPT gray
		  background: "transparent",// No box, blends in with main background
        // you can add lineHeight or letterSpacing here if you want
          lineHeight: 1.3,
        }}
      >
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      </div>
    );
  }

  return null;
})}


		
        <div ref={chatEndRef} />
      </div>

      {/* REVIEW CARD */}
      {showReview && (
        <ReviewCard
          answers={answers}
          questions={questions}
          onRevise={(qIdx) => {
            setStep(qIdx);
            setReviewMode(true);
            setShowSummary(false);
            setMessages([]);
          }}
          onContinue={() => setShowSummary(true)}
        />
      )}

      {/* FINAL SUMMARY CARD */}
      {showSummary && (
  <FinalReportCard
    questions={questions}
    breakdown={reportBreakdown}
    summary={summary}
    score={score}
	onRetry={() => {
      // Re-trigger the summary fetch
      setSummary("");
      setTyping(true);
      // Your summary-fetch logic here (see below)
      fetchSummary();
    }}
  />
)}
         
           {/* MULTI UPLOAD (N docs per question) */}
      {showMultiUpload && step < questions.length && (
        <MultiUploadSection
          question={questions[step]}
          questionNumber={questions[step].number}
          sessionId={sessionId}
          email={user.email}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          precheck={precheck}
          setPrecheck={setPrecheck}
          auditResult={auditResult}
          setAuditResult={setAuditResult}
          setShowMultiUpload={setShowMultiUpload}
          setMessages={setMessages}
          setStep={setStep}
          setJustAnswered={setJustAnswered}
          reviewMode={reviewMode}
          setReviewMode={setReviewMode}
          profile={profile}
		  results={results}
          setResults={setResults}
		  focusReqIdx={focusReqIdx}
        />
      )}
      {/* YES/NO BUTTONS */}
            {!typing &&
			!showMultiUpload &&
			step >= 0 && step < questions.length &&
			!answers[step] &&                 // ⬅️ only if not answered yet
			messages.length > 0 &&
			!showIntro &&
			bubblesComplete && (
          <div style={{ marginTop: 16 }}>
            <button
  onClick={() => handleAnswer("Yes")}
  className="answer-btn"
>
  ✅ Yes
</button>
<button
  onClick={() => handleAnswer("No")}
  className="answer-btn alt"
>
  ❌ No
</button>

          </div>
        )}
{!showProgress && (
  <button
    onClick={() => setShowProgress(true)}
    style={{
      position: "fixed",
      bottom: 38,
      right: 36,
      zIndex: 1100,
      background: "linear-gradient(108deg, #229cf9 70%, #35b3ff 100%)",
      color: "#fff",
      border: "none",
      borderRadius: "50%",
      width: 64,
      height: 64,
      boxShadow: "0 4px 24px #229cf970",
      fontSize: "0.9rem",
      fontWeight: 800,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.15s",
      outline: "none",
    }}
    title="Show Progress"
    aria-label="Show Progress"
  >
    📊
  </button>
)}
		
    </div>
  );
  
}

// --- UPLOAD SECTION ---
function LoaderCard({ text }) {
  return (
    <div style={{ margin: "18px 0 10px 0" }}>
      <div style={{ background:"#1f2a36", border:"1px solid #2e3c4a", borderRadius:10, padding:16, color:"#cfe7ff" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:24, height:24, borderRadius:"50%", border:"3px solid #cfe7ff", borderTopColor:"#229cf9", animation:"spin 0.9s linear infinite" }} />
          <div>
            <div style={{ fontWeight:700 }}>{text}</div>
            <div style={{ fontSize:"0.85rem", opacity:0.85 }}>This can take 10–30 seconds depending on file size.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MultiUploadSection({
  question,                 // { number, text, requirements:[...] }
  questionNumber,
  sessionId,
  email,
  uploadedFiles,
  setUploadedFiles,
  precheck,
  setPrecheck,
  auditResult,
  setAuditResult,
  setShowMultiUpload,
  setMessages,
  setStep,
  setJustAnswered,
  reviewMode,
  setReviewMode,
  profile,
  results,                 // NEW
  setResults,              // NEW
  focusReqIdx,
}) {
  const [ocrLang, setOcrLang] = useState("eng");
  const [paths, setPaths] = useState(() => uploadedFiles[questionNumber] || []); // file paths per requirement
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [localError, setLocalError] = useState("");
  const [disagreeOpen, setDisagreeOpen] = useState(false);
const [disagreeReason, setDisagreeReason] = useState("");
const [isValidating, setIsValidating] = useState(false);
const [isAuditing, setIsAuditing] = useState(false);
  const reqCount = question?.requirements?.length ?? 0; // can be 0..12+
useEffect(() => {
	if (typeof focusReqIdx === "number") {
	const el = document.getElementById(`req-slot-${focusReqIdx}`);
	if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
	}
	}, [focusReqIdx]);
  // Ensure we render one slot per requirement (N-file)
  // Sync paths with any previously uploaded files when revisiting/jumping via Progress
useEffect(() => {
  const base = uploadedFiles[questionNumber] || [];
  const padded = Array.from({ length: reqCount || 0 }, (_, i) => base[i] || "");
  setPaths(padded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [questionNumber, reqCount, uploadedFiles]);


  const uploadForIndex = async (idx, file) => {
    setUploadingIdx(idx);
    setLocalError("");
    try {
      const base = `${sessionId}_${email}/question-${questionNumber}`;
      const filePath = `${base}/req-${idx + 1}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("uploads").upload(filePath, file, { upsert: true });
      if (error) throw error;

      setPaths(prev => {
        const next = [...prev];
        next[idx] = filePath;
        return next;
      });
      setUploadedFiles(prev => {
        const list = Array.isArray(prev[questionNumber]) ? [...prev[questionNumber]] : [];
        list[idx] = filePath;
        return { ...prev, [questionNumber]: list };
      });
	  setResults(prev => {
        const next = [...prev];
        const r = next[questionNumber - 1]?.requirements?.[idx];
        if (r) next[questionNumber - 1].requirements[idx] = { ...r, aiFeedback: "Uploaded" };
        return next;
      });

    } catch (e) {
      setLocalError(`Upload failed: ${e.message || String(e)}`);
    } finally {
      setUploadingIdx(null);
    }
  };

  const clearAll = () => {
    setPrecheck(null);
    setAuditResult(null);
    setPaths(Array.from({ length: reqCount }, () => ""));
    setUploadedFiles(prev => ({ ...prev, [questionNumber]: [] }));
  };

  // 1) PRE-CHECK (AI: are these the *right* docs + suggestions)
  const runPrecheck = async () => {
  setLocalError("");
  setIsValidating(true);
  try {
    if (!paths[0] || !paths[1]) {
      setLocalError("Please upload the required documents first.");
      return;
    }
    const save = await apiFetch(`/api/audit/${questionNumber}/save-files`, {
      json: { email, r1Path: paths[0], r2Path: paths[1] },
    });
    if (!save.ok) throw new Error("Could not register files");

    const res = await apiFetch(`/api/audit/${questionNumber}/validate`, {
      json: { email, ocrLang },
    });
    if (!res.ok) throw new Error("Validation failed");
    const data = await res.json();
    setPrecheck(data);            // shows AFTER loader
  } catch (e) {
    setLocalError(e.message || "Pre-check error");
  } finally {
    setIsValidating(false);
  }
};



  // 2) AUDIT (final review) – proceed even if pre-check wasn't perfect
  const runAudit = async () => {
  setLocalError("");
  setIsAuditing(true);
  try {
    if (!paths[0] || !paths[1]) {
      setLocalError("Please upload the required documents first.");
      return;
    }
    const res = await apiFetch(`/api/audit/${questionNumber}/process`, {
      json: { email, companyProfile: profile || {}, ocrLang, insist: true },
    });
    if (!res.ok) throw new Error("Audit failed");
    const data = await res.json();
    setAuditResult(data);
    setResults(prev => {
      const next = [...prev];
      next[questionNumber - 1] = {
        ...next[questionNumber - 1],
        questionScore: data.score ?? null,
        questionFeedback: data.feedback || ""
      };
      return next;
    });
    setMessages(prev => [
      ...prev,
      { from: "bot", text: `🧠 **AI Audit (Q${questionNumber}):**\n\n${data.feedback || "No feedback."}` },
    ]);
  } catch (e) {
    setLocalError(e.message || "Audit error");
  } finally {
    setIsAuditing(false);
  }
};



  // 3) User agrees – advance to next question
  const agreeAndNext = () => {
    setShowMultiUpload(false);
    setPrecheck(null);
    setAuditResult(null);
    setJustAnswered(false);
    if (reviewMode) {
      setReviewMode(false);
      setStep(questions.length);
    } else {
      setStep(prev => prev + 1);
    }
  };

  // 4) Disagree flow: request reconsideration + increment/possibly escalate
  const submitDisagree = async () => {
    if (!disagreeReason.trim()) return;
    try {
      // a) AI reconsideration message
      const fd = new FormData();
      fd.append("questionNumber", String(questionNumber));
      fd.append("requirement", `Question ${questionNumber} overall audit`);
      fd.append("disagreeReason", disagreeReason);
      fd.append("ocrLang", ocrLang);
      const ai = await apiFetch(`/api/disagree-feedback`, { formData: fd });
      const aiJson = await ai.json();
      setMessages(prev => [
        ...prev,
        { from: "bot", text: `🧠 **AI reconsideration:**\n\n${aiJson?.feedback || "No new feedback."}` },
      ]);

      // b) count attempt & maybe escalate (server enforces the 2x limit)
      const ctr = await apiFetch(`/api/audit/${questionNumber}/disagree`, {
        json: { userArgument: disagreeReason }
      });
      const cJson = await ctr.json(); // { escalated, remainingAppeals }
      if (cJson.escalated) {
        setMessages(prev => [
          ...prev,
          { from: "bot", text: "🚩 Escalated to Human Auditor. We’ll continue; they will finalize later." },
        ]);
        setDisagreeOpen(false);
		        setResults(prev => {
          const next = [...prev];
          if (next[questionNumber - 1]) {
            next[questionNumber - 1].questionScore = null;
            next[questionNumber - 1].questionFeedback = "Pending Human Auditor";
          }
          return next;
        });
        agreeAndNext();
        return;
      } else {
        setMessages(prev => [
          ...prev,
          { from: "bot", text: `ℹ️ You have ${cJson.remainingAppeals ?? 1} disagreement attempt(s) left for this question.` },
        ]);
      }
    } catch (e) {
      setLocalError(`Disagree error: ${e.message || String(e)}`);
    } finally {
      setDisagreeOpen(false);
      setDisagreeReason("");
    }
  };

  const haveFirstTwo = Boolean(paths[0] && paths[1]);
if (isValidating || isAuditing) return <LoaderCard text={isValidating ? "Validating documents…" : "Running AI audit…"} />;
  return (
    <div style={{ margin: "18px 0 10px 0" }}>
      {/* OCR language */}
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="ocr-lang" style={{ marginRight: 8, fontWeight: 500, color: "#0085CA" }}>
          OCR language:
        </label>
        <select
          id="ocr-lang"
          value={ocrLang}
          onChange={e => setOcrLang(e.target.value)}
          style={{ border: "1.5px solid #b3d6f8", borderRadius: 7, padding: "3px 12px", fontSize: "0.9rem" }}
        >
          <option value="eng">English</option>
          <option value="ind">Bahasa Indonesia</option>
          <option value="vie">Vietnamese</option>
          <option value="tha">Thai</option>
        </select>
      </div>

      {/* N pickers (one per requirement). If a question has 12, you’ll see 12 inputs */}
      <div style={{ display: "grid", gap: 10 }}>
        {Array.from({ length: Math.max(1, reqCount || 1) }).map((_, idx) => (
  <div key={idx} id={`req-slot-${idx}`} style={{ display: "grid", gap: 6 }}>
    <div style={{ color: "#bfe3ff", fontSize: "0.85rem" }}>
      <strong>Requirement {idx + 1}:</strong>{" "}
      {question?.requirements?.[idx] || "Additional document"}
    </div>
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <label className="browse-btn">
        📄 Choose File
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.docx,.txt"
          hidden
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) uploadForIndex(idx, f);
          }}
          disabled={uploadingIdx === idx}
        />
      </label>
      <span style={{ color: "#fff" }}>
        {paths[idx] ? paths[idx].split("/").pop() : "No file chosen"}
      </span>
    </div>
  </div>
))}

      </div>

      {/* Before pre-check */}
      {!precheck && !auditResult && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="continue-btn" onClick={runAudit} disabled={isAuditing}>▶ Continue to Audit</button>
          <button className="upload-btn" onClick={clearAll}>♻️ Clear All</button>
          <button
            className="disagree-btn"
            onClick={() => { setPrecheck(null); setAuditResult(null); setShowMultiUpload(false); }}
          >
            ✖ Close
          </button>
        </div>
      )}

      {/* After pre-check: show suggestions + branch */}
      {precheck && !auditResult && (
  <div style={{ marginTop: 16 }}>
    <div style={{ color: "#fff", marginBottom: 8 }}>
      <strong>🧪 Document validation</strong>
      <ReactMarkdown>{precheck.feedback || ""}</ReactMarkdown>
      {precheck.isValid === false && (
        <div style={{ marginTop: 6, fontSize: "0.85rem", color: "#ffd666" }}>
          You can still continue to audit — we’ll proceed with your files.
        </div>
      )}
    </div>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button className="continue-btn" onClick={runAudit}>
        ▶ Continue to Audit
      </button>
      <button className="upload-btn" onClick={clearAll}>
        📤 Re-upload
      </button>
    </div>
  </div>
)}


      {/* After audit: agree / retry / disagree */}
      {auditResult && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: "#157A4A", fontWeight: 700, marginBottom: 8 }}>
            Proposed score: {auditResult.score ?? "-"} / 5
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="continue-btn" onClick={agreeAndNext}>✅ Agree & Continue</button>
            <button className="upload-btn" onClick={() => { setAuditResult(null); setPrecheck(null); }}>
              ♻️ Re-upload & Retry Q{questionNumber}
            </button>
            <button className="disagree-btn" onClick={() => setDisagreeOpen(true)}>❓ Disagree</button>
          </div>

          {/* Disagree modal */}
          {disagreeOpen && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
              }}
            >
              <div style={{ background: "#fff", borderRadius: 12, padding: 18, width: 420 }}>
                <div style={{ fontWeight: 700, color: "#d32f2f", marginBottom: 8 }}>
                  Disagree with AI feedback
                </div>
                <textarea
                  placeholder="Explain your disagreement with facts or references..."
                  value={disagreeReason}
                  onChange={e => setDisagreeReason(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 90,
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 8,
                    padding: 8,
                    fontSize: "0.9rem",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <button className="upload-btn" onClick={() => setDisagreeOpen(false)}>Cancel</button>
                  <button
                    className="disagree-btn"
                    onClick={submitDisagree}
                    disabled={!disagreeReason.trim()}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {localError && <div style={{ color: "red", marginTop: 10 }}>{localError}</div>}
    </div>
  );
}

function cleanSummary(summary) {
  // 1. Parse if possible
  if (typeof summary === "string") {
    try {
      summary = JSON.parse(summary);
    } catch {
      /* leave as string */
    }
  }
  // 2. Drill down recursively into feedback if found (handles any level of nesting)
  while (
    summary &&
    typeof summary === "object" &&
    !Array.isArray(summary) &&
    Object.keys(summary).length === 1 &&
    summary.hasOwnProperty("feedback")
  ) {
    summary = summary.feedback;
  }
  // 3. If still a plain object but NOT strengths/weaknesses, just pretty print
  if (
    summary &&
    typeof summary === "object" &&
    !Array.isArray(summary) &&
    !summary.strengths &&
    !summary.weaknesses
  ) {
    return JSON.stringify(summary, null, 2);
  }
  // 4. Otherwise, return as is (string, strengths/weaknesses, etc)
  return summary;
}

function FinalReportCard({ questions, breakdown, summary, score, onRetry }) {
const cleanedSummary = cleanSummary(summary);
  
  
  // === 5. Render ===

  // PDF Export Handler (unchanged)
  const handlePdfExport = () => {
  const input = document.getElementById("report-summary-download");
  html2canvas(input, { scale: 2 }).then((canvas) => {
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save("vendoriq-compliance-report.pdf");
    });
  };

  // === 6. Helper for formatting summary (as before) ===
  

   
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        margin: "32px auto 0 auto",
        padding: "30px 22px",
        maxWidth: 650,
        boxShadow: "0 2px 12px #0001",
        color: "#223",
        fontSize: "0.9rem",
        textAlign: "left",
      }}
    >
      <div id="report-summary-download">
        <h3 style={{ color: "#0085CA", marginTop: 0 }}>
          <span role="img" aria-label="report">📝</span> Compliance Report Card
        </h3>
		{breakdown?.some(row =>
  Array.isArray(row.requirementScores)
    ? row.requirementScores.some(s => s == null)
    : row.questionScore == null
) && (
  <div style={{
    background: "#fff7e6",
    border: "1px solid #ffe8b3",
    color: "#ad6800",
    borderRadius: 6,
    padding: "8px 12px",
    margin: "8px 0 14px 0",
    fontSize: "0.85rem",
    fontWeight: 600
  }}>
    Some scores are pending Human Auditor review. Your report will auto-update once finalized.
  </div>
)}

                <table style={{ width: "100%", marginBottom: 16, borderCollapse: "collapse", background: "#f3f4f6", fontSize: "0.7rem" }}>
          <thead>
            <tr style={{ background: "#f0faff" }}>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>Q#</th>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>Question</th>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>Answer</th>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>Requirement</th>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>AI Score</th>
              <th style={{ padding: "6px", border: "1px solid #eee" }}>Feedback</th>
            </tr>
          </thead>
          <tbody>
  {breakdown.map((row, qIdx) =>
    (row.requirementScores && row.requirementScores.length > 0
      ? row.requirementScores.map((scoreVal, reqIdx) => (
          <tr key={`${qIdx}-${reqIdx}`}>
            <td>{row.questionNumber}</td>
            <td>{questions[qIdx]?.text.slice(0, 32)}...</td>
            <td>{row.answer}</td>
            <td>
              {questions[qIdx]?.requirements[reqIdx]
                ? questions[qIdx].requirements[reqIdx].slice(0, 38) + "..."
                : "-"}
            </td>
             <td>{scoreVal != null ? `${scoreVal}/5` : "— (Pending auditor)"}</td>
            <td>
              {row.upload_feedback && Array.isArray(row.upload_feedback)
                ? (row.upload_feedback[reqIdx] || "-").slice(0, 48)
                : (row.upload_feedback || "-").slice(0, 48)}
            </td>
          </tr>
        ))
      : (
        <tr key={qIdx}>
          <td>{row.questionNumber}</td>
          <td>{questions[qIdx]?.text.slice(0, 32)}...</td>
          <td>{row.answer}</td>
          <td>-</td>
          <td>-</td>
          <td>{typeof row.upload_feedback === "string" ? row.upload_feedback.slice(0, 48) : "-"}</td>
        </tr>
      )
    )
  )}
</tbody>

        </table>

        <div
          style={{
            fontWeight: 700,
            fontSize: "0.9rem",
            color: "#157A4A",
            marginBottom: 8,
          }}
        >
          Overall Score: {score ?? "-"} / 100
        </div>
        <div style={{ marginTop: 16, background: "#f8fafd", padding: "16px 10px", borderRadius: 7 }}>
          <strong>Summary & Recommendations:</strong>
          <br />
		  {formatSummary(cleanedSummary)?.trim() ? (
    <ReactMarkdown>{formatSummary(cleanedSummary)}</ReactMarkdown>
  ) : (
    <span>No summary data available.</span>
  )}
</div>
        {/* --- Download/Retry Buttons, as needed --- */}
        <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
          <button
            style={{
              background: "#229cf9",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
            onClick={handlePdfExport}
          >
            Download PDF Report
          </button>
          <button
            style={{
              background: "#3AB66B",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
            onClick={() => {
              // Download as TXT file
              const blob = new Blob(
                [typeof cleanedSummary === "string" ? cleanedSummary : formatSummary(cleanedSummary)],
                { type: "text/plain" }
              );
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = "vendoriq-summary.txt";
              link.click();
            }}
          >
            Download Summary (TXT)
          </button>
          {onRetry && (
            <button
              style={{
                background: "#ffbf00",
                color: "#222",
                border: "none",
                borderRadius: 8,
                padding: "10px 22px",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
              onClick={onRetry}
            >
              Retry Summary
            </button>
          )}
        </div>
      </div>
      <div style={{
        marginTop: 32,
        textAlign: "center",
        color: "#157A4A",
        fontSize: "1.0rem",
        fontWeight: 600
      }}>
        🎉 Thank you for completing the VendorIQ Assessment! 🎉
      </div>
    </div>
  );
}


// --- REVIEW CARD ---
function ReviewCard({ answers, questions, onRevise, onContinue }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        margin: "32px auto 0 auto",
        padding: "30px 22px",
        maxWidth: 550,
        boxShadow: "0 2px 12px #0001",
        color: "#223",
        fontSize: "0.9rem",
        textAlign: "left",
      }}
    >
      <h3 style={{ color: "#0085CA", marginTop: 0 }}>
        <span role="img" aria-label="review">
          🔎
        </span>{" "}
        Review Your Answers
      </h3>
      <ol style={{ paddingLeft: 16 }}>
        {questions.map((q, idx) => (
          <li
            key={q.number}
            style={{
              marginBottom: 18,
              borderBottom: "1px dashed #ccd",
              paddingBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>{q.text}</div>
            <div>
              <strong>Answer:</strong>{" "}
              {answers[idx] || <span style={{ color: "#a00" }}>No answer</span>}
            </div>
            <button
              onClick={() => onRevise(idx)}
              style={{
                marginTop: 6,
                marginRight: 8,
                background: "#f8c100",
                color: "#333",
                border: "none",
                borderRadius: 7,
                padding: "5px 15px",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              Revise
            </button>
          </li>
        ))}
      </ol>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button
          onClick={onContinue}
          style={{
            background: "#0085CA",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "9px 26px",
            fontSize: "0.9rem",
            cursor: "pointer",
          }}
        >
          Submit & See Final Summary
        </button>
      </div>
    </div>
  );
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatApp />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

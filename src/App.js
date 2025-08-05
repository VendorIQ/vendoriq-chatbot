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

// --- CONSTANTS ---
const botAvatar = process.env.PUBLIC_URL + "/bot-avatar.png";
const userAvatar = process.env.PUBLIC_URL + "/user-avatar.png";
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

// --- HOURGLASS LOADER ---
function HourglassLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        margin: "22px 0 12px 0",
        justifyContent: "flex-start",
      }}
    >
      <span className="hourglass-anim" style={{ fontSize: "2.2rem", marginRight: 10 }}>
        ⏳
      </span>
      <span style={{ fontSize: "1.08rem", color: "#0085CA", fontWeight: 600 }}>
        Reviewing your document...
      </span>
    </div>
  );
}
function formatSummary(summary) {
  let obj = summary;
  if (typeof summary === "string") {
    try {
      obj = JSON.parse(summary);
    } catch {
      // Not JSON, return as is
      return summary;
    }
  }
  if (obj && typeof obj === "object" && ("strengths" in obj || "weaknesses" in obj)) {
    let str = "";
    if (obj.strengths?.length) {
      str += "**Strengths:**\n";
      for (const s of obj.strengths) str += `- ${s}\n`;
    }
    if (obj.weaknesses?.length) {
      str += (str ? "\n" : "") + "**Weaknesses:**\n";
      for (const w of obj.weaknesses) str += `- ${w}\n`;
    }
    return str || JSON.stringify(obj, null, 2);
  }
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}
	  
// =============== MAIN APP COMPONENT ===============
export default function App() {
  const [reportBreakdown, setReportBreakdown] = useState([]); // NEW
  const [bubblesComplete, setBubblesComplete] = useState(false); // <--- ADD THIS IF NOT DECLARED
const sendBubblesSequentially = (messagesArray, from = "bot", delay = 650, callback) => {
  setTyping(true); // <--- Mark as typing at start
  setBubblesComplete(false);
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
function formatSummary(summary) {
  let obj = summary;
  if (typeof summary === "string") {
    try {
      obj = JSON.parse(summary);
    } catch {
      // Not JSON, return as is
      return summary;
    }
  }
  if (obj && typeof obj === "object" && ("strengths" in obj || "weaknesses" in obj)) {
    let str = "";
    if (obj.strengths?.length) {
      str += "**Strengths:**\n";
      for (const s of obj.strengths) str += `- ${s}\n`;
    }
    if (obj.weaknesses?.length) {
      str += (str ? "\n" : "") + "**Weaknesses:**\n";
      for (const w of obj.weaknesses) str += `- ${w}\n`;
    }
    return str || JSON.stringify(obj, null, 2);
  }
  return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
}



  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [step, setStep] = useState(-1);
  const [showUploads, setShowUploads] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [uploadReqIdx, setUploadReqIdx] = useState(0);
  const [showIntro, setShowIntro] = useState(false);
  const [summary, setSummary] = useState("");
  const [score, setScore] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [reviewMode, setReviewMode] = useState(false);
  const chatEndRef = useRef(null);
  const [companyName, setCompanyName] = useState("");
  const [disagreeLoading, setDisagreeLoading] = useState(false);
  const [showDisagreeModal, setShowDisagreeModal] = useState(false);
  const [disagreeReason, setDisagreeReason] = useState("");
  const [disagreeFile, setDisagreeFile] = useState(null);
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
        setTypingText("Generating assessment summary...");
        try {
          const response = await fetch(`${BACKEND_URL}/api/session-summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, sessionId }),
          });
          const result = await response.json();
		  
		  console.log("Session summary API response:", result);
          
		  
		  setSummary(
  typeof result?.feedback === "string"
    ? result.feedback
    : JSON.stringify(result?.feedback) || "No summary found."
);
		  setScore(result?.score ?? 0);
          setReportBreakdown(result?.detailedScores ?? []);

        } catch (err) {
          setSummary("Failed to generate summary. Please contact support.");
        }
        setTyping(false);
        setTypingText("");
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
          style={{ background: "none", border: "none", fontSize: "1.3rem", color: "#aaa", cursor: "pointer", marginLeft: 8 }}>
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
              style={{ marginLeft: 10, fontSize: "0.93rem", cursor: "pointer" }}
            >
              Go
            </button>
            {/* Requirement Progress as Text */}
            {results[i]?.answer === "Yes" && (
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
          fontSize: "0.97rem",
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
  
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data));
    } else {
      setProfile(null);
    }
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
const saveAnswerToBackend = async (email, questionNumber, answer) => {
  try {
    await fetch(`${BACKEND_URL}/api/save-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ email: user.email.trim().toLowerCase(), questionNumber, answer })
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
    if (
      step >= 0 &&
      step < questions.length &&
      !justAnswered &&
      !showUploads &&
      !showIntro
    ) {
      sendBubblesSequentially(
        [`**Question ${questions[step].number}:** ${questions[step].text}`],
        "bot"
      );
    }
    // eslint-disable-next-line
  }, [step, showUploads, showIntro]);

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
  saveAnswerToBackend(user.email, questionNumber, answer); // 🧠 Send to backend!

  const botMsgs = getBotMessage({ step, answer, justAnswered: true });
  sendBubblesSequentially(botMsgs, "bot", 650, () => {
    if (answer === "Yes" && questions[step].requirements.length > 0) {
      setShowUploads(true);
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
        background: "#f7f8fa;",   // GPT gray
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
    <span style={{ fontWeight: 700, fontSize: "1.18rem", color: "#fff" }}>
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
    fontSize: "0.98rem",
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
      fontSize: "0.98rem",
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
    setUploadReqIdx(reqIdx || 0);
    setShowUploads(true);
    setShowSummary(false);
    setReviewMode(false);
    setMessages([]);
    setShowProgress(false); // Hide popup after jump
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
            background: "#FFA726",
            color: "#fff",
            borderRadius: "18px",
            padding: "10px 26px",
            fontSize: "1.05rem",
            fontWeight: 600,
            minWidth: "60px",
            maxWidth: "340px",
            textAlign: "right",
            boxShadow: "0 1px 6px #FFA72640",
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
          padding: "0 0 20px", //
          fontSize: "0.9rem",
          color: "#383a42", // dark GPT gray
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
      setTypingText("Regenerating summary...");
      // Your summary-fetch logic here (see below)
      fetchSummary();
    }}
  />
)}
         
      {/* UPLOAD SECTION */}
      {showUploads && step < questions.length && (
        <UploadSection
  question={questions[step]}
  requirementIdx={uploadReqIdx}
  setRequirementIdx={setUploadReqIdx}
  onDone={() => {
    setShowUploads(false);
    setUploadReqIdx(0);
    if (reviewMode) {
      setReviewMode(false);
      setStep(questions.length);
    } else {
      setStep((prev) => prev + 1);
    }
    setJustAnswered(false);
  }}
  email={user.email}
  sessionId={sessionId}
  questionNumber={questions[step].number}
  companyName={companyName}     // <-- Add this!
  setMessages={setMessages}
  setShowUploads={setShowUploads}
  setUploadReqIdx={setUploadReqIdx}
  reviewMode={reviewMode}
  setReviewMode={setReviewMode}
  setStep={setStep}
  setJustAnswered={setJustAnswered}
  showDisagreeModal={showDisagreeModal} //added
  setShowDisagreeModal={setShowDisagreeModal}
  disagreeReason={disagreeReason}
  setDisagreeReason={setDisagreeReason}
  disagreeFile={disagreeFile}
  setDisagreeFile={setDisagreeFile}
  disagreeLoading={disagreeLoading}
  setDisagreeLoading={setDisagreeLoading}
  results={results}
  setResults={setResults}
/>

      )}

      {/* YES/NO BUTTONS */}
      {!typing &&
        !showUploads &&
        step >= 0 &&
        step < questions.length &&
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
      fontSize: "2.25rem",
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

function UploadSection({
  question,
  requirementIdx,
  setRequirementIdx,
  onDone,
  email,
  sessionId,
  questionNumber,
  setMessages,
  setShowUploads,
  setUploadReqIdx,
  reviewMode,
  companyName,
  setReviewMode,
  setStep,
  setJustAnswered,
  showDisagreeModal,
  setShowDisagreeModal,
  disagreeReason,
  setDisagreeReason,
  disagreeFile,
  setDisagreeFile,
  disagreeLoading,
  setDisagreeLoading,  // Use these variables directly instead of local useState
  results,
  setResults
}) {
  const requirement = question.requirements[requirementIdx];
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
const [isDragActive, setIsDragActive] = useState(false);
const [ocrLang, setOcrLang] = useState("eng");
const [lastFile, setLastFile] = useState(null);

// *** ADD THIS useEffect ***
useEffect(() => {
  function onRetryUpload(e) {
    const pending = e.detail;
    // Make sure requirement context matches to avoid cross-upload bugs
    if (
      pending &&
      pending.file &&
      pending.email === email &&
      pending.questionNumber === questionNumber &&
      requirement === pending.requirement
    ) {
      // Retry the failed upload with the stored file
      handleUpload({ target: { files: [pending.file] } });
    }
  }
  window.addEventListener("vendorIQ:retryUpload", onRetryUpload);
  return () => window.removeEventListener("vendorIQ:retryUpload", onRetryUpload);
}, [email, questionNumber, requirement]); // dependencies must match current upload context

  const handleUpload = async (e) => {
  const file = e.target.files[0];
  setLastFile(file);
  if (!file) return;
  setUploading(true);
  setError("");

  // 1. Upload to Supabase
  const filePath = `uploads/${sessionId}_${email}/question-${questionNumber}/requirement-${requirementIdx + 1}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from("uploads").upload(filePath, file, { upsert: true });
  if (uploadError) {
    setUploading(false);
    setError("Upload failed: " + uploadError.message);
    return;
  }

  // 2. Send to Ollama for AI feedback
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("requirement", requirement);
    formData.append("email", email);
    formData.append("questionNumber", questionNumber);
    formData.append("companyName", companyName);
    formData.append("ocrLang", ocrLang); // <-- ADD THIS LINE
    const response = await fetch(`${BACKEND_URL}/api/check-file`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("AI review failed");
    const data = await response.json();
    // 3. Build bubble message (requirement + feedback)
    const botBubble = 
      `🧾 **Question ${questionNumber}, Requirement ${requirementIdx + 1}:**\n\n` +
      `**Requirement:**\n${requirement}\n\n` +
      `**AI Review:**\n${data.feedback || "No feedback received."}`;

    setMessages(prev => [...prev, { from: "bot", text: botBubble }]);
    setUploaded(true);
    setAccepted(false);

    // Set result for this requirement
    setResults(prev => {
      const updated = [...prev];
      updated[questionNumber - 1].requirements[requirementIdx] = {
        aiScore: data.score || null,
        aiFeedback: data.feedback || ""
      };
      return updated;
    });



  } catch (err) {
    setError("AI review failed: " + err.message);
  }

  setUploading(false);
};

const handleAccept = () => {
  // If there are more requirements for this question, go to the next requirement
  if (requirementIdx < question.requirements.length - 1) {
    setUploadReqIdx(requirementIdx + 1);    // Move to next requirement
    setUploaded(false);                     // Reset upload for new requirement
    setAccepted(false);                    
    // Do NOT hide the uploads section
  } else {
    // All requirements done, move to next question
    setShowUploads(false);
    setUploadReqIdx(0);
    if (reviewMode) {
      setReviewMode(false);
      setStep(questions.length);
    } else {
      setStep((prev) => prev + 1);
    }
    setJustAnswered(false);
  }
};

const submitDisagreement = async () => {
  setDisagreeLoading(true);

  try {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("questionNumber", questionNumber);
    formData.append("requirement", requirement);
    formData.append("disagreeReason", disagreeReason);
    if (disagreeFile) {
      formData.append("file", disagreeFile);
    }

    const res = await fetch(`${BACKEND_URL}/api/disagree-feedback`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();
    setMessages(prev => [
      ...prev,
      {
        from: "bot",
        text: `🧠 Re-evaluated AI Feedback:\n\n${result.feedback || "No new feedback returned."}`,
      },
    ]);

    setShowDisagreeModal(false);
    setDisagreeReason("");
    setDisagreeFile(null);
    // --- DO NOT advance to next requirement ---
    // setUploaded(true);   <-- REMOVE THIS IF YOU HAVE IT HERE
    // setAccepted(true);   <-- REMOVE THIS IF YOU HAVE IT HERE
    // --- Instead, keep user on this requirement, let them Accept, Re-upload, or Disagree again ---
  } catch (err) {
    setMessages(prev => [
      ...prev,
      {
        from: "bot",
        text: `❌ Failed to reprocess disagreement: ${err.message}`,
      },
    ]);
  }

  setDisagreeLoading(false);
}

return (
  <div>
    {/* Disagree Modal is rendered globally so it's always available */}
    {showDisagreeModal && (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 999,
        }}
      >
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!disagreeReason.trim()) return;
            submitDisagreement();
          }}
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: "30px 32px 24px 32px",
            maxWidth: 420,
            width: "92%",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 26, color: "#d32f2f", marginRight: 10 }}>❓</span>
            <span style={{ fontWeight: 700, fontSize: "1.14rem", color: "#d32f2f" }}>
              Disagree with AI Feedback
            </span>
          </div>
          <label htmlFor="disagree-reason" style={{ fontWeight: 500, marginBottom: 2 }}>
            Your reason or argument <span style={{ color: "#d32f2f" }}>*</span>
          </label>
          <textarea
            id="disagree-reason"
            placeholder="Clearly state your reason for disagreement, with facts or references if possible..."
            value={disagreeReason}
            onChange={e => setDisagreeReason(e.target.value)}
            style={{
              width: "95%",
              minHeight: 80,
              resize: "vertical",
              fontSize: "1rem",
              padding: "10px",
              borderRadius: 7,
              border: "1.5px solid #e0e0e0",
            }}
            required
          />
          <label
            htmlFor="disagree-file"
            style={{
              display: "inline-block",
              background: "#e3f2fd",
              color: "#333",
              fontWeight: 500,
              borderRadius: 7,
              padding: "8px 22px",
              cursor: "pointer",
              boxShadow: "0 1px 4px #0001",
              transition: "background 0.2s",
              border: "1.5px solid #e0e0e0",
              marginTop: 2,
              marginBottom: 4,
            }}
          >
            📁 Upload File
            <input
              id="disagree-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
              onChange={e => setDisagreeFile(e.target.files[0])}
              style={{ display: "none" }}
            />
          </label>
          <span style={{ marginLeft: 8, color: "#777", fontSize: "0.97rem" }}>
            {disagreeFile ? disagreeFile.name : "No file chosen"}
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setShowDisagreeModal(false)}
              style={{
                background: "#f5f5f5",
                color: "#666",
                border: "none",
                borderRadius: 8,
                padding: "8px 22px",
                fontSize: "1.01rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
              disabled={disagreeLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                background: "#d32f2f",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 22px",
                fontSize: "1.01rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
              disabled={disagreeLoading || !disagreeReason.trim()}
            >
              {disagreeLoading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    )}

    {/* Main upload UI */}
    {!uploaded && !uploading && (
      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          setIsDragActive(false);
        }}
        onDrop={e => {
          e.preventDefault();
          setIsDragActive(false);
          const file = e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) {
            handleUpload({ target: { files: [file] } });
          }
        }}
        style={{
          border: isDragActive
            ? "2.8px solid #229cf9"
            : "2px dashed #b3d6f8",
          background: isDragActive
            ? "linear-gradient(108deg, #e4f4ff 70%, #daf0fc 100%)"
            : "linear-gradient(108deg, #fafdff 60%, #f0f8ff 100%)",
          borderRadius: 22,
          padding: "20px 0 30px 0",
          margin: "5px 0",
          minHeight: 134,
          maxWidth: 370,
          textAlign: "center",
          transition: "all 0.17s",
          boxShadow: isDragActive
            ? "0 4px 18px #229cf930"
            : "0 2px 10px #b6d9fc30",
          cursor: "pointer",
          display: uploaded ? "none" : "block",
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: "1.0rem",
            fontWeight: 700,
            color: "#0085CA",
          }}
        >
          Requirement {requirementIdx + 1}: {requirement}
        </div>
        <div style={{ fontWeight: 600, color: "#999", fontSize: "0.70rem", marginTop: "10px", marginBottom: "10px" }}>
          {isDragActive
            ? "Drop your file here..."
            : "Drag & drop a file here, or click Browse File below"}
        </div>
        <div
          style={{
            margin: "10px auto 0 auto",
            color: "#0085CA",
            fontSize: "0.97rem",
            fontWeight: 400,
            maxWidth: 400,
            padding: "4px 0",
            marginBottom: "40px",
          }}
        >
        </div>
        <div style={{ marginBottom: 10 }}>
  <label htmlFor="ocr-lang" style={{ marginRight: 8, fontWeight: 500, color: "#0085CA" }}>
    Select language for document text:
  </label>
  <select
    id="ocr-lang"
    value={ocrLang}
    onChange={e => setOcrLang(e.target.value)}
    style={{
      border: "1.5px solid #b3d6f8",
      borderRadius: 7,
      padding: "3px 12px",
      fontSize: "1rem",
      color: "#333",
    }}
  >
    <option value="eng">English</option>
    <option value="ind">Bahasa Indonesia</option>
    <option value="vie">Vietnamese</option>
    <option value="tha">Thai</option>
    {/* Add more as needed */}
  </select>
</div>

        <label className="browse-btn" style={{ marginTop: 12 }}>
          📁 Browse File
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
            onChange={handleUpload}
            disabled={uploading}
            hidden
          />
        </label>
        <button
          className="skip-btn"
          onClick={() => {
            setResults(prev => {
              const updated = [...prev];
              updated[questionNumber - 1].requirements[requirementIdx] = {
                aiScore: null,
                aiFeedback: "Skipped"
              };
              return updated;
            });
            setUploaded(true);
          }}
          disabled={uploading}
        >
          ⏭️ Skip Requirement
        </button>
      </div>
    )}


    {uploaded && !accepted && (
      <div className="button-group">
        <button className="continue-btn" onClick={handleAccept}>
          ✅ Accept & Continue
        </button>
        <button className="upload-btn" onClick={() => setUploaded(false)}>
          📄 Re-upload
        </button>
        <button className="disagree-btn" onClick={() => setShowDisagreeModal(true)}>
          ❓ Disagree
        </button>
      </div>
    )}
    {uploading && <HourglassLoader />}
    {error && (
  <div style={{ color: "red", marginTop: 12 }}>
    {error}
    {error.includes("AI review failed") && lastFile && (
      <button
        onClick={() => handleUpload({ target: { files: [lastFile] } })}
        disabled={uploading}
		style={{
          marginLeft: 14,
          background: "#0085CA",
          color: "#fff",
          border: "none",
          borderRadius: 7,
          padding: "7px 18px",
          fontWeight: 600,
          fontSize: "1.01rem",
          cursor: uploading ? "not-allowed" : "pointer",
          opacity: uploading ? 0.6 : 1,
        }}
      >
        Retry AI Review
      </button>
    )}
  </div>
)}

  </div>
);
}


function FinalReportCard({ questions, breakdown, summary, score, onRetry }) {
  // PDF Export Handler
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
console.log("SUMMARY DEBUG:", summary, typeof summary, Array.isArray(summary));
let cleanedSummary = summary;
if (Array.isArray(summary) && summary.every(c => typeof c === "string" && c.length === 1)) {
  cleanedSummary = summary.join("");
}

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
        fontSize: "1.11rem",
        textAlign: "left",
      }}
    >
      {/* --- BEGIN: PDF Export Area --- */}
      <div id="report-summary-download">
        <h3 style={{ color: "#0085CA", marginTop: 0 }}>
          <span role="img" aria-label="report">📝</span> Compliance Report Card
        </h3>
        <table style={{ width: "100%", marginBottom: 16, borderCollapse: "collapse", fontSize: "1rem" }}>
          <thead>
            <tr style={{ background: "#f1f7fa" }}>
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
            <td>{scoreVal != null ? `${scoreVal}/5` : "-"}</td>
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
            fontSize: "1.22rem",
            color: "#157A4A",
            marginBottom: 8,
          }}
        >
          Overall Score: {score ?? "-"} / 100
        </div>

        <div style={{ marginTop: 16, background: "#f8fafd", padding: "16px 10px", borderRadius: 7 }}>
          <strong>Summary & Recommendations:</strong>
          <br />
          <ReactMarkdown>{formatSummary(cleanedSummary)}</ReactMarkdown>
        </div>
        <div style={{
          marginTop: 28,
          textAlign: "center",
          fontWeight: 700,
          fontSize: "1.22rem",
          color: "#0085CA",
        }}>
          🎉 Thank you for completing the VendorIQ Assessment! 🎉
          <div style={{ margin: "20px 0", display: "flex", justifyContent: "center" }} />
        </div>
      </div>
      {/* --- END: PDF Export Area --- */}

      {/* --- Download Buttons --- */}
      <div style={{ marginTop: 18, display: "flex", gap: 12 }}>
        <button
          onClick={handlePdfExport}
          style={{
            background: "#0085CA",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "10px 22px",
            fontSize: "1.07rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⬇️ Download PDF Report
        </button>
        <button
          onClick={() => {
            const el = document.createElement("a");
            const file = new Blob([formatSummary(summary)], { type: "text/plain" });
            el.href = URL.createObjectURL(file);
            el.download = "vendoriq-compliance-summary.txt";
            document.body.appendChild(el);
            el.click();
            setTimeout(() => document.body.removeChild(el), 100);
          }}
          style={{
            background: "#229cf9",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "10px 22px",
            fontSize: "1.07rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ⬇️ Download Summary (TXT)
        </button>
      </div>
      {typeof summary === "string" && summary.includes("Failed to generate summary") && onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 14,
            background: "#0085CA",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "8px 20px",
            fontSize: "1.08rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry Final Summary
        </button>
      )}
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
        fontSize: "1.12rem",
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
                fontSize: "0.95rem",
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
            fontSize: "1.08rem",
            cursor: "pointer",
          }}
        >
          Submit & See Final Summary
        </button>
      </div>
    </div>
  );
}

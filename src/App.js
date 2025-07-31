import React, { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import "./App.css"; // <-- Make sure to create/import this!
import AuditorReviewPanel from "./AuditorReviewPanel";
import AuthPage from "./AuthPage";



// --- SUPABASE ---
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// --- CONSTANTS ---
const botAvatar = process.env.PUBLIC_URL + "/bot-avatar.png";
const userAvatar = process.env.PUBLIC_URL + "/user-avatar.png";
const BACKEND_URL = "https://vendoriq-backend.onrender.com";

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

// =============== MAIN APP COMPONENT ===============
export default function App() {
  const [showSupplierNameModal, setShowSupplierNameModal] = useState(false);
  const [supplierNameSaveSuccess, setSupplierNameSaveSuccess] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null); // holds info if an upload failed due to name mismatch
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
const [supplierNameLoading, setSupplierNameLoading] = useState(false);
const [supplierName, setSupplierName] = useState("");   // holds detected or manually set company name
const [editingSupplier, setEditingSupplier] = useState(false);
const [inputSupplierName, setInputSupplierName] = useState("");
const [disagreeMode, setDisagreeMode] = useState(false);
const [disagreeFeedback, setDisagreeFeedback] = useState("");
const [disagreeLoading, setDisagreeLoading] = useState(false);
const [disagreeHistory, setDisagreeHistory] = useState([]);
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
                        listStyle: "none"
                      }}
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
// Fetch current supplier name for this user
const fetchSupplierName = async () => {
  if (!user?.email) return;
  setSupplierNameLoading(true);
  try {
    const res = await fetch(`${BACKEND_URL}/api/get-supplier-name?email=${user.email}`);
    const data = await res.json();
    setSupplierName(data.supplierName || "");
  } catch {
    setSupplierName("(not found)");
  }
  setSupplierNameLoading(false);
};

useEffect(() => {
  if (user) fetchSupplierName();
  // eslint-disable-next-line
}, [user]);

// Save edited supplier name
const saveSupplierName = async () => {
  if (!user?.email || !inputSupplierName.trim()) return;
  const res = await fetch(`${BACKEND_URL}/api/set-supplier-name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, supplierName: inputSupplierName }),
  });
  const data = await res.json();
  if (data.success) {
    setSupplierName(data.supplierName);
    setEditingSupplier(false);
  } else {
    alert("Failed to update company name.");
  }
};


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
  

  // --- Animate chat bubbles ---
  function sendBubblesSequentially(messagesArray, from = "bot", delay = 650, callback) {
    let idx = 0;
    function sendNext() {
      setTyping(true);
      setTypingText("");
      let i = 0;
      const msg = messagesArray[idx];
      const interval = setInterval(() => {
        setTypingText(msg.slice(0, i + 1));
        i++;
        if (i >= msg.length) {
          clearInterval(interval);
          setTimeout(() => {
            setMessages((prev) => [...prev, { from, text: msg }]);
            setTyping(false);
            setTypingText("");
            idx++;
            if (idx < messagesArray.length) {
              setTimeout(sendNext, delay);
            } else if (callback) {
              setTimeout(callback, delay);
            }
          }, 350);
        }
      }, 12);
    }
    sendNext();
  }

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
    if (showSummary && step >= questions.length) {
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
          setSummary(result.feedback || "No summary found.");
          setScore(result.score || null);
        } catch (err) {
          setSummary("Failed to generate summary. Please contact support.");
        }
        setTyping(false);
        setTypingText("");
      }
      fetchSummary();
    }
    // eslint-disable-next-line
  }, [showSummary]);

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
  return <AuthPage onAuth={setUser} />;
}

  // --- RENDER ---
  return (
    <>
    {supplierNameSaveSuccess && (
  <div style={{
    position: "fixed", top: 30, right: 30, background: "#157A4A",
    color: "#fff", padding: "13px 22px", borderRadius: 9, zIndex: 2000,
    fontWeight: 600, boxShadow: "0 2px 12px #0003"
  }}>
    ✅ Company name updated!
  </div>
)}
{showSupplierNameModal && (
  <div style={{
    position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
    background: "rgba(0,0,0,0.27)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
  }}>
    <div style={{
      background: "#fff",
      borderRadius: 14,
      padding: "30px 40px",
      boxShadow: "0 4px 32px #0004",
      minWidth: 340,
      display: "flex", flexDirection: "column", gap: 18,
      alignItems: "center"
    }}>
      <div style={{ fontWeight: 700, fontSize: "1.18rem", marginBottom: 8 }}>
        Confirm Your Company Name
      </div>
      <input
        value={inputSupplierName}
        onChange={e => setInputSupplierName(e.target.value)}
        style={{
          fontSize: "1.07rem", padding: "8px 18px", borderRadius: 7,
          border: "1.5px solid #0085CA", width: 220, marginBottom: 10
        }}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={async () => {
            if (!user?.email || !inputSupplierName.trim()) return;
            const res = await fetch(`${BACKEND_URL}/api/set-supplier-name`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: user.email, supplierName: inputSupplierName }),
            });
            const data = await res.json();
            if (data.success) {
              setSupplierName(data.supplierName);
              setSupplierNameSaveSuccess(true);
              setShowSupplierNameModal(false);
              setTimeout(() => setSupplierNameSaveSuccess(false), 2200);
              setPendingUpload(null);
            } else {
              alert("Failed to update company name.");
            }
          }}
          style={{
            background: "#0085CA", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 22px", fontWeight: 600, fontSize: "1.07rem"
          }}>
          Save
        </button>
        <button
          onClick={() => {
            setShowSupplierNameModal(false);
            setPendingUpload(null);
          }}
          style={{
            background: "#f5f5f5", color: "#666", border: "none",
            borderRadius: 8, padding: "8px 22px", fontWeight: 500, fontSize: "1.01rem"
          }}>
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
    <div
      style={{
        maxWidth: 700,
        margin: "0px auto",
		paddingTop: 40,
        fontFamily: "Inter, sans-serif",
        background: "#F7F8FA",
        minHeight: "100vh",
      }}
    >
<nav
  style={{
    background: "#333",
    color: "#fff",
    padding: "14px 20px",
    borderRadius: 8,
    marginBottom: 10,
    fontSize: "1.1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  }}
  >
  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
  {profile && profile.role === 'auditor' && (
  <button style={{ fontSize: "0.95rem" }} onClick={() => setReviewMode(!reviewMode)}>
    {reviewMode ? "🔙 Exit Auditor Panel" : "🛠️ Auditor Review"}
  </button>
  )}
<button
  onClick={() => setShowProgress(v => !v)}
  style={{
    marginLeft: 8,
    background: "#fff",
    color: "#0085CA",
    border: "1.5px solid #0085CA",
    borderRadius: 7,
    padding: "4px 16px",
    fontWeight: 500,
    fontSize: "0.97rem",
    cursor: "pointer"
  }}
>
  {showProgress ? "Hide Progress" : "Show Progress"}
</button>
    <span style={{ flex: 1 }} />
    <span style={{ color: "#dff", fontWeight: 400, fontSize: "0.95rem" }}>
      {user.email}
    </span>
    <button
      style={{
        background: "#0085CA",
        color: "#fff",
        border: "none",
        borderRadius: 7,
        padding: "6px 18px",
        fontSize: "0.98rem",
        fontWeight: 500,
        cursor: "pointer",
        marginLeft: 8,
      }}
      onClick={async () => {
        await supabase.auth.signOut();
        setUser(null);
      }}
    >
      Log Out
    </button>
  </div>
  <strong style={{ fontSize: "1.18rem", marginTop: 2 }}>VendorIQ Chatbot</strong>
</nav>

{/* --- Supplier Name Display and Correction --- */}
{step === 0 && !showUploads && (
  <div
    style={{
      background: "#fffde7",
      border: "1.5px solid #ffeb3b",
      borderRadius: 10,
      padding: "14px 24px",
      margin: "18px 0 4px 0",
      display: "flex",
      alignItems: "center",
      gap: 18,
      fontSize: "1.11rem",
    }}
  >
    <div>
      <b>Detected Company Name:</b>{" "}
      {editingSupplier ? (
        <input
          type="text"
          value={inputSupplierName}
          onChange={e => setInputSupplierName(e.target.value)}
          style={{
            padding: "6px 12px",
            fontSize: "1.03rem",
            borderRadius: 6,
            border: "1.5px solid #ddd",
            minWidth: 180,
          }}
        />
      ) : supplierNameLoading ? (
        <span style={{ color: "#229cf9", fontStyle: "italic", marginLeft: 8 }}>
          <span role="img" aria-label="hourglass">⏳</span> Loading...
        </span>
      ) : (
        <span style={{ color: "#d8a900" }}>{supplierName || "(not found yet)"}</span>
      )}
    </div>
    {editingSupplier ? (
      <>
        <button
          onClick={saveSupplierName}
          style={{
            background: "#ffeb3b",
            color: "#333",
            border: "none",
            borderRadius: 8,
            padding: "7px 20px",
            fontWeight: 600,
            fontSize: "1.01rem",
            marginLeft: 5,
          }}
        >
          Save
        </button>
        <button
          onClick={() => setEditingSupplier(false)}
          style={{
            background: "#f9f9f9",
            color: "#444",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "7px 16px",
            marginLeft: 3,
            fontSize: "0.97rem",
          }}
        >
          Cancel
        </button>
      </>
    ) : (
      <button
        onClick={() => {
          setInputSupplierName(supplierName || "");
          setEditingSupplier(true);
        }}
        style={{
          background: "#fffde7",
          color: "#b89800",
          border: "1px solid #ffeb3b",
          borderRadius: 8,
          padding: "7px 20px",
          fontWeight: 600,
          fontSize: "1.01rem",
        }}
      >
        Edit Name
      </button>
    )}
  </div>
)}
    
{showProgress && (
  <ProgressPopup
    results={results}
    questions={questions}
    onJump={idx => {
      setStep(idx);
      setShowSummary(false);
      setReviewMode(false);
      setMessages([]);
      setShowUploads(false);
      setShowProgress(false); // Hide the popup after jump
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
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              flexDirection: msg.from === "bot" ? "row" : "row-reverse",
              alignItems: "flex-start",
              margin: "18px 0",
              width: "100%",
              justifyContent: msg.from === "bot" ? "flex-start" : "flex-end",
            }}
          >
            <img
              src={msg.from === "bot" ? botAvatar : userAvatar}
              alt={msg.from === "bot" ? "AI Bot" : "You"}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "#fff",
                margin: msg.from === "bot" ? "0 32px 0 14px" : "0 14px 0 32px",
                boxShadow: "0 1px 8px #0002",
                alignSelf: "flex-start",
              }}
            />
            <div
              style={{
                background: msg.from === "bot" ? "#0085CA" : "#6D7B8D",
                color: "#fff",
                borderRadius: "18px",
                padding: "1px 22px",
                fontSize: "1.01rem",
                fontFamily: "Inter, sans-serif",
                boxShadow: "0 1px 6px #0001",
                maxWidth: "440px",
                minWidth: "64px",
                textAlign: "left",
                wordBreak: "break-word",
                marginLeft: msg.from === "bot" ? "0" : "auto",
                marginRight: msg.from === "bot" ? "auto" : "0",
              }}
            >
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
          </div>
        ))}
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
    results={results}   // <-- your per-question/requirement tracking array
    summary={summary}
    score={score}
  />
)}

      {/* TYPING */}
      {typing && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "32px 0",
            maxWidth: "100%",
          }}
        >
          <img
            src={botAvatar}
            alt="AI Bot"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "#fff",
              marginRight: 14,
              boxShadow: "0 1px 8px #0002",
              alignSelf: "center",
            }}
          />
          <div
            style={{
              background: "#0085CA",
              color: "#fff",
              borderRadius: "16px",
              padding: "10px 20px",
              minWidth: 48,
              maxWidth: "70%",
              fontSize: "1rem",
              fontFamily: "Inter, sans-serif",
              boxShadow: "0 1px 6px #0001",
              position: "relative",
              textAlign: "left",
              wordBreak: "break-word",
              fontStyle: "italic",
            }}
          >
            {typingText}
            <span className="typing-cursor">|</span>
          </div>
        </div>
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
  setMessages={setMessages}
  setShowUploads={setShowUploads}
  setUploadReqIdx={setUploadReqIdx}
  reviewMode={reviewMode}
  setReviewMode={setReviewMode}
  setStep={setStep}
  setJustAnswered={setJustAnswered}
  fetchSupplierName={fetchSupplierName}
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
  onCompanyNameMismatch={({ detectedCompanyName, file, requirement, questionNumber, requirementIdx }) => {
    setShowSupplierNameModal(true);
    setInputSupplierName(detectedCompanyName || "");
    setPendingUpload({ file, requirement, questionNumber, requirementIdx });
  }}
/>

      )}

      {/* YES/NO BUTTONS */}
      {!typing &&
        !showUploads &&
        step >= 0 &&
        step < questions.length &&
        messages.length > 0 &&
        !showIntro && (
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
    </div>
    </>
  );





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
  const [showMissingReasonInput, setShowMissingReasonInput] = useState(false);
  const [missingReason, setMissingReason] = useState("");
  const [aiMissingFeedback, setAiMissingFeedback] = useState("");
  const [showAcceptAsk, setShowAcceptAsk] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);
const [showDisagree, setShowDisagree] = useState(false);
const [isDragActive, setIsDragActive] = useState(false);


  const handleUpload = async (e) => {
  const file = e.target.files[0];
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

    const response = await fetch(`${BACKEND_URL}/api/check-file`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("AI review failed");
    const data = await response.json();

// Handle company name mismatch / confirmation prompt from backend
if (data.requireCompanyNameConfirmation) {
  // Pass up to App for handling modal and possible retry
  if (typeof window !== "undefined" && window.setShowSupplierNameModal) {
    // for global ref (optional, see step 4)
    window.setShowSupplierNameModal(true);
    window.setInputSupplierName(data.detectedCompanyName || "");
  }
  if (typeof window !== "undefined" && window.setPendingUpload) {
    window.setPendingUpload({
      file, requirement, email, questionNumber, requirementIdx
    });
  }
  setError("Company name needs confirmation/correction.");
  setUploading(false);
  return;
}

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

    // --- PATCH: Refresh company name after uploading to Q1R1 ---
    if (questionNumber === 1 && fetchSupplierName) {
      fetchSupplierName();
    }

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
    setAccepted(false);                     // Reset accept state
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
};


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
    {!uploaded && (
  <>
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
    ><div
    style={{
      fontSize: "1.0rem",
      fontWeight: 700,
      color: "#0085CA",
    }}
  >
    Requirement {requirementIdx + 1}: {requirement}
  </div>
      <div style={{ fontWeight: 600, 
        color: "#999",
        fontSize: "0.70rem",
        marginTop: "10px",
        marginBottom: "10px" }}>
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
  </>
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
    {error && <div style={{ color: "red", marginTop: 12 }}>{error}</div>}
  </div>
);
}
function FinalReportCard({ questions, results, summary, score }) {
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
          {questions.map((q, idx) =>
            (results[idx]?.answer === "Yes"
              ? q.requirements.map((r, ridx) => (
                <tr key={`${idx}-${ridx}`}>
                  <td style={{ border: "1px solid #eee" }}>{q.number}</td>
                  <td style={{ border: "1px solid #eee" }}>{q.text.slice(0, 32)}...</td>
                  <td style={{ border: "1px solid #eee" }}>{results[idx].answer}</td>
                  <td style={{ border: "1px solid #eee" }}>{`R${ridx + 1}: ${r.slice(0, 20)}...`}</td>
                  <td style={{ border: "1px solid #eee" }}>{results[idx].requirements?.[ridx]?.aiScore ?? "-"}</td>
                  <td style={{ border: "1px solid #eee" }}>{results[idx].requirements?.[ridx]?.aiFeedback?.slice(0, 32) ?? "-"}</td>
                </tr>
              ))
              : (
                <tr key={idx}>
                  <td style={{ border: "1px solid #eee" }}>{q.number}</td>
                  <td style={{ border: "1px solid #eee" }}>{q.text.slice(0, 32)}...</td>
                  <td style={{ border: "1px solid #eee" }}>{results[idx]?.answer ?? "-"}</td>
                  <td style={{ border: "1px solid #eee" }}>-</td>
                  <td style={{ border: "1px solid #eee" }}>-</td>
                  <td style={{ border: "1px solid #eee" }}>-</td>
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
        <ReactMarkdown>{summary}</ReactMarkdown>
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
}
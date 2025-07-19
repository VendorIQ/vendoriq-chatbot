import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from "react-markdown";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const GEMINI_API_URL = process.env.REACT_APP_GEMINI_API_URL || "https://4d66d45e-0288-4203-935e-1c5d2a182bde-00-38ratc2twzear.pike.replit.dev/api/run-gemini-feedback";

// ---- QUESTIONNAIRE ----
const questions = [
  {
    number: 1,
    text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    disqualifiesIfNo: true,
    requirements: [
      "A copy of the OHS Policy.",
      "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards)."
    ]
  },
  {
    number: 2,
    text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
    disqualifiesIfNo: false,
    requirements: [
      "A declaration from your top management that your company has not committed any infringements to the laws or regulations or is not under any current investigation by any regulatory authority in respect of any OHS matters (Statement should be signed off by CEO with official letterhead, stamp, etc.)",
      "A copy of the documented process or the systematic identification and assessment of legal applicable laws and regulations (i.e. procedure, instruction)",
      "A list of all OHS requirements including laws and regulations that the Company has identified as applicable",
      "A report of the legal compliance check conducted within the last twelve (12) months and corrective action plan to close any gaps identified"
    ]
  },
  {
    number: 3,
    text: "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
    disqualifiesIfNo: false,
    requirements: [
      "A copy of the documented process (i.e. procedure, instruction).",
      "Evidence of how the process has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards).",
      "Evidence of investigations, identified root causes and action plans for incidents and near misses (i.e. investigation reports) (excluding personal identifiable information).",
      `Records if the Company had any work-related fatality and/or incidents (internal employee, sub-contractors, or external party) that caused permanent disability or absence of over thirty (30) days in the last three (03) years.
      Evidence requested includes:
        1. If yes, the Company must provide the investigation report/s, and corrective action plans to prevent re-occurrence, including a status report on the corrective actions.
        2. If not, the Company must provide a declaration from its top management that there has not been any work-related fatality and/or incident that caused permanent disability or absence of over thirty (30) days in the last three (03) years.`,
      "Last three (03) years statistics including incidents, near misses, fatalities, work related illness."
    ]
  }
 ];

// =============== MAIN COMPONENT ===============
export default function App() {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [step, setStep] = useState(-1);
  const [showUploads, setShowUploads] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [showEmailInput, setShowEmailInput] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [uploadFiles, setUploadFiles] = useState({});
  const [answers, setAnswers] = useState([]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const typingTimeout = useRef();

  // For comments per requirement:
  const [commentInputs, setCommentInputs] = useState({});
  const [uploadedComments, setUploadedComments] = useState({});
  const [uploading, setUploading] = useState({});

  // Gemini
  const [geminiSummary, setGeminiSummary] = useState('');
  const [geminiScore, setGeminiScore] = useState(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState('');

  // ===== Email validation =====
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ===== Animated question typing =====
  const startTypingQuestion = (stepIndex) => {
    const question = questions[stepIndex].text;
    setTyping(true);
    setTypingText("");
    let i = 0;
    typingTimeout.current = setInterval(() => {
      setTypingText(question.slice(0, i + 1));
      i++;
      if (i === question.length) {
        clearInterval(typingTimeout.current);
        setTimeout(() => {
          setMessages(prev => [...prev, { from: "bot", text: question }]);
          setTyping(false);
          setTypingText("");
        }, 250);
      }
    }, 10);
  };

  // ===== Session =====
  const initSession = async () => {
    if (!validateEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }
    const { data } = await supabase.from("sessions").select("*").eq("email", email).single();
    let sessionStep = 0;
    if (data) {
      setSessionId(data.id);
      sessionStep = data.current_question;
    } else {
      const { data: newSession } = await supabase
        .from("sessions")
        .insert({ email, current_question: 0, status: "active" })
        .select()
        .single();
      if (newSession) {
        setSessionId(newSession.id);
      } else {
        alert('Could not start session. Please try again or contact support.');
        return;
      }
    }
    setShowEmailInput(false);
    setMessages([{ from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }]);
    setTimeout(() => setStep(sessionStep), 350);
  };

  // ===== Question sequence/typing =====
  useEffect(() => {
    if (step >= 0 && step < questions.length && !justAnswered && !showUploads) {
      setUploadFiles({});
      setCommentInputs({});
      setUploadedComments({});
      startTypingQuestion(step);
      return () => clearInterval(typingTimeout.current);
    } else if (step >= questions.length && reviewConfirmed) {
      setShowComplete(true);
    }
    // eslint-disable-next-line
  }, [step, justAnswered, showUploads, reviewConfirmed]);

  // ===== Handle answer =====
  const handleAnswer = (answer) => {
    const currentQuestion = questions[step];
    setAnswers(prev => {
      const updated = [...prev];
      updated[step] = { question: currentQuestion.text, answer };
      return updated;
    });
    setMessages(prev => [...prev, { from: "user", text: answer }]);
    setJustAnswered(true);
    if (answer === "Yes" && currentQuestion.requirements.length > 0) {
      setShowUploads(true);
    } else {
      setTimeout(() => {
        setStep(prev => prev + 1);
        setJustAnswered(false);
      }, 350);
    }
  };

  // ====== Handle multi file upload ======
  const handleUploadChange = async (e, reqIdx) => {
    const files = Array.from(e.target.files).slice(0, 3);
    setUploading(prev => ({ ...prev, [reqIdx]: true }));
    let uploaded = uploadFiles[reqIdx] || [];
    for (const file of files) {
      const filePath = `uploads/${sessionId}_${email}/question-${questions[step].number}/req-${reqIdx + 1}-${file.name}`;
      await supabase.storage.from('uploads').upload(filePath, file, { upsert: true });
      uploaded.push(file);
    }
    setUploadFiles(prev => ({
      ...prev,
      [reqIdx]: uploaded.slice(0, 3)
    }));
    setUploading(prev => ({ ...prev, [reqIdx]: false }));
  };

  // ====== Handle comment input ======
  const handleCommentInput = (e, reqIdx) => {
    setCommentInputs(prev => ({ ...prev, [reqIdx]: e.target.value }));
  };

  // ====== Save comments as .txt files per requirement ======
  const handleSaveComment = async (reqIdx) => {
    const comment = commentInputs[reqIdx];
    if (comment && comment.trim()) {
      const fileBlob = new Blob([comment], { type: "text/plain" });
      const filePath = `uploads/${sessionId}_${email}/question-${questions[step].number}/req-${reqIdx + 1}-COMMENT.txt`;
      await supabase.storage.from('uploaded_files').upload(filePath, fileBlob, { upsert: true, contentType: "text/plain" });
      setUploadedComments(prev => ({ ...prev, [reqIdx]: comment }));
      setCommentInputs(prev => ({ ...prev, [reqIdx]: "" }));
    }
  };

  // ====== Delete upload or comment ======
  const handleDeleteFile = async (reqIdx, fileIdx) => {
    const file = uploadFiles[reqIdx][fileIdx];
    const filePath = `uploads/${sessionId}_${email}/question-${questions[step].number}/req-${reqIdx + 1}-${file.name}`;
    await supabase.storage.from('uploaded_files').remove([filePath]);
    setUploadFiles(prev => ({
      ...prev,
      [reqIdx]: prev[reqIdx].filter((_, i) => i !== fileIdx)
    }));
  };
  const handleDeleteComment = async (reqIdx) => {
    const filePath = `uploads/${sessionId}_${email}/question-${questions[step].number}/req-${reqIdx + 1}-COMMENT.txt`;
    await supabase.storage.from('uploaded_files').remove([filePath]);
    setUploadedComments(prev => ({ ...prev, [reqIdx]: undefined }));
  };

  // ===== Submit assessment & fetch Gemini feedback =====
  const handleSubmitAssessment = async () => {
    setReviewConfirmed(true);
    setGeminiLoading(true);
    setGeminiSummary('');
    setGeminiScore(null);
    setGeminiError('');
    try {
      const res = await fetch(
        GEMINI_API_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, sessionId })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setGeminiSummary(data.feedback || '');
      setGeminiScore(data.score || null);
      setShowComplete(true);
      setGeminiLoading(false);
    } catch (err) {
      setGeminiError(err.message || 'Error contacting Gemini feedback server.');
      setGeminiLoading(false);
    }
  };

  // ====== Edit answer ======
  const handleEditAnswer = (index) => {
    setStep(index);
    setShowUploads(false);
    setJustAnswered(false);
    setReviewConfirmed(false);
    setMessages(prev => [...prev, { from: "bot", text: `Let's revisit Question ${index + 1}` }]);
  };

  // ====== Back to Review after Assessment Complete ======
  const handleBackToReview = () => {
    setShowComplete(false);
    setReviewConfirmed(false);
    setStep(questions.length);
  };

  // ============ UI =============
  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}>
      <nav style={{
        background: "#333",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: 8,
        marginBottom: 14,
        fontSize: "1.1rem"
      }}>
        <strong>VendorIQ Chatbot</strong>
      </nav>

      {/* EMAIL INPUT */}
      {showEmailInput && (
        <div style={{ marginBottom: 14 }}>
          <input
            type="email"
            placeholder="Enter your email to begin"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && initSession()}
            style={{ padding: "8px", width: "80%", fontSize: "0.97rem" }}
          />
          <button onClick={initSession} style={{ marginLeft: 10, padding: "8px", fontSize: "0.97rem" }}>Start</button>
        </div>
      )}

      {/* CHAT HISTORY */}
      {messages.map((msg, idx) => (
        <div
          key={idx}
          style={{
            margin: "6px 0",
            padding: "10px 14px",
            background: msg.from === "bot" ? "#e5eeff" : "#d1ffe5",
            borderRadius: 18,
            textAlign: msg.from === "bot" ? "left" : "right",
            maxWidth: "95%",
            marginLeft: msg.from === "bot" ? 0 : "auto",
            boxShadow: "0 1px 4px #0001",
            fontSize: "0.99rem"
          }}
        >
          {msg.text}
        </div>
      ))}

      {/* TYPING ANIMATION */}
      {typing && (
        <div
          style={{
            margin: "6px 0",
            padding: "10px 14px",
            background: "#e5eeff",
            borderRadius: 18,
            color: "#234",
            fontStyle: "italic",
            boxShadow: "0 1px 4px #0001",
            fontSize: "0.99rem"
          }}
        >
          {typingText}<span className="typing-cursor">|</span>
        </div>
      )}

      {/* YES/NO BUTTONS */}
      {!typing && !showUploads && !showEmailInput && step >= 0 && step < questions.length && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => handleAnswer("Yes")} style={{ marginRight: 12, fontSize: "0.98rem" }}>Yes</button>
          <button onClick={() => handleAnswer("No")} style={{ fontSize: "0.98rem" }}>No</button>
        </div>
      )}

      {/* UPLOAD/COMMENT SECTION */}
      {showUploads && step < questions.length && (
        <div style={{ background: "#fffbe6", borderRadius: 14, padding: 16, marginTop: 14 }}>
          <h3 style={{ fontSize: "1.02rem" }}>Please upload the following documents:</h3>
          <ul style={{ paddingLeft: 20 }}>
            {questions[step].requirements.map((req, idx) => (
              <li key={idx} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: "0.97rem" }}>{req}</div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                  onChange={e => handleUploadChange(e, idx)}
                  disabled={uploading[idx]}
                  style={{ marginTop: 6, fontSize: "0.91rem" }}
                />
                {uploadFiles[idx] && uploadFiles[idx].length > 0 && (
                  <div style={{ fontSize: "0.87rem", color: "#333", marginTop: 6 }}>
                    {uploadFiles[idx].map((file, fileIdx) => (
                      <div key={fileIdx} style={{ display: "flex", alignItems: "center" }}>
                        📎 {file.name}
                        <button
                          onClick={() => handleDeleteFile(idx, fileIdx)}
                          style={{
                            marginLeft: 8,
                            background: "none",
                            border: "none",
                            color: "#c00",
                            fontWeight: "bold",
                            cursor: "pointer",
                            fontSize: "1rem"
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    placeholder="Leave a comment (optional)"
                    value={commentInputs[idx] || ""}
                    onChange={e => handleCommentInput(e, idx)}
                    style={{
                      padding: 6,
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      width: "100%",
                      fontSize: "0.91rem"
                    }}
                  />
                  <button
                    style={{
                      marginTop: 3,
                      marginLeft: 3,
                      fontSize: "0.91rem",
                      borderRadius: 5,
                      padding: "4px 12px"
                    }}
                    onClick={() => handleSaveComment(idx)}
                    disabled={!!uploadedComments[idx]}
                  >
                    Save Comment
                  </button>
                </div>
                {uploadedComments[idx] && (
                  <div style={{ fontSize: "0.87rem", color: "#444", marginTop: 4, display: "flex", alignItems: "center" }}>
                    📎 COMMENT.txt
                    <button
                      onClick={() => handleDeleteComment(idx)}
                      style={{
                        marginLeft: 8,
                        background: "none",
                        border: "none",
                        color: "#c00",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: "1rem"
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              setShowUploads(false);
              setStep(prev => prev + 1);
              setJustAnswered(false);
            }}
            style={{ marginTop: 10, fontSize: "0.97rem" }}
          >
            Continue
          </button>
        </div>
      )}

      {/* REVIEW BLOCK */}
      {!showEmailInput && answers.length > 0 && step === questions.length && !showUploads && !showComplete && (
        <div style={{ marginTop: 14, background: "#e5eeff", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: "1.05rem" }}>Review Your Answers</h3>
          <ul>
            {answers.map((entry, idx) => (
              <li key={idx} style={{ marginBottom: 7, fontSize: "0.98rem" }}>
                <strong>Q{idx + 1}:</strong> {entry.question}
                <br />
                <strong>Answer:</strong> {entry.answer}
                <br />
                <button onClick={() => handleEditAnswer(idx)} style={{ marginTop: 3, fontSize: "0.91rem" }}>Edit</button>
              </li>
            ))}
          </ul>
          <button onClick={handleSubmitAssessment} style={{ marginTop: 8, fontSize: "0.97rem" }}>
            Submit Assessment
          </button>
        </div>
      )}

      {/* ASSESSMENT COMPLETE with Gemini Feedback */}
      {showComplete && (
        <div style={{ marginTop: 40, padding: 20, background: "#e0ffe0", borderRadius: 16 }}>
          <h2 style={{ fontSize: "1.08rem" }}>Assessment Complete!</h2>
          <p style={{ fontSize: "0.96rem" }}>
            Thank you for completing the VendorIQ compliance interview. A summary report will be sent to your email shortly.
          </p>
          <div style={{ marginTop: 18 }}>
            {geminiLoading && <div style={{ color: "#444", fontSize: "0.97rem" }}>Gemini AI is reviewing your documents…</div>}
            {geminiError && <div style={{ color: "red", fontSize: "0.97rem" }}>{geminiError}</div>}
            {geminiSummary && (
              <div style={{ background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 1px 6px #0002", marginTop: 6 }}>
                <h3 style={{ fontSize: "1.03rem" }}>AI Assessment Feedback</h3>
                <ReactMarkdown>{geminiSummary}</ReactMarkdown>
                {geminiScore !== null && (
                  <div style={{ fontSize: "0.99rem" }}>
                    <strong>Score:</strong> {geminiScore}%
                  </div>
                )}
              </div>
            )}
            {!geminiLoading && !geminiSummary && !geminiError && (
              <div style={{ color: "#aaa", fontSize: "0.96rem" }}>
                No Gemini feedback yet. It may take a moment—try refreshing.
              </div>
            )}
          </div>
          <button
            style={{
              marginTop: 24,
              padding: "10px 22px",
              borderRadius: 10,
              background: "#3b72da",
              color: "#fff",
              border: "none",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
            onClick={handleBackToReview}
          >
            Review My Answers
          </button>
        </div>
      )}
    </div>
  );
}
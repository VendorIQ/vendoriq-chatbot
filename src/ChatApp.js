// ChatApp.js (final cleanup with restored logic)
import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from "react-markdown";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// --- CONSTANTS ---
const botAvatar = process.env.PUBLIC_URL + "/bot-avatar.png";
const userAvatar = process.env.PUBLIC_URL + "/user-avatar.png";
const GEMINI_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const questions = [
  // ... (same question array as before)
];

export default function ChatApp({ user }) {
  const email = user.email;
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [step, setStep] = useState(-1);
  const [showUploads, setShowUploads] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [uploadReqIdx, setUploadReqIdx] = useState(0);
  const [justAnswered, setJustAnswered] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [showDisagreeModal, setShowDisagreeModal] = useState(false);
  const [disagreeReason, setDisagreeReason] = useState("");
  const [disagreeFile, setDisagreeFile] = useState(null);
  const [disagreeLoading, setDisagreeLoading] = useState(false);
  const typingTimeout = useRef();

  useEffect(() => {
    async function initSession() {
      const { data } = await supabase.from("sessions").select("*").eq("email", email).single();
      let sessionStep = 0;
      if (data) {
        setSessionId(data.id);
        sessionStep = data.current_question || 0;
      } else {
        const { data: newSession } = await supabase
          .from("sessions")
          .insert({ email, current_question: 0, status: "active" })
          .select()
          .single();
        if (newSession) {
          setSessionId(newSession.id);
        } else {
          alert("Could not start session.");
          return;
        }
      }
      setMessages([{ from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }]);
      setTimeout(() => setStep(sessionStep), 350);
    }
    initSession();
  }, [email]);

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

  useEffect(() => {
    if (step >= 0 && step < questions.length && !justAnswered && !showUploads) {
      startTypingQuestion(step);
      return () => clearInterval(typingTimeout.current);
    } else if (step >= questions.length && reviewConfirmed) {
      setShowComplete(true);
    }
  }, [step, justAnswered, showUploads, reviewConfirmed]);

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

  const handleSubmitAssessment = async () => {
    setReviewConfirmed(true);
    setTyping(true);
    setTypingText("Reviewing your documents with Groq...");
    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'mixtral-8x7b-32768',
          messages: [
            {
              role: 'system',
              content: 'You are an expert auditor. Please review the supplier\'s uploaded answers and documents, and provide a summary with an overall score out of 100. Return only Markdown with `Summary:`, `Suggestions:` and `Score: X/100`.'
            },
            {
              role: 'user',
              content: answers.map((a, i) => `Q${i + 1}: ${a.question}\nAnswer: ${a.answer}`).join("\n\n")
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;

      setMessages(prev => [...prev, { from: "bot", text: "Here is your AI-reviewed summary:" }, { from: "bot", text }]);
      setTyping(false);
      setTypingText("");
    } catch (err) {
      setTyping(false);
      setTypingText("");
      setMessages(prev => [...prev, { from: "bot", text: "⚠️ Failed to contact Groq AI service." }]);
    }
  };

  if (showUploads && step >= 0 && step < questions.length) {
    const question = questions[step];
    const requirement = question.requirements[uploadReqIdx];

    const handleUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setUploading(true);
      setUploadFeedback("");
      const filePath = `uploads/${sessionId}_${email}/question-${question.number}/requirement-${uploadReqIdx + 1}-${file.name}`;
      const { error } = await supabase.storage.from("uploads").upload(filePath, file, { upsert: true });
      if (error) {
        setUploadFeedback("❌ Upload failed: " + error.message);
        setUploading(false);
        return;
      }
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("requirement", requirement);
        formData.append("email", email);
        formData.append("questionNumber", question.number);

        const response = await fetch("http://localhost:8080/api/check-file", {
          method: "POST",
          body: formData
        });
        const result = await response.json();
        setMessages(prev => [...prev, { from: "bot", text: `📎 Q${question.number}, Req ${uploadReqIdx + 1} Feedback:

${result.feedback}` }]);
        setUploaded(true);
      } catch (err) {
        setUploadFeedback("❌ AI review failed: " + err.message);
      }
      setUploading(false);
    };

    const handleAccept = () => {
      if (uploadReqIdx < question.requirements.length - 1) {
        setUploadReqIdx(uploadReqIdx + 1);
        setUploaded(false);
        setUploadFeedback("");
      } else {
        setShowUploads(false);
        setUploadReqIdx(0);
        setUploaded(false);
        setStep(prev => prev + 1);
        setJustAnswered(false);
      }
    };

    return (
      <div style={{ padding: 20, background: '#fffbe6', borderRadius: 12 }}>
        <h3>📎 Requirement {uploadReqIdx + 1}</h3>
        <p>{requirement}</p>
        <input type="file" onChange={handleUpload} disabled={uploading} />
        {uploadFeedback && <p>{uploadFeedback}</p>}
        {uploaded && (
          <div style={{ marginTop: 12 }}>
            <button onClick={handleAccept}>✅ Accept & Continue</button>
            <button onClick={() => setUploaded(false)} style={{ marginLeft: 8 }}>📄 Re-upload</button>
            <button onClick={() => setShowDisagreeModal(true)} style={{ marginLeft: 8 }}>❓ Disagree</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Inter, sans-serif" }}>
      <nav style={{ background: '#333', color: '#fff', padding: '12px 18px', borderRadius: 8, marginBottom: 10, fontSize: '1rem' }}>
        <button onClick={() => setReviewMode(!reviewMode)} style={{ background: '#f8f8f8', color: '#333', padding: '4px 12px', marginRight: 10, borderRadius: 6 }}>
          {reviewMode ? '🔙 Exit Auditor Panel' : '🛠️ Auditor Review'}
        </button>
        <strong>VendorIQ Chatbot</strong>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} style={{ marginLeft: 'auto', background: '#f44336', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
          🚪 Logout
        </button>
      </nav>

      {messages.map((msg, idx) => (
        <div key={idx} style={{ textAlign: msg.from === "bot" ? "left" : "right" }}>
          <div style={{ background: msg.from === "bot" ? "#e0e0ff" : "#d0ffd0", display: "inline-block", padding: 10, borderRadius: 12, margin: 6 }}>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        </div>
      ))}

      {typing && <div style={{ background: "#e0e0ff", padding: 10, borderRadius: 12, margin: 6 }}>{typingText}…</div>}

      {!typing && !showUploads && step >= 0 && step < questions.length && !reviewMode && (
        <div style={{ marginTop: 16 }}>
          <button onClick={() => handleAnswer("Yes")}>✅ Yes</button>
          <button onClick={() => handleAnswer("No")}>❌ No</button>
        </div>
      )}

      {step >= questions.length && !showComplete && (
        <div style={{ marginTop: 24 }}>
          <button onClick={handleSubmitAssessment}>🧠 Submit for AI Summary</button>
        </div>
      )}

      {reviewMode && (
        <div style={{ background: '#fff', padding: 20, borderRadius: 12, marginTop: 20 }}>
          <h3>🔎 Auditor Review Panel</h3>
          <ul style={{ paddingLeft: 16 }}>
            {answers.map((a, i) => (
              <li key={i} style={{ marginBottom: 10 }}>
                <strong>Q{i + 1}:</strong> {a.question}<br />
                <strong>Answer:</strong> {a.answer || <span style={{ color: 'red' }}>No answer</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showComplete && (
        <div style={{ marginTop: 32, background: '#e3f6e3', padding: 20, borderRadius: 12 }}>
          <h3>✅ Assessment Complete</h3>
          <p>Thank you! Here's a summary based on your answers:</p>
          <div style={{ marginTop: 14 }}>
            {messages.filter(m => m.from === 'bot' && m.text.includes('Summary:')).map((msg, i) => (
              <div key={i} style={{ background: '#fff', padding: 14, borderRadius: 8 }}>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ))}
          </div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 20 }}>🔄 Restart Interview</button>
        </div>
      )}
    </div>
  );
}

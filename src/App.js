// VendorIQ React chatbot with Supabase integration and document uploads
import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const questions = [
  // ... [unchanged questions array] ...
  // your questions as before
];

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
  const [reviewMode, setReviewMode] = useState(false);
  const [aiSummary, setAiSummary] = useState("");           // PATCHED: to hold AI feedback
  const [loading, setLoading] = useState(false);            // PATCHED: show loading state for AI

  const typingTimeout = useRef();

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
        }, 350);
      }
    }, 14);
  };

  const initSession = async () => {
    if (!validateEmail(email)) {
      alert("Please enter a valid email address.");
      return;
    }
    const { data, error } = await supabase.from("sessions").select("*").eq("email", email).single();
    let sessionStep = 0;
    if (data) {
      setSessionId(data.id);
      sessionStep = data.current_question;
    } else {
      const { data: newSession, error: insertError } = await supabase
        .from("sessions")
        .insert({ email, current_question: 0, status: "active" })
        .select()
        .single();
      if (newSession) {
        setSessionId(newSession.id);
      } else {
        console.error('Failed to create session:', insertError);
        alert('Could not start session. Please try again or contact support.');
        return;
      }
    }
    setShowEmailInput(false);
    setMessages([{ from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }]);
    setTimeout(() => setStep(sessionStep), 400);
  };

  useEffect(() => {
    if (step >= 0 && step < questions.length && !justAnswered && !showUploads) {
      startTypingQuestion(step);
      return () => clearInterval(typingTimeout.current);
    }
  }, [step, justAnswered, showUploads]);

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
      }, 400);
    }
  };

  // PATCHED: Use 'uploads' bucket instead of 'uploaded_files'
  const handleUploadChange = async (e, requirementIndex) => {
    const file = e.target.files[0];
    if (!file) return;
    const filePath = `uploads/${sessionId}_${email}/question-${questions[step].number}/req-${requirementIndex + 1}-${file.name}`;
    const { error } = await supabase.storage.from('uploads').upload(filePath, file, { upsert: true });
    if (error) {
      alert(`File upload failed: ${error.message}`);
      return;
    }
    setUploadFiles(prev => ({ ...prev, [requirementIndex]: file }));
  };

  const handleEditAnswer = (index) => {
    setStep(index);
    setShowUploads(false);
    setJustAnswered(false);
    setReviewConfirmed(false);
    setReviewMode(false);
    setMessages(prev => [...prev, { from: "bot", text: `Let's revisit Question ${index + 1}` }]);
  };

  // PATCHED: Handler for submitting the assessment, fetches Gemini AI summary
  const handleAssessmentSubmit = async () => {
    setLoading(true);
    setReviewConfirmed(true);
    try {
      // Call your backend API endpoint to get Gemini AI feedback
      const response = await fetch('https://YOUR_BACKEND_DOMAIN/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email }),
      });
      const data = await response.json();
      setAiSummary(data.summary || "No summary was generated.");
    } catch (err) {
      setAiSummary("AI analysis failed or server unavailable.");
    }
    setShowComplete(true);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}>
      <nav style={{ background: "#333", color: "#fff", padding: "12px 24px", borderRadius: 10, marginBottom: 20 }}>
        <strong>VendorIQ Chatbot</strong>
      </nav>

      {showEmailInput && (
        <div style={{ marginBottom: 20 }}>
          <input
            type="email"
            placeholder="Enter your email to begin"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && initSession()}
            style={{ padding: "10px", width: "80%", fontSize: "1rem" }}
          />
          <button onClick={initSession} style={{ marginLeft: 10, padding: "10px" }}>Start</button>
        </div>
      )}

      {messages.map((msg, idx) => (
        <div
          key={idx}
          style={{
            margin: "10px 0",
            padding: "12px 20px",
            background: msg.from === "bot" ? "#e5eeff" : "#d1ffe5",
            borderRadius: 20,
            textAlign: msg.from === "bot" ? "left" : "right",
            maxWidth: "95%",
            marginLeft: msg.from === "bot" ? 0 : "auto",
            boxShadow: "0 1px 4px #0001",
            fontSize: "1.05rem"
          }}
        >
          {msg.text}
        </div>
      ))}

      {typing && (
        <div
          style={{
            margin: "10px 0",
            padding: "12px 20px",
            background: "#e5eeff",
            borderRadius: 20,
            color: "#234",
            fontStyle: "italic",
            boxShadow: "0 1px 4px #0001"
          }}
        >
          {typingText}<span className="typing-cursor">|</span>
        </div>
      )}

      {!typing && !showUploads && !showEmailInput && step >= 0 && step < questions.length && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => handleAnswer("Yes")} style={{ marginRight: 16 }}>Yes</button>
          <button onClick={() => handleAnswer("No")}>No</button>
        </div>
      )}

      {showUploads && step < questions.length && (
        <div style={{ background: "#fffbe6", borderRadius: 16, padding: 20, marginTop: 20 }}>
          <h3>Please upload the following documents:</h3>
          <ul style={{ paddingLeft: 20 }}>
            {questions[step].requirements.map((req, idx) => (
              <li key={idx} style={{ marginBottom: 12 }}>
                {req}
                <br />
                <input
                  type="file"
                  onChange={(e) => handleUploadChange(e, idx)}
                  style={{ marginTop: 6 }}
                />
                {uploadFiles[idx] && (
                  <div style={{ fontSize: "0.9rem", color: "#333", marginTop: 6 }}>
                    📎 <a href={
                      // PATCHED: download link for 'uploads' bucket
                      `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/public/uploads/uploads/${sessionId}_${email}/question-${questions[step].number}/req-${idx + 1}-${uploadFiles[idx].name}`
                    } target="_blank" rel="noopener noreferrer">{uploadFiles[idx].name}</a>
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
            style={{ marginTop: 20 }}
          >
            Continue
          </button>
        </div>
      )}

      {!showEmailInput && answers.length > 0 && step === questions.length && !showUploads && !showComplete && (
        <div style={{ marginTop: 20, background: "#e5eeff", borderRadius: 20, padding: 20 }}>
          <h3>Review Your Answers</h3>
          <ul>
            {answers.map((entry, idx) => (
              <li key={idx} style={{ marginBottom: 10 }}>
                <strong>Q{idx + 1}:</strong> {entry.question}
                <br />
                <strong>Answer:</strong> {entry.answer}
                <br />
                <button onClick={() => handleEditAnswer(idx)} style={{ marginTop: 4 }}>Edit</button>
              </li>
            ))}
          </ul>
          <button onClick={handleAssessmentSubmit} style={{ marginTop: 12 }}>
            {loading ? "Generating Summary..." : "Submit Assessment"}
          </button>
        </div>
      )}

      {/* PATCHED: Show Gemini AI summary in assessment summary/complete balloon */}
      {showComplete && (
        <div style={{ marginTop: 40, padding: 20, background: "#e0ffe0", borderRadius: 16 }}>
          <h2>Assessment Complete!</h2>
          <p>Thank you for completing the VendorIQ compliance interview. A summary report will be sent to your email shortly.</p>
          <hr />
          <h3>AI Feedback & Summary</h3>
          {loading ? (
            <p>Analyzing your documents and answers...</p>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", background: "#f8f8fa", padding: 10, borderRadius: 10, marginTop: 10 }}>
              {aiSummary}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from "react";
import { createClient } from '@supabase/supabase-js';
import ReactMarkdown from "react-markdown";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const GEMINI_API_URL = process.env.REACT_APP_GEMINI_API_URL || "https://4d66d45e-0288-4203-935e-1c5d2a182bde-00-38ratc2twzear.pike.replit.dev/api/run-gemini-feedback";

const botAvatar = process.env.PUBLIC_URL + "/bot-avatar.png";
const userAvatar = process.env.PUBLIC_URL + "/user-avatar.png";

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

  // For comments per requirement:
  const [commentInputs, setCommentInputs] = useState({});
  const [uploadedComments, setUploadedComments] = useState({});
  const [uploading, setUploading] = useState({});

  // Gemini
  const [geminiSummary, setGeminiSummary] = useState('');
  const [geminiScore, setGeminiScore] = useState(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState('');

  // -------- Helper for friendlier dialog --------
  function getBotMessage({ step, answer, justAnswered }) {
    if (step < 0) {
      return [
        "Hi there! Welcome to the VendorIQ Supplier Compliance Interview.",
        "I’ll be your guide today—just answer a few questions, and I’ll help you every step of the way."
      ];
    }
    const q = questions[step];
    if (!justAnswered) {
      return [
        "Let's talk about your company's safety practices.",
        `**Question ${q.number}:** ${q.text}`
      ];
    }
    if (answer === "Yes") {
      return [
        "Awesome, thanks for letting me know!",
        "Since you answered yes, could you please upload the required documents? (You can drag and drop your files or click to upload.)"
      ];
    }
    if (answer === "No" && q.disqualifiesIfNo) {
      return [
        "Thanks for your honesty!",
        "Just so you know, having a written OHS Policy is an important requirement. Let's continue."
      ];
    }
    return [
      "Thanks for your response!",
      "Let's move on to the next question."
    ];
  }

  // -------- Utility: Sequential bubbles with typing animation --------
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
            setMessages(prev => [...prev, { from, text: msg }]);
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

  // -------- Email validation --------
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // -------- Session --------
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
    sendBubblesSequentially(getBotMessage({ step: -1 }), "bot", 650, () => {
      setStep(sessionStep);
    });
  };

  // -------- Question sequence/typing --------
  useEffect(() => {
    if (step >= 0 && step < questions.length && !justAnswered && !showUploads) {
      setUploadFiles({});
      setCommentInputs({});
      setUploadedComments({});
      sendBubblesSequentially(getBotMessage({ step, justAnswered: false }));
    } else if (step >= questions.length && reviewConfirmed) {
      setShowComplete(true);
    }
    // eslint-disable-next-line
  }, [step, justAnswered, showUploads, reviewConfirmed]);

  // -------- Handle answer --------
  const handleAnswer = (answer) => {
    const currentQuestion = questions[step];
    setAnswers(prev => {
      const updated = [...prev];
      updated[step] = { question: currentQuestion.text, answer };
      return updated;
    });
    setMessages(prev => [...prev, { from: "user", text: answer }]);
    const botMsgs = getBotMessage({ step, answer, justAnswered: true });
    sendBubblesSequentially(botMsgs, "bot", 650, () => {
      if (answer === "Yes" && currentQuestion.requirements.length > 0) {
        setShowUploads(true);
      } else {
        setTimeout(() => {
          setStep(prev => prev + 1);
          setJustAnswered(false);
        }, 350);
      }
    });
    setJustAnswered(true);
  };

  // ============ UI =============
  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Inter, sans-serif", background: "#F7F8FA", minHeight: "100vh" }}>
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

      {/* CHAT HISTORY WITH BUBBLES AND AVATARS */}
      {messages.map((msg, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            flexDirection: msg.from === "bot" ? "row" : "row-reverse",
            alignItems: "center",
            margin: "32px 0",
            maxWidth: "100%"
          }}
        >
          {/* Avatar */}
          <img
            src={msg.from === "bot" ? botAvatar : userAvatar}
            alt={msg.from === "bot" ? "AI Bot" : "You"}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#fff",
              margin: msg.from === "bot" ? "0 16px 0 0" : "0 0 0 16px",
              boxShad

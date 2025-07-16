import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

const supplierId = "SUP123";
const supplierEmail = "abc@vendor.com";

const questions = [
  {
    text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    weight: { Yes: 10, No: 5 },
    requirements: [
      "A copy of the OHS Policy",
      "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards)"
    ],
    consequence: "Consider obtaining ISO 9001 for better market compliance."
  },
  {
    text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
    weight: { Yes: 10, No: 0 },
    requirements: [
      "A declaration from your top management that your company has not committed any infringements to the laws or regulations or is not under any current investigation by any regulatory authority in respect of any OHS matters (Statement should be signed off by CEO with official letterhead, stamp, etc.)",
      "A copy of the documented process or the systematic identification and assessment of legal applicable laws and regulations (i.e. procedure, instruction)",
      "A list of all OHS requirements including laws and regulations that the Company has identified as applicable",
      "A report of the legal compliance check conducted within the last twelve (12) months and corrective action plan to close any gaps identified"
    ],
    consequence: "Failure to comply this, Supplier will be directly failed the assessment"
  },
  {
    text: "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
    weight: { Yes: 10, No: 0 },
    requirements: [
      "A copy of the documented process (i.e. procedure, instruction)",
      "Evidence of how the process has been communicated to employees (if available subcontractors) (i.e. Email, training, notice boards)",
      "Evidence of investigations, identified root causes and action plans for incidents and near misses (i.e. investigation reports) (excluding personal identifiable information)",
      "Records if the Company had any work-related fatality and/or incidents (internal employee, sub-contractors, or external party) that caused permanent disability or absence of over thirty (30) days in the last three (03) years. Evidence requested includes; 1. If yes, the Company must provide the investigation report/s, and corrective action plans to prevent re-occurrence, including a status report on the corrective actions. 2. If not, the Company must provide a declaration from its top management that there has not been any work-related fatality and/or incident that caused permanent disability or absence of over thirty (30) days in the last three (03) years.",
      "Last three (03) years statistics including incidents, near misses, fatalities, work related illness"
    ],
    consequence: "Failure to comply this, Supplier will be directly failed the assessment"
  }
];

function App() {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
  ]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [uploadInputs, setUploadInputs] = useState([]);
  const [uploadFiles, setUploadFiles] = useState({});
  const [reportFeedback, setReportFeedback] = useState([]);
  const [showRestart, setShowRestart] = useState(false);
  const chatBottomRef = useRef(null);

  // SCROLL TO BOTTOM
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingBuffer, uploadInputs, disqualified]);

  // Add question if needed (no duplicate!)
  useEffect(() => {
    if (typing || disqualified || step >= questions.length) return;
    // Only add if not already present
    const q = questions[step]?.text;
    if (q && !messages.some(m => m.text === q)) {
      startTyping(q);
    }
  }, [step, typing, disqualified, messages]);

  // Typing animation
  const startTyping = (text, delay = 14) => {
    setTyping(true);
    setTypingBuffer("");
    let index = 0;
    const interval = setInterval(() => {
      setTypingBuffer(text.slice(0, index + 1));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
        setTyping(false);
        setMessages(prev => [...prev, { from: "bot", text }]);
        setTypingBuffer("");
      }
    }, delay);
  };

  // ANSWER LOGIC
  const handleAnswer = async (answer) => {
    setMessages(prev => [...prev, { from: "user", text: answer }]);
    const current = questions[step];
    const points = current.weight[answer];

    // Try DB insert (catch error, show toast, not crash)
    try {
      await supabase.from("responses").insert({
        supplier_email: supplierEmail,
        question_index: step,
        answer,
        score: points
      });
    } catch (e) {
      // Silently ignore in demo (could show toast)
    }

    if (answer === "No" && points === 0) {
      setMessages(prev => [
        ...prev,
        { from: "bot", text: `❌ Disqualified: ${current.consequence}` }
      ]);
      setDisqualified(true);
      setShowRestart(true);
      setReportFeedback(prev => [
        ...prev,
        `Q${step + 1}: ❌ Disqualified - ${current.consequence}`
      ]);
      return;
    }

    setReportFeedback(prev => [
      ...prev,
      `Q${step + 1}: ${answer} - ${answer === "Yes" ? "Good. Please upload all required documents." : current.consequence}`
    ]);

    if (answer === "Yes" && current.requirements.length > 0) {
      setUploadInputs(current.requirements);
      setUploadFiles({});
    } else {
      setScore(prev => prev + points);
      setStep(prev => prev + 1);
    }
  };

  // UPLOAD DOCS LOGIC (force all uploads)
  const handleFileChange = (idx, file) => {
    setUploadFiles(prev => ({ ...prev, [idx]: file }));
  };

  const handleFilesUploaded = async () => {
    if (uploadInputs.length !== Object.keys(uploadFiles).length) {
      alert("Please upload all required documents before submitting.");
      return;
    }
    for (let i = 0; i < uploadInputs.length; i++) {
      const file = uploadFiles[i];
      if (!file) continue;
      const folder = `uploads/${supplierId}_${supplierEmail}/question-${step + 1}`;
      const path = `${folder}/${file.name}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
      if (error) {
        alert("Upload failed: " + error.message);
        return;
      }
    }
    setMessages(prev => [...prev, { from: "bot", text: "✅ Files uploaded. Moving on..." }]);
    setScore(prev => prev + questions[step].weight.Yes);
    setUploadInputs([]);
    setUploadFiles({});
    setStep(prev => prev + 1);
  };

  // Restart on disqualify
  const restart = () => {
    setMessages([
      { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
    ]);
    setTyping(false);
    setTypingBuffer("");
    setStep(0);
    setScore(0);
    setDisqualified(false);
    setUploadInputs([]);
    setUploadFiles({});
    setReportFeedback([]);
    setShowRestart(false);
  };

  // RENDER HELPERS
  const renderMessages = () =>
    messages.map((msg, idx) =>
      idx === messages.length - 1 && disqualified && msg.text.startsWith("❌") ? null : (
        <div key={idx} className={`bubble ${msg.from}`}>
          {msg.text}
        </div>
      )
    );

  const renderTyping = () =>
    typingBuffer && (
      <div className="bubble bot typing">
        {typingBuffer}
      </div>
    );

  const renderUploads = () =>
    uploadInputs.length > 0 && (
      <div className="bubble bot upload">
        <div>
          <strong>Please upload the following documents:</strong>
        </div>
        {uploadInputs.map((label, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <label>{label}</label>
            <input
              type="file"
              onChange={e => handleFileChange(idx, e.target.files[0])}
              style={{ marginLeft: 8 }}
              accept=".pdf,.doc,.docx,.jpeg,.jpg,.png"
            />
          </div>
        ))}
        <button
          className="submit-btn"
          onClick={handleFilesUploaded}
          disabled={uploadInputs.length !== Object.keys(uploadFiles).length}
        >
          Submit Documents
        </button>
      </div>
    );

  const renderButtons = () =>
    !typing &&
    !disqualified &&
    uploadInputs.length === 0 &&
    step < questions.length && (
      <div className="bubble user" style={{ background: "none", boxShadow: "none" }}>
        <button onClick={() => handleAnswer("Yes")} className="answer-btn">Yes</button>
        <button onClick={() => handleAnswer("No")} className="answer-btn">No</button>
      </div>
    );

  const renderRestart = () =>
    showRestart && (
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button className="restart-btn" onClick={restart}>
          Restart Assessment
        </button>
      </div>
    );

  const renderFinalReport = () =>
    step >= questions.length && !disqualified && (
      <div className="bubble bot complete">
        <h3>✅ Assessment Complete</h3>
        <p>Score: {score}</p>
        <h4>Feedback Summary:</h4>
        <ul>
          {reportFeedback.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      </div>
    );

  const renderDisqualified = () =>
    disqualified && (
      <div className="bubble bot disqualified">
        <h3>❌ Disqualified</h3>
        <p>{questions[step]?.consequence}</p>
      </div>
    );

  return (
    <div className="chat-bg">
      <div className="chat-window">
        <h1>VendorIQ Chatbot</h1>
        <div className="chat-area">
          {renderMessages()}
          {renderTyping()}
          {renderUploads()}
          {renderButtons()}
          {renderFinalReport()}
          {renderDisqualified()}
          {renderRestart()}
          <div ref={chatBottomRef} />
        </div>
      </div>
    </div>
  );
}

export default App;

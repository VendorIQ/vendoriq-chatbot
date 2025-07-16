import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./App.css"; // You need to update this with the CSS below

function App() {
  // Demo hardcoded for now
  const supplierId = "SUP123";
  const supplierEmail = "abc@vendor.com";

  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
  ]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [uploadInputs, setUploadInputs] = useState([]);
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [reportFeedback, setReportFeedback] = useState([]);
  const [files, setFiles] = useState({});
  const [uploadError, setUploadError] = useState("");
  const [restarting, setRestarting] = useState(false);

  // Questions
  const questions = [
    {
      text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
      weight: { Yes: 10, No: 5 },
      requirements: [
        "A copy of the OHS Policy",
        "Evidence of how the OHS Policy has been communicated to employees/subcontractors"
      ],
      consequence: "Consider obtaining ISO 9001 for better market compliance."
    },
    {
      text: "Has your Company committed any infringements to the laws or regulations concerning OHS matters in the last 3 years or is under investigation by any regulatory authority?",
      weight: { Yes: 10, No: 0 },
      requirements: [
        "Declaration from top management (signed/stamped)",
        "Documented process for legal assessment",
        "List of all OHS requirements incl. laws/regulations",
        "Legal compliance report & corrective plan"
      ],
      consequence: "Failure to comply this, Supplier will be directly failed the assessment"
    },
    {
      text: "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
      weight: { Yes: 10, No: 0 },
      requirements: [
        "Documented process (procedure/instruction)",
        "Evidence of communication to employees/subcontractors",
        "Investigation reports, root causes & action plans (no PII)",
        "Fatality/incident declaration and/or report for last 3 years",
        "Last 3 years incident, near misses, fatalities statistics"
      ],
      consequence: "Failure to comply this, Supplier will be directly failed the assessment"
    }
  ];

  // --- Handle Typing Animation ---
  useEffect(() => {
    if (restarting) return;
    if (typing || typingBuffer || disqualified) return;

    if (step < questions.length && !messages.some(m => m.text === questions[step].text)) {
      let idx = 0;
      setTyping(true);
      setTypingBuffer("");
      const fullText = questions[step].text;

      const interval = setInterval(() => {
        setTypingBuffer(fullText.slice(0, idx + 1));
        idx++;
        if (idx >= fullText.length) {
          clearInterval(interval);
          setTyping(false);
          setTypingBuffer("");
          setMessages(prev => [...prev, { from: "bot", text: fullText }]);
        }
      }, 12);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line
  }, [step, typing, typingBuffer, disqualified, restarting]);

  // --- Save to Edge Function (report) ---
  useEffect(() => {
    if (step === questions.length && !disqualified) {
      fetch(process.env.REACT_APP_FUNCTION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email: supplierEmail,
          score,
          feedback: reportFeedback,
        }),
      });
    }
    // eslint-disable-next-line
  }, [step, disqualified]);

  // --- Handle answer buttons ---
  const handleAnswer = (answer) => {
    if (typing || typingBuffer) return;
    setMessages(prev => [...prev, { from: "user", text: answer }]);
    const q = questions[step];

    // Save to DB
    supabase.from("responses").insert({
      supplier_email: supplierEmail,
      question_index: step,
      answer,
      score: q.weight[answer],
    });

    const feedbackMsg = answer === "No"
      ? `❗ ${q.consequence}`
      : `✅ Good. Please ensure all required documents are uploaded.`;
    setReportFeedback(prev => [...prev, `Q${step + 1}: ${answer} - ${feedbackMsg}`]);

    if (answer === "No" && q.weight["No"] === 0) {
      setMessages(prev => [...prev, { from: "bot", text: q.consequence }]);
      setDisqualified(true);
      return;
    }

    if (answer === "Yes" && q.requirements.length > 0) {
      setUploadInputs(q.requirements);
      setFiles({});
    } else {
      setScore(prev => prev + q.weight[answer]);
      setStep(prev => prev + 1);
    }
  };

  // --- Handle file change and force all fields ---
  const handleFileChange = (e, idx) => {
    const f = { ...files, [idx]: e.target.files[0] };
    setFiles(f);
    setUploadError("");
  };

  // --- Submit uploads, only allow if all provided ---
  const handleFilesUploaded = async () => {
    setUploadError("");
    if (uploadInputs.length === 0) return;

    let missing = uploadInputs.find((_, idx) => !files[idx]);
    if (missing) {
      setUploadError("Please upload all required documents.");
      return;
    }
    const folderPrefix = `uploads/${supplierId}_${supplierEmail}/question-${step + 1}`;
    let uploadedFiles = 0;
    for (let idx = 0; idx < uploadInputs.length; idx++) {
      const file = files[idx];
      if (!file) continue;
      const path = `${folderPrefix}/${file.name}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
      if (!error) uploadedFiles++;
      else setUploadError(error.message);
    }
    setReportFeedback(prev => [...prev, `📎 ${uploadedFiles} document(s) uploaded for question ${step + 1}.`]);
    setScore(prev => prev + questions[step].weight["Yes"]);
    setUploadInputs([]);
    setMessages(prev => [...prev, { from: "bot", text: "✅ Files uploaded. Moving on..." }]);
    setStep(prev => prev + 1);
  };

  // --- Restart everything after disqualified ---
  const handleRestart = () => {
    setRestarting(true);
    setTimeout(() => {
      setStep(0);
      setMessages([{ from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }]);
      setTyping(false);
      setTypingBuffer("");
      setUploadInputs([]);
      setScore(0);
      setDisqualified(false);
      setReportFeedback([]);
      setFiles({});
      setUploadError("");
      setRestarting(false);
    }, 250);
  };

  // --- Render Report ---
  const renderFinalReport = () => (
    <div className="complete-box">
      <h3>✅ Assessment Complete</h3>
      <p>Score: {score}</p>
      <div>
        <h4>Feedback Summary:</h4>
        <ul>
          {reportFeedback.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  // --- Render Disqualified ---
  const renderDisqualified = () => (
    <div className="disqualified-box">
      <h3>❌ Disqualified</h3>
      <p>{questions[step]?.consequence}</p>
      <button className="restart-btn" onClick={handleRestart}>Restart Assessment</button>
    </div>
  );

  return (
    <div className="chat-container">
      <h1>VendorIQ Chatbot</h1>

      {messages.map((msg, idx) => (
        <div key={idx} className={`bubble ${msg.from}`}>
          {msg.text}
        </div>
      ))}
      {typing && <div className="bubble bot typing">{typingBuffer}</div>}

      {!typing && !disqualified && uploadInputs.length === 0 && step < questions.length && (
        <div className="button-group">
          <button onClick={() => handleAnswer("Yes")}>Yes</button>
          <button onClick={() => handleAnswer("No")}>No</button>
        </div>
      )}

      {uploadInputs.length > 0 && (
        <div className="upload-section">
          <h4>Upload required documents:</h4>
          {uploadInputs.map((label, idx) => (
            <div key={idx} style={{ marginBottom: 8 }}>
              <label>{label}:</label>
              <input
                type="file"
                onChange={e => handleFileChange(e, idx)}
              />
            </div>
          ))}
          {uploadError && <div className="error-msg">{uploadError}</div>}
          <button
            onClick={handleFilesUploaded}
            disabled={uploadInputs.some((_, idx) => !files[idx])}
          >
            Submit Documents
          </button>
        </div>
      )}

      {step >= questions.length && !disqualified && renderFinalReport()}

      {disqualified && renderDisqualified()}
    </div>
  );
}

export default App;

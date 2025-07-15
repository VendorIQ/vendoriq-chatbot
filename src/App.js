import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [uploadInputs, setUploadInputs] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [messageQueued, setMessageQueued] = useState(false);

  const questions = [
    {
      text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
      weight: { Yes: 10, No: 5 },
      requirements: [
        "A copy of the OHS Policy",
        "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e.. Email, training, notice boards)"
      ],
      consequence: "Consider obtaining ISO 9001 for better market compliance."
    },
    {
      text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
      weight: { Yes: 10, No: 0 },
      requirements: [
        "A declaration from your top management that your company has not committed any infringements to the laws or regulations or is not under any current investigation by any regulatory authority in respect of any OHS matters",
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
        "Evidence of how the process has been communicated to employees (if available subcontractors) (i.e.. Email, training, notice boards)",
        "Evidence of investigations, identified root causes and action plans for incidents and near misses (excluding personal identifiable information)",
        "Records if the Company had any work-related fatality and/or incidents (internal employee, sub-contractors, or external party) that caused permanent disability or absence of over thirty (30) days in the last three (03) years",
        "Last three (03) years statistics including incidents, near misses, fatalities, work related illness"
      ],
      consequence: "Failure to comply this, Supplier will be directly failed the assessment"
    }
  ];

  useEffect(() => {
    const currentQuestionText = questions[step]?.text;
    const hasAsked = messages.some(m => m.from === "bot" && m.text === currentQuestionText);

    if (!typing && !typingBuffer && !disqualified && !messageQueued && step < questions.length && !hasAsked) {
      typeBotMessage(currentQuestionText);
    }
  }, [step, typing, typingBuffer, disqualified, messageQueued]);

  const typeBotMessage = (text) => {
    setTyping(true);
    let index = 0;
    const interval = setInterval(() => {
      setTypingBuffer((prev) => prev + text.charAt(index));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
        setTyping(false);
        setMessages(prev => [...prev, { from: "bot", text }]);
        setTypingBuffer("");
        setMessageQueued(false);
      }
    }, 15);
  };

  const handleAnswer = (answer) => {
    const current = questions[step];
    setMessages(prev => [...prev, { from: "user", text: answer }]);

    if (answer === "No" && current.weight["No"] === 0) {
      setMessages(prev => [...prev, { from: "bot", text: current.consequence }]);
      setDisqualified(true);
      return;
    }

    if (answer === "Yes" && current.requirements.length > 0) {
      setUploadInputs(current.requirements);
      setUploadedFiles({});
    } else {
      setStep(prev => prev + 1);
    }

    setScore(prev => prev + current.weight[answer]);
  };

  const handleFileChange = (label, file) => {
    setUploadedFiles(prev => ({ ...prev, [label]: file }));
  };

  const handleFilesUploaded = () => {
    if (uploadInputs.every(label => uploadedFiles[label])) {
      setUploadInputs([]);
      setMessages(prev => [...prev, { from: "bot", text: "✅ Documents uploaded. Moving on..." }]);
      setStep(prev => prev + 1);
    } else {
      alert("Please upload all required documents before proceeding.");
    }
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", background: "#fff", padding: "30px", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <h1 style={{ textAlign: "center", marginBottom: "20px" }}>VendorIQ Supplier Chatbot</h1>

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              background: msg.from === "bot" ? "#eef1f5" : "#d1e7dd",
              padding: "12px 18px",
              marginBottom: "10px",
              borderRadius: "16px",
              maxWidth: "100%",
              animation: "fadeIn 0.4s ease",
              whiteSpace: "pre-wrap"
            }}
          >
            {msg.text}
          </div>
        ))}

        {typing && (
          <div style={{ fontStyle: "italic", color: "#888", marginBottom: "10px" }}>{typingBuffer}</div>
        )}

        {!disqualified && !typing && uploadInputs.length === 0 && step < questions.length && (
          <div style={{ display: "flex", gap: "15px", marginTop: "20px" }}>
            <button onClick={() => handleAnswer("Yes")}>Yes</button>
            <button onClick={() => handleAnswer("No")}>No</button>
          </div>
        )}

        {uploadInputs.length > 0 && (
          <div style={{ marginTop: "20px" }}>
            <h4>Please upload the following documents:</h4>
            {uploadInputs.map((label, idx) => (
              <div key={idx} style={{ marginBottom: "10px" }}>
                <label>{label}</label>
                <input type="file" onChange={(e) => handleFileChange(label, e.target.files[0])} />
              </div>
            ))}
            <button onClick={handleFilesUploaded} style={{ marginTop: "10px" }}>Submit Documents</button>
          </div>
        )}

        {step >= questions.length && !disqualified && (
          <div style={{ marginTop: "30px", padding: "20px", background: "#e3f2fd", borderRadius: "8px" }}>
            <h3>✅ Interview Complete</h3>
            <p>Total Score: {score} / 30</p>
            <p>Thank you for your submission. A report will be emailed to you.</p>
          </div>
        )}

        {disqualified && (
          <div style={{ marginTop: "30px", padding: "20px", background: "#ffebee", borderRadius: "8px" }}>
            <h3>❌ Disqualified</h3>
            <p>{questions[step]?.consequence}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

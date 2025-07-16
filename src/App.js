// App.js
import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const supplierId = "SUP123"; // Replace with real supplier ID
  const supplierEmail = "abc@vendor.com"; // Replace with real email

  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [uploadInputs, setUploadInputs] = useState([]);
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [messageQueued, setMessageQueued] = useState(false);

  const questions = [
    {
      text: "Do you have a written OHS Policy?",
      weight: { Yes: 10, No: 5 },
      requirements: [
        "OHS Policy Document",
        "Evidence of communication to employees/subcontractors"
      ],
      consequence: "Consider obtaining ISO 9001 for better compliance."
    },
    {
      text: "Any OHS legal infringements in the last 3 years?",
      weight: { Yes: 10, No: 0 },
      requirements: [
        "Management declaration",
        "Legal assessment procedure",
        "List of OHS legal requirements",
        "Latest legal compliance report"
      ],
      consequence: "Failure to comply, supplier will be disqualified."
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
    } else {
      setScore(prev => prev + current.weight[answer]);
      setStep(prev => prev + 1);
    }
  };

  const handleFilesUploaded = async () => {
    const inputs = document.querySelectorAll("input[type='file']");
    const folderPrefix = `uploads/${supplierId}_${supplierEmail}/question-${step}`;

    for (let i = 0; i < inputs.length; i++) {
      const file = inputs[i].files[0];
      if (!file) continue;

      const path = `${folderPrefix}/${file.name}`;
      const { error } = await supabase.storage
        .from("uploads")
        .upload(path, file, { upsert: true });

      if (error) {
        alert("Upload failed: " + error.message);
        return;
      }
    }

    setScore(prev => prev + questions[step].weight["Yes"]);
    setUploadInputs([]);
    setMessages(prev => [...prev, { from: "bot", text: "✅ Files uploaded. Moving on..." }]);
    setStep(prev => prev + 1);
  };

  return (
    <div className="chat-container">
      <h1>VendorIQ Chatbot</h1>

      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`message ${msg.from === "bot" ? "bot" : "user"}`}
        >
          {msg.text}
        </div>
      ))}

      {typing && <div className="typing">{typingBuffer}</div>}

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
            <div key={idx}>
              <label>{label}</label>
              <input type="file" />
            </div>
          ))}
          <button onClick={handleFilesUploaded}>Submit Documents</button>
        </div>
      )}

      {step >= questions.length && !disqualified && (
        <div className="complete-box">
          <h3>✅ Assessment Complete</h3>
          <p>Score: {score}</p>
        </div>
      )}

      {disqualified && (
        <div className="disqualified-box">
          <h3>❌ Disqualified</h3>
          <p>{questions[step].consequence}</p>
        </div>
      )}
    </div>
  );
}

export default App;

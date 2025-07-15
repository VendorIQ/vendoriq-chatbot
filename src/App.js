import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [score, setScore] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [fileUploads, setFileUploads] = useState({});

  const questions = [
    {
      text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
      yesUploads: [
        "A copy of the OHS Policy",
        "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors)"
      ],
      noFeedback: "Consider obtaining ISO 9001 for better market compliance.",
      yesScore: 10,
      noScore: 5
    },
    {
      text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
      yesUploads: [
        "A declaration from your top management...",
        "A copy of the documented process...",
        "A list of all OHS requirements...",
        "A report of the legal compliance check..."
      ],
      noFeedback: "Failure to comply will result in disqualification.",
      yesScore: 10,
      noScore: 0,
      disqualifyOnNo: true
    },
    {
      text: "Does the company have a process for Incident Reporting and Investigation...",
      yesUploads: [
        "A copy of the documented process",
        "Evidence of how the process has been communicated",
        "Evidence of investigations, root causes, action plans",
        "Records related to work-related fatalities/incidents",
        "Last 3 years statistics on incidents"
      ],
      noFeedback: "Failure to comply will result in disqualification.",
      yesScore: 10,
      noScore: 0,
      disqualifyOnNo: true
    }
  ];

  const typeBotMessage = (text) => {
    let i = 0;
    setTyping(true);
    setTypingBuffer("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setTypingBuffer((prev) => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(interval);
        setTyping(false);
        setMessages((prev) => [...prev, { from: "bot", text }]);
      }
    }, 20);
  };

  const handleAnswer = (answer) => {
    const q = questions[step];
    const newScore = answer === "Yes" ? q.yesScore : q.noScore;
    setScore((prev) => prev + newScore);
    setMessages((prev) => [...prev, { from: "user", text: answer }]);

    if (answer === "No" && q.disqualifyOnNo) {
      setDisqualified(true);
      typeBotMessage(q.noFeedback);
      return;
    }

    if (answer === "Yes" && q.yesUploads?.length) {
      q.yesUploads.forEach((requirement, index) => {
        setMessages((prev) => [
          ...prev,
          { from: "bot", text: `Upload required: ${requirement}`, uploadFor: `${step}-${index}` }
        ]);
      });
    } else if (answer === "No" && q.noFeedback) {
      typeBotMessage(q.noFeedback);
    } else {
      setStep((prev) => prev + 1);
    }
  };

  const handleFileUpload = (e, key) => {
    const files = Array.from(e.target.files);
    setFileUploads((prev) => ({ ...prev, [key]: files }));
    // Move to next step only when all expected uploads are done
    const expectedUploads = questions[step].yesUploads.length;
    const uploadedKeys = Object.keys({ ...fileUploads, [key]: files }).filter((k) => k.startsWith(`${step}-`));
    if (uploadedKeys.length === expectedUploads) {
      setStep((prev) => prev + 1);
    }
  };

  useEffect(() => {
    if (step < questions.length && !disqualified) {
      const currentQ = questions[step].text;
      const alreadyAsked = messages.some((m) => m.from === "bot" && m.text === currentQ);
      if (!typing && !typingBuffer && !alreadyAsked) {
        typeBotMessage(currentQ);
      }
    }
  }, [step, typing, typingBuffer, messages, disqualified]);

  return (
    <div className="App">
      <h1>VendorIQ Supplier Chatbot</h1>
      <div className="chat-window">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.from}`}>
            <span>{msg.text}</span>
            {msg.uploadFor && (
              <input
                type="file"
                multiple
                onChange={(e) => handleFileUpload(e, msg.uploadFor)}
              />
            )}
          </div>
        ))}
        {typing && (
          <div className="message bot">
            <span>{typingBuffer}</span>
          </div>
        )}
      </div>
      {step < questions.length && !disqualified && !typing && !typingBuffer && (
        <div className="button-row">
          <button onClick={() => handleAnswer("Yes")}>Yes</button>
          <button onClick={() => handleAnswer("No")}>No</button>
        </div>
      )}
      {step === questions.length && !disqualified && (
        <div className="summary">
          <h2>✅ Interview Complete</h2>
          <p>Your total score: {score} / 30</p>
        </div>
      )}
      {disqualified && (
        <div className="summary fail">
          <h2>❌ Disqualified</h2>
          <p>You did not meet a mandatory requirement.</p>
        </div>
      )}
    </div>
  );
}

export default App;

import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [score, setScore] = useState(0);
  const [messages, setMessages] = useState([{
    from: "bot",
    text: "Welcome to the VendorIQ Supplier Compliance Interview."
  }]);
  const [typing, setTyping] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [disqualified, setDisqualified] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [messageQueued, setMessageQueued] = useState(false);

  const questions = [
    {
      text:
        "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
      score: { Yes: 10, No: 5 },
      requirements: [
        "A copy of the OHS Policy",
        "Evidence of how the OHS Policy has been communicated to employees (if available subcontractors) (i.e.. Email, training, notice boards)"
      ],
      failIfNo: false,
      failMessage: "Consider obtaining ISO 9001 for better market compliance."
    },
    {
      text:
        "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by, or in discussions with, any regulatory authority in respect of any OHS matters, accident or alleged breach of OHS laws or regulations?",
      score: { Yes: 10, No: 0 },
      requirements: [
        "A declaration from your top management that your company has not committed any infringements...",
        "A copy of the documented process for identification and assessment of legal applicable laws and regulations",
        "A list of all applicable OHS requirements including laws and regulations",
        "A report of legal compliance check within the last 12 months and corrective action plan"
      ],
      failIfNo: true,
      failMessage: "Supplier has failed the assessment due to legal non-compliance."
    },
    {
      text:
        "Does the company have a process for Incident Reporting and Investigation, including a system for recording safety incidents (near misses, injuries, fatalities etc.) that meets local regulations and Ericsson's OHS Requirements at a minimum?",
      score: { Yes: 10, No: 0 },
      requirements: [
        "A copy of the documented process (procedure, instruction)",
        "Evidence of how the process has been communicated (emails, training, notice boards)",
        "Evidence of investigations, root causes and action plans for incidents (no PII)",
        "Records of any fatality/disability incidents or a declaration if none (signed and stamped)",
        "Last 3 years statistics including incidents, near misses, fatalities"
      ],
      failIfNo: true,
      failMessage: "Supplier has failed the assessment due to lacking incident reporting compliance."
    }
  ];

  useEffect(() => {
    const currentQuestionText = questions[step]?.text;
    const hasAsked = messages.some(m => m.from === "bot" && m.text === currentQuestionText);

    if (
      !typing &&
      !typingBuffer &&
      !disqualified &&
      !messageQueued &&
      step < questions.length &&
      !hasAsked
    ) {
      setMessageQueued(true);
      typeBotMessage(currentQuestionText);
    }
  }, [messages, typing, typingBuffer, step, disqualified, messageQueued]);

  const typeBotMessage = (text) => {
    setTyping(true);
    let index = 0;
    const speed = 20;
    const type = () => {
      if (index < text.length) {
        setTypingBuffer((prev) => prev + text.charAt(index));
        index++;
        setTimeout(type, speed);
      } else {
        setMessages((prev) => [...prev, { from: "bot", text }]);
        setTypingBuffer("");
        setTyping(false);
        setMessageQueued(false);
      }
    };
    setTypingBuffer("");
    type();
  };

  const handleAnswer = (answer) => {
    const current = questions[step];
    const newMessages = [...messages, { from: "user", text: answer }];
    const newScore = score + current.score[answer];
    setScore(newScore);
    setAnswers([...answers, answer]);
    setMessages(newMessages);

    if (answer === "No" && current.failIfNo) {
      setDisqualified(true);
      typeBotMessage(current.failMessage);
      return;
    }

    if (answer === "Yes" && current.requirements.length > 0) {
      typeBotMessage("Great! Please upload the required documents below:");
    } else {
      setStep((prev) => prev + 1);
    }
  };

  const handleFileUpload = (event, requirement) => {
    const files = event.target.files;
    setUploadedFiles((prev) => ({
      ...prev,
      [step]: {
        ...(prev[step] || {}),
        [requirement]: files
      }
    }));

    // If all requirements are uploaded, move to next question
    const current = questions[step];
    const currentFiles = {
      ...(uploadedFiles[step] || {}),
      [requirement]: files
    };

    const allUploaded = current.requirements.every(
      (req) => currentFiles[req] && currentFiles[req].length > 0
    );

    if (allUploaded) {
      setTimeout(() => setStep((prev) => prev + 1), 800);
    }
  };

  const renderUploads = () => {
    const reqs = questions[step]?.requirements;
    if (!reqs || answers[step] !== "Yes") return null;

    return (
      <div>
        {reqs.map((req, idx) => (
          <div key={idx} style={{ marginBottom: "10px" }}>
            <p style={{ marginBottom: "4px" }}>{req}</p>
            <input type="file" multiple onChange={(e) => handleFileUpload(e, req)} />
          </div>
        ))}
      </div>
    );
  };

  const renderChat = () => {
    return (
      <div className="chat-window">
        {messages.map((msg, idx) => (
          <div className={`message-row ${msg.from}`} key={idx}>
            <div className="icon">{msg.from === "bot" ? "🤖" : "🧑"}</div>
            <div className="bubble">{msg.text}</div>
          </div>
        ))}
        {typingBuffer && (
          <div className="message-row bot">
            <div className="icon">🤖</div>
            <div className="bubble fade-in">{typingBuffer}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderFinal = () => {
    return (
      <div>
        <h3>✅ Interview Complete</h3>
        <p>Your total score: {score} / 30</p>
        {score < 30 && <p>Suggestions for improvement have been provided above.</p>}
      </div>
    );
  };

  return (
    <div className="container">
      <h1 className="title">VendorIQ Supplier Chatbot</h1>
      {renderChat()}

      {!disqualified && step < questions.length && (
        <div className="controls">
          <button onClick={() => handleAnswer("Yes")}>Yes</button>
          <button onClick={() => handleAnswer("No")}>No</button>
        </div>
      )}

      {!disqualified && renderUploads()}
      {step >= questions.length && !disqualified && renderFinal()}
    </div>
  );
}

export default App;
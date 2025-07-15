import React, { useState, useEffect } from "react";
import "./App.css";

const botAvatar = "https://cdn-icons-png.flaticon.com/512/4712/4712109.png";

const questions = [
  {
    text: "Does your Company have a written OHS Policy that has been approved by your top management and has been communicated throughout the organization and to your subcontractors (when applicable)?",
    yesScore: 10,
    noScore: 5,
    failIfNo: false,
    yesUploads: [
      "A copy of the OHS Policy",
      "Evidence of how the OHS Policy has been communicated to employees/subcontractors"
    ],
    noFeedback: "Consider obtaining ISO 9001 for better market compliance."
  },
  {
    text: "Has your Company committed any infringements to the laws or regulations concerning Occupational Health & Safety (OHS) matters in the last three (03) years or is under any current investigation by any regulatory authority?",
    yesScore: 10,
    noScore: 0,
    failIfNo: true,
    yesUploads: [
      "A declaration from your top management signed off on company letterhead",
      "A documented process for identification and assessment of legal requirements",
      "A list of all OHS requirements including laws and regulations",
      "A recent legal compliance check report with corrective actions"
    ],
    noFeedback: "Failure to comply will result in automatic disqualification."
  },
  {
    text: "Does the company have a process for Incident Reporting and Investigation that meets local regulations and Ericsson's OHS Requirements?",
    yesScore: 10,
    noScore: 0,
    failIfNo: true,
    yesUploads: [
      "A documented incident reporting process",
      "Evidence of communication to employees/subcontractors",
      "Incident investigation reports with root causes and actions",
      "Records on work-related fatalities or serious incidents (3 years)",
      "Statistics from the last 3 years on incidents, near misses, illnesses"
    ],
    noFeedback: "Failure to comply will result in automatic disqualification."
  }
];

function App() {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
  ]);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const [expectingUpload, setExpectingUpload] = useState(false);
  const [typingBuffer, setTypingBuffer] = useState("");
  const [typing, setTyping] = useState(false);
  const [disqualified, setDisqualified] = useState(false);
  const [messageQueued, setMessageQueued] = useState(false);

  const typeBotMessage = (text, callback) => {
    let i = 0;
    setTypingBuffer("");
    setTyping(true);
    setMessageQueued(true);
    const interval = setInterval(() => {
      setTypingBuffer((prev) => prev + text.charAt(i));
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        setTyping(false);
        setMessages((prev) => [...prev, { from: "bot", text }]);
        setTypingBuffer("");
        setMessageQueued(false);
        if (callback) callback();
      }
    }, 20);
  };

  const handleAnswer = (answer) => {
    const q = questions[step];
    const isYes = answer === "Yes";

    setMessages((prev) => [...prev, { from: "user", text: answer }]);
    setScore((prev) => prev + (isYes ? q.yesScore : q.noScore));

    if (!isYes && q.failIfNo) {
      setDisqualified(true);
      typeBotMessage(q.noFeedback);
      return;
    }

    if (isYes && q.yesUploads.length > 0) {
      setExpectingUpload(true);
      typeBotMessage("Great. Please upload the following:");
      q.yesUploads.forEach((item, idx) =>
        setTimeout(() => setMessages((prev) => [...prev, { from: "bot", text: `- ${item}` }]), 600 * (idx + 1))
      );
    } else {
      typeBotMessage(isYes ? "Thank you. Moving on..." : q.noFeedback, () => {
        setTimeout(() => setStep((s) => s + 1), 800);
      });
    }
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files).map((f) => f.name).join(", ");
    setMessages((prev) => [...prev, { from: "user", text: `📎 Uploaded: ${files}` }]);
    setExpectingUpload(false);
    typeBotMessage("Thanks! Let's move on.", () => {
      setTimeout(() => setStep((s) => s + 1), 800);
    });
  };

  useEffect(() => {
    const currentQuestionText = questions[step]?.text;
    const hasAlreadyAsked = messages.some((msg) => msg.from === "bot" && msg.text === currentQuestionText);

    if (!typing && !typingBuffer && !disqualified && !messageQueued && step < questions.length && !hasAlreadyAsked) {
      typeBotMessage(currentQuestionText);
    }
  }, [step, typing, typingBuffer, disqualified, messageQueued, messages]);

  return (
    <div className="chat-container">
      <h2 className="chat-heading">VendorIQ Supplier Chatbot</h2>
      <div className="chat-box">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble-wrapper ${msg.from === "user" ? "right" : "left"}`}>
            {msg.from === "bot" && <img src={botAvatar} alt="bot" className="bot-avatar" />}
            <div className={`chat-bubble ${msg.from}`}>{msg.text}</div>
          </div>
        ))}

        {typingBuffer && (
          <div className="chat-bubble-wrapper left">
            <img src={botAvatar} alt="bot" className="bot-avatar" />
            <div className="chat-bubble bot typing">{typingBuffer}<span className="cursor">|</span></div>
          </div>
        )}

        {!typing && !expectingUpload && !disqualified && step < questions.length && (
          <div className="button-group">
            <button onClick={() => handleAnswer("Yes")}>Yes</button>
            <button onClick={() => handleAnswer("No")}>No</button>
          </div>
        )}

        {!typing && expectingUpload && (
          <div className="upload-input">
            <input type="file" multiple onChange={handleFileUpload} />
          </div>
        )}

        {!typing && step >= questions.length && !disqualified && (
          <div className="completion-message">
            ✅ Interview Complete — Total Score: <strong>{score}/30</strong>
          </div>
        )}

        {disqualified && (
          <div className="completion-message" style={{ color: "red" }}>
            ❌ You did not meet the required compliance threshold. Assessment failed.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

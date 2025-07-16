import React, { useState, useEffect, useRef } from "react";

const questions = [
  {
    text: "Do you have a written OHS Policy?",
    requirements: [
      "OHS Policy Document",
      "Evidence of communication to employees/subcontractors"
    ],
  },
  {
    text: "Any OHS legal infringements in the last 3 years?",
    requirements: [
      "Management declaration",
      "Legal assessment procedure",
      "List of OHS legal requirements",
      "Latest legal compliance report"
    ],
  },
  {
    text: "Do you have an Incident Reporting and Investigation process?",
    requirements: [
      "Incident process document",
      "Communication evidence",
      "Investigation reports",
      "Declaration or reports on work-related fatality/absence",
      "Last 3 years incident statistics"
    ],
  },
];

export default function App() {
  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Compliance Interview." }
  ]);
  const [typing, setTyping] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [step, setStep] = useState(0);
  const [showUploads, setShowUploads] = useState(false);
  const typingTimeout = useRef();

  // Typing animation effect for bot questions
  useEffect(() => {
    if (step < questions.length && !typing && !showUploads) {
      const question = questions[step].text;
      setTyping(true);
      setTypingText("");
      let i = 0;
      typingTimeout.current = setInterval(() => {
        setTypingText(question.slice(0, i + 1));
        i++;
        if (i === question.length) {
          clearInterval(typingTimeout.current);
          setTimeout(() => {
            setMessages(prev => [
              ...prev,
              { from: "bot", text: question }
            ]);
            setTyping(false);
            setTypingText("");
          }, 400);
        }
      }, 18);
    }
    return () => clearInterval(typingTimeout.current);
  }, [step, typing, showUploads]);

  const handleAnswer = answer => {
    setMessages(prev => [
      ...prev,
      { from: "user", text: answer }
    ]);
    if (answer === "Yes" && questions[step].requirements.length > 0) {
      setShowUploads(true);
    } else {
      setShowUploads(false);
      setStep(prev => prev + 1);
    }
  };

  const handleSubmitDocuments = () => {
    setMessages(prev => [
      ...prev,
      { from: "bot", text: "Files uploaded. Moving on..." }
    ]);
    setShowUploads(false);
    setStep(prev => prev + 1);
  };

  const handleSkipQuestion = () => {
    setMessages(prev => [
      ...prev,
      { from: "user", text: "Skip" }
    ]);
    setShowUploads(false);
    setStep(prev => prev + 1);
  };

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>VendorIQ Chatbot</h1>
      <div>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              margin: "10px 0",
              padding: "12px 20px",
              background: msg.from === "bot" ? "#e5eeff" : "#d1ffe5",
              borderRadius: 20,
              textAlign: msg.from === "bot" ? "left" : "right",
              maxWidth: "90%",
              marginLeft: msg.from === "bot" ? 0 : "auto",
              boxShadow: "0 1px 4px #0001"
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
            {typingText}
            <span className="typing-cursor">|</span>
          </div>
        )}

        {/* Show answer buttons only when not typing, not uploading, and still in questions */}
        {!typing && !showUploads && step < questions.length && (
          <div style={{ marginTop: 24 }}>
            <button onClick={() => handleAnswer("Yes")} style={{ marginRight: 16 }}>Yes</button>
            <button onClick={() => handleAnswer("No")}>No</button>
          </div>
        )}

        {/* Document upload with dashed line separators and skip button */}
        {showUploads && (
          <div style={{
            background: "#fff",
            border: "1px solid #dde5fa",
            borderRadius: 16,
            padding: 18,
            margin: "16px 0",
            boxShadow: "0 1px 6px #0001"
          }}>
            <h4>Upload required documents:</h4>
            {questions[step].requirements.map((req, idx) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <label>{req}</label>
                <input type="file" style={{ display: "block", marginTop: 5 }} />
                {/* Dashed line, but not after last item */}
                {idx < questions[step].requirements.length - 1 && (
                  <div style={{
                    borderBottom: "1.5px dashed #7ba5ff",
                    margin: "16px 0"
                  }} />
                )}
              </div>
            ))}
            <button onClick={handleSubmitDocuments} style={{ marginRight: 12 }}>Submit Documents</button>
            <button onClick={handleSkipQuestion} style={{
              background: "#ffe5e5", border: "1px solid #ffbaba"
            }}>Skip Question</button>
          </div>
        )}

        {/* Assessment complete */}
        {!typing && !showUploads && step === questions.length && (
          <div
            style={{
              margin: "40px 0 0",
              padding: "16px",
              background: "#e5ffe5",
              borderRadius: 20,
              fontWeight: "bold",
              textAlign: "center"
            }}
          >
            Assessment Complete!
          </div>
        )}
      </div>
    </div>
  );
}

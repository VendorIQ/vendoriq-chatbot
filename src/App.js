import React, { useState, useEffect } from "react";

const botAvatar = "https://cdn-icons-png.flaticon.com/512/4712/4712109.png";

function App() {
  const questions = [
    "Do you have ISO 9001 certification?",
    "Do you perform regular internal audits?",
    "Do you maintain a supplier code of conduct?"
  ];

  const [messages, setMessages] = useState([
    { from: "bot", text: "Welcome to the VendorIQ Supplier Interview!" }
  ]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);

  const handleAnswer = (answer) => {
    const currentQuestion = questions[step];

    // Show user response
    setMessages((prev) => [...prev, { from: "user", text: answer }]);

    // Simulate bot typing
    setTyping(true);

    setTimeout(() => {
      const botResponse =
        answer === "Yes"
          ? "Great! Please upload your supporting documents."
          : "We recommend implementing this for better compliance.";

      setMessages((prev) => [
        ...prev,
        { from: "bot", text: botResponse }
      ]);
      setTyping(false);

      if (answer === "No") {
        setStep((s) => s + 1);
      }
    }, 700);
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files).map((f) => f.name);
    setMessages((prev) => [
      ...prev,
      { from: "user", text: `📎 Uploaded: ${files.join(", ")}` },
      { from: "bot", text: "Thanks! Moving to the next question." }
    ]);
    setStep((s) => s + 1);
  };

  useEffect(() => {
    if (step < questions.length && messages[messages.length - 1]?.from === "bot" && !typing) {
      const nextQuestion = questions[step];
      setMessages((prev) => [...prev, { from: "bot", text: nextQuestion }]);
    }
  }, [step, typing]);

  return (
    <div style={{ fontFamily: "Arial", maxWidth: "600px", margin: "30px auto", padding: "20px" }}>
      <h2 style={{ textAlign: "center" }}>VendorIQ Supplier Chatbot</h2>
      <div style={{ background: "#f2f2f2", borderRadius: "10px", padding: "20px", minHeight: "400px" }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: msg.from === "user" ? "flex-end" : "flex-start",
              marginBottom: "10px"
            }}
          >
            {msg.from === "bot" && (
              <img
                src={botAvatar}
                alt="bot"
                style={{ width: "30px", height: "30px", borderRadius: "50%", marginRight: "10px" }}
              />
            )}
            <div
              style={{
                background: msg.from === "user" ? "#007bff" : "#fff",
                color: msg.from === "user" ? "#fff" : "#000",
                padding: "10px 15px",
                borderRadius: "15px",
                maxWidth: "75%"
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {typing && (
          <div style={{ color: "#aaa", marginTop: "10px" }}>VendorIQ is typing...</div>
        )}

        {!typing && step < questions.length && (
          <div style={{ marginTop: "20px" }}>
            <button onClick={() => handleAnswer("Yes")} style={{ marginRight: "10px" }}>Yes</button>
            <button onClick={() => handleAnswer("No")}>No</button>
          </div>
        )}

        {!typing && messages[messages.length - 1]?.text?.includes("upload") && (
          <div style={{ marginTop: "10px" }}>
            <input type="file" multiple onChange={handleFileUpload} />
          </div>
        )}

        {step >= questions.length && !typing && (
          <div style={{ marginTop: "20px", fontWeight: "bold", color: "green" }}>
            ✅ Interview Complete — Your responses have been saved.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

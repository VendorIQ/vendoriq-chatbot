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
  const [typingBuffer, setTypingBuffer] = useState("");

  // Utility: Simulate bot typing char-by-char
  const typeBotMessage = (fullMessage) => {
    let index = 0;
    setTypingBuffer("");
    setTyping(true);

    const interval = setInterval(() => {
      setTypingBuffer((prev) => prev + fullMessage.charAt(index));
      index++;

      if (index >= fullMessage.length) {
        clearInterval(interval);
        setTyping(false);
        setMessages((prev) => [...prev, { from: "bot", text: fullMessage }]);
        setTypingBuffer("");
      }
    }, 30);
  };

  const handleAnswer = (answer) => {
    const currentQuestion = questions[step];
    setMessages((prev) => [...prev, { from: "user", text: answer }]);

    const botResponse =
      answer === "Yes"
        ? "Great! Please upload your supporting documents."
        : "We recommend implementing this for better compliance.";

    setTimeout(() => {
      typeBotMessage(botResponse);
      if (answer === "No") {
        setTimeout(() => setStep((s) => s + 1), botResponse.length * 30 + 400);
      }
    }, 600);
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files).map((f) => f.name);
    setMessages((prev) => [
      ...prev,
      { from: "user", text: `📎 Uploaded: ${files.join(", ")}` }
    ]);
    typeBotMessage("Thanks! Moving to the next question.");
    setTimeout(() => setStep((s) => s + 1), 1500);
  };

  useEffect(() => {
    if (
      step < questions.length &&
      !typing &&
      typingBuffer === "" &&
      messages[messages.length - 1]?.from !== "bot"
    ) {
      setTimeout(() => {
        typeBotMessage(questions[step]);
      }, 600);
    }
  }, [step, typing, messages, typingBuffer]);

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

        {typingBuffer && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}>
            <img
              src={botAvatar}
              alt="bot"
              style={{ width: "30px", height: "30px", borderRadius: "50%", marginRight: "10px" }}
            />
            <div
              style={{
                background: "#fff",
                padding: "10px 15px",
                borderRadius: "15px",
                fontFamily: "monospace",
                fontSize: "15px"
              }}
            >
              {typingBuffer}
              <span className="blinking-cursor">|</span>
            </div>
          </div>
        )}

        {!typing && step < questions.length && (
          <div style={{ marginTop: "20px" }}>
            <button onClick={() => handleAnswer("Yes")} style={{ marginRight: "10px" }}>Yes</button>
            <button onClick={() => handleAnswer("No")}>No</button>
          </div>
        )}

        {!typing &&
          messages[messages.length - 1]?.text?.includes("upload") && (
            <div style={{ marginTop: "10px" }}>
              <input type="file" multiple onChange={handleFileUpload} />
            </div>
          )}

        {step >= questions.length && !typing && !typingBuffer && (
          <div style={{ marginTop: "20px", fontWeight: "bold", color: "green" }}>
            ✅ Interview Complete — Your responses have been saved.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

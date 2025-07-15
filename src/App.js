import React, { useState, useEffect } from "react";
import "./App.css"; // Import the animation styles

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
  const [expectingUpload, setExpectingUpload] = useState(false);

  const typeBotMessage = (fullMessage, callback) => {
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

        if (callback) callback();
      }
    }, 30);
  };

  const handleAnswer = (answer) => {
    setMessages((prev) => [...prev, { from: "user", text: answer }]);

    const botResponse =
      answer === "Yes"
        ? "Great! Please upload your supporting documents."
        : "We recommend implementing this for better compliance.";

    setExpectingUpload(answer === "Yes");

    setTimeout(() => {
      typeBotMessage(botResponse, () => {
        if (answer === "No") {
          setTimeout(() => setStep((s) => s + 1), 600);
        }
      });
    }, 600);
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files).map((f) => f.name);
    setMessages((prev) => [
      ...prev,
      { from: "user", text: `📎 Uploaded: ${files.join(", ")}` }
    ]);
    setExpectingUpload(false);
    typeBotMessage("Thanks! Moving to the next question.", () => {
      setTimeout(() => setStep((s) => s + 1), 500);
    });
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
    <div className="chat-container">
      <h2 className="chat-heading">VendorIQ Supplier Chatbot</h2>
      <div className="chat-box">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-bubble-wrapper ${msg.from === "user" ? "right" : "left"}`}
          >
            {msg.from === "bot" && (
              <img src={botAvatar} alt="bot" className="bot-avatar" />
            )}
            <div className={`chat-bubble ${msg.from}`}>
              {msg.text}
            </div>
          </div>
        ))}

        {typingBuffer && (
          <div className="chat-bubble-wrapper left">
            <img src={botAvatar} alt="bot" className="bot-avatar" />
            <div className="chat-bubble bot typing">{typingBuffer}<span className="cursor">|</span></div>
          </div>
        )}

        {!typing && step < questions.length && !expectingUpload && (
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

        {step >= questions.length && !typing && !typingBuffer && (
          <div className="completion-message">
            ✅ Interview Complete — Your responses have been saved.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

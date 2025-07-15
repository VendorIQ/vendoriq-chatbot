import React, { useState } from "react";

function App() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [fileUploads, setFileUploads] = useState({});
  const [feedback, setFeedback] = useState("");

  const questions = [
    "Do you have ISO 9001 certification?",
    "Do you perform regular internal audits?",
    "Do you maintain a supplier code of conduct?"
  ];

  const handleAnswer = (answer) => {
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setFeedback("");

    if (answer === "Yes") {
      // Show upload prompt
    } else {
      setStep(step + 1);
    }

    if (answer === "No") {
      setFeedback("We recommend implementing this for better compliance.");
    } else {
      setFeedback("Great! Please upload supporting documents.");
    }
  };

  const handleFileUpload = (event) => {
    const files = event.target.files;
    setFileUploads({ ...fileUploads, [step]: files });
    setStep(step + 1);
    setFeedback("Files received. Moving to the next question.");
  };

  const renderQuestion = () => {
    if (step >= questions.length) {
      return (
        <div>
          <h2>✅ Interview Complete</h2>
          <p>Your answers have been recorded. A final score will be calculated.</p>
        </div>
      );
    }

    return (
      <div>
        <h2>{questions[step]}</h2>
        <button onClick={() => handleAnswer("Yes")}>Yes</button>
        <button onClick={() => handleAnswer("No")}>No</button>
        {answers[step] === "Yes" && (
          <div>
            <p>Upload your documents (PDF or DOCX):</p>
            <input type="file" multiple onChange={handleFileUpload} />
          </div>
        )}
        {feedback && <p style={{ color: "#555", marginTop: "10px" }}>{feedback}</p>}
      </div>
    );
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ textAlign: "center" }}>VendorIQ Supplier Chatbot</h1>
      <div style={{ maxWidth: "600px", margin: "40px auto", background: "#f8f8f8", padding: "20px", borderRadius: "8px" }}>
        {renderQuestion()}
      </div>
    </div>
  );
}

export default App;

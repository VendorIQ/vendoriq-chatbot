import React from "react";

export function ReviewCard({ answers, questions, onRevise, onContinue }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      margin: "32px auto 0 auto",
      padding: "30px 22px",
      maxWidth: 550,
      boxShadow: "0 2px 12px #0001",
      color: "#223",
      fontSize: "1.12rem",
      textAlign: "left"
    }}>
      <h3 style={{ color: "#0085CA", marginTop: 0 }}>
        <span role="img" aria-label="review">🔎</span> Review Your Answers
      </h3>
      <ol style={{ paddingLeft: 16 }}>
        {questions.map((q, idx) => (
          <li key={q.number} style={{
            marginBottom: 18,
            borderBottom: "1px dashed #ccd",
            paddingBottom: 12
          }}>
            <div style={{ fontWeight: 600 }}>{q.text}</div>
            <div>
              <strong>Answer:</strong> {answers[idx] || <span style={{ color: "#a00" }}>No answer</span>}
            </div>
            <button
              onClick={() => onRevise(idx)}
              style={{
                marginTop: 6,
                marginRight: 8,
                background: "#f8c100",
                color: "#333",
                border: "none",
                borderRadius: 7,
                padding: "5px 15px",
                fontSize: "0.95rem",
                cursor: "pointer"
              }}
            >Revise</button>
          </li>
        ))}
      </ol>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button
          onClick={onContinue}
          style={{
            background: "#0085CA",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "9px 26px",
            fontSize: "1.08rem",
            cursor: "pointer"
          }}
        >
          Submit & See Final Summary
        </button>
      </div>
    </div>
  );
}

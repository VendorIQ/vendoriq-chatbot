// src/AuditorReviewPanel.js
import React, { useEffect, useState } from "react";

export default function AuditorReviewPanel() {
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMap, setFeedbackMap] = useState({});

  useEffect(() => {
  setLoading(true);
  fetch("/api/all-answers")
    .then(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error("❌ /api/all-answers did not return JSON:", text);
        setAnswers([]); // Show empty, or optionally show an error state
        setLoading(false);
        alert("Error: Backend did not return JSON for all answers. Check console.");
        return null;
      }
    })
    .then((data) => {
      if (data) setAnswers(data);
      setLoading(false);
    })
    .catch((err) => {
      console.error("❌ Network or fetch error:", err);
      setAnswers([]);
      setLoading(false);
      alert("Network error when loading auditor answers.");
    });
}, []);

  const handleScoreSubmit = async (email, questionNumber) => {
    const fb = feedbackMap[`${email}-${questionNumber}`];
    if (!fb || !fb.newScore || !fb.comment) return alert("Missing input");
    setLoading(true);
    const res = await fetch("/api/manual-score", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email,
    questionNumber,
    newScore: fb.newScore,
    comment: fb.comment,
    auditor: "auditor@vendor.com",
  }),
});
const text = await res.text();
console.log("📦 Raw response from /api/manual-score:", text);
let data;
try {
  data = JSON.parse(text);
} catch (e) {
  console.error("❌ Failed to parse JSON:", e);
  alert("Server did not return JSON. Check console for details.");
  return;
}

setLoading(false);
if (data.success) {
  alert("✅ Saved successfully.");
} else {
  alert("❌ Failed to save: " + (data.error || "Unknown error"));
}

  };
if (loading) return <div>Loading auditor answers...</div>;

  return (
    <div style={{ background: "#fff", padding: 20 }}>
      <h3>🧾 Auditor Review Panel</h3>
      {answers.map((a, idx) => (
        <div
          key={idx}
          style={{ borderBottom: "1px solid #ccc", padding: "10px 0" }}
        >
          <div>
            <strong>{a.email}</strong> - Q{a.question_number}: {a.answer}
          </div>
          <div>
            <em>Feedback:</em>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.9em" }}>{
              a.upload_feedback || "(no feedback)"
            }</pre>
          </div>
          <textarea
            rows={2}
            placeholder="Manual score override..."
            onChange={(e) =>
              setFeedbackMap((prev) => ({
                ...prev,
                [`${a.email}-${a.question_number}`]: {
                  ...prev[`${a.email}-${a.question_number}`],
                  newScore: e.target.value,
                },
              }))
            }
            style={{ width: "100%", marginTop: 5 }}
          />
          <textarea
            rows={2}
            placeholder="Comment for record..."
            onChange={(e) =>
              setFeedbackMap((prev) => ({
                ...prev,
                [`${a.email}-${a.question_number}`]: {
                  ...prev[`${a.email}-${a.question_number}`],
                  comment: e.target.value,
                },
              }))
            }
            style={{ width: "100%", marginTop: 5 }}
          />
          <button
            onClick={() => handleScoreSubmit(a.email, a.question_number)}
            disabled={loading}
            style={{ marginTop: 5 }}
          >
            ✅ Save Audit Score
          </button>
        </div>
      ))}
    </div>
  );
}

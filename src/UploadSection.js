// --- UploadSection Updated with AI Justification Flow ---
import React, { useState } from "react";

export function UploadSection({
  question, requirementIdx, setRequirementIdx, onDone,
  email, messages, setMessages, waitingGemini, setWaitingGemini,
  typing, setTyping, setTypingText,
  pendingFile, setPendingFile,
  showMissingReasonInput, setShowMissingReasonInput,
  missingReason, setMissingReason,
  setShowAuditorUpload // <--- new
}) {
  const requirement = question.requirements[requirementIdx];
  const [showSkipReasonInput, setShowSkipReasonInput] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [aiReview, setAiReview] = useState(null);
  const [showAiDecisionButtons, setShowAiDecisionButtons] = useState(false);

  return (
    <div>
      {/* Loader when Gemini is checking */}
      {waitingGemini ? (
        <div style={{ margin: "18px 0" }}>⏳ Checking your document...</div>
      ) : (
        !pendingFile && !showMissingReasonInput && (
          <div style={{ display: "flex", alignItems: "center", margin: "12px 0", maxWidth: "70%" }}>
            <div style={{ background: "#0085CA", color: "#fff", borderRadius: "16px", padding: "10px 18px", maxWidth: "420px" }}>
              {`Please upload: ${requirement}`}
            </div>
          </div>
        )
      )}

      {/* File input */}
      {!waitingGemini && !pendingFile && !showMissingReasonInput && !aiReview && (
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
          onChange={e => {
            const file = e.target.files[0];
            if (file) setPendingFile(file);
          }}
        />
      )}

      {/* Missing Reason Text Input Flow */}
      {showMissingReasonInput && !aiReview && (
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            placeholder="Please explain why you don’t have this document…"
            value={missingReason}
            onChange={e => setMissingReason(e.target.value)}
            style={{ width: "60%", padding: 6 }}
          />
          <button
            onClick={async () => {
              setMessages(prev => [...prev, { from: "user", text: `Reason: ${missingReason}` }]);
              setTyping(true);
              setTypingText("Evaluating your reason...");
              try {
                const res = await fetch("http://localhost:8080/api/check-missing-reason", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ reason: missingReason, requirement, email, questionNumber: question.number })
                });
                const data = await res.json();
                setTyping(false);
                setTypingText("");
                setAiReview(data.feedback);
                setShowAiDecisionButtons(true);
              } catch {
                setTyping(false);
                setTypingText("");
                setMessages(prev => [...prev, { from: "bot", text: "Sorry, something went wrong with the AI review." }]);
              }
            }}
            disabled={!missingReason.trim()}
            style={{ marginLeft: 10 }}
          >
            Submit Reason
          </button>
        </div>
      )}

      {/* AI Review Message + Options */}
      {aiReview && (
        <div style={{ marginTop: 16 }}>
          <div style={{ background: "#0085CA", color: "#fff", padding: "12px", borderRadius: 10 }}>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{aiReview}</pre>
          </div>
          {showAiDecisionButtons && (
            <div style={{ marginTop: 10 }}>
              <button
                style={{ marginRight: 12 }}
                onClick={() => {
                  setMessages(prev => [...prev, { from: "bot", text: "✅ You have accepted the AI score." }]);
                  setShowMissingReasonInput(false);
                  setMissingReason("");
                  setAiReview(null);
                  setShowAiDecisionButtons(false);
                  if (requirementIdx + 1 < question.requirements.length) {
                    setTimeout(() => setRequirementIdx(requirementIdx + 1), 800);
                  } else {
                    setTimeout(onDone, 1000);
                  }
                }}
              >✅ Accept AI Score</button>
              <button
                onClick={() => {
                  setMessages(prev => [...prev, { from: "bot", text: "🧑‍⚖️ An auditor will now review your justification." }]);
                  setShowMissingReasonInput(false);
                  setMissingReason("");
                  setAiReview(null);
                  setShowAiDecisionButtons(false);
                  setShowAuditorUpload(true); // NEW: trigger auditor upload section
                }}
              >🧑‍⚖️ Ask Auditor</button>
            </div>
          )}
        </div>
      )}

      {/* Skip / No Document Buttons */}
      {!waitingGemini && !pendingFile && !showMissingReasonInput && !aiReview && (
        <>
          <button onClick={() => setShowSkipReasonInput(true)}>Skip requirement (add comment)</button>
          <button onClick={() => {
            setMessages(prev => [...prev, { from: "user", text: "I do not have this document." }]);
            setTyping(true);
            setTypingText("Could you tell me why you don’t have it?");
            setTimeout(() => {
              setTyping(false);
              setTypingText("");
              setShowMissingReasonInput(true);
            }, 1200);
          }}>
            I do not have this document
          </button>
        </>
      )}
    </div>
  );
}

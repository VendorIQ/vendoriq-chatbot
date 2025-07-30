// --- AuditorUploadSection.js ---
import React, { useState } from "react";

export function AuditorUploadSection({ email, question, onComplete }) {
  const [auditorFile, setAuditorFile] = useState(null);
  const [status, setStatus] = useState("idle");

  const handleUpload = async () => {
    if (!auditorFile) return;
    setStatus("uploading");
    try {
      const formData = new FormData();
      formData.append("file", auditorFile);
      formData.append("email", email);
      formData.append("questionNumber", question.number);
      formData.append("source", "auditor");

      const res = await fetch("http://localhost:8080/api/upload-auditor-review", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        setStatus("done");
        onComplete();
      } else {
        setStatus("error");
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h4>📤 Auditor Review Upload</h4>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
        onChange={e => setAuditorFile(e.target.files[0])}
      />
      <button
        onClick={handleUpload}
        disabled={!auditorFile || status === "uploading"}
        style={{ marginLeft: 10 }}
      >
        Submit to System
      </button>
      {status === "uploading" && <p>Uploading file...</p>}
      {status === "done" && <p style={{ color: "green" }}>✅ File sent for auditor review.</p>}
      {status === "error" && <p style={{ color: "red" }}>❌ Upload failed. Try again.</p>}
    </div>
  );
}

import React, { useEffect } from "react";

function App() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/rasa-webchat@1.0.1/lib/index.min.js";
    script.async = true;
    script.onload = () => {
      window.WebChat.default(
        {
          initPayload: "/get_started",
          customData: { language: "en" },
          socketUrl: "https://your-backend.com", // We'll fix this later
          title: "VendorIQ Assistant",
          subtitle: "Answer 25 supplier questions",
          profileAvatar: "https://cdn-icons-png.flaticon.com/512/4712/4712109.png",
          inputTextFieldHint: "Type your answer...",
          showFullScreenButton: true,
          params: {
            storage: "local"
          }
        },
        null
      );
    };
    document.body.appendChild(script);
  }, []);

  return (
    <div>
      <h1 style={{ textAlign: "center", marginTop: "40px" }}>VendorIQ Chatbot UI</h1>
      <p style={{ textAlign: "center", color: "#555" }}>
        Please wait for the chat to load...
      </p>
    </div>
  );
}

export default App;

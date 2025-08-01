// AuthPage.js
import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

export default function AuthPage({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");

  const handleAuth = async () => {
    setError("");
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    const { data, error } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
    } else if (data.user) {
      // --- Ensure profile row exists ---
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", data.user.id)
        .single();

      if (!existingProfile) {
        // Set default role (change as needed)
        const { error: insertErr } = await supabase.from("profiles").insert([
          {
            id: data.user.id,
            email: data.user.email,
            company_name: companyName,
            role: "user",
          },
        ]);
        if (insertErr) {
          console.error("Failed to insert profile:", insertErr);
        }
      }
      onAuth(data.user, companyName);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", textAlign: "center" }}>
      <h2>{isLogin ? "Login" : "Sign Up"}</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
      />
      <input
        type="text"
        placeholder="Company Name"
        value={companyName}
        onChange={e => setCompanyName(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
        required
      />
      <button onClick={handleAuth} style={{ padding: 10, width: "100%" }}>
        {isLogin ? "Login" : "Sign Up"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <p style={{ marginTop: 12 }}>
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          onClick={() => setIsLogin(!isLogin)}
          style={{ border: "none", background: "none", color: "#0077cc", cursor: "pointer" }}
        >
          {isLogin ? "Sign Up" : "Login"}
        </button>
      </p>
    </div>
  );
}

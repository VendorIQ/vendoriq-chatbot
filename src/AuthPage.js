// src/AuthPage.jsx
import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Optional admin allowlist (emails). Example:
// REACT_APP_ADMIN_EMAILS=admin1@yourco.com,admin2@yourco.com
const ADMIN_EMAILS = (process.env.REACT_APP_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState(""); // used only on sign-up
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ensureProfile(user, suppliedCompany) {
    // Read existing profile
    const { data: existing, error: selErr } = await supabase
      .from("profiles")
      .select("id, company_name, role")
      .eq("id", user.id)
      .single();

    // Decide role via allowlist only (no admin code)
    const emailLower = (user.email || "").toLowerCase();
    const desiredRole = ADMIN_EMAILS.includes(emailLower) ? "admin" : "user";

    // Insert if missing
    if (!existing || selErr) {
      const { error: insErr } = await supabase.from("profiles").insert([
        {
          id: user.id,
          email: user.email,
          company_name: suppliedCompany || null,
          role: desiredRole,
        },
      ]);
      if (insErr) throw insErr;
      return { role: desiredRole, company_name: suppliedCompany || "" };
    }

    // Update if needed (fill company_name once, and/or upgrade to admin)
    const updates = {};
    if (!existing.company_name && suppliedCompany) {
      updates.company_name = suppliedCompany;
    }
    if (existing.role !== desiredRole && desiredRole === "admin") {
      updates.role = "admin";
    }

    if (Object.keys(updates).length) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (updErr) throw updErr;
      return {
        role: updates.role || existing.role || "user",
        company_name: updates.company_name || existing.company_name || "",
      };
    }

    return {
      role: existing.role || "user",
      company_name: existing.company_name || "",
    };
  }

  const handleAuth = async () => {
    setError("");
    setLoading(true);

    try {
      // Sign in / Sign up
      const { data, error: authErr } = isLogin
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
          });

      if (authErr) throw authErr;

      const user = data?.user;
      if (!user) {
        // If email confirmation is on, user may be null until confirmed
        setError("Check your email to confirm your account, then sign in.");
        return;
      }

      // Company name is required only on sign up
      const suppliedCompany = !isLogin ? (companyName || "").trim() : undefined;
      if (!isLogin && !suppliedCompany) {
        throw new Error("Company name is required for sign up.");
      }

      // Ensure profile row exists/updated
      const profile = await ensureProfile(user, suppliedCompany);

      // Optional: notify backend of supplier name (non-blocking)
      const finalCompanyName = profile.company_name || suppliedCompany || "";
      if (finalCompanyName) {
        try {
          await fetch(
            `${
              process.env.REACT_APP_BACKEND_URL ||
              "https://vendoriq-backend.onrender.com"
            }/api/set-supplier-name`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: user.email,
                supplierName: finalCompanyName,
              }),
            }
          );
        } catch (e) {
          console.warn("set-supplier-name failed:", e?.message || e);
        }
      }

      // Hand off to App (App expects (userObj, company))
      onAuth(user, finalCompanyName);
    } catch (e) {
      setError(e.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", textAlign: "center" }}>
      <h2 style={{ marginBottom: 16 }}>{isLogin ? "Login" : "Sign Up"}</h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
        autoComplete="email"
        required
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
        autoComplete={isLogin ? "current-password" : "new-password"}
        required
      />

      {/* Company Name only shown on Sign Up */}
      {!isLogin && (
        <input
          type="text"
          placeholder="Company Name (required)"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          style={{ padding: 8, width: "100%", marginBottom: 10 }}
          required
        />
      )}

      <button
        onClick={handleAuth}
        style={{ padding: 10, width: "100%" }}
        disabled={loading}
      >
        {loading ? "Please wait…" : isLogin ? "Login" : "Sign Up"}
      </button>

      {error && <p style={{ color: "tomato", marginTop: 10 }}>{error}</p>}

      <p style={{ marginTop: 12 }}>
        {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          style={{
            border: "none",
            background: "none",
            color: "#0077cc",
            cursor: "pointer",
          }}
        >
          {isLogin ? "Sign Up" : "Login"}
        </button>
      </p>
    </div>
  );
}

// src/AuthPage.jsx
import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Optional admin controls:
// 1) Comma-separated allowlist of admin emails
const ADMIN_EMAILS = (process.env.REACT_APP_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// 2) Optional admin access code (user types it to become admin)
const ADMIN_CODE = process.env.REACT_APP_ADMIN_CODE || "";

export default function AuthPage({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function ensureProfile(user, providedCompanyName) {
    // Fetch existing profile
    const { data: existing, error: selErr } = await supabase
      .from("profiles")
      .select("id, company_name, role")
      .eq("id", user.id)
      .single();

    // Decide role
    let role = "user";
    const emailLower = (user.email || "").toLowerCase();
    const adminByAllowlist = ADMIN_EMAILS.includes(emailLower);
    const adminByCode = ADMIN_CODE && adminCode && adminCode === ADMIN_CODE;
    if (adminByAllowlist || adminByCode) role = "admin";

    // If no row, insert
    if (!existing || selErr) {
      const { error: insErr } = await supabase.from("profiles").insert([
        {
          id: user.id,
          email: user.email,
          company_name: providedCompanyName || null,
          role,
        },
      ]);
      if (insErr) throw insErr;
      return { role, company_name: providedCompanyName || "" };
    }

    // If row exists, update if missing company_name or role needs upgrade
    const updates = {};
    if (!existing.company_name && providedCompanyName) {
      updates.company_name = providedCompanyName;
    }
    if (existing.role !== role && role === "admin") {
      updates.role = "admin";
    }

    if (Object.keys(updates).length) {
      const { error: updErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      if (updErr) throw updErr;
      return {
        role: updates.role || existing.role,
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
      // Sign in / up
      const { data, error: authErr } = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

      if (authErr) throw authErr;
      const user = data?.user;
      if (!user) throw new Error("No user returned from Supabase.");

      // For sign-up, we expect a company name; for login it’s optional
      const suppliedCompany =
        isLogin ? (companyName || undefined) : (companyName || "").trim();
      if (!isLogin && !suppliedCompany) {
        throw new Error("Company name is required for sign up.");
      }

      // Ensure profile row exists & is up-to-date
      const profile = await ensureProfile(user, suppliedCompany);

      // Save supplier name to your backend if we have one
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
          // Non-fatal; log only
          console.warn("set-supplier-name failed:", e?.message || e);
        }
      }

      // Hand off to App
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
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
        autoComplete={isLogin ? "current-password" : "new-password"}
      />

      {/* Company Name:
          - Required on Sign Up
          - Optional on Login (used to fill missing profile.company_name) */}
      <input
        type="text"
        placeholder={
          isLogin
            ? "Company Name (optional if already set)"
            : "Company Name (required)"
        }
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 10 }}
        required={!isLogin}
      />

      {/* Optional admin code to elevate on first login/sign up */}
      {ADMIN_CODE && (
        <input
          type="text"
          placeholder="Admin Access Code (optional)"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
          style={{ padding: 8, width: "100%", marginBottom: 10 }}
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

import React, { useState } from "react";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "https://vendoriq-backend.onrender.com";

export default function AdminLogin({ onToken }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    try {
      const res = await fetch(`${BACKEND}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");
      onToken(data.token);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "60px auto" }}>
      <h2>Admin Login</h2>
      <input placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} style={{width:"100%",padding:8,marginBottom:8}}/>
      <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",padding:8,marginBottom:8}}/>
      <button onClick={submit} style={{width:"100%",padding:10}}>Sign in</button>
      {err && <div style={{color:"red",marginTop:8}}>{err}</div>}
    </div>
  );
}

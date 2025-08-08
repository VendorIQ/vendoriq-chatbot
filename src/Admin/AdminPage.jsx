// src/admin/AdminPage.jsx
import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

export default function AdminPage() {
  const [enteredUser, setEnteredUser] = useState("");
  const [enteredPass, setEnteredPass] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const ADMIN_USER = process.env.REACT_APP_ADMIN_USER || "admin";
  const ADMIN_PASS = process.env.REACT_APP_ADMIN_PASS || "changeme";

  async function loadProfiles() {
    const { data, error } = await supabase.from("profiles").select("*").limit(200);
    if (error) return setError(error.message);
    setRows(data || []);
  }

  async function saveProfile(row) {
    const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
    if (error) alert(error.message);
    else alert("Saved");
  }

  if (!isAuthed) {
    return (
      <div style={{ maxWidth: 360, margin: "80px auto" }}>
        <h2>Admin Login</h2>
        <input value={enteredUser} onChange={e=>setEnteredUser(e.target.value)} placeholder="Username" />
        <input value={enteredPass} onChange={e=>setEnteredPass(e.target.value)} placeholder="Password" type="password" />
        <button onClick={()=>{
          if (enteredUser===ADMIN_USER && enteredPass===ADMIN_PASS) {
            setIsAuthed(true);
            loadProfiles();
          } else {
            setError("Invalid admin credentials");
          }
        }}>Enter</button>
        {error && <p style={{color:"red"}}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Profiles Admin</h2>
      <button onClick={loadProfiles}>Reload</button>
      {rows.map((r) => (
        <div key={r.id} style={{ border:"1px solid #ddd", padding:12, margin:"12px 0" }}>
          <div>ID: {r.id}</div>
          <div>Email: <input defaultValue={r.email} onChange={e => r.email = e.target.value} /></div>
          <div>Company: <input defaultValue={r.company_name} onChange={e => r.company_name = e.target.value} /></div>
          <div>Role: <input defaultValue={r.role} onChange={e => r.role = e.target.value} /></div>
          <button onClick={()=>saveProfile(r)}>Save</button>
        </div>
      ))}
    </div>
  );
}

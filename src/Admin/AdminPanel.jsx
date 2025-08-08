import React, { useEffect, useState } from "react";
const BACKEND = process.env.REACT_APP_BACKEND_URL || "https://vendoriq-backend.onrender.com";

export default function AdminPanel({ token }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const url = new URL(`${BACKEND}/api/admin/profiles`);
    if (search.trim()) url.searchParams.set("search", search.trim());
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const updateRow = async (id, patch) => {
    setMsg("");
    const res = await fetch(`${BACKEND}/api/admin/profiles/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error || "Update failed");
    setMsg("Saved.");
    setRows(rows.map(r => r.id === id ? data : r));
  };

  return (
    <div style={{maxWidth:900, margin:"30px auto"}}>
      <h2>Profiles (Admin)</h2>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input placeholder="Search email/company..." value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,padding:8}}/>
        <button onClick={load}>Search</button>
      </div>
      {msg && <div style={{color:"green",marginBottom:8}}>{msg}</div>}
      <div style={{overflowX:"auto"}}>
        <table width="100%" cellPadding="6" style={{borderCollapse:"collapse"}}>
          <thead>
            <tr>
              <th align="left">Email</th>
              <th align="left">Company</th>
              <th align="left">Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{borderTop:"1px solid #eee"}}>
                <td>{r.email}</td>
                <td>
                  <input
                    defaultValue={r.company_name || ""}
                    onBlur={e=>updateRow(r.id, { company_name: e.target.value })}
                    style={{width:"100%"}}
                  />
                </td>
                <td>
                  <select
                    defaultValue={r.role || "user"}
                    onChange={e=>updateRow(r.id, { role: e.target.value })}
                  >
                    <option value="user">user</option>
                    <option value="auditor">auditor</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td><button onClick={()=>updateRow(r.id, { company_name: r.company_name })}>Save</button></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} style={{padding:12,color:"#666"}}>No rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

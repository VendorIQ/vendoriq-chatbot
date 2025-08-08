// AdminPage.jsx
import React, { useState } from "react";
import AdminLogin from "./AdminLogin";
import AdminPanel from "./AdminPanel";

export default function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || "");

  const onToken = (t) => {
    localStorage.setItem("admin_token", t);
    setToken(t);
  };

  if (!token) return <AdminLogin onToken={onToken} />;

  return <AdminPanel token={token} />;
}

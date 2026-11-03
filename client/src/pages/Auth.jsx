import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data } = await api.post("/auth/signup", form);
        setNotice(data.message);
      } else {
        await api.post("/auth/login", {
          email: form.email,
          password: form.password,
        });
        await refresh();
        navigate("/app");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError("");
    try {
      const { data } = await api.post("/auth/resend", { email: form.email });
      setNotice(data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend");
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-col">
        <Link to="/" className="brand auth-brand">
          Renew<span>Keep</span>
        </Link>
        <div className="card auth-card">
          <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label className="field">
                <span>Your name</span>
                <input value={form.name} onChange={set("name")} required maxLength={80} />
              </label>
              <label className="field">
                <span>Company name (optional)</span>
                <input
                  value={form.companyName}
                  onChange={set("companyName")}
                  maxLength={120}
                  placeholder="Acme Ltd"
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set("email")} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              required
              minLength={8}
            />
          </label>

          {error && <p className="error">{error}</p>}
          {notice && <p className="success">{notice}</p>}

          <button className="btn" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: "1rem" }}>
          {mode === "login" ? (
            <>
              New here?{" "}
              <button type="button" className="linklike" onClick={() => setMode("signup")}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button type="button" className="linklike" onClick={() => setMode("login")}>
                Log in
              </button>
              {" · "}
              <button type="button" className="linklike" onClick={resend}>
                Resend verification
              </button>
            </>
          )}
          </p>
        </div>
        <p className="auth-foot muted">
          Licenses, permits and insurance — reminded before they expire.
        </p>
      </div>
    </div>
  );
}

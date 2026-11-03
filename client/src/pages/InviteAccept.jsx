import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function InviteAccept() {
  const { token } = useParams();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    api
      .get(`/auth/invite/${token}`)
      .then((r) => setInvite(r.data))
      .catch((e) => setError(e.response?.data?.message || "Invalid invitation"));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post(`/auth/invite/${token}/accept`, { name, password });
      await refresh();
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.message || "Could not accept the invitation");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h2>Join on RenewKeep</h2>

        {!invite && !error && <p className="muted">Checking invitation…</p>}
        {error && (
          <>
            <p className="error">{error}</p>
            <Link to="/auth">Go to sign in</Link>
          </>
        )}

        {invite && (
          <>
            <p className="muted">
              You were invited to <strong>{invite.companyName}</strong> as a {invite.role},
              using <strong>{invite.email}</strong>.
            </p>
            <form onSubmit={submit}>
              <label className="field">
                <span>Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
              </label>
              <label className="field">
                <span>Choose a password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </label>
              <button className="btn" disabled={busy} style={{ width: "100%" }}>
                {busy ? "Joining…" : "Join the team"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

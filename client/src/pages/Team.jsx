import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Team() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get("/team")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load team"));
  }, []);

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user, load]);

  if (user?.role !== "admin")
    return (
      <>
        <Link to="/app" className="muted">← Dashboard</Link>
        <h1>Team</h1>
        <div className="card empty">
          <p>Only company admins can manage the team. Ask your admin if you need access changed.</p>
        </div>
      </>
    );

  async function invite(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api.post("/team/invites", { email: inviteEmail, role: inviteRole });
      setNotice(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError("");
    setNotice("");
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    }
  }

  return (
    <>
      <Link to="/app" className="muted">← Dashboard</Link>
      <h1>Team</h1>

      <form onSubmit={invite} className="card form-inline" style={{ margin: "1rem 0" }}>
        <label className="field grow">
          <span>Invite by email</span>
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="teammate@company.com" />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
      </form>

      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}
      {!data && !error && <p className="loading">Loading team…</p>}

      {data && (
        <>
          <h2 className="section-title">Members</h2>
          <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id} style={{ cursor: "default" }}>
                    <td>{m.name} {m.isYou && <span className="muted">(you)</span>}</td>
                    <td>{m.email}</td>
                    <td>
                      {m.isYou ? (
                        m.role
                      ) : (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            act(() => api.patch(`/team/members/${m.id}`, { role: e.target.value }))
                          }
                          aria-label={`Role for ${m.name}`}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {!m.isYou && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.35rem 0.8rem" }}
                          onClick={() =>
                            act(() => api.delete(`/team/members/${m.id}`), `Remove ${m.name} from the team?`)
                          }
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="section-title">Pending invites</h2>
          {data.invites.length === 0 ? (
            <p className="muted">No pending invites.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr>
                </thead>
                <tbody>
                  {data.invites.map((i) => (
                    <tr key={i.id} style={{ cursor: "default" }}>
                      <td>{i.email}</td>
                      <td>{i.role}</td>
                      <td>{new Date(i.expiresAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: "0.35rem 0.8rem" }}
                          onClick={() => act(() => api.delete(`/team/invites/${i.id}`))}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

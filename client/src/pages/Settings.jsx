import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

// All IANA timezones the browser knows; fallback list for older browsers.
const TIMEZONES =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC", "Europe/London", "Asia/Karachi", "America/New_York"];

export default function Settings() {
  const { user, company, refresh } = useAuth();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [emailsText, setEmailsText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!company) return;
    setName(company.name);
    setTimezone(company.timezone);
    setEmailsText((company.reminderEmails || []).join(", "));
  }, [company]);

  if (user?.role !== "admin")
    return (
      <>
        <Link to="/app" className="muted">← Dashboard</Link>
        <h1>Settings</h1>
        <div className="card empty">
          <p>Only company admins can change settings.</p>
        </div>
      </>
    );

  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    const reminderEmails = emailsText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy(true);
    try {
      await api.put("/company", { name, timezone, reminderEmails });
      await refresh(); // keep AuthContext's company in sync
      setNotice("Settings saved");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Link to="/app" className="muted">← Dashboard</Link>
      <h1>Settings</h1>
      <form onSubmit={save} className="card" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <label className="field">
          <span>Company name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="field">
          <span>Timezone (used for expiry status and reminder timing)</span>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Who receives reminders (comma separated; blank = company admins)</span>
          <input
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            placeholder="ops@company.com, owner@company.com"
          />
        </label>
        <p className="muted">
          Items with their own notification emails always use those; this list is the
          fallback for items without any.
        </p>

        {error && <p className="error">{error}</p>}
        {notice && <p className="success">{notice}</p>}

        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </form>

      <div className="card" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          Plan: <strong>{company?.plan}</strong> · up to {company?.itemLimit} items ·{" "}
          <a href="/api/account/export">Export my data (JSON)</a>
        </p>
      </div>

      <div className="card card-danger" style={{ maxWidth: 560, marginTop: "1rem" }}>
        <h2 style={{ color: "var(--danger)" }}>Danger zone</h2>
        <p className="muted">
          Deleting your account is permanent. If you are the last member, the whole
          company — items, files and reminder history — is deleted with it.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!window.confirm("Really delete your account? This cannot be undone.")) return;
            setDeleteError("");
            try {
              await api.delete("/account", { data: { password: deletePassword } });
              navigate("/");
            } catch (err) {
              setDeleteError(err.response?.data?.message || "Could not delete the account");
            }
          }}
          className="form-inline"
        >
          <label className="field grow">
            <span>Confirm with your password</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
            />
          </label>
          <button className="btn btn-danger">Delete account</button>
        </form>
        {deleteError && <p className="error">{deleteError}</p>}
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { TYPE_LABELS } from "./Items.jsx";
import { formatDate, formatDaysLeft } from "../format.js";
import DateInput from "../components/DateInput.jsx";

export default function ItemDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get(`/items/${id}`)
      .then((r) => setItem(r.data.item))
      .catch((e) => setError(e.response?.data?.message || "Could not load item"));
  }, [id]);

  async function renew(e) {
    e.preventDefault();
    if (!newDate) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/items/${id}/renew`, { expiryDate: newDate });
      setItem(data.item);
      setRenewing(false);
      setNewDate("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not renew");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem() {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`/items/${id}`);
      navigate("/app/items");
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete");
      setBusy(false);
    }
  }

  if (error && !item) return <p className="error">{error}</p>;
  if (!item) return <p className="loading">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app/items" className="muted">← Items</Link>
          <h1 style={{ marginTop: "0.3rem" }}>{item.title}</h1>
          <StatusBadge status={item.status} daysLeft={item.daysLeft} />
        </div>
        <div className="btn-row">
          <Link to={`/app/items/${id}/edit`} className="btn btn-secondary">Edit</Link>
          <button className="btn" onClick={() => setRenewing((v) => !v)}>
            Mark as renewed
          </button>
          <button className="btn btn-danger" onClick={removeItem} disabled={busy}>
            Delete
          </button>
        </div>
      </div>

      {renewing && (
        <form onSubmit={renew} className="card" style={{ marginBottom: "1rem", maxWidth: 420 }}>
          <div className="field">
            <span>New expiry date</span>
            <DateInput value={newDate} onChange={setNewDate} required />
          </div>
          <button className="btn" disabled={busy}>{busy ? "Saving…" : "Renew"}</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      <div className="card">
        <dl className="detail-grid">
          <div><dt>Type</dt><dd>{TYPE_LABELS[item.type]}</dd></div>
          <div>
            <dt>Expiry date</dt>
            <dd>
              {formatDate(item.expiryDate)}{" "}
              <span className="muted">({formatDaysLeft(item.daysLeft)})</span>
            </dd>
          </div>
          <div><dt>Holder</dt><dd>{item.holderName || "—"}</dd></div>
          <div><dt>Issuer</dt><dd>{item.issuer || "—"}</dd></div>
          <div><dt>Reference number</dt><dd>{item.number || "—"}</dd></div>
          <div>
            <dt>Reminders go to</dt>
            <dd>{item.notifyEmails.length ? item.notifyEmails.join(", ") : "Company admins"}</dd>
          </div>
          {item.renewedAt && (
            <div><dt>Last renewed</dt><dd>{new Date(item.renewedAt).toLocaleDateString()}</dd></div>
          )}
        </dl>

        {item.notes && (
          <>
            <div className="detail-label">Notes</div>
            <p style={{ whiteSpace: "pre-wrap", marginTop: "0.3rem" }}>{item.notes}</p>
          </>
        )}

        <div className="divider">
          <div className="detail-label">Document</div>
          {item.file ? (
            <p style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <span>
                {item.file.originalName}{" "}
                <span className="muted">({Math.round(item.file.size / 1024)} KB)</span>
              </span>
              {/* Plain links: the browser sends the auth cookie with them. */}
              <a href={`/api/items/${id}/file`} target="_blank" rel="noreferrer">View</a>
              <a href={`/api/items/${id}/file?download=1`}>Download</a>
            </p>
          ) : (
            <p className="muted">No document attached — add one via Edit.</p>
          )}
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import api from "../api.js";
import { TYPE_LABELS } from "./Items.jsx";
import DateInput from "../components/DateInput.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const empty = {
  type: "license",
  title: "",
  holderName: "",
  issuer: "",
  number: "",
  expiryDate: "",
  notes: "",
};

export default function ItemForm() {
  const { id } = useParams(); // present = edit mode
  const [form, setForm] = useState(empty);
  const [emailsText, setEmailsText] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    api
      .get(`/items/${id}`)
      .then((r) => {
        const i = r.data.item;
        setForm({
          type: i.type,
          title: i.title,
          holderName: i.holderName,
          issuer: i.issuer,
          number: i.number,
          expiryDate: i.expiryDate,
          notes: i.notes,
        });
        setEmailsText(i.notifyEmails.join(", "));
        setLoading(false);
      })
      .catch((e) => {
        setError(e.response?.data?.message || "Could not load item");
        setLoading(false);
      });
  }, [id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");

    // Client-side validation mirrors the server's (server remains the authority).
    if (!form.title.trim()) return setError("Title is required");
    if (!form.expiryDate) return setError("Expiry date is required");
    const notifyEmails = emailsText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const em of notifyEmails)
      if (!EMAIL_RE.test(em)) return setError(`"${em}" is not a valid email`);
    if (notifyEmails.length > 10) return setError("At most 10 notification emails");

    setBusy(true);
    try {
      const body = { ...form, notifyEmails };
      const { data } = id
        ? await api.put(`/items/${id}`, body)
        : await api.post("/items", body);
      const itemId = data.item.id;

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        await api.post(`/items/${itemId}/file`, fd);
      }
      navigate(`/app/items/${itemId}`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save item");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="loading">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>{id ? "Edit item" : "Add item"}</h1>
        <Link to={id ? `/app/items/${id}` : "/app/items"} className="btn btn-secondary">Cancel</Link>
      </div>

      <form onSubmit={submit} className="card" style={{ maxWidth: 760 }}>
        <div className="form-grid">
          <label className="field">
            <span>Type *</span>
            <select value={form.type} onChange={set("type")}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Title *</span>
            <input value={form.title} onChange={set("title")} maxLength={160} required />
          </label>
          <label className="field">
            <span>Holder name</span>
            <input value={form.holderName} onChange={set("holderName")} maxLength={120}
              placeholder="Person or asset it belongs to" />
          </label>
          <label className="field">
            <span>Issuer</span>
            <input value={form.issuer} onChange={set("issuer")} maxLength={120}
              placeholder="Authority that issued it" />
          </label>
          <label className="field">
            <span>Reference number</span>
            <input value={form.number} onChange={set("number")} maxLength={80} />
          </label>
          <div className="field">
            <span>Expiry date *</span>
            <DateInput
              value={form.expiryDate}
              onChange={(iso) => setForm((f) => ({ ...f, expiryDate: iso }))}
              required
            />
          </div>
          <label className="field full">
            <span>Notification emails (comma separated, blank = company admins)</span>
            <input value={emailsText} onChange={(e) => setEmailsText(e.target.value)}
              placeholder="ops@company.com, hr@company.com" />
          </label>
          <label className="field full">
            <span>Notes</span>
            <textarea rows={3} value={form.notes} onChange={set("notes")} maxLength={2000} />
          </label>
          <label className="field full">
            <span>Document (PDF, JPG, PNG or WebP — max 5 MB){id ? " — replaces the current file" : ""}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : id ? "Save changes" : "Add item"}
        </button>
      </form>
    </>
  );
}

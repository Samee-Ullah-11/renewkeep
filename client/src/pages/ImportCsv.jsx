import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import { formatDate } from "../format.js";

export default function ImportCsv() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function pickFile(e) {
    const f = e.target.files?.[0];
    setPreview(null);
    setResult(null);
    setError("");
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
    setBusy(true);
    try {
      const { data } = await api.post("/items/import/preview", { csv: text });
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not read the file");
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/items/import", { csv });
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err.response?.data?.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Import items</h1>
        <Link to="/app/items" className="muted">← Items</Link>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <p>
          Upload a CSV with a header row. Required columns: <code>title</code>,{" "}
          <code>expiryDate</code> (YYYY-MM-DD or DD/MM/YYYY). Optional:{" "}
          <code>type, holderName, issuer, number, notes, notifyEmails</code>{" "}
          (separate several emails with <code>;</code>).{" "}
          <a href="/api/items/import/template">Download the template</a>.
        </p>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={pickFile} />
        </label>
      </div>

      {busy && <p className="loading">Working…</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="card">
          <h2 style={{ fontSize: "1.1rem" }}>Import finished</h2>
          <p>
            <strong>{result.created}</strong> item{result.created === 1 ? "" : "s"} created ·{" "}
            {result.skippedDuplicates} duplicate{result.skippedDuplicates === 1 ? "" : "s"} skipped ·{" "}
            {result.skippedInvalid} invalid row{result.skippedInvalid === 1 ? "" : "s"} skipped
          </p>
          <button className="btn" onClick={() => navigate("/app/items")}>Go to items</button>
        </div>
      )}

      {preview && (
        <>
          <div className="card btn-row" style={{ marginBottom: "1rem", gap: "1rem" }}>
            <span><strong>{fileName}</strong>: {preview.summary.valid} will import</span>
            <span className="muted">
              {preview.summary.duplicates} duplicates · {preview.summary.invalid} with errors
            </span>
            <button className="btn" disabled={busy || preview.summary.valid === 0} onClick={doImport}>
              Import {preview.summary.valid} item{preview.summary.valid === 1 ? "" : "s"}
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Line</th><th>Title</th><th>Type</th><th>Expiry</th><th>Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} style={{ cursor: "default" }}>
                    <td className="muted">{r.line}</td>
                    <td>{r.data.title || <span className="muted">—</span>}</td>
                    <td>{r.data.type}</td>
                    <td>{formatDate(r.data.expiryDate)}</td>
                    <td className="wrap">
                      {r.errors.length > 0 ? (
                        <span className="error" style={{ margin: 0 }}>{r.errors.join("; ")}</span>
                      ) : r.duplicate ? (
                        <span className="muted">Duplicate — skipped</span>
                      ) : (
                        <span className="badge badge-green">Will import</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatDate } from "../format.js";

export const TYPE_LABELS = {
  license: "License",
  permit: "Permit",
  insurance: "Insurance",
  employee_doc: "Employee doc",
  other: "Other",
};

export default function Items() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Small debounce so typing in search doesn't fire a request per keypress.
    const t = setTimeout(() => {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (type) params.type = type;
      if (status) params.status = status;
      api
        .get("/items", { params })
        .then((r) => setItems(r.data.items))
        .catch((e) => setError(e.response?.data?.message || "Could not load items"));
    }, 250);
    return () => clearTimeout(t);
  }, [search, type, status]);

  const filtered = search || type || status;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/app" className="muted">← Dashboard</Link>
          <h1>Items</h1>
        </div>
        <div className="btn-row">
          {/* Plain link: the browser sends the auth cookie and saves the file. */}
          <a href="/api/items/export.xlsx" className="btn btn-secondary">Export Excel</a>
          <a href="/api/items/export.csv" className="btn btn-secondary">Export CSV</a>
          <Link to="/app/items/import" className="btn btn-secondary">Import CSV</Link>
          <Link to="/app/items/new" className="btn">+ Add item</Link>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search title, holder, issuer, number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="expired">Expired</option>
          <option value="red">Urgent (≤ 7 days)</option>
          <option value="amber">Due soon (8–30)</option>
          <option value="green">OK (31+)</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="loading">Loading items…</p>}

      {items && items.length === 0 && (
        <div className="card empty">
          <p>{filtered ? "Nothing matches these filters." : "No items yet."}</p>
          {!filtered && (
            <Link to="/app/items/new" className="btn btn-sun">Add your first item</Link>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Holder</th>
                <th>Expiry date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="row-link" onClick={() => navigate(`/app/items/${i.id}`)}>
                  <td>{i.title}</td>
                  <td>{TYPE_LABELS[i.type]}</td>
                  <td>{i.holderName || "—"}</td>
                  <td>{formatDate(i.expiryDate)}</td>
                  <td><StatusBadge status={i.status} daysLeft={i.daysLeft} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

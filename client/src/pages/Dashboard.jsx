import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatDate } from "../format.js";

const CARDS = [
  { key: "expired", label: "Expired" },
  { key: "red", label: "Urgent (≤ 7 days)" },
  { key: "amber", label: "Due soon (8–30)" },
  { key: "green", label: "OK (31+)" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load dashboard"));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="loading">Loading dashboard…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <Link to="/app/items/new" className="btn">+ Add item</Link>
      </div>

      <div className="stat-grid">
        {CARDS.map((c) => (
          <div key={c.key} className={`stat stat-${c.key}`}>
            <div className="num">{data.counts[c.key]}</div>
            <div className="muted">{c.label}</div>
          </div>
        ))}
      </div>

      <h2 className="section-title">Expiring soonest</h2>
      {data.soonest.length === 0 ? (
        <div className="card empty">
          <p>No upcoming expiries.</p>
          {data.total === 0 && (
            <Link to="/app/items/new" className="btn btn-sun">Add your first item</Link>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Expiry date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.soonest.map((i) => (
                <tr key={i.id} className="row-link" onClick={() => navigate(`/app/items/${i.id}`)}>
                  <td>{i.title}</td>
                  <td>{formatDate(i.expiryDate)}</td>
                  <td><StatusBadge status={i.status} daysLeft={i.daysLeft} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ marginTop: "1rem" }}>
        {data.total} of {data.itemLimit} items used · timezone {data.timezone}
      </p>
    </>
  );
}

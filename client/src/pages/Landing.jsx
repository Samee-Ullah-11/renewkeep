import { Link } from "react-router-dom";

// Everything on this page describes real behaviour: the status bands,
// reminder schedule, CSV flow, roles and limits all match the app exactly.
// The dashboard preview is drawn with the same components as the real UI.

const PREVIEW_ITEMS = [
  { title: "Trade license", holder: "Acme Ltd", date: "5 Nov 2026", status: "red", label: "Urgent · 3d" },
  { title: "Fleet insurance", holder: "Van ABC-123", date: "22 Nov 2026", status: "amber", label: "Due soon · 20d" },
  { title: "Work visa — A. Khan", holder: "HR", date: "28 Oct 2026", status: "expired", label: "Expired 5d ago" },
  { title: "Fire safety permit", holder: "HQ building", date: "31 Jan 2027", status: "green", label: "OK" },
];

const STEPS = [
  ["Add what expires", "Licenses, permits, insurance, employee documents — typed in, or imported from your spreadsheet as CSV."],
  ["See status instantly", "Every item is colour- and text-coded by days left, computed in your company's timezone. The dashboard shows what needs attention first."],
  ["Get one email, in time", "A single digest per company at each reminder point. Renew an item and the cycle starts over."],
];

const CAPABILITIES = [
  "Statuses computed in your company's timezone",
  "One digest email per company — never per item",
  "Overdue follow-ups stop after 14 days",
  "The same reminder is never sent twice",
  "CSV import with a preview of every row and error",
  "Dates accepted as YYYY-MM-DD or DD/MM/YYYY",
  "Duplicate rows skipped automatically",
  "CSV export of everything, any time",
  "Documents stored privately — no public links",
  "PDF, JPG, PNG and WebP attachments up to 5 MB",
  "Teammates by email invite — admin and member roles",
  "Export your data or delete your account yourself",
];

export default function Landing() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link to="/" className="brand">
          Renew<span>Keep</span>
        </Link>
        <Link to="/auth" className="btn btn-secondary">Sign in</Link>
      </nav>

      {/* ---- hero: claim + live-looking product preview ---- */}
      <header className="hero">
        <h1>The renewal you forgot is the one that costs you.</h1>
        <p>
          RenewKeep tracks everything in your company that expires — and emails
          you well before it does.
        </p>
        <div className="btn-row">
          <Link to="/auth" className="btn">Create a free account</Link>
          <span className="muted">Free plan · 25 items · no card</span>
        </div>
      </header>

      <div className="preview" aria-label="Example of the RenewKeep dashboard">
        <div className="preview-caption">Your dashboard — example data</div>
        <div className="stat-grid">
          <div className="stat stat-expired"><div className="num">1</div><div className="muted">Expired</div></div>
          <div className="stat stat-red"><div className="num">1</div><div className="muted">Urgent (≤ 7 days)</div></div>
          <div className="stat stat-amber"><div className="num">1</div><div className="muted">Due soon (8–30)</div></div>
          <div className="stat stat-green"><div className="num">1</div><div className="muted">OK (31+)</div></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Holder</th><th>Expiry date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {PREVIEW_ITEMS.map((i) => (
                <tr key={i.title}>
                  <td>{i.title}</td>
                  <td>{i.holder}</td>
                  <td>{i.date}</td>
                  <td><span className={`badge badge-${i.status}`}>{i.label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- reminder timeline: the whole schedule in one picture ---- */}
      <section className="timeline-section" aria-label="Reminder schedule">
        <h2>When the emails arrive</h2>
        <div className="timeline">
          {[
            ["60d", "before"],
            ["30d", "before"],
            ["7d", "before"],
            ["Day 0", "expiry"],
            ["+1d", "after"],
            ["+7d", "after"],
            ["+14d", "last one"],
          ].map(([t, sub]) => (
            <div className={`tick${sub === "expiry" ? " tick-zero" : ""}`} key={t}>
              <div className="dot" />
              <div className="tick-label">{t}</div>
              <div className="tick-sub">{sub}</div>
            </div>
          ))}
        </div>
        <p className="muted timeline-note">
          One digest per company per day, listing every item that is due — sent to each
          item's own contacts, your settings list, or the admins. Then it stops.
        </p>
      </section>

      {/* ---- three steps ---- */}
      <section className="steps" aria-label="How it works">
        <h2>How it works</h2>
        <ol>
          {STEPS.map(([title, text], n) => (
            <li key={title}>
              <div className="step-num">{n + 1}</div>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- the fine print, scannable ---- */}
      <section className="capabilities" aria-label="Everything included">
        <h2>Everything in the free plan</h2>
        <ul className="check-grid">
          {CAPABILITIES.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <div className="landing-cta card">
        <h2>Put your renewals on autopilot.</h2>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link to="/auth" className="btn">Create a free account</Link>
          <Link to="/auth" className="btn btn-secondary">Sign in</Link>
        </div>
      </div>

      <footer className="landing-footer">
        RenewKeep — expiry tracking for small teams. Free plan: 25 items per company.
      </footer>
    </div>
  );
}

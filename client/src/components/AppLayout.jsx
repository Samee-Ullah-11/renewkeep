import { useState, useEffect } from "react";
import { NavLink, Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const links = [
  { to: "/app", label: "Dashboard", end: true },
  { to: "/app/items", label: "Items" },
  { to: "/app/team", label: "Team" },
  { to: "/app/settings", label: "Settings" },
];

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { company, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Close the slide-out menu on every navigation.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/auth");
  }

  return (
    <div className="shell">
      <div className="topbar">
        <button
          className="hamburger"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          ☰
        </button>
        {/* Brand always leads straight back to the dashboard. */}
        <Link to="/app" className="brand">
          Renew<span>Keep</span>
        </Link>
      </div>

      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar${menuOpen ? " open" : ""}`}>
        <Link to="/app" className="brand">
          Renew<span>Keep</span>
        </Link>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
          <div style={{ flex: 1 }} />
          <button className="nav-btn" onClick={handleLogout}>
            Log out
          </button>
          <div className="company" title={company?.name}>{company?.name}</div>
        </nav>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

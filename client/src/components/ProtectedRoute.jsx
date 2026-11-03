import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="auth-wrap">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}

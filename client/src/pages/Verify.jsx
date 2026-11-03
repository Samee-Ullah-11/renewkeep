import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Verify() {
  const { token } = useParams();
  const [status, setStatus] = useState("working"); // working | ok | fail
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/auth/verify/${token}`);
        if (cancelled) return;
        setStatus("ok");
        setMessage(data.message);
        await refresh();
        setTimeout(() => navigate("/app"), 1200);
      } catch (err) {
        if (cancelled) return;
        setStatus("fail");
        setMessage(err.response?.data?.message || "Verification failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate, refresh]);

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <h2>Email verification</h2>
        {status === "working" && <p>Verifying…</p>}
        {status === "ok" && <p className="success">{message} — taking you to the app…</p>}
        {status === "fail" && (
          <>
            <p className="error">{message}</p>
            <Link to="/auth">Back to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}

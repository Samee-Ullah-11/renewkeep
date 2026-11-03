import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * protect — requires a valid JWT in the httpOnly "token" cookie.
 * Loads the user and attaches { id, companyId, role, ... } as req.user.
 * companyId on req.user is the single source of truth for tenant scoping:
 * every items/files/reminders/team query must filter by it.
 */
export async function protect(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ message: "Not logged in" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "User no longer exists" });
    if (!user.isVerified)
      return res.status(401).json({ message: "Email not verified" });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired session" });
  }
}

/** requireAdmin — use after protect on admin-only routes (team, settings). */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
}

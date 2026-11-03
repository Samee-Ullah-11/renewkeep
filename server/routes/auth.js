import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import User from "../models/User.js";
import Company from "../models/Company.js";
import Invite from "../models/Invite.js";
import sendEmail from "../utils/sendEmail.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Basic brute-force protection on the auth endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many attempts, try again later" },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function setAuthCookie(res, userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function sendVerifyEmail(user, rawToken) {
  const url = `${process.env.CLIENT_URL}/verify/${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: "Verify your RenewKeep account",
    html: `
      <p>Hi ${user.name},</p>
      <p>Confirm your email to activate your RenewKeep account:</p>
      <p><a href="${url}">${url}</a></p>
      <p>This link expires in 24 hours.</p>`,
  });
}

// POST /api/auth/signup — creates a Company and its first (admin) user.
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, companyName } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ message: "Name is required" });
    if (!email || !EMAIL_RE.test(email))
      return res.status(400).json({ message: "A valid email is required" });
    if (!password || typeof password !== "string" || password.length < 8)
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    if (companyName && typeof companyName !== "string")
      return res.status(400).json({ message: "Invalid company name" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ message: "Email already registered" });

    // Every signup creates a new company; the signer-up is its admin.
    const company = await Company.create({
      name: (companyName || "").trim() || `${name.trim()}'s company`,
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    let user;
    try {
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase(),
        password: await bcrypt.hash(password, 10),
        companyId: company._id,
        role: "admin",
        verifyTokenHash: hashToken(rawToken),
        verifyTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    } catch (err) {
      // Don't leave an orphan company if user creation failed (e.g. dup email race).
      await Company.deleteOne({ _id: company._id });
      throw err;
    }

    await sendVerifyEmail(user, rawToken);
    res.status(201).json({ message: "Account created. Check your email to verify." });
  } catch (err) {
    console.error("signup error:", err);
    res.status(500).json({ message: "Could not create account" });
  }
});

// GET /api/auth/verify/:token
router.get("/verify/:token", async (req, res) => {
  try {
    const user = await User.findOne({
      verifyTokenHash: hashToken(req.params.token),
      verifyTokenExpires: { $gt: new Date() },
    }).select("+verifyTokenHash +verifyTokenExpires");

    if (!user)
      return res.status(400).json({ message: "Invalid or expired link" });

    user.isVerified = true;
    user.verifyTokenHash = undefined;
    user.verifyTokenExpires = undefined;
    await user.save();

    setAuthCookie(res, user._id);
    res.json({ message: "Email verified" });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

// POST /api/auth/resend — resend the verification email.
router.post("/resend", authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email))
      return res.status(400).json({ message: "A valid email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Same response whether or not the account exists (no enumeration).
    if (!user || user.isVerified)
      return res.json({ message: "If that account needs verification, an email was sent" });

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.verifyTokenHash = hashToken(rawToken);
    user.verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerifyEmail(user, rawToken);

    res.json({ message: "If that account needs verification, an email was sent" });
  } catch (err) {
    console.error("resend error:", err);
    res.status(500).json({ message: "Could not resend email" });
  }
});

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email: String(email).toLowerCase() }).select(
      "+password"
    );
    if (!user || !(await bcrypt.compare(String(password), user.password)))
      return res.status(401).json({ message: "Invalid email or password" });
    if (!user.isVerified)
      return res.status(403).json({ message: "Please verify your email first" });

    setAuthCookie(res, user._id);
    res.json({ message: "Logged in" });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

// GET /api/auth/invite/:token — details for the invite-accept page.
router.get("/invite/:token", async (req, res) => {
  try {
    const invite = await Invite.findOne({
      tokenHash: hashToken(req.params.token),
      acceptedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!invite)
      return res.status(400).json({ message: "Invalid or expired invitation" });
    const company = await Company.findById(invite.companyId);
    res.json({ email: invite.email, role: invite.role, companyName: company?.name });
  } catch (err) {
    console.error("invite lookup error:", err);
    res.status(500).json({ message: "Could not load invitation" });
  }
});

// POST /api/auth/invite/:token/accept — create the account and log in.
// The invite arrived at the person's email, so the address is already
// proven: no separate verification step is needed.
router.post("/invite/:token/accept", authLimiter, async (req, res) => {
  try {
    const { name, password } = req.body || {};
    if (!name || typeof name !== "string" || !name.trim())
      return res.status(400).json({ message: "Name is required" });
    if (!password || typeof password !== "string" || password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    const invite = await Invite.findOne({
      tokenHash: hashToken(req.params.token),
      acceptedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!invite)
      return res.status(400).json({ message: "Invalid or expired invitation" });

    if (await User.findOne({ email: invite.email }))
      return res.status(409).json({ message: "This email already has an account" });

    const user = await User.create({
      name: name.trim(),
      email: invite.email,
      password: await bcrypt.hash(password, 10),
      isVerified: true,
      companyId: invite.companyId,
      role: invite.role,
    });

    invite.acceptedAt = new Date();
    await invite.save();

    setAuthCookie(res, user._id);
    res.status(201).json({ message: "Welcome aboard" });
  } catch (err) {
    console.error("invite accept error:", err);
    res.status(500).json({ message: "Could not accept the invitation" });
  }
});

// GET /api/auth/me — current user + their company.
router.get("/me", protect, async (req, res) => {
  try {
    const company = await Company.findById(req.user.companyId);
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
      company: company
        ? {
            id: company._id,
            name: company.name,
            timezone: company.timezone,
            plan: company.plan,
            itemLimit: company.itemLimit,
            reminderEmails: company.reminderEmails,
          }
        : null,
    });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ message: "Could not load profile" });
  }
});

export default router;

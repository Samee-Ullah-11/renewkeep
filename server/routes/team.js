import express from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User.js";
import Invite from "../models/Invite.js";
import sendEmail from "../utils/sendEmail.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { tenantScope } from "../middleware/tenant.js";

const router = express.Router();

// Team management is admin-only (members can add/edit items, nothing here).
router.use(protect, tenantScope, requireAdmin);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

// GET /api/team — members and pending invites.
router.get("/", async (req, res) => {
  try {
    const members = await User.find(req.tenantFilter).sort({ createdAt: 1 });
    const invites = await Invite.find({
      ...req.tenantFilter,
      acceptedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    res.json({
      members: members.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        isVerified: u.isVerified,
        isYou: u._id.equals(req.user._id),
      })),
      invites: invites.map((i) => ({
        id: i._id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
      })),
    });
  } catch (err) {
    console.error("team list error:", err);
    res.status(500).json({ message: "Could not load team" });
  }
});

// POST /api/team/invites — invite a teammate by email.
router.post("/invites", async (req, res) => {
  try {
    const { email, role } = req.body || {};
    if (!email || !EMAIL_RE.test(email))
      return res.status(400).json({ message: "A valid email is required" });
    if (role && !["admin", "member"].includes(role))
      return res.status(400).json({ message: "Role must be admin or member" });

    const lower = String(email).toLowerCase();
    const existingUser = await User.findOne({ email: lower });
    if (existingUser)
      return res.status(409).json({
        message: existingUser.companyId.equals(req.company._id)
          ? "That person is already on your team"
          : "That email already has a RenewKeep account",
      });

    const rawToken = crypto.randomBytes(32).toString("hex");
    // Re-inviting the same email replaces the previous invite (new token,
    // fresh 7-day expiry) thanks to the unique {companyId, email} index.
    const invite = await Invite.findOneAndUpdate(
      { companyId: req.company._id, email: lower },
      {
        role: role || "member",
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: req.user._id,
        acceptedAt: null,
      },
      { upsert: true, new: true }
    );

    const url = `${process.env.CLIENT_URL}/invite/${rawToken}`;
    await sendEmail({
      to: lower,
      subject: `${req.user.name} invited you to ${req.company.name} on RenewKeep`,
      html: `
        <p>Hi,</p>
        <p>${req.user.name} invited you to join <strong>${req.company.name}</strong> on RenewKeep
        as a ${invite.role}.</p>
        <p><a href="${url}">Accept the invitation</a> (valid for 7 days)</p>`,
    });

    res.status(201).json({
      invite: { id: invite._id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt },
    });
  } catch (err) {
    console.error("invite error:", err);
    res.status(500).json({ message: "Could not send invite" });
  }
});

// DELETE /api/team/invites/:id — revoke a pending invite.
router.delete("/invites/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Invite not found" });
    const gone = await Invite.findOneAndDelete({ _id: req.params.id, ...req.tenantFilter });
    if (!gone) return res.status(404).json({ message: "Invite not found" });
    res.json({ message: "Invite revoked" });
  } catch (err) {
    console.error("revoke invite error:", err);
    res.status(500).json({ message: "Could not revoke invite" });
  }
});

// PATCH /api/team/members/:id — change a member's role.
router.patch("/members/:id", async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!["admin", "member"].includes(role))
      return res.status(400).json({ message: "Role must be admin or member" });
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Member not found" });

    const member = await User.findOne({ _id: req.params.id, ...req.tenantFilter });
    if (!member) return res.status(404).json({ message: "Member not found" });

    if (member._id.equals(req.user._id))
      return res.status(400).json({ message: "You cannot change your own role" });

    member.role = role;
    await member.save();
    res.json({ message: "Role updated" });
  } catch (err) {
    console.error("change role error:", err);
    res.status(500).json({ message: "Could not change role" });
  }
});

// DELETE /api/team/members/:id — remove a member from the company.
router.delete("/members/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(404).json({ message: "Member not found" });

    const member = await User.findOne({ _id: req.params.id, ...req.tenantFilter });
    if (!member) return res.status(404).json({ message: "Member not found" });
    if (member._id.equals(req.user._id))
      return res.status(400).json({ message: "You cannot remove yourself" });

    await User.deleteOne({ _id: member._id });
    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("remove member error:", err);
    res.status(500).json({ message: "Could not remove member" });
  }
});

export default router;

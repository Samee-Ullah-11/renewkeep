import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    // Same approach as email verification: only a sha256 hash of the token
    // that was emailed is stored.
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true }, // 7 days from creation
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One live invite per email per company (re-inviting replaces it).
inviteSchema.index({ companyId: 1, email: 1 }, { unique: true });

export default mongoose.model("Invite", inviteSchema);

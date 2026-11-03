import nodemailer from "nodemailer";

// All outgoing email goes through this one function so the provider can be
// swapped later (Resend/Brevo) without touching any route or job code.

// Test driver: with EMAIL_DRIVER=test nothing leaves the machine — messages
// are captured in `outbox` for assertions instead.
export const outbox = [];

const transporter =
  process.env.EMAIL_DRIVER === "test"
    ? null
    : nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS, // Gmail app password
        },
      });

/**
 * Send an email.
 * @param {{ to: string | string[], subject: string, html: string }} opts
 */
export default async function sendEmail({ to, subject, html }) {
  if (process.env.EMAIL_DRIVER === "test") {
    outbox.push({ to: Array.isArray(to) ? to : [to], subject, html });
    return;
  }
  await transporter.sendMail({
    from: `"RenewKeep" <${process.env.EMAIL_USER}>`,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html,
  });
}

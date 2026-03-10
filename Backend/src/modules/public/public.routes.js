import express from "express";
import { sendMail } from "../../config/mailer.js";
import { env } from "../../config/env.js";

const router = express.Router();

function normalizeText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

router.post("/enquiries", async (req, res, next) => {
  try {
    const name = normalizeText(req.body?.name);
    const email = normalizeText(req.body?.email).toLowerCase();
    const phone = normalizeText(req.body?.phone);
    const branchName = normalizeText(req.body?.branch_name);
    const message = normalizeText(req.body?.message);

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    if (!branchName) {
      return res.status(400).json({ error: "branch_name is required" });
    }

    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    const recipient = env.SMTP_REPLY_TO || env.SMTP_FROM;

    if (!recipient) {
      return res.status(503).json({ error: "Enquiry email is not configured yet" });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2d6b;">
        <p style="letter-spacing:2px;font-size:12px;text-transform:uppercase;color:#f08a12;margin:0 0 12px;">AlphaGrips Enquiry</p>
        <h1 style="margin:0 0 18px;font-size:28px;">New Website Enquiry</h1>
        <div style="background:#f8f5ef;border:1px solid #d9dfe8;border-radius:18px;padding:20px;">
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone || "-")}</p>
          <p><strong>Branch / Academy:</strong> ${escapeHtml(branchName)}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
        </div>
      </div>
    `;

    const text = [
      "AlphaGrips Enquiry",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "-"}`,
      `Branch / Academy: ${branchName}`,
      "Message:",
      message
    ].join("\n");

    const delivery = await sendMail({
      to: recipient,
      subject: `New enquiry from ${name} - ${branchName}`,
      html,
      text
    });

    if (!delivery.sent) {
      return res.status(500).json({
        error: "Unable to send enquiry email right now",
        reason: delivery.reason || "mailer_error"
      });
    }

    return res.json({ message: "Enquiry submitted successfully" });
  } catch (error) {
    return next(error);
  }
});

export default router;

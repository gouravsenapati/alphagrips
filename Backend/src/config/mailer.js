import nodemailer from "nodemailer";
import { env, hasMailerConfig } from "./env.js";

let transporter = null;

if (hasMailerConfig()) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS
    }
  });
}

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    return {
      sent: false,
      reason: "mailer_not_configured"
    };
  }

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      replyTo: env.SMTP_REPLY_TO || undefined,
      to,
      subject,
      html,
      text
    });

    return {
      sent: true
    };
  } catch (error) {
    return {
      sent: false,
      reason: error.message || "mailer_error"
    };
  }
}

import { sendMail } from "../../../config/mailer.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(value) {
  const numeric = Number(value || 0);
  return `Rs ${numeric.toFixed(2)}`;
}

function formatDateRange(startDate, endDate) {
  const start = startDate ? new Date(startDate).toLocaleDateString("en-IN") : "TBC";
  const end = endDate ? new Date(endDate).toLocaleDateString("en-IN") : "TBC";
  return `${start} - ${end}`;
}

function buildEmailShell({ title, subtitle, lines }) {
  const lineHtml = lines.map((line) => `<p style="margin:0 0 10px;">${line}</p>`).join("");
  const text = [subtitle, ...lines.map((line) => line.replace(/<[^>]+>/g, ""))].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2d6b;">
      <p style="letter-spacing:2px;font-size:12px;text-transform:uppercase;color:#f08a12;margin:0 0 12px;">AlphaGrips Tournament</p>
      <h1 style="margin:0 0 12px;font-size:30px;">${title}</h1>
      <p style="margin:0 0 24px;color:#53657d;">${subtitle}</p>
      <div style="background:#f8f5ef;border:1px solid #d9dfe8;border-radius:18px;padding:20px;">
        ${lineHtml}
      </div>
    </div>
  `;

  return { html, text };
}

export async function sendRegistrationReceivedEmail({
  to,
  tournament,
  registration,
  event,
  pricing
}) {
  const shell = buildEmailShell({
    title: "Registration Received",
    subtitle: `Player: ${registration.player_name} | Dates: ${formatDateRange(
      tournament.start_date,
      tournament.end_date
    )}`,
    lines: [
      `Player Name: <strong>${escapeHtml(registration.player_name || "-")}</strong>`,
      `Tournament: <strong>${escapeHtml(tournament.tournament_name || "-")}</strong>`,
      `Dates: <strong>${escapeHtml(
        formatDateRange(tournament.start_date, tournament.end_date)
      )}</strong>`,
      `Event: <strong>${escapeHtml(event.event_name || "-")}</strong>`,
      `Registration ID: <strong>${escapeHtml(registration.id)}</strong>`,
      `Payment method: <strong>${escapeHtml(registration.payment_method || "-")}</strong>`,
      `Payment status: <strong>${escapeHtml(registration.payment_status || "pending")}</strong>`,
      `Amount: <strong>${escapeHtml(formatMoney(pricing?.payable_amount || 0))}</strong>`
    ]
  });

  return sendMail({
    to,
    subject: `Registration received - ${tournament.tournament_name} - ${event.event_name}`,
    html: shell.html,
    text: shell.text
  });
}

export async function sendPaymentConfirmedEmail({
  to,
  tournament,
  registration,
  event,
  pricing
}) {
  const shell = buildEmailShell({
    title: "Payment Confirmed",
    subtitle: `Player: ${registration.player_name || "-"} | Dates: ${formatDateRange(
      tournament.start_date,
      tournament.end_date
    )}`,
    lines: [
      `Player Name: <strong>${escapeHtml(registration.player_name || "-")}</strong>`,
      `Tournament: <strong>${escapeHtml(tournament.tournament_name || "-")}</strong>`,
      `Dates: <strong>${escapeHtml(
        formatDateRange(tournament.start_date, tournament.end_date)
      )}</strong>`,
      `Event: <strong>${escapeHtml(event.event_name || "-")}</strong>`,
      `Registration ID: <strong>${escapeHtml(registration.id)}</strong>`,
      `Amount received: <strong>${escapeHtml(formatMoney(pricing?.payable_amount || 0))}</strong>`,
      `Payment status: <strong>${escapeHtml(registration.payment_status || "paid")}</strong>`
    ]
  });

  return sendMail({
    to,
    subject: `Payment confirmed - ${tournament.tournament_name} - ${event.event_name}`,
    html: shell.html,
    text: shell.text
  });
}

export async function sendRegistrationDecisionEmail({
  to,
  tournament,
  registration,
  event,
  decision
}) {
  const normalizedDecision = String(decision || "").toLowerCase();
  const decisionTitle =
    normalizedDecision === "approved"
      ? "Registration Approved"
      : normalizedDecision === "rejected"
        ? "Registration Update"
        : "Registration Updated";

  const shell = buildEmailShell({
    title: decisionTitle,
    subtitle: `Player: ${registration.player_name || "-"} | Dates: ${formatDateRange(
      tournament.start_date,
      tournament.end_date
    )}`,
    lines: [
      `Player Name: <strong>${escapeHtml(registration.player_name || "-")}</strong>`,
      `Tournament: <strong>${escapeHtml(tournament.tournament_name || "-")}</strong>`,
      `Dates: <strong>${escapeHtml(
        formatDateRange(tournament.start_date, tournament.end_date)
      )}</strong>`,
      `Event: <strong>${escapeHtml(event.event_name || "-")}</strong>`,
      `Registration ID: <strong>${escapeHtml(registration.id)}</strong>`,
      `Entry status: <strong>${escapeHtml(decision || "-")}</strong>`,
      `Current payment status: <strong>${escapeHtml(registration.payment_status || "-")}</strong>`
    ]
  });

  return sendMail({
    to,
    subject: `${decisionTitle} - ${tournament.tournament_name} - ${event.event_name}`,
    html: shell.html,
    text: shell.text
  });
}

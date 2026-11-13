// The "Eflow cleaned N emails" summary sent after an automatic cleanup.
// Plain, table-based HTML so it renders the same in Gmail, Outlook, Yahoo,
// AOL and Apple Mail, plus a text version. Sender names come from other
// people's emails, so everything inserted is escaped.

export type SummaryLang = "en" | "es";

export interface SummaryInput {
  lang: SummaryLang;
  cleaned: number;
  frequency: "weekly" | "biweekly";
  senders: { name: string; count: number }[];
  appUrl: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Names are shown as-is but trimmed, and stripped of anything that looks like
// a link, so a sender can't smuggle a clickable address into the email.
const cleanName = (s: string) =>
  s.replace(/https?:\/\/\S+/gi, "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 60) || "Unknown sender";

const fmt = (n: number, lang: SummaryLang) => n.toLocaleString(lang === "es" ? "es-419" : "en-US");

const COPY = {
  en: {
    subject: (n: string, f: string) => `Eflow cleaned ${n} ${n === "1" ? "email" : "emails"} ${f}`,
    period: { weekly: "this week", biweekly: "in the last 2 weeks" },
    heading: (n: string) => `${n} ${n === "1" ? "email" : "emails"} cleared from your inbox`,
    intro: "Your automatic cleanup just ran. Unopened promos and alerts at least 7 days old were moved to your Archive folder.",
    safe: "Nothing was deleted, and receipts, invoices and personal emails were left in your inbox.",
    topSenders: "Cleared the most",
    button: "Open Eflow",
    footer: "You're getting this because Automatic cleanup is on. To turn off these summaries or change how often it runs, open Account in Eflow.",
  },
  es: {
    subject: (n: string, f: string) => `Eflow limpió ${n} ${n === "1" ? "correo" : "correos"} ${f}`,
    period: { weekly: "esta semana", biweekly: "en las últimas 2 semanas" },
    heading: (n: string) => `${n} ${n === "1" ? "correo salió" : "correos salieron"} de tu bandeja de entrada`,
    intro: "Tu limpieza automática acaba de terminar. Las promociones y alertas sin abrir de al menos 7 días se movieron a tu carpeta Archivo.",
    safe: "No se eliminó nada, y los recibos, las facturas y los correos personales se quedaron en tu bandeja.",
    topSenders: "Lo que más se limpió",
    button: "Abrir Eflow",
    footer: "Recibes este correo porque la Limpieza automática está activada. Para dejar de recibir estos resúmenes o cambiar la frecuencia, abre Cuenta en Eflow.",
  },
} as const;

export function buildSummaryEmail(input: SummaryInput) {
  const c = COPY[input.lang] ?? COPY.en;
  const n = fmt(input.cleaned, input.lang);
  const link = `${input.appUrl}/?open=account`;
  const senders = input.senders.slice(0, 5).map((s) => ({ name: cleanName(s.name), count: fmt(s.count, input.lang) }));

  const subject = c.subject(n, c.period[input.frequency]);

  const senderRows = senders
    .map(
      (s) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee5d3;font-size:15px;color:#2b2b2b;">${escapeHtml(s.name)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee5d3;font-size:15px;color:#2b2b2b;text-align:right;font-weight:bold;">${s.count}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="${input.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f1e7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;border:2px solid #e6dcc8;">
        <tr><td style="padding:28px 28px 8px 28px;">
          <div style="font-size:22px;font-weight:bold;color:#2b2b2b;">Eflow</div>
        </td></tr>
        <tr><td style="padding:8px 28px 0 28px;">
          <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#2b2b2b;">${escapeHtml(c.heading(n))}</h1>
          <p style="margin:0 0 12px 0;font-size:16px;line-height:1.5;color:#4a4a4a;">${escapeHtml(c.intro)}</p>
          <p style="margin:0 0 20px 0;font-size:16px;line-height:1.5;color:#2f6b4f;font-weight:bold;">${escapeHtml(c.safe)}</p>
        </td></tr>
        ${
          senders.length
            ? `<tr><td style="padding:0 28px 8px 28px;">
          <div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;color:#7a7364;margin-bottom:4px;">${escapeHtml(c.topSenders)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${senderRows}</table>
        </td></tr>`
            : ""
        }
        <tr><td style="padding:20px 28px 28px 28px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#bfe3f2;color:#2b2b2b;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 28px;border-radius:14px;border:2px solid #a7cfe0;">${escapeHtml(c.button)}</a>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:16px 12px;font-size:12px;line-height:1.5;color:#7a7364;text-align:center;">
          ${escapeHtml(c.footer)}<br>Artexhaus LLC · <a href="${escapeHtml(input.appUrl)}" style="color:#7a7364;">eflowapp.org</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    c.heading(n),
    "",
    c.intro,
    c.safe,
    ...(senders.length ? ["", `${c.topSenders}:`, ...senders.map((s) => `- ${s.name}: ${s.count}`)] : []),
    "",
    `${c.button}: ${link}`,
    "",
    c.footer,
    "Artexhaus LLC",
  ].join("\n");

  return { subject, html, text };
}

// Sends through Resend's API. Returns false (and logs) instead of throwing:
// a summary that fails to send must never mark the cleanup itself as failed.
export async function sendSummaryEmail(to: string, email: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.error("auto-clean: RESEND_API_KEY is not set; skipping summary email.");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Eflow <summary@eflowapp.org>",
        to: [to],
        reply_to: "support@eflowapp.org",
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      console.error("auto-clean: summary email failed:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("auto-clean: summary email error:", err);
    return false;
  }
}

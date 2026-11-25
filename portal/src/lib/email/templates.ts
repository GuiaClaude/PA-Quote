import { formatDateTime } from "@/lib/dates";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#007C89;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 16px;font-size:18px"><span style="color:#00AEBF;font-weight:300">Print</span><span style="color:#E0295A;font-weight:800">Amplified</span></p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${bodyHtml}${button}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">This message was sent by the Print Amplified ordering app. If you didn't expect it, you can ignore it or reply to let us know.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export function inviteEmail(p: { company: string | null; inviter: string; url: string; expiresAt: string }) {
  const where = p.company ? `${p.company} on the Print Amplified ordering app` : "the Print Amplified staff app";
  const title = "You're invited";
  const text = `${p.inviter} invited you to ${where}.\n\nCreate your account: ${p.url}\n\nThis link works once and expires on ${formatDateTime(p.expiresAt)}.`;
  const html = layout(title,
    `<p>${esc(p.inviter)} invited you to ${esc(where)}.</p><p>The link works once and expires on <b>${esc(formatDateTime(p.expiresAt))}</b>.</p>`,
    { label: "Create my account", url: p.url });
  return { subject: `Invitation to ${p.company ?? "Print Amplified"}`, html, text };
}

export function newDeviceEmail(p: { name: string; when: string; userAgent: string | null; ip: string | null; url: string }) {
  const title = "New sign-in to your account";
  const device = p.userAgent ?? "Unknown device";
  const text = `Hi ${p.name},\n\nYour account was just used to sign in on a new device.\nWhen: ${formatDateTime(p.when)}\nDevice: ${device}\nIP: ${p.ip ?? "unknown"}\n\nIf this was you, you can ignore this email. If not, reset your password right away: ${p.url}`;
  const html = layout(title,
    `<p>Hi ${esc(p.name)},</p><p>Your account was just used to sign in on a new device.</p>
     <p style="background:#f4f6f8;padding:12px;border-radius:8px;font-size:14px">When: ${esc(formatDateTime(p.when))}<br>Device: ${esc(device)}<br>IP: ${esc(p.ip ?? "unknown")}</p>
     <p>If this was you, you can ignore this email. If not, reset your password right away.</p>`,
    { label: "Reset my password", url: p.url });
  return { subject: "New sign-in to your Print Amplified account", html, text };
}

export function inviteNeedsApprovalEmail(p: { company: string; email: string; inviter: string; url: string }) {
  const title = "Invite waiting for your approval";
  const text = `${p.inviter} (${p.company}) wants to invite ${p.email}, which is outside the company's approved email domains.\n\nReview it: ${p.url}`;
  const html = layout(title,
    `<p>${esc(p.inviter)} (${esc(p.company)}) wants to invite <b>${esc(p.email)}</b>, which is outside the company's approved email domains.</p>`,
    { label: "Review invite", url: p.url });
  return { subject: `Approve invite for ${p.company}`, html, text };
}

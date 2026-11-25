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

export function revisionSubmittedEmail(p: { company: string; item: string; round: number; by: string; changes: number; url: string }) {
  const title = `Revision ${p.round} requested: ${p.item}`;
  const text = `${p.by} (${p.company}) sent ${p.changes} change${p.changes === 1 ? "" : "s"} for ${p.item}.\n\nOpen the revision queue: ${p.url}`;
  return { subject: `${p.company} — ${title}`, text, html: layout(title, `<p>${esc(p.by)} (${esc(p.company)}) sent <b>${p.changes}</b> change${p.changes === 1 ? "" : "s"} for <b>${esc(p.item)}</b>.</p>`, { label: "Open revision", url: p.url }) };
}

export function proofReadyEmail(p: { item: string; round: number; message: string | null; url: string }) {
  const title = `Your revised proof is ready`;
  const text = `The revised proof for ${p.item} (Revision ${p.round}) is ready for your review.${p.message ? `\n\nNote from Print Amplified: ${p.message}` : ""}\n\nReview and approve: ${p.url}`;
  return { subject: `Revised proof ready: ${p.item}`, text, html: layout(title,
    `<p>The revised proof for <b>${esc(p.item)}</b> (Revision ${p.round}) is ready. Compare it with the previous version, then approve it or add more changes.</p>${p.message ? `<p style="background:#f4f6f8;padding:12px;border-radius:8px">${esc(p.message)}</p>` : ""}`,
    { label: "Review proof", url: p.url }) };
}

export function proofApprovedEmail(p: { company: string; item: string; round: number; by: string; url: string }) {
  const title = `Proof approved: ${p.item}`;
  const text = `${p.by} (${p.company}) approved Revision ${p.round} of ${p.item}. It is now Approved for Print.\n\n${p.url}`;
  return { subject: `${p.company} approved ${p.item}`, text, html: layout(title, `<p>${esc(p.by)} (${esc(p.company)}) approved Revision ${p.round} of <b>${esc(p.item)}</b>. It is now <b>Approved for Print</b>.</p>`, { label: "Open", url: p.url }) };
}

export function newOrderStaffEmail(p: { company: string; orderNo: string; item: string; quantity: number; url: string }) {
  const title = `New order ${p.orderNo}`;
  const text = `${p.company} placed ${p.orderNo}: ${p.item} × ${p.quantity.toLocaleString("en-PH")}. Please confirm it.\n\n${p.url}`;
  return { subject: `${p.company} — ${title}`, text, html: layout(title, `<p><b>${esc(p.company)}</b> placed <b>${esc(p.orderNo)}</b>: ${esc(p.item)} × ${p.quantity.toLocaleString("en-PH")}.</p><p>Please confirm it.</p>`, { label: "Open order", url: p.url }) };
}

export function quoteRequestStaffEmail(p: { company: string; requestNo: string; title: string; url: string }) {
  const title = `Quote request ${p.requestNo}`;
  const text = `${p.company} asked for a quote: ${p.title}.\n\n${p.url}`;
  return { subject: `${p.company} — ${title}`, text, html: layout(title, `<p><b>${esc(p.company)}</b> asked for a quote: ${esc(p.title)}.</p>`, { label: "Reply with a quote", url: p.url }) };
}

export function quoteReadyEmail(p: { title: string; quoteNo: string; validUntil: string | null; url: string }) {
  const title = "Your quote is ready";
  const text = `Your quote ${p.quoteNo} for ${p.title} is ready${p.validUntil ? ` (valid until ${p.validUntil})` : ""}. Accept it in one tap: ${p.url}`;
  return { subject: `Quote ready: ${p.title}`, text, html: layout(title, `<p>Your quote <b>${esc(p.quoteNo)}</b> for <b>${esc(p.title)}</b> is ready${p.validUntil ? `, valid until <b>${esc(p.validUntil)}</b>` : ""}.</p><p>Review it and accept it in one tap.</p>`, { label: "View quote", url: p.url }) };
}

import "server-only";
import { env } from "@/lib/env";
import { getSetting } from "@/lib/settings";

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends an email through Resend (https://resend.com). Without a
 * RESEND_API_KEY (local development) the email is printed to the server
 * console instead, so nothing is sent by accident.
 */
export async function sendEmail(email: Email): Promise<{ ok: boolean; id?: string; error?: string }> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    console.info(`[email:dev] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return { ok: true, id: "dev" };
  }
  const sender = await getSetting("email");
  const from = sender.from_email ? `${sender.from_name} <${sender.from_email}>` : e.EMAIL_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [email.to], subject: email.subject, html: email.html, text: email.text,
        reply_to: sender.reply_to || undefined,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body.message ?? `HTTP ${res.status}` };
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Minimal RFC 5322 / MIME builder for Gmail API `raw` messages.
const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const wrap = (b64) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

export function buildMime({ from, to, cc = [], subject, text, attachments = [], messageId, headers = {} }) {
  const boundary = `pa_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const lines = [];
  if (from) lines.push(`From: ${from}`);
  lines.push(`To: ${to.join(', ')}`);
  if (cc.length) lines.push(`Cc: ${cc.join(', ')}`);
  lines.push(`Subject: ${enc(subject)}`);
  if (messageId) lines.push(`Message-ID: ${messageId}`);
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  lines.push('MIME-Version: 1.0');
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '');
  lines.push(`--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', wrap(Buffer.from(text, 'utf8').toString('base64')));
  for (const a of attachments) {
    lines.push(`--${boundary}`, `Content-Type: ${a.contentType}; name="${a.filename}"`, `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64', '', wrap(Buffer.from(a.content).toString('base64')));
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

export const toBase64Url = (s) => Buffer.from(s).toString('base64url');

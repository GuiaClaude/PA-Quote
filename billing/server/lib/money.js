// Money is handled as integer centavos to avoid floating-point drift.

export function toCents(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    return Math.round(v * 100);
  }
  const s = String(v).replace(/[₱,\s]/g, '').replace(/^PHP/i, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] || 0) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

export function fromCents(c) {
  if (c === null || c === undefined) return null;
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function formatPHP(c) {
  if (c === null || c === undefined) return '—';
  const neg = c < 0;
  const a = Math.abs(c);
  const whole = Math.floor(a / 100).toLocaleString('en-US');
  return `${neg ? '-' : ''}PHP ${whole}.${String(a % 100).padStart(2, '0')}`;
}

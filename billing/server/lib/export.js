import ExcelJS from 'exceljs';
import { renderPdf, table } from './pdf.js';
import { fromCents, formatPHP } from './money.js';

const cell = (c, v) => (v === null || v === undefined ? '' : c.money ? fromCents(v) : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : v);
const csvEsc = (v) => {
  const s = String(v ?? '');
  // Neutralise spreadsheet formula injection in exported text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const summaryRows = (r) => Object.entries(r.summary || {}).map(([k, v]) => [k, typeof v === 'number' && /amount|receiv|billing|collect|value|overdue|outstanding|credit|debit|adjust|closing|opening/i.test(k) && !/count|reconciles|Pct/i.test(k) ? fromCents(v) : v]);

export function toCSV(report) {
  const out = [[report.title], [`As of`, report.asOf], []];
  if (report.summary) { out.push(['Summary']); summaryRows(report).forEach((r) => out.push(r)); out.push([]); }
  for (const s of report.sections || []) {
    out.push([s.title]);
    out.push(s.columns.map((c) => c.label));
    for (const r of s.rows) out.push(s.columns.map((c) => cell(c, r[c.key])));
    out.push([]);
  }
  return out.map((r) => r.map(csvEsc).join(',')).join('\r\n');
}

export async function toXLSX(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PA Billing';
  const sum = wb.addWorksheet('Summary');
  sum.addRow([report.title]).font = { bold: true, size: 14 };
  sum.addRow(['As of', report.asOf]);
  summaryRows(report).forEach((r) => sum.addRow(r));
  (report.checks || []).forEach((c) => sum.addRow(['CHECK FAILED', JSON.stringify(c)]));
  sum.columns.forEach((c) => { c.width = 34; });
  const used = new Set();
  for (const s of report.sections || []) {
    let name = s.title.replace(/[\\/?*[\]:]/g, '').slice(0, 28);
    while (used.has(name)) name = `${name.slice(0, 26)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(s.columns.map((c) => c.label)).font = { bold: true };
    for (const r of s.rows) ws.addRow(s.columns.map((c) => (c.money && r[c.key] != null ? Number(r[c.key]) / 100 : cell(c, r[c.key]))));
    s.columns.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.money ? 16 : 24; if (c.money) col.numFmt = '#,##0.00'; });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPDF(report) {
  return renderPdf((doc) => {
    doc.font('Helvetica-Bold').fontSize(14).text(report.title);
    doc.font('Helvetica').fontSize(9).text(`As of ${report.asOf}  ·  generated ${new Date().toISOString()}`);
    doc.moveDown();
    for (const [k, v] of summaryRows(report)) doc.text(`${k}: ${v}`);
    for (const c of report.checks || []) doc.fillColor('#b00020').text(`Reconciliation check failed: ${JSON.stringify(c)}`).fillColor('#000');
    for (const s of report.sections || []) {
      doc.moveDown().font('Helvetica-Bold').fontSize(11).text(s.title).font('Helvetica');
      const w = (doc.page.width - 72) / s.columns.length;
      const rows = s.rows.map((r) => Object.fromEntries(s.columns.map((c) => [c.key, c.money ? r[c.key] : cell(c, r[c.key])])));
      table(doc, s.columns.map((c) => ({ ...c, width: w })), rows.length ? rows : [{ [s.columns[0].key]: '(none)' }], { fontSize: 7 });
    }
  });
}
export { formatPHP };

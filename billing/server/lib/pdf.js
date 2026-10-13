import PDFDocument from 'pdfkit';
import { formatPHP } from './money.js';

const fmt = (c) => (c === null || c === undefined ? '' : formatPHP(c).replace('PHP ', ''));

export function renderPdf(build, { landscape = true } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, info: { Producer: 'PA Billing', Creator: 'PA Billing' } });
    // Fixed creation date keeps identical statements byte-identical (stable hash) when re-rendered.
    doc.info.CreationDate = new Date(0);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

/** Simple paginated table. cols: [{key,label,width,align,money}] */
export function table(doc, cols, rows, { fontSize = 8 } = {}) {
  const x0 = doc.page.margins.left;
  const drawHeader = () => {
    let x = x0;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const hh = Math.max(...cols.map((c) => doc.heightOfString(c.label, { width: c.width - 4 }))) + 6;
    doc.rect(x0, y - 2, cols.reduce((s, c) => s + c.width, 0), hh).fill('#e8f6f7').fillColor('#000');
    for (const c of cols) { doc.text(c.label, x + 2, y + 1, { width: c.width - 4, align: c.align || (c.money ? 'right' : 'left') }); x += c.width; }
    doc.y = y + hh;
    doc.font('Helvetica').fontSize(fontSize);
  };
  drawHeader();
  for (const r of rows) {
    const h = Math.max(...cols.map((c) => doc.heightOfString(String(c.money ? fmt(r[c.key]) : r[c.key] ?? ''), { width: c.width - 4 }))) + 4;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); drawHeader(); }
    const y = doc.y;
    let x = x0;
    doc.font(r._bold ? 'Helvetica-Bold' : 'Helvetica');
    for (const c of cols) {
      doc.text(String(c.money ? fmt(r[c.key]) : r[c.key] ?? ''), x + 2, y + 2, { width: c.width - 4, align: c.align || (c.money ? 'right' : 'left') });
      x += c.width;
    }
    doc.moveTo(x0, y + h).lineTo(x, y + h).strokeColor('#dddddd').stroke().strokeColor('#000');
    doc.y = y + h;
  }
  doc.font('Helvetica');
  doc.x = x0;
}

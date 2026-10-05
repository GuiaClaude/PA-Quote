/**
 * Synthetic seed data: about 12 months of made-up activity for a PH printing business.
 * Every name, TIN and amount here is invented. Real sample files are never read.
 *
 *   pnpm db:seed      (run after pnpm db:migrate)
 *
 * Documents are created through the same services the app uses, signed in as the
 * demo Owner, so posting rules, RLS and database checks are all exercised.
 */

import { DEFAULT_ACCOUNTS, DEFAULT_EXPENSE_CATEGORIES, normalSide, SYS } from "../src/lib/domain/coa";
import { addDays, addMonths, manilaToday, type ISODate } from "../src/lib/domain/dates";
import { ceKey } from "../src/lib/domain/parties";
import { sql, withUser, type Tx } from "../src/server/db";
import { createApPayment, createBilling, createCollection, createPurchase } from "../src/server/documents";
import { postOpeningEntry } from "../src/server/ledger";

// Deterministic pseudo-random numbers so every seed run gives the same data.
let state = 20261005;
const rnd = () => ((state = (state * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pesos = (lo: number, hi: number, step = 50) => Math.round(between(lo, hi) / step) * step * 100;

const USERS = [
  { email: "owner@demo.local", name: "Demo Owner", role: "owner" },
  { email: "bookkeeper@demo.local", name: "Demo Bookkeeper", role: "bookkeeper" },
  { email: "viewer@demo.local", name: "Demo Viewer", role: "viewer" },
] as const;

// Invented clients. payDays = how long they usually take to pay after billing.
const CLIENTS = [
  { name: "Acme Learning Center Inc.", tin: "201-111-001-000", terms: 30, cwt: 200, payDays: 35, code: "ALC" },
  { name: "Bluefin Trading Corp.", tin: "201-111-002-000", terms: 30, cwt: 100, payDays: 28, code: "BTC" },
  { name: "BLUE FINN TRADING CORPORATION", tin: null, terms: 30, cwt: 100, payDays: 30, code: "BFT" }, // near-duplicate on purpose
  { name: "Coralview Hotel & Suites", tin: "201-111-003-000", terms: 60, cwt: 200, payDays: 75, code: "CHS" },
  { name: "Dagat Foods Manufacturing Corp.", tin: "201-111-004-000", terms: 30, cwt: 100, payDays: 45, code: "DFM" },
  { name: "Evergreen Motors Philippines Inc.", tin: "201-111-005-000", terms: 60, cwt: 200, payDays: 62, code: "EMP" },
  { name: "Fiesta Events Studio", tin: "201-111-006-000", terms: 0, cwt: 0, payDays: 0, code: "FES" },
  { name: "Gintong Ani Cooperative", tin: "201-111-007-000", terms: 30, cwt: 0, payDays: 20, code: "GAC" },
  { name: "Harbor Logistics Solutions Inc.", tin: "201-111-008-000", terms: 30, cwt: 200, payDays: 95, code: "HLS" },
  { name: "Isla Wellness Clinic", tin: "201-111-009-000", terms: 15, cwt: 0, payDays: 14, code: "IWC" },
  { name: "Juan Dela Cruz Design Co.", tin: "201-111-010-000", terms: 0, cwt: 0, payDays: 0, code: "JDC" },
  { name: "Kalayaan University Foundation", tin: "201-111-011-000", terms: 60, cwt: 200, payDays: 80, code: "KUF" },
  { name: "Lakbay Travel & Tours", tin: "201-111-012-000", terms: 30, cwt: 200, payDays: 33, code: "LTT" },
  { name: "Mabuhay Realty Holdings Inc.", tin: "201-111-013-000", terms: 30, cwt: 200, payDays: 40, code: "MRH" },
  { name: "Northstar Pharma Distribution", tin: "201-111-014-000", terms: 60, cwt: 100, payDays: 58, code: "NPD" },
  { name: "Orion Business Process Inc.", tin: "201-111-015-000", terms: 30, cwt: 200, payDays: 31, code: "OBP" },
] as const;

const SUPPLIERS = [
  { name: "Papel Masa Paper Trading", tin: "301-222-001-000", type: "goods", vat: "vat", terms: 60, cat: "Paper" },
  { name: "Inkwell Supplies Corp.", tin: "301-222-002-000", type: "goods", vat: "vat", terms: 30, cat: "Supplies - Press" },
  { name: "PlateTech CTP Services", tin: "301-222-003-000", type: "services", vat: "vat", terms: 30, cat: "CTP/Negatives" },
  { name: "Tahi Bindery Works", tin: "301-222-004-000", type: "services", vat: "non_vat", terms: 15, cat: "Bindery" },
  { name: "Kintab Finishing & Lamination", tin: "301-222-005-000", type: "services", vat: "vat", terms: 30, cat: "Finish" },
  { name: "Diecut Masters", tin: "301-222-006-000", type: "services", vat: "non_vat", terms: 15, cat: "Postpress" },
  { name: "BigPrint Outsourcing Inc.", tin: "301-222-007-000", type: "services", vat: "vat", terms: 30, cat: "Job-Out" },
  { name: "Metro Power Distribution", tin: "301-222-008-000", type: "utilities", vat: "vat", terms: 15, cat: "Electricity" },
  { name: "TeleLink Fiber", tin: "301-222-009-000", type: "utilities", vat: "vat", terms: 15, cat: "Tel./Comm." },
  { name: "Gusali Property Leasing", tin: "301-222-010-000", type: "rental", vat: "vat", terms: 0, cat: "Rental" },
  { name: "Bantay Security Agency", tin: "301-222-011-000", type: "services", vat: "vat", terms: 30, cat: "Repairs - Main Office/Press Area" },
  { name: "Gasolinahan Fuel Station", tin: "301-222-012-000", type: "goods", vat: "vat", terms: 0, cat: "Transpo" },
  { name: "Kainan Catering", tin: "301-222-013-000", type: "goods", vat: "vat", terms: 0, cat: "Meals" },
  { name: "Opisina Office Depot", tin: "301-222-014-000", type: "goods", vat: "vat", terms: 0, cat: "Supplies - Office" },
  { name: "Ayos Machine Repair", tin: "301-222-015-000", type: "services", vat: "non_vat", terms: 15, cat: "Repairs - Main Machine" },
] as const;

const JOBS = [
  ["Business Cards", 3_000, 25_000],
  ["Flyers", 8_000, 60_000],
  ["Brochures", 15_000, 120_000],
  ["Stickers", 5_000, 45_000],
  ["Catalog", 60_000, 380_000],
  ["Packaging Box", 40_000, 300_000],
  ["Envelopes", 6_000, 35_000],
  ["Letterhead", 4_000, 20_000],
  ["Diploma/TOR", 20_000, 90_000],
  ["Calendars", 25_000, 160_000],
] as const;

async function main() {
  if (process.argv.includes("--if-empty")) {
    const [o] = await sql<{ n: number }[]>`select count(*)::int as n from organizations`;
    if (o!.n > 0) {
      console.log("Demo data already present; keeping it.");
      await sql.end();
      return;
    }
  }
  const today = manilaToday();
  const firstMonth = addMonths(today.slice(0, 8) + "01", -12);

  // Users and organisation (server role; RLS is exercised for documents below).
  await sql`delete from auth.users where email like '%@demo.local'`;
  await sql`delete from organizations where name = 'Print Amplified OPC (demo)'`;
  const users: Record<string, string> = {};
  for (const u of USERS) {
    const [r] = await sql<{ id: string }[]>`insert into auth.users (email) values (${u.email}) returning id`;
    users[u.role] = r!.id;
    await sql`insert into profiles (user_id, full_name, email) values (${r!.id}, ${u.name}, ${u.email})`;
  }
  const [org] = await sql<{ id: string }[]>`
    insert into organizations (name, legal_name, tin, rdo_code, address, books_start_date)
    values ('Print Amplified OPC (demo)', 'PRINT AMPLIFIED OPC', '123456789', '000', 'Demo address, Metro Manila', '2023-01-01')
    returning id`;
  const orgId = org!.id;
  for (const u of USERS) await sql`insert into memberships (org_id, user_id, role) values (${orgId}, ${users[u.role]!}, ${u.role})`;

  await withUser({ userId: users.owner! }, async (tx) => {
    await seedSetup(tx, orgId);
    await seedOpening(tx, orgId);
    const clientIds = await seedClients(tx, orgId);
    const supplierIds = await seedSuppliers(tx, orgId);
    await seedSales(tx, orgId, clientIds, firstMonth, today);
    await seedPurchases(tx, orgId, supplierIds, firstMonth, today);
  });

  const [c] = await sql<{ billings: number; collections: number; purchases: number; entries: number }[]>`
    select (select count(*)::int from billings where org_id = ${orgId}) as billings,
           (select count(*)::int from collections where org_id = ${orgId}) as collections,
           (select count(*)::int from purchases where org_id = ${orgId}) as purchases,
           (select count(*)::int from journal_entries where org_id = ${orgId}) as entries`;
  console.log(`Seeded ${c!.billings} billings, ${c!.collections} collections, ${c!.purchases} bills, ${c!.entries} journal entries.`);
  console.log("Demo logins (local preview): owner@demo.local, bookkeeper@demo.local, viewer@demo.local");
  await sql.end();
}

async function seedSetup(tx: Tx, orgId: string) {
  await tx`insert into accounts ${tx(
    DEFAULT_ACCOUNTS.map((a) => ({
      org_id: orgId, code: a.code, name: a.name, type: a.type, subtype: a.subtype ?? null, normal_side: normalSide(a.type),
      is_system: a.system ?? false, tax_tag: a.taxTag ?? null, bir_summary_column: a.birColumn ?? null, purchase_class: a.purchaseClass ?? null,
    })),
  )}`;
  const acct = new Map((await tx<{ id: string; code: string }[]>`select id, code from accounts where org_id = ${orgId}`).map((r) => [r.code, r.id]));
  await tx`insert into expense_categories ${tx(
    DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ org_id: orgId, name: c.name, expense_type: c.expenseType, account_id: acct.get(c.account)! })),
  )}`;
  const banks = [
    { name: "BPI Current", bank: "BPI", account_no_masked: "••••1234", type: "current", code: SYS.bpiCurrent },
    { name: "BPI Savings", bank: "BPI", account_no_masked: "••••5678", type: "savings", code: SYS.bpiSavings },
    { name: "GCash", bank: "GCash", account_no_masked: "••••9012", type: "ewallet", code: SYS.gcash },
    { name: "Spenmo Wallet", bank: "Spenmo", account_no_masked: null, type: "ewallet", code: SYS.spenmo },
    { name: "Cash on Hand", bank: null, account_no_masked: null, type: "cash", code: SYS.cashOnHand },
    { name: "Cheques on Hand (undeposited)", bank: null, account_no_masked: null, type: "clearing", code: SYS.undeposited },
  ];
  await tx`insert into bank_accounts ${tx(banks.map(({ code, ...b }) => ({ ...b, org_id: orgId, gl_account_id: acct.get(code)! })))}`;
  await tx`insert into tax_settings (org_id) values (${orgId})`;
  await tx`insert into vat_basis_periods ${tx([
    { org_id: orgId, start_date: "2023-01-01", end_date: "2024-03-31", basis: "collected", note: "Before EOPT: output VAT on collections (confirm with accountant)" },
    { org_id: orgId, start_date: "2024-04-01", end_date: null, basis: "billed", note: "EOPT: output VAT when the sales invoice is issued" },
  ])}`;
}

async function seedOpening(tx: Tx, orgId: string) {
  // Made-up opening trial balance as of 12/31/2022.
  await postOpeningEntry(tx, orgId, {
    date: "2022-12-31",
    memo: "Opening balances as of 12/31/2022 (demo figures)",
    lines: [
      { account: SYS.bpiCurrent, debit: 85_000_000, credit: 0 },
      { account: SYS.cashOnHand, debit: 2_000_000, credit: 0 },
      { account: "1500", debit: 240_000_000, credit: 0 },
      { account: "1510", debit: 18_000_000, credit: 0 },
      { account: "1590", debit: 0, credit: 96_000_000 },
      { account: "3010", debit: 0, credit: 100_000_000 },
      { account: SYS.retainedEarnings, debit: 0, credit: 149_000_000 },
    ],
  });
}

async function seedClients(tx: Tx, orgId: string) {
  const ids: { id: string; c: (typeof CLIENTS)[number] }[] = [];
  for (const c of CLIENTS) {
    const digits = c.tin?.replace(/\D/g, "") ?? null;
    const [r] = await tx<{ id: string }[]>`
      insert into clients (org_id, name, tin, tin_branch, address, terms_days, cwt_rate_bp, contact_person, email)
      values (${orgId}, ${c.name}, ${digits ? digits.slice(0, 9) : null}, ${digits ? digits.slice(9) : null}, ${"Demo address"},
              ${c.terms}, ${c.cwt}, ${"Accounts Payable Dept."}, ${`ap@${c.code.toLowerCase()}.example`})
      returning id`;
    ids.push({ id: r!.id, c });
  }
  return ids;
}

async function seedSuppliers(tx: Tx, orgId: string) {
  const cats = new Map((await tx<{ id: string; name: string }[]>`select id, name from expense_categories where org_id = ${orgId}`).map((r) => [r.name, r.id]));
  const out: { id: string; s: (typeof SUPPLIERS)[number]; categoryId: string }[] = [];
  for (const s of SUPPLIERS) {
    const digits = s.tin.replace(/\D/g, "");
    const categoryId = cats.get(s.cat)!;
    const [r] = await tx<{ id: string }[]>`
      insert into suppliers (org_id, name, tin, tin_branch, address, terms_days, vat_status, supplier_type, default_category_id)
      values (${orgId}, ${s.name}, ${digits.slice(0, 9)}, ${digits.slice(9)}, ${"Demo address"}, ${s.terms}, ${s.vat}, ${s.type}, ${categoryId})
      returning id`;
    out.push({ id: r!.id, s, categoryId });
  }
  return out;
}

async function seedSales(tx: Tx, orgId: string, clients: { id: string; c: (typeof CLIENTS)[number] }[], firstMonth: ISODate, today: ISODate) {
  const banks = new Map((await tx<{ id: string; name: string }[]>`select id, name from bank_accounts where org_id = ${orgId}`).map((r) => [r.name, r.id]));
  let invoiceNo = 1200;
  let receiptNo = 5400;
  const ceCounters: Record<string, number> = {};
  const payQueue: { date: ISODate; billingId: string; clientId: string; gross: number; net: number; cwtBp: number; partial: boolean }[] = [];

  for (let month = firstMonth; month <= today; month = addMonths(month, 1)) {
    const seasonal = [1.0, 0.85, 1.0, 1.1, 1.15, 1.25, 0.9, 1.0, 1.05, 1.1, 1.3, 1.45][Number(month.slice(5, 7)) - 1]!;
    const n = Math.round(between(9, 14) * seasonal);
    for (let i = 0; i < n; i++) {
      const date = addDays(month, between(0, 27));
      if (date > today) continue;
      const { id: clientId, c } = pick(clients);
      const [job, lo, hi] = pick(JOBS);
      const gross = pesos(lo, hi) * (seasonal > 1.2 ? 1.2 : 1);
      const year = date.slice(0, 4);
      const ceNo = `CE# ${c.code}${year}-${String((ceCounters[c.code + year] = (ceCounters[c.code + year] ?? 0) + 1)).padStart(3, "0")}`;
      const [proj] = await tx<{ id: string }[]>`
        insert into projects (org_id, ce_number, ce_key, client_id, name, job_type, quoted_c, status, start_date)
        values (${orgId}, ${ceNo}, ${ceKey(ceNo)}, ${clientId}, ${`${job} – ${c.code}`}, ${job}, ${Math.round(gross)}, 'billed', ${date})
        returning id`;
      const qty = pick([100, 250, 500, 1000, 2000, 5000]);
      const unit = Math.round(gross / qty);
      const billingId = await createBilling(tx, orgId, {
        clientId, projectId: proj!.id, docType: "sales_invoice", docNo: String(invoiceNo++).padStart(4, "0"), billingDate: date,
        termsDays: c.terms, poNumber: rnd() > 0.5 ? `PO-${between(10000, 99999)}` : null, jobType: job,
        description: `${job} – ${qty.toLocaleString("en-US")} pcs`, vatTreatment: "vat", cwtRateBp: c.cwt,
        lines: [{ description: `${job} (${qty.toLocaleString("en-US")} pcs)`, qty, unitPrice: unit }],
      });
      const [b] = await tx<{ gross_c: number; net_c: number }[]>`select gross_c, net_c from billings where id = ${billingId}`;
      // Payment timing follows the client's habit, with noise; ~6% never paid (bad/slow accounts).
      if (rnd() < 0.06 && c.payDays > 60) continue;
      const payDate = addDays(date, Math.max(0, c.payDays + between(-7, 12)));
      payQueue.push({ date: payDate, billingId, clientId, gross: b!.gross_c, net: b!.net_c, cwtBp: c.cwt, partial: c.terms >= 60 && rnd() < 0.25 });
    }
  }

  payQueue.sort((a, b) => a.date.localeCompare(b.date));
  for (const p of payQueue) {
    if (p.date > today) continue;
    const cwt = Math.round((p.net * p.cwtBp) / 10000);
    const full = p.gross - cwt;
    const mode = pick(["online_bank", "online_bank", "cheque_pickup", "bank_deposit", "gcash", "bank_wire"] as const);
    const depositAccountId = mode === "gcash" ? banks.get("GCash")! : banks.get("BPI Current")!;
    if (p.partial) {
      const half = Math.round(full / 2);
      await createCollection(tx, orgId, {
        clientId: p.clientId, collectionDate: p.date, receiptType: "collection_receipt", receiptNo: String(receiptNo++),
        paymentMode: mode, depositAccountId, cash: half, allocations: [{ billingId: p.billingId, applied: half, cwt: 0 }],
        remarks: "1st partial",
      });
      const second = addDays(p.date, between(20, 40));
      if (second <= today) {
        await createCollection(tx, orgId, {
          clientId: p.clientId, collectionDate: second, receiptType: "collection_receipt", receiptNo: String(receiptNo++),
          paymentMode: mode, depositAccountId, cash: full - half, allocations: [{ billingId: p.billingId, applied: full - half, cwt }],
          form2307Status: cwt > 0 ? (rnd() < 0.7 ? "received" : "pending") : "not_required", remarks: "Full payment",
        });
      }
    } else {
      await createCollection(tx, orgId, {
        clientId: p.clientId, collectionDate: p.date, receiptType: "collection_receipt", receiptNo: String(receiptNo++),
        paymentMode: mode, depositAccountId, cash: full, allocations: [{ billingId: p.billingId, applied: full, cwt }],
        form2307Status: cwt > 0 ? (rnd() < 0.7 ? "received" : "pending") : "not_required",
      });
    }
  }
  // A follow-up note on a few overdue billings (Taglish, as in the real workflow).
  const overdue = await tx<{ id: string }[]>`
    select id from v_billing_balances where org_id = ${orgId} and balance_c > 0 and due_date < ${today} order by due_date limit 4`;
  const notes = ["Nag-follow up via email, for processing na raw sa accounting.", "Tumawag kay AP, i-release daw next week.", "Need ng revised SOA, sinend na.", "Waiting for check pickup schedule."];
  for (const [i, o] of overdue.entries()) {
    await tx`insert into follow_up_notes (org_id, billing_id, note, next_follow_up_date) values (${orgId}, ${o.id}, ${notes[i]!}, ${addDays(today, 3 + i)})`;
  }
}

async function seedPurchases(tx: Tx, orgId: string, suppliers: { id: string; s: (typeof SUPPLIERS)[number]; categoryId: string }[], firstMonth: ISODate, today: ISODate) {
  const banks = new Map((await tx<{ id: string; name: string }[]>`select id, name from bank_accounts where org_id = ${orgId}`).map((r) => [r.name, r.id]));
  const ranges: Record<string, [number, number, number]> = {
    // category: [min, max, bills per month]
    Paper: [25_000, 180_000, 4], "Supplies - Press": [5_000, 40_000, 2], "CTP/Negatives": [6_000, 30_000, 3], Bindery: [3_000, 25_000, 2],
    Finish: [4_000, 35_000, 2], Postpress: [2_000, 18_000, 1], "Job-Out": [15_000, 120_000, 1], Electricity: [28_000, 46_000, 1],
    "Tel./Comm.": [3_500, 3_500, 1], Rental: [65_000, 65_000, 1], "Repairs - Main Office/Press Area": [2_000, 15_000, 1],
    Transpo: [1_500, 6_000, 4], Meals: [800, 6_500, 3], "Supplies - Office": [1_000, 9_000, 2], "Repairs - Main Machine": [5_000, 45_000, 1],
  };
  let ref = 80000;
  const bills: { id: string; supplierId: string; due: ISODate; total: number; ewt: number; date: ISODate; cash: boolean }[] = [];
  for (let month = firstMonth; month <= today; month = addMonths(month, 1)) {
    for (const sup of suppliers) {
      const [lo, hi, perMonth] = ranges[sup.s.cat]!;
      const count = sup.s.cat === "Rental" || sup.s.cat === "Electricity" || sup.s.cat === "Tel./Comm." ? 1 : between(Math.max(0, perMonth - 1), perMonth + 1);
      for (let i = 0; i < count; i++) {
        const date = sup.s.cat === "Rental" ? addDays(month, 0) : addDays(month, between(0, 27));
        if (date > today) continue;
        const gross = pesos(lo, hi, lo < 5000 ? 10 : 50);
        const noReceipt = (sup.s.cat === "Transpo" || sup.s.cat === "Meals") && rnd() < 0.2;
        const id = await createPurchase(tx, orgId, {
          supplierId: sup.id, docType: noReceipt ? "none" : sup.s.vat === "vat" ? "sales_invoice" : "official_receipt",
          referenceNo: noReceipt ? null : String(ref++), invoiceDate: date, termsDays: sup.s.terms,
          vatTreatment: sup.s.vat === "vat" ? "vat" : "non_vat", noReceipt, ewtRateBp: sup.s.cat === "Rental" ? 500 : 0,
          description: sup.s.cat, lines: [{ categoryId: sup.categoryId, gross }],
        });
        const [p] = await tx<{ total_c: number; ewt_c: number; due_date: string }[]>`select total_c, ewt_c, due_date from purchases where id = ${id}`;
        bills.push({ id, supplierId: sup.id, due: p!.due_date, total: p!.total_c, ewt: p!.ewt_c, date, cash: sup.s.terms === 0 });
      }
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));
  for (const b of bills) {
    const payDate = b.cash ? b.date : addDays(b.due, between(-5, 10));
    if (payDate > today) continue;
    const mode = b.cash ? pick(["cash", "gcash_spenmo"] as const) : pick(["bizlink", "bizlink", "bank_transfer_spenmo", "cheque"] as const);
    const from = mode === "cash" ? "Cash on Hand" : mode === "gcash_spenmo" || mode === "bank_transfer_spenmo" ? "Spenmo Wallet" : "BPI Current";
    await createApPayment(tx, orgId, {
      supplierId: b.supplierId, paymentDate: payDate, paymentMode: mode, paidFromAccountId: banks.get(from)!,
      referenceNo: mode === "bizlink" ? `BL${between(1_000_000, 9_999_999)}` : null,
      allocations: [{ purchaseId: b.id, applied: b.total - b.ewt }],
    });
  }
  // Treasury moves so wallets don't go negative: top up Spenmo and petty cash from BPI at the start of
  // each month (by that month's spending), and sweep GCash collections into BPI at month end.
  const { postManualEntry } = await import("../src/server/ledger");
  for (let month = firstMonth; month <= today; month = addMonths(month, 1)) {
    const monthEnd = addDays(addMonths(month, 1), -1);
    const [m] = await tx<{ spenmo: number; cash: number; gcash: number }[]>`
      select
        (select coalesce(sum(p.amount_c), 0) from ap_payments p join bank_accounts b on b.id = p.paid_from_account_id
          where p.org_id = ${orgId} and b.name = 'Spenmo Wallet' and p.payment_date between ${month} and ${monthEnd})::bigint as spenmo,
        (select coalesce(sum(p.amount_c), 0) from ap_payments p join bank_accounts b on b.id = p.paid_from_account_id
          where p.org_id = ${orgId} and b.name = 'Cash on Hand' and p.payment_date between ${month} and ${monthEnd})::bigint as cash,
        (select coalesce(sum(c.cash_c), 0) from collections c join bank_accounts b on b.id = c.deposit_account_id
          where c.org_id = ${orgId} and b.name = 'GCash' and c.collection_date between ${month} and ${monthEnd})::bigint as gcash`;
    const moves: [string, string, number, string, ISODate][] = [
      [SYS.spenmo, SYS.bpiCurrent, m!.spenmo, "Spenmo wallet top-up from BPI", month],
      [SYS.cashOnHand, SYS.bpiCurrent, m!.cash, "Petty cash replenishment from BPI", month],
      [SYS.bpiCurrent, SYS.gcash, Math.round(m!.gcash * 0.9), "Transfer GCash collections to BPI", monthEnd < today ? monthEnd : today],
    ];
    for (const [to, from, amount, memo, date] of moves) {
      if (amount <= 0) continue;
      await postManualEntry(tx, orgId, { date, memo, lines: [{ account: to, debit: amount, credit: 0 }, { account: from, debit: 0, credit: amount }] });
    }
  }
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});

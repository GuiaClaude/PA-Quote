import { describe, expect, it } from "vitest";
import { SYS } from "./coa";
import { splitVatInclusive, sum } from "./money";
import {
  allocateProportionally,
  finalize,
  postApPayment,
  postBilling,
  postCollection,
  postPurchase,
  PostingError,
  reverseEntry,
  type BillingForPosting,
  type DraftEntry,
} from "./posting";

const totals = (e: DraftEntry) => ({ debit: sum(e.lines.map((l) => l.debit)), credit: sum(e.lines.map((l) => l.credit)) });
const byAccount = (e: DraftEntry) => {
  const m: Record<string, number> = {};
  for (const l of e.lines) m[l.account] = (m[l.account] ?? 0) + l.debit - l.credit;
  return m;
};

const billing = (over: Partial<BillingForPosting> = {}): BillingForPosting => ({
  id: "b1",
  docLabel: "SI 0412",
  billingDate: "2026-09-10",
  clientId: "c1",
  status: "billed",
  vatTreatment: "vat",
  vatBasis: "billed",
  gross: 1_120_000,
  net: 1_000_000,
  vat: 120_000,
  lines: [{ amount: 1_120_000 }],
  ...over,
});

describe("billing", () => {
  it("₱11,200 VAT sale: Dr AR 11,200 / Cr Revenue 10,000 / Cr Output VAT 1,200", () => {
    const e = postBilling(billing())!;
    expect(byAccount(e)).toEqual({ [SYS.ar]: 1_120_000, [SYS.revenueDefault]: -1_000_000, [SYS.outputVat]: -120_000 });
  });
  it("collected basis credits Deferred Output VAT instead", () => {
    const e = postBilling(billing({ vatBasis: "collected" }))!;
    expect(byAccount(e)[SYS.deferredOutputVat]).toBe(-120_000);
    expect(byAccount(e)[SYS.outputVat]).toBeUndefined();
  });
  it("splits revenue across lines and accounts, exactly", () => {
    const e = postBilling(
      billing({
        gross: 1_000_001,
        ...splitVatInclusive(1_000_001),
        lines: [
          { amount: 333_334, revenueAccount: "4010" },
          { amount: 333_334, revenueAccount: "4020" },
          { amount: 333_333, revenueAccount: "4040" },
        ],
      }),
    )!;
    expect(totals(e).debit).toBe(totals(e).credit);
    const rev = -(byAccount(e)["4010"]! + byAccount(e)["4020"]! + byAccount(e)["4040"]!);
    expect(rev).toBe(splitVatInclusive(1_000_001).net);
  });
  it("zero-rated sale has no VAT line", () => {
    const e = postBilling(billing({ vatTreatment: "zero_rated", net: 1_120_000, vat: 0 }))!;
    expect(e.lines.map((l) => l.account).sort()).toEqual([SYS.ar, SYS.revenueDefault].sort());
  });
  it("drafts, voids and rejected billings do not post", () => {
    for (const status of ["draft", "void", "rejected"]) expect(postBilling(billing({ status }))).toBeNull();
  });
  it("refuses inconsistent amounts", () => {
    expect(() => postBilling(billing({ net: 999_999 }))).toThrow(PostingError);
    expect(() => postBilling(billing({ vatTreatment: "exempt" }))).toThrow(PostingError);
  });
});

describe("collection", () => {
  const alloc = (over = {}) => ({
    billingId: "b1",
    billingLabel: "SI 0412",
    applied: 1_100_000,
    cwt: 20_000,
    billing: { gross: 1_120_000, vat: 120_000, vatBasis: "billed" as const },
    deferredVatRemaining: 0,
    settlesBilling: true,
    ...over,
  });

  it("cash ₱11,000 + 2% CWT ₱200 settles ₱11,200", () => {
    const e = postCollection({
      id: "c", label: "OR 1001", collectionDate: "2026-10-01", clientId: "c1", depositAccount: SYS.bpiCurrent,
      cash: 1_100_000, cwt: 20_000, allocations: [alloc()],
    });
    expect(byAccount(e)).toEqual({ [SYS.bpiCurrent]: 1_100_000, [SYS.cwt]: 20_000, [SYS.ar]: -1_120_000 });
  });

  it("collected basis: half payment moves half the deferred VAT; final payment clears the rest", () => {
    const first = postCollection({
      id: "c", label: "AR 1", collectionDate: "2026-10-01", clientId: "c1", depositAccount: SYS.gcash,
      cash: 560_000, cwt: 0,
      allocations: [alloc({ applied: 560_000, cwt: 0, billing: { gross: 1_120_000, vat: 120_000, vatBasis: "collected" }, deferredVatRemaining: 120_000, settlesBilling: false })],
    });
    expect(byAccount(first)[SYS.outputVat]).toBe(-60_000);
    expect(byAccount(first)[SYS.deferredOutputVat]).toBe(60_000);

    const second = postCollection({
      id: "c2", label: "AR 2", collectionDate: "2026-10-20", clientId: "c1", depositAccount: SYS.gcash,
      cash: 540_000, cwt: 20_000,
      allocations: [alloc({ applied: 540_000, cwt: 20_000, billing: { gross: 1_120_000, vat: 120_000, vatBasis: "collected" }, deferredVatRemaining: 60_000, settlesBilling: true })],
    });
    expect(byAccount(second)[SYS.outputVat]).toBe(-60_000);
  });

  it("unapplied cash becomes a customer deposit", () => {
    const e = postCollection({
      id: "c", label: "DP", collectionDate: "2026-10-01", clientId: "c1", depositAccount: SYS.bpiCurrent,
      cash: 500_000, cwt: 0, allocations: [],
    });
    expect(byAccount(e)).toEqual({ [SYS.bpiCurrent]: 500_000, [SYS.customerDeposits]: -500_000 });
  });

  it("rejects over-application and mismatched CWT", () => {
    const base = { id: "c", label: "x", collectionDate: "2026-10-01", clientId: "c1", depositAccount: SYS.bpiCurrent };
    expect(() => postCollection({ ...base, cash: 100, cwt: 20_000, allocations: [alloc()] })).toThrow(PostingError);
    expect(() => postCollection({ ...base, cash: 1_100_000, cwt: 0, allocations: [alloc()] })).toThrow(PostingError);
  });
});

describe("purchases and payments", () => {
  it("VAT bill split across two categories with 1% EWT", () => {
    const paper = splitVatInclusive(2_240_000); // 22,400 → 20,000 + 2,400
    const ink = splitVatInclusive(560_000); // 5,600 → 5,000 + 600
    const e = postPurchase({
      id: "p", label: "SI 77", invoiceDate: "2026-09-15", supplierId: "s1",
      total: 2_800_000, inputVat: paper.vat + ink.vat, ewt: 25_000,
      lines: [
        { account: "5010", net: paper.net, vat: paper.vat },
        { account: "5045", net: ink.net, vat: ink.vat },
      ],
    });
    expect(byAccount(e)).toEqual({ "5010": 2_000_000, "5045": 500_000, [SYS.inputVat]: 300_000, [SYS.ap]: -2_775_000, [SYS.ewtPayable]: -25_000 });
  });

  it("non-VAT / no-receipt bill puts everything in expense", () => {
    const e = postPurchase({
      id: "p", label: "Parking", invoiceDate: "2026-09-15", supplierId: "s1", total: 10_000, inputVat: 0, ewt: 0,
      lines: [{ account: "6155", net: 10_000, vat: 0 }],
    });
    expect(byAccount(e)).toEqual({ "6155": 10_000, [SYS.ap]: -10_000 });
  });

  it("rejects bills whose lines don't add up", () => {
    expect(() =>
      postPurchase({ id: "p", label: "x", invoiceDate: "2026-09-15", supplierId: "s1", total: 100, inputVat: 0, ewt: 0, lines: [{ account: "6100", net: 99, vat: 0 }] }),
    ).toThrow(PostingError);
  });

  it("supplier payment with an unapplied advance", () => {
    const e = postApPayment({
      id: "x", label: "BizLink 123", paymentDate: "2026-09-30", supplierId: "s1", paidFromAccount: SYS.bpiCurrent,
      amount: 3_000_000, allocations: [{ purchaseId: "p", applied: 2_775_000 }],
    });
    expect(byAccount(e)).toEqual({ [SYS.ap]: 2_775_000, "1160": 225_000, [SYS.bpiCurrent]: -3_000_000 });
  });
});

describe("invariants", () => {
  it("random billings and collections always balance", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const gross = Math.floor(rnd() * 50_000_000) + 1;
      const { net, vat } = splitVatInclusive(gross);
      const nLines = 1 + Math.floor(rnd() * 4);
      const weights = allocateProportionally(gross, Array.from({ length: nLines }, () => 1 + Math.floor(rnd() * 1000)));
      const b = postBilling(billing({ gross, net, vat, vatBasis: rnd() > 0.5 ? "collected" : "billed", lines: weights.map((amount) => ({ amount })) }))!;
      expect(totals(b).debit).toBe(totals(b).credit);
      expect(totals(b).debit).toBe(gross);

      const cwt = Math.floor(net * 0.02);
      const paid = Math.floor(rnd() * (gross - cwt));
      const c = postCollection({
        id: "c", label: "x", collectionDate: "2026-10-01", clientId: "c1", depositAccount: SYS.bpiCurrent,
        cash: paid + 1000, cwt,
        allocations: [{ billingId: "b", billingLabel: "b", applied: paid, cwt, billing: { gross, vat, vatBasis: "collected" }, deferredVatRemaining: vat, settlesBilling: false }],
      });
      expect(totals(c).debit).toBe(totals(c).credit);
    }
  });

  it("allocateProportionally always sums to the total", () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(allocateProportionally(999_999, [3, 7, 11, 13]))).toBe(999_999);
    expect(allocateProportionally(50, [0, 0])).toEqual([50, 0]);
  });

  it("reversal swaps sides and still balances", () => {
    const e = postBilling(billing())!;
    const r = reverseEntry(e, "2026-09-12");
    expect(byAccount(r)[SYS.ar]).toBe(-1_120_000);
    expect(totals(r).debit).toBe(totals(r).credit);
  });

  it("finalize rejects unbalanced entries", () => {
    expect(() => finalize({ date: "2026-01-01", memo: "bad", lines: [{ account: "1010", debit: 100, credit: 0 }, { account: "4010", debit: 0, credit: 99 }] })).toThrow(PostingError);
  });
});

import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asOwner, becomeUser, pool, U, ORG_A } from "./db";

afterAll(async () => { await pool.end(); });

const PRINTING_A = "70000000-0000-4000-8000-0000000000a2";   // ABC, printing, partly paid
const SUBMITTED_A = "70000000-0000-4000-8000-0000000000a3";  // ABC, submitted, ₱850
const ITEM_A3 = "71000000-0000-4000-8000-0000000000a3";
const DELIVERED_B = "70000000-0000-4000-8000-0000000000b1";  // Sunrise, delivered

async function expectFail(c: PoolClient, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint sp");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}
async function photo(c: PoolClient, org: string, by: string, purpose = "order_photo") {
  await c.query("reset role");
  const { rows } = await c.query(
    `insert into public.files (organization_id, purpose, kind, bucket, storage_path, original_name, size_bytes, uploaded_by)
     values ($1::uuid, $2, 'upload', 'attachments', $1::text || '/orders/x/' || gen_random_uuid() || '.jpg', 'p.jpg', 1000, $3::uuid) returning id`, [org, purpose, by]);
  return rows[0].id as string;
}

describe("order status updates", () => {
  it("production moves an order along with a note and photos; the client sees it", async () => {
    await asOwner(async (c) => {
      const f = await photo(c, ORG_A, U.production);
      await becomeUser(c, U.production);
      await c.query("select public.update_order_status($1, 'finishing', 'Folding done', true, $2::uuid[], 'production_photo')", [PRINTING_A, [f]]);
      await becomeUser(c, U.aViewer);
      const ev = (await c.query("select to_status, note from public.order_status_events where order_id = $1 order by created_at desc limit 1", [PRINTING_A])).rows[0];
      expect(ev).toEqual({ to_status: "finishing", note: "Folding done" });
      expect((await c.query("select count(*)::int n from public.order_attachments where order_id = $1", [PRINTING_A])).rows[0].n).toBe(1);
      const n = (await c.query("select count(*)::int n from public.notifications where kind = 'order_status'")).rows[0].n;
      expect(n).toBe(1);
    });
  });

  it("an internal note stays hidden from the client", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.production);
      await c.query("select public.update_order_status($1, 'quality_check', 'Colour slightly off on sheet 3 — reprinted', false)", [PRINTING_A]);
      await becomeUser(c, U.aBuyer);
      const ev = (await c.query("select to_status from public.order_status_events where order_id = $1 order by created_at desc limit 1", [PRINTING_A])).rows[0];
      expect(ev.to_status).not.toBe("quality_check");
      expect((await c.query("select status from public.orders where id = $1", [PRINTING_A])).rows[0].status).toBe("quality_check");
    });
  });

  it("refuses wrong moves, other people and clients", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.production);
      await expectFail(c, "select public.update_order_status($1, 'confirmed', null)", [SUBMITTED_A], /can't be moved/);
      await expectFail(c, "select public.update_order_status($1, 'cancelled', null)", [PRINTING_A], /can't be moved/);
      await expectFail(c, "select public.update_order_status($1, 'printing', null)", [DELIVERED_B], /can't be moved/);
      await c.query("select public.update_order_status($1, 'closed', null)", [DELIVERED_B]);
      for (const who of [U.aBuyer, U.aAdmin, U.sales2]) {
        await becomeUser(c, who);
        await expectFail(c, "select public.update_order_status($1, 'finishing', null)", [PRINTING_A], /not found/);
      }
      // nobody updates orders directly except managing staff
      await becomeUser(c, U.production);
      expect((await c.query("update public.orders set status = 'delivered' where id = $1", [PRINTING_A])).rowCount).toBe(0);
    });
  });
});

describe("confirming and cancelling", () => {
  it("sales confirm with a new price; totals and VAT are recomputed", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.production);
      await expectFail(c, "select public.confirm_order($1)", [SUBMITTED_A], /not found/);
      await becomeUser(c, U.sales1);
      await c.query("select public.confirm_order($1, $2::jsonb, 'Added rush fee')", [SUBMITTED_A, JSON.stringify([{ order_item_id: ITEM_A3, total_centavos: 112000 }])]);
      await becomeUser(c, U.aBuyer);
      const o = (await c.query("select o.status, f.total_centavos, f.vat_centavos, p.unit_price from public.orders o join public.order_financials f on f.order_id = o.id join public.order_item_prices p on p.order_item_id = $2 where o.id = $1", [SUBMITTED_A, ITEM_A3])).rows[0];
      expect(o).toEqual({ status: "confirmed", total_centavos: "112000", vat_centavos: "12000", unit_price: "5.6000" });
      // once confirmed, the client can no longer cancel
      await expectFail(c, "select public.cancel_order($1, 'changed my mind')", [SUBMITTED_A], /already confirmed/);
    });
  });

  it("clients cancel while Submitted (with a reason); viewers can't", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aViewer);
      await expectFail(c, "select public.cancel_order($1, 'x')", [SUBMITTED_A], /not found/);
      await becomeUser(c, U.aBuyer);
      await expectFail(c, "select public.cancel_order($1, ' ')", [SUBMITTED_A], /reason/);
      await c.query("select public.cancel_order($1, 'Ordered twice by mistake')", [SUBMITTED_A]);
      expect((await c.query("select status from public.orders where id = $1", [SUBMITTED_A])).rows[0].status).toBe("cancelled");
      await becomeUser(c, U.sales1);
      expect((await c.query("select count(*)::int n from public.notifications where kind = 'order_cancelled'")).rows[0].n).toBe(1);
    });
  });
});

describe("payments", () => {
  it("Unpaid → Partially Paid → Paid, and voiding rolls back", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.sales1);
      const st = async () => (await c.query("select payment_status, amount_paid_centavos from public.order_financials where order_id = $1", [SUBMITTED_A])).rows[0];
      expect(await st()).toEqual({ payment_status: "unpaid", amount_paid_centavos: "0" });
      await c.query("select public.record_payment($1, 'bank_transfer', 'BDO-1', 'BDO', 50000, current_date, null)", [SUBMITTED_A]);
      expect((await st()).payment_status).toBe("partially_paid");
      const { rows: [{ id }] } = await c.query("select public.record_payment($1, 'cheque', 'CHK 1', 'BPI', 35000, current_date, null) id", [SUBMITTED_A]);
      expect(await st()).toEqual({ payment_status: "paid", amount_paid_centavos: "85000" });
      await expectFail(c, "select public.void_payment($1, '')", [id], /reason/);
      await c.query("select public.void_payment($1, 'Cheque bounced')", [id]);
      expect(await st()).toEqual({ payment_status: "partially_paid", amount_paid_centavos: "50000" });
      // checks
      await expectFail(c, "select public.record_payment($1, 'cheque', '', null, 100, current_date, null)", [SUBMITTED_A], /cheque number/);
      await expectFail(c, "select public.record_payment($1, 'cheque', 'C', null, 100, current_date + 3, null)", [SUBMITTED_A], /future/);
      await expectFail(c, "select public.record_payment($1, 'cheque', 'C', null, 0, current_date, null)", [SUBMITTED_A], /amount/);
    });
  });

  it("only managing staff record payments; production and viewers never see them", async () => {
    await asOwner(async (c) => {
      for (const who of [U.production, U.sales2, U.aAdmin]) {
        await becomeUser(c, who);
        await expectFail(c, "select public.record_payment($1, 'cheque', 'C', null, 100, current_date, null)", [PRINTING_A], /not found/);
      }
      await becomeUser(c, U.aAdmin);
      await expectFail(c, `insert into public.payments (organization_id, order_id, method, amount_centavos, received_on, recorded_by) values ($1, $2, 'cheque', 1, current_date, $3)`, [ORG_A, PRINTING_A, U.aAdmin], /row-level security/);
      for (const who of [U.production, U.aViewer]) {
        await becomeUser(c, who);
        expect((await c.query("select count(*)::int n from public.payments where order_id = $1", [PRINTING_A])).rows[0].n).toBe(0);
        expect((await c.query("select count(*)::int n from public.order_financials where order_id = $1", [PRINTING_A])).rows[0].n).toBe(0);
      }
    });
  });

  it("a buyer attaches a deposit slip; staff are told", async () => {
    await asOwner(async (c) => {
      const f = await photo(c, ORG_A, U.aBuyer, "payment_slip");
      const other = await photo(c, ORG_A, U.aAdmin, "payment_slip");
      await becomeUser(c, U.aBuyer);
      await expectFail(c, "select public.add_payment_slip($1, $2, null)", [PRINTING_A, other], /again/);
      await c.query("select public.add_payment_slip($1, $2, 'Deposited at BDO Makati')", [PRINTING_A, f]);
      await becomeUser(c, U.aViewer);
      expect((await c.query("select count(*)::int n from public.payment_slips")).rows[0].n).toBe(0);
      await becomeUser(c, U.sales1);
      expect((await c.query("select count(*)::int n from public.payment_slips where order_id = $1", [PRINTING_A])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from public.notifications where kind = 'payment_slip'")).rows[0].n).toBe(1);
    });
  });
});

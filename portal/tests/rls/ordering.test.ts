import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asOwner, becomeUser, pool, U, ORG_A, ORG_B } from "./db";

afterAll(async () => { await pool.end(); });

const FLYERS = "41000000-0000-4000-8000-000000000001";
const CARDS = "41000000-0000-4000-8000-000000000005";
const SUNRISE_ONLY = "41000000-0000-4000-8000-000000000010";
const ADDR_A = "30000000-0000-4000-8000-0000000000a1";
const ADDR_B = "30000000-0000-4000-8000-0000000000b1";
const STANDOUT_QUOTE = "61000000-0000-4000-8000-0000000000b1"; // Sunrise, sent, 2 tiers

async function expectFail(c: PoolClient, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint sp");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}
const priceId = async (c: PoolClient, product: string, qty: number) =>
  (await c.query("select id from public.standard_prices where product_id = $1 and quantity = $2", [product, qty])).rows[0].id as string;
const LINK = ["https://drive.google.com/file/d/x/view"];

describe("ordering at a standard price", () => {
  it("creates a submitted order with the price from the price list (VAT split correctly)", async () => {
    await asOwner(async (c) => {
      const sp = await priceId(c, CARDS, 200);   // ₱850.00 VAT-inclusive
      await becomeUser(c, U.aBuyer);
      const { rows: [{ id }] } = await c.query(
        "select public.place_standard_order($1, $2, current_date + 7, 'PO-77', 'rush', '{}', $3::text[], false) as id", [sp, ADDR_A, LINK]);
      const o = (await c.query("select order_no, status, kind, client_po_no, delivery_address_snapshot->>'city' city from public.orders where id = $1", [id])).rows[0];
      expect(o).toMatchObject({ status: "submitted", kind: "new", client_po_no: "PO-77", city: "Makati City" });
      expect(o.order_no).toMatch(/^PA-\d{4}-\d{6}$/);
      const f = (await c.query("select net_centavos, vat_centavos, total_centavos from public.order_financials where order_id = $1", [id])).rows[0];
      // 85000 incl. 12% VAT -> net 75893 + VAT 9107
      expect(f).toEqual({ net_centavos: "75893", vat_centavos: "9107", total_centavos: "85000" });
    });
  });

  it("requires artwork, a Drive link or design help", async () => {
    await asOwner(async (c) => {
      const sp = await priceId(c, CARDS, 200);
      await becomeUser(c, U.aBuyer);
      await expectFail(c, "select public.place_standard_order($1, $2, null, null, null)", [sp, ADDR_A], /artwork/);
      const ok = await c.query("select public.place_standard_order($1, $2, null, null, null, '{}', '{}', true) as id", [sp, ADDR_A]);
      expect(ok.rows[0].id).toBeTruthy();
    });
  });

  it("viewers, staff and other companies' addresses are refused; clients can't write orders directly", async () => {
    await asOwner(async (c) => {
      const sp = await priceId(c, CARDS, 200);
      for (const who of [U.aViewer, U.production, U.sales1]) {
        await becomeUser(c, who);
        await expectFail(c, "select public.place_standard_order($1, null, null, null, null, '{}', '{}', true)", [sp], /Not allowed/);
      }
      await becomeUser(c, U.aBuyer);
      await expectFail(c, "select public.place_standard_order($1, $2, null, null, null, '{}', '{}', true)", [sp, ADDR_B], /Address not found/);
      await expectFail(c, `insert into public.orders (organization_id, order_no, kind, placed_by) values ($1, 'X', 'new', $2)`, [ORG_A, U.aBuyer], /row-level security/);
      await expectFail(c, `insert into public.order_item_prices (order_item_id, organization_id, unit_price, total_centavos)
        values ('71000000-0000-4000-8000-0000000000a3', $1, 0.01, 1)`, [ORG_A], /row-level security/);
    });
  });
});

describe("quote requests", () => {
  it("clients request quotes for visible products only, numbered QR-YYYY-NNNN", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      const { rows: [{ id }] } = await c.query(
        `select public.submit_quote_request($1, 'Event flyers', '{"size":"A4"}', '{1000,500}', $2, null, null, 'Need by Friday', '{}', '{}', true) as id`, [FLYERS, ADDR_A]);
      const r = (await c.query("select request_no, status, quantities, reply_due_at > now() due from public.quote_requests where id = $1", [id])).rows[0];
      expect(r.request_no).toMatch(/^QR-\d{4}-0006$/);
      expect(r).toMatchObject({ status: "submitted", quantities: [500, 1000], due: true });
      await expectFail(c, `select public.submit_quote_request($1, 'x', '{}', '{100}', null, null, null, null)`, [SUNRISE_ONLY], /not found/);
      await expectFail(c, `select public.submit_quote_request($1, 'x', '{}', '{}', null, null, null, null)`, [FLYERS], /quantity/);
    });
  });
});

describe("quotes: staff send, client accepts in one tap", () => {
  it("accepting creates a CONFIRMED order at the quoted price", async () => {
    await asOwner(async (c) => {
      const tier = (await c.query("select id from public.quote_tiers where quote_id = $1 and quantity = 6", [STANDOUT_QUOTE])).rows[0].id;
      await becomeUser(c, U.bBuyer);
      const { rows: [{ id }] } = await c.query("select public.accept_quote($1, $2, 'SF-PO-1', '203.0.113.5') as id", [STANDOUT_QUOTE, tier]);
      const o = (await c.query("select status, quote_id, client_po_no from public.orders where id = $1", [id])).rows[0];
      expect(o).toMatchObject({ status: "confirmed", quote_id: STANDOUT_QUOTE, client_po_no: "SF-PO-1" });
      const f = (await c.query("select total_centavos from public.order_financials where order_id = $1", [id])).rows[0];
      expect(f.total_centavos).toBe("1650000");
      const q = (await c.query("select status, host(response_ip) ip from public.quotes where id = $1", [STANDOUT_QUOTE])).rows[0];
      expect(q).toEqual({ status: "accepted", ip: "203.0.113.5" });
      await expectFail(c, "select public.accept_quote($1, $2)", [STANDOUT_QUOTE, tier], /not available/);
    });
  });

  it("viewers and other companies can't accept; expired quotes can't be accepted", async () => {
    await asOwner(async (c) => {
      const tier = (await c.query("select id from public.quote_tiers where quote_id = $1 limit 1", [STANDOUT_QUOTE])).rows[0].id;
      for (const who of [U.bViewer, U.aAdmin, U.sales2]) {
        await becomeUser(c, who);
        await expectFail(c, "select public.accept_quote($1, $2)", [STANDOUT_QUOTE, tier], /not available/);
      }
      await c.query("reset role");
      await c.query("update public.quotes set valid_until = current_date - 1 where id = $1", [STANDOUT_QUOTE]);
      await becomeUser(c, U.bBuyer);
      await c.query("savepoint sp");
      await expect(c.query("select public.accept_quote($1, $2)", [STANDOUT_QUOTE, tier])).rejects.toThrow(/expired/);
    });
  });

  it("draft quotes are invisible to clients until staff send them; sending supersedes the old one", async () => {
    await asOwner(async (c) => {
      const req = "60000000-0000-4000-8000-0000000000b1";
      await becomeUser(c, U.sales2);
      const { rows: [{ id: q2 }] } = await c.query(
        `insert into public.quotes (organization_id, quote_request_id, revision_no, valid_until, status) values ($1, $2, 2, current_date + 15, 'draft') returning id`, [ORG_B, req]);
      await becomeUser(c, U.bBuyer);
      expect((await c.query("select count(*)::int n from public.quotes where id = $1", [q2])).rows[0].n).toBe(0);
      await becomeUser(c, U.sales2);
      await expectFail(c, "select public.send_quote($1)", [q2], /at least one/);
      await c.query(`insert into public.quote_tiers (organization_id, quote_id, quantity, unit_price, total_centavos) values ($1, $2, 3, 2800, 840000)`, [ORG_B, q2]);
      await becomeUser(c, U.sales1);
      await expectFail(c, "select public.send_quote($1)", [q2], /not found/);
      await becomeUser(c, U.sales2);
      await c.query("select public.send_quote($1)", [q2]);
      await becomeUser(c, U.bBuyer);
      const rows = (await c.query("select revision_no, status from public.quotes where quote_request_id = $1 order by revision_no", [req])).rows;
      expect(rows).toEqual([{ revision_no: 1, status: "superseded" }, { revision_no: 2, status: "sent" }]);
    });
  });
});

describe("a delivered new order becomes a Print Item", () => {
  it("creates the item with specs, a draft version and the price paid", async () => {
    await asOwner(async (c) => {
      const order = "70000000-0000-4000-8000-0000000000a3"; // new order, business cards, no Print Item
      await c.query("update public.orders set status = 'delivered' where id = $1", [order]);
      const oi = (await c.query("select print_item_id from public.order_items where order_id = $1", [order])).rows[0];
      expect(oi.print_item_id).toBeTruthy();
      const item = (await c.query("select name, source_order_id, spec->>'material' material from public.print_items where id = $1", [oi.print_item_id])).rows[0];
      expect(item).toMatchObject({ source_order_id: order, material: "Carolina C2S" });
      const tier = (await c.query("select quantity, total_centavos, source from public.price_tiers where print_item_id = $1", [oi.print_item_id])).rows[0];
      expect(tier).toEqual({ quantity: 200, total_centavos: "85000", source: "order" });
      const v = (await c.query("select status from public.artwork_versions where print_item_id = $1", [oi.print_item_id])).rows[0];
      expect(v.status).toBe("draft");
      // the client (ABC) can see their new item; Sunrise cannot
      await becomeUser(c, U.aBuyer);
      expect((await c.query("select count(*)::int n from public.print_items where id = $1", [oi.print_item_id])).rows[0].n).toBe(1);
      await becomeUser(c, U.bAdmin);
      expect((await c.query("select count(*)::int n from public.print_items where id = $1", [oi.print_item_id])).rows[0].n).toBe(0);
    });
  });
});

import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asOwner, becomeUser, pool, U, ORG_A } from "./db";

afterAll(async () => { await pool.end(); });

const BROCHURE = "50000000-0000-4000-8000-0000000000a1";
const CARD = "50000000-0000-4000-8000-0000000000a2";
const LABEL_B = "50000000-0000-4000-8000-0000000000b1";
const PROMO_ESTIMATE = "57000000-0000-4000-8000-0000000000b3";   // Sunrise, draft
const ADDR_A = "30000000-0000-4000-8000-0000000000a1";

async function expectFail(c: PoolClient, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint sp");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

/** The server inserts instant quotes after computing them (clients can't). */
async function offer(c: PoolClient, item: string, org: string, qty: number, total: number, valid = "current_date + 15") {
  await c.query("reset role");
  const { rows } = await c.query(
    `insert into public.instant_quotes (organization_id, print_item_id, quantity, final_total_centavos, vat_centavos, final_net_centavos, valid_until, status)
     values ($1, $2, $3, $4, 0, $4, ${valid}, 'offered') returning id`, [org, item, qty, total]);
  return rows[0].id as string;
}

describe("confirming a past estimate", () => {
  it("turns its lines into the item's agreed prices — only after staff confirm", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.bBuyer);
      expect((await c.query("select count(*)::int n from public.price_tiers where print_item_id = '50000000-0000-4000-8000-0000000000b3'")).rows[0].n).toBe(0);
      await becomeUser(c, U.sales1);
      await expectFail(c, "select public.confirm_past_estimate($1)", [PROMO_ESTIMATE], /not found/);
      await becomeUser(c, U.sales2);
      const { rows } = await c.query("select public.confirm_past_estimate($1) n", [PROMO_ESTIMATE]);
      expect(rows[0].n).toBe(1);
      await becomeUser(c, U.bBuyer);
      const t = (await c.query("select quantity, total_centavos, source, source_ref from public.price_tiers where print_item_id = '50000000-0000-4000-8000-0000000000b3' and is_current")).rows;
      expect(t).toEqual([{ quantity: 2000, total_centavos: "480000", source: "estimate", source_ref: "CE-2025-0610" }]);
    });
  });

  it("an older estimate never replaces a newer agreed price", async () => {
    await asOwner(async (c) => {
      const { rows: [{ id }] } = await c.query(`insert into public.past_estimates (organization_id, print_item_id, estimate_no, estimate_date, status)
        values ($1, $2, 'OLD-1', '2020-01-01', 'draft') returning id`, [ORG_A, BROCHURE]);
      await c.query(`insert into public.past_estimate_lines (organization_id, past_estimate_id, quantity, unit_price, total_centavos) values ($1, $2, 1000, 1, 100000)`, [ORG_A, id]);
      await becomeUser(c, U.sales1);
      const { rows } = await c.query("select public.confirm_past_estimate($1) n", [id]);
      expect(rows[0].n).toBe(0);
      const cur = (await c.query("select source_ref from public.price_tiers where print_item_id = $1 and quantity = 1000 and is_current", [BROCHURE])).rows;
      expect(cur).toEqual([{ source_ref: "CE-2025-0142" }]);
    });
  });
});

describe("accepting instant quotes", () => {
  it("several items become ONE confirmed reorder with snapshots", async () => {
    await asOwner(async (c) => {
      const q1 = await offer(c, BROCHURE, ORG_A, 1000, 2_098_000);
      const q2 = await offer(c, CARD, ORG_A, 200, 96_500);
      await becomeUser(c, U.aBuyer);
      const { rows: [{ id }] } = await c.query("select public.accept_instant_quotes($1::uuid[], $2, current_date + 10, 'PO-9', 'cart', '198.51.100.1') id", [[q1, q2], ADDR_A]);
      const o = (await c.query("select kind, status, client_po_no from public.orders where id = $1", [id])).rows[0];
      expect(o).toEqual({ kind: "reorder", status: "confirmed", client_po_no: "PO-9" });
      const items = (await c.query("select title, quantity, artwork_version_id is not null has_art from public.order_items where order_id = $1 order by quantity", [id])).rows;
      expect(items).toEqual([{ title: "Business Card – Liza Mendoza", quantity: 200, has_art: true }, { title: "Product Brochure A4 Trifold", quantity: 1000, has_art: true }]);
      const cs = (await c.query("select color_standard_snapshot->>'press_machine' press from public.order_items where order_id = $1 and quantity = 1000", [id])).rows[0];
      expect(cs.press).toBe('Komori (26"x19")');
      const f = (await c.query("select total_centavos from public.order_financials where order_id = $1", [id])).rows[0];
      expect(f.total_centavos).toBe("2194500");
      await expectFail(c, "select public.accept_instant_quotes($1::uuid[], null, null, null, null)", [[q1]], /already used/);
    });
  });

  it("viewers, other companies, expired quotes and mixed companies are refused", async () => {
    await asOwner(async (c) => {
      const q = await offer(c, BROCHURE, ORG_A, 1000, 2_000_000);
      const old = await offer(c, CARD, ORG_A, 200, 90_000, "current_date - 1");
      const other = await offer(c, LABEL_B, "20000000-0000-4000-8000-00000000000b", 10000, 1_000_000);
      for (const who of [U.aViewer, U.bAdmin, U.sales1]) {
        await becomeUser(c, who);
        await expectFail(c, "select public.accept_instant_quotes($1::uuid[], null, null, null, null)", [[q]], /not found/);
      }
      await becomeUser(c, U.aBuyer);
      await expectFail(c, "select public.accept_instant_quotes($1::uuid[], null, null, null, null)", [[old]], /expired/);
      await expectFail(c, "select public.accept_instant_quotes($1::uuid[], null, null, null, null)", [[q, other]], /not found/);
      // clients can't create or edit instant quotes themselves
      await expectFail(c, `insert into public.instant_quotes (organization_id, print_item_id, quantity, status) values ($1, $2, 1, 'offered')`, [ORG_A, BROCHURE], /row-level security/);
      const upd = await c.query("update public.instant_quotes set final_total_centavos = 1 where id = $1", [q]);
      expect(upd.rowCount).toBe(0);
    });
  });
});

describe("staff override and Needs Quote requests", () => {
  it("staff can change an offered quote (with a reason, logged); not after acceptance", async () => {
    await asOwner(async (c) => {
      const q = await offer(c, BROCHURE, ORG_A, 1000, 2_000_000);
      await becomeUser(c, U.sales1);
      await expectFail(c, "select public.override_instant_quote($1, 1900000, '')", [q], /reason/);
      await c.query("select public.override_instant_quote($1, 1900000, 'Loyalty — approved by GM')", [q]);
      await becomeUser(c, U.aBuyer);
      const row = (await c.query("select final_total_centavos, override_old_total_centavos, override_reason from public.instant_quotes where id = $1", [q])).rows[0];
      expect(row).toEqual({ final_total_centavos: "1900000", override_old_total_centavos: "2000000", override_reason: "Loyalty — approved by GM" });
      await becomeUser(c, U.sales2);
      await expectFail(c, "select public.override_instant_quote($1, 1, 'x')", [q], /not found/);
    });
  });

  it("a reorder that needs a quote becomes a request with clean reasons", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      const { rows: [{ id }] } = await c.query(
        "select public.submit_reorder_request($1, '{1500}', '{quantity_not_in_tiers,hack}', 'New phone number', $2, null, null, null) id", [CARD, ADDR_A]);
      const r = (await c.query("select kind, needs_quote_reasons, spec->>'requested_changes' ch, print_item_id from public.quote_requests where id = $1", [id])).rows[0];
      expect(r).toEqual({ kind: "reorder", needs_quote_reasons: ["quantity_not_in_tiers"], ch: "New phone number", print_item_id: CARD });
      await becomeUser(c, U.aViewer);
      await expectFail(c, "select public.submit_reorder_request($1, '{100}', '{}', null, null, null, null, null)", [CARD], /not found/);
    });
  });
});

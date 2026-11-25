import { afterAll, describe, expect, it } from "vitest";
import { asOwner, becomeUser, pool, U } from "./db";

afterAll(async () => { await pool.end(); });

const EP = "https://push.example.test/send/abc123";
const KEYS = JSON.stringify({ p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" });

describe("push subscriptions", () => {
  it("each person sees and manages only their own devices", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      await c.query("insert into public.push_subscriptions (profile_id, endpoint, keys) values ($1, $2, $3::jsonb)", [U.aBuyer, EP, KEYS]);
      await c.query("savepoint sp");
      await expect(c.query("insert into public.push_subscriptions (profile_id, endpoint, keys) values ($1, $2, $3::jsonb)", [U.bBuyer, `${EP}-x`, KEYS])).rejects.toThrow(/row-level security/);
      await c.query("rollback to savepoint sp");
      for (const who of [U.bBuyer, U.admin, U.aAdmin]) {
        await becomeUser(c, who);
        expect((await c.query("select count(*)::int n from public.push_subscriptions")).rows[0].n).toBe(0);
        expect((await c.query("delete from public.push_subscriptions where endpoint = $1", [EP])).rowCount).toBe(0);
      }
    });
  });

  it("a shared phone moves to whoever turns notifications on", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      await c.query("insert into public.push_subscriptions (profile_id, endpoint, keys) values ($1, $2, $3::jsonb)", [U.aBuyer, EP, KEYS]);
      await becomeUser(c, U.aAdmin);
      await c.query("select public.claim_push_endpoint($1)", [EP]);
      await c.query("insert into public.push_subscriptions (profile_id, endpoint, keys) values ($1, $2, $3::jsonb)", [U.aAdmin, EP, KEYS]);
      await c.query("reset role");
      expect((await c.query("select profile_id from public.push_subscriptions where endpoint = $1", [EP])).rows).toEqual([{ profile_id: U.aAdmin }]);
    });
  });

  it("new notifications wait to be pushed; old ones never are", async () => {
    await asOwner(async (c) => {
      const old = (await c.query("select count(*)::int n from public.notifications where pushed_at is null")).rows[0].n;
      expect(old).toBe(0);
      await becomeUser(c, U.production);
      await c.query("select public.update_order_status('70000000-0000-4000-8000-0000000000a2', 'finishing', null)");
      await c.query("reset role");
      expect((await c.query("select count(*)::int n from public.notifications where pushed_at is null and kind = 'order_status'")).rows[0].n).toBeGreaterThan(0);
    });
  });
});

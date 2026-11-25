import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * The same isolation proof, but through the REAL Supabase API with each demo
 * user's own login token — exactly what a curious user could do from their
 * browser. Runs only when a Supabase project with the demo seed is set:
 *
 *   TEST_SUPABASE_URL=https://xxxx.supabase.co \
 *   TEST_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   npm run test:api
 */
const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const PASSWORD = process.env.TEST_DEMO_PASSWORD ?? "Demo-Print-2026!";
const ORG_A = "20000000-0000-4000-8000-00000000000a";
const ORG_B = "20000000-0000-4000-8000-00000000000b";

const TABLES = ["addresses", "artwork_versions", "color_standards", "files", "instant_quotes", "invitations",
  "memberships", "order_financials", "order_item_prices", "order_items", "order_status_events", "orders",
  "organization_domains", "past_estimate_lines", "past_estimates", "payments", "preview_renditions",
  "price_tiers", "print_items", "quote_requests", "quote_tiers", "quotes", "revision_markups",
  "revision_requests", "template_fields"];

describe.skipIf(!url || !key)("RLS through the live Supabase API", () => {
  async function signIn(email: string) {
    const sb = createClient(url!, key!, { auth: { persistSession: false } });
    const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`${email}: ${error.message}`);
    return sb;
  }

  for (const [email, own, other] of [
    ["buyer@abccorp-demo.test", ORG_A, ORG_B],
    ["marketing@abccorp-demo.test", ORG_A, ORG_B],
    ["purchasing@sunrisefoods-demo.test", ORG_B, ORG_A],
  ] as const) {
    it(`${email} sees nothing from the other company`, async () => {
      const sb = await signIn(email);
      for (const t of TABLES) {
        const { data, error } = await sb.from(t).select("organization_id").eq("organization_id", other);
        expect(error?.message ?? "", t).not.toMatch(/JWT/);
        expect(data ?? [], `${t} leaked`).toHaveLength(0);
      }
      const { data: orgs } = await sb.from("organizations").select("id");
      expect((orgs ?? []).map((o) => o.id)).toEqual([own]);
      const { data: objects } = await sb.storage.from("print-files").list(own);
      expect(objects ?? []).toHaveLength(0);
      const signed = await sb.storage.from("print-files").createSignedUrl(`${own}/brochure/v2/brochure-2025.pdf`, 60);
      expect(signed.data?.signedUrl).toBeFalsy();
    });
  }

  it("a signed-out visitor gets nothing", async () => {
    const anon = createClient(url!, key!, { auth: { persistSession: false } });
    for (const t of ["organizations", "orders", "print_items", "price_tiers", "profiles"]) {
      const { data } = await anon.from(t).select("*").limit(1);
      expect(data ?? [], t).toHaveLength(0);
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, asOwner, becomeUser, listTables, ORG_A, ORG_B, pool, U } from "./db";

/**
 * PROOF THAT ONE CLIENT CANNOT SEE ANOTHER CLIENT'S DATA.
 *
 * For every table and storage bucket, users of Client A (ABC Corporation)
 * must get zero rows of Client B (Sunrise Foods) and vice versa — whatever
 * the query, including guessed ids.
 */

let tables: { name: string; hasOrg: boolean }[] = [];
beforeAll(async () => {
  tables = await listTables();
});
afterAll(async () => {
  await pool.end();
});

const clientUsers = [
  { label: "ABC client_admin", id: U.aAdmin, own: ORG_A, other: ORG_B },
  { label: "ABC client_buyer", id: U.aBuyer, own: ORG_A, other: ORG_B },
  { label: "ABC client_viewer", id: U.aViewer, own: ORG_A, other: ORG_B },
  { label: "Sunrise client_admin", id: U.bAdmin, own: ORG_B, other: ORG_A },
  { label: "Sunrise client_buyer", id: U.bBuyer, own: ORG_B, other: ORG_A },
  { label: "Sunrise client_viewer", id: U.bViewer, own: ORG_B, other: ORG_A },
];

describe("seed sanity (so the isolation tests are meaningful)", () => {
  it("both companies have data in the key tables", async () => {
    for (const t of ["print_items", "artwork_versions", "files", "preview_renditions", "orders",
      "order_items", "order_item_prices", "order_financials", "payments", "price_tiers",
      "past_estimates", "past_estimate_lines", "quote_requests", "addresses", "memberships",
      "order_status_events", "template_fields", "color_standards"]) {
      const { rows } = await pool.query(
        `select count(*) filter (where organization_id = $1)::int a,
                count(*) filter (where organization_id = $2)::int b from public.${t}`, [ORG_A, ORG_B]);
      expect(rows[0].a + rows[0].b, t).toBeGreaterThan(0);
    }
  });
});

describe("every table: a client sees only its own company", () => {
  for (const u of clientUsers) {
    it(`${u.label} gets 0 rows of the other company in every table`, async () => {
      await as({ id: u.id }, async (c) => {
        for (const t of tables.filter((t) => t.hasOrg)) {
          const { rows } = await c.query(
            `select count(*)::int n from public.${t.name} where organization_id is distinct from $1 and organization_id is not null`,
            [u.own]);
          expect(rows[0].n, `${t.name} leaked rows to ${u.label}`).toBe(0);
        }
        const orgs = await c.query("select id from public.organizations");
        expect(orgs.rows.map((r) => r.id)).toEqual([u.own]);
      });
    });
  }

  it("clients cannot see other companies' users, domains or targeted products", async () => {
    await as({ id: U.aAdmin }, async (c) => {
      const people = await c.query("select email from public.profiles");
      const emails = people.rows.map((r) => r.email as string);
      expect(emails.some((e) => e.includes("sunrise"))).toBe(false);
      // they DO see their own team and their account manager
      expect(emails).toContain("buyer@abccorp-demo.test");
      expect(emails).toContain("sales1@pa-demo.test");
      expect(emails).not.toContain("sales2@pa-demo.test");

      const domains = await c.query("select domain from public.organization_domains");
      expect(domains.rows.map((r) => r.domain)).toEqual(["abccorp-demo.test"]);

      // the custom carton product is only visible to Sunrise
      const products = await c.query("select slug from public.products");
      expect(products.rows.map((r) => r.slug)).not.toContain("shipping-boxes");
      const vis = await c.query("select count(*)::int n from public.product_visibility");
      expect(vis.rows[0].n).toBe(0);
      const assign = await c.query("select organization_id from public.staff_assignments");
      expect(assign.rows.every((r) => r.organization_id === ORG_A)).toBe(true);
    });
    await as({ id: U.bBuyer }, async (c) => {
      const products = await c.query("select slug from public.products");
      expect(products.rows.map((r) => r.slug)).toContain("shipping-boxes");
    });
  });
});

describe("guessed ids never reveal another client's records", () => {
  const sunriseIds: Record<string, string> = {
    print_items: "50000000-0000-4000-8000-0000000000b1",
    artwork_versions: "51000000-0000-4000-8000-0000000000b1",
    files: "52000000-0000-4000-8000-0000000000b1",
    preview_renditions: "53000000-0000-4000-8000-0000000000b1",
    color_standards: "54000000-0000-4000-8000-0000000000b1",
    editable_templates: "55000000-0000-4000-8000-0000000000b2",
    past_estimates: "57000000-0000-4000-8000-0000000000b1",
    quote_requests: "60000000-0000-4000-8000-0000000000b1",
    quotes: "61000000-0000-4000-8000-0000000000b1",
    orders: "70000000-0000-4000-8000-0000000000b1",
    order_items: "71000000-0000-4000-8000-0000000000b1",
    addresses: "30000000-0000-4000-8000-0000000000b1",
    organizations: ORG_B,
  };
  it("ABC users looking up Sunrise ids get nothing", async () => {
    for (const id of [U.aAdmin, U.aBuyer, U.aViewer]) {
      await as({ id }, async (c) => {
        for (const [table, rowId] of Object.entries(sunriseIds)) {
          const { rows } = await c.query(`select * from public.${table} where id = $1`, [rowId]);
          expect(rows, `${table} ${rowId}`).toHaveLength(0);
        }
        const fin = await c.query("select * from public.order_financials where order_id = $1", [
          "70000000-0000-4000-8000-0000000000b1"]);
        expect(fin.rows).toHaveLength(0);
      });
    }
  });

  it("ABC users cannot change or create Sunrise records", async () => {
    await as({ id: U.aAdmin }, async (c) => {
      const upd = await c.query("update public.addresses set label = 'hacked' where organization_id = $1", [ORG_B]);
      expect(upd.rowCount).toBe(0);
      const upd2 = await c.query("update public.orders set notes = 'x' where id = '70000000-0000-4000-8000-0000000000b1'");
      expect(upd2.rowCount).toBe(0);
    });
    for (const sql of [
      `insert into public.addresses (organization_id, label, line1, city) values ('${ORG_B}', 'x', 'x', 'x')`,
      `insert into public.quote_requests (organization_id, title, submitted_by) values ('${ORG_B}', 'x', '${U.aAdmin}')`,
      `insert into public.orders (organization_id, order_no, kind, placed_by) values ('${ORG_B}', 'X-1', 'new', '${U.aAdmin}')`,
      `insert into public.memberships (profile_id, organization_id, client_role) values ('${U.aBuyer}', '${ORG_B}', 'client_admin')`,
    ]) {
      await as({ id: U.aAdmin }, async (c) => {
        await expect(c.query(sql), sql).rejects.toThrow(/row-level security/);
      });
    }
  });
});

describe("prices: only client_admin / client_buyer and price staff", () => {
  const priceTables = ["price_tiers", "quote_tiers", "quotes", "order_item_prices",
    "order_financials", "payments", "payment_slips", "instant_quotes", "standard_prices"];
  const staffOnly = ["past_estimates", "past_estimate_lines", "past_estimate_charges", "price_history",
    "inflation_rates", "category_surcharges", "fixed_addons", "pricing_settings", "audit_logs"];

  it("client_viewer sees no prices at all", async () => {
    await as({ id: U.aViewer }, async (c) => {
      for (const t of [...priceTables, ...staffOnly]) {
        const { rows } = await c.query(`select count(*)::int n from public.${t}`);
        expect(rows[0].n, t).toBe(0);
      }
      // ...but can still follow orders
      const orders = await c.query("select count(*)::int n from public.orders");
      expect(orders.rows[0].n).toBeGreaterThan(0);
    });
  });

  it("client_buyer sees own prices but never estimates or pricing rules", async () => {
    await as({ id: U.aBuyer }, async (c) => {
      const tiers = await c.query("select count(*)::int n from public.price_tiers");
      expect(tiers.rows[0].n).toBeGreaterThan(0);
      for (const t of staffOnly) {
        const { rows } = await c.query(`select count(*)::int n from public.${t}`);
        expect(rows[0].n, t).toBe(0);
      }
      const files = await c.query("select count(*)::int n from public.files where bucket = 'print-files' or kind = 'drive_link'");
      expect(files.rows[0].n, "high-res file rows").toBe(0);
    });
  });

  it("pa_production sees every order but no prices or payments", async () => {
    await as({ id: U.production }, async (c) => {
      const orders = await c.query("select count(distinct organization_id)::int n from public.orders");
      expect(orders.rows[0].n).toBe(2);
      for (const t of [...priceTables, ...staffOnly]) {
        const { rows } = await c.query(`select count(*)::int n from public.${t}`);
        expect(rows[0].n, t).toBe(0);
      }
    });
  });

  it("pa_sales only sees assigned clients", async () => {
    await as({ id: U.sales1 }, async (c) => {
      for (const t of tables.filter((t) => t.hasOrg)) {
        const { rows } = await c.query(
          `select count(*)::int n from public.${t.name} where organization_id = $1`, [ORG_B]);
        expect(rows[0].n, t.name).toBe(0);
      }
      const est = await c.query("select count(*)::int n from public.past_estimates");
      expect(est.rows[0].n).toBeGreaterThan(0);
    });
  });

  it("pa_admin sees both companies", async () => {
    await as({ id: U.admin }, async (c) => {
      const { rows } = await c.query("select count(*)::int n from public.organizations");
      expect(rows[0].n).toBe(2);
    });
  });
});

describe("signed-out visitors and deactivated users", () => {
  it("anon has no access to any table", async () => {
    for (const t of tables) {
      await as("anon", async (c) => {
        await expect(c.query(`select 1 from public.${t.name} limit 1`), t.name).rejects.toThrow(/permission denied/);
      });
    }
  });

  it("a deactivated user loses access immediately", async () => {
    await asOwner(async (c) => {
      await c.query("update public.profiles set is_active = false where id = $1", [U.aBuyer]);
      await becomeUser(c, U.aBuyer);
      for (const t of ["organizations", "print_items", "orders", "price_tiers", "settings", "products"]) {
        const { rows } = await c.query(`select count(*)::int n from public.${t}`);
        expect(rows[0].n, t).toBe(0);
      }
    });
  });
});

describe("2-step verification is enforced in the database", () => {
  it("when required, staff and client_admin without AAL2 see nothing", async () => {
    await asOwner(async (c) => {
      await c.query(`update public.settings set value = value || '{"require_mfa": true}' where key = 'security'`);
      await becomeUser(c, U.admin, "aal1");
      const a = await c.query("select count(*)::int n from public.organizations");
      expect(a.rows[0].n).toBe(0);
    });
    await asOwner(async (c) => {
      await c.query(`update public.settings set value = value || '{"require_mfa": true}' where key = 'security'`);
      await becomeUser(c, U.aAdmin, "aal1");
      const a = await c.query("select count(*)::int n from public.print_items");
      expect(a.rows[0].n).toBe(0);
    });
    await asOwner(async (c) => {
      await c.query(`update public.settings set value = value || '{"require_mfa": true}' where key = 'security'`);
      // a buyer does not need 2FA
      await becomeUser(c, U.aBuyer, "aal1");
      const b = await c.query("select count(*)::int n from public.print_items");
      expect(b.rows[0].n).toBeGreaterThan(0);
      // staff with AAL2 are fine
      await becomeUser(c, U.admin, "aal2");
      const d = await c.query("select count(*)::int n from public.organizations");
      expect(d.rows[0].n).toBe(2);
    });
  });
});

describe("storage buckets", () => {
  async function withObjects<T>(fn: (c: import("pg").PoolClient) => Promise<T>) {
    return asOwner(async (c) => {
      // previews of APPROVED versions (paths from the seed's preview rows)
      await c.query(`insert into storage.objects (bucket_id, name) values
         ('previews', '20000000-0000-4000-8000-00000000000a/brochure/v2/p1.jpg'),
         ('previews', '20000000-0000-4000-8000-00000000000b/label-80x50/v1/p1.jpg'),
         ('previews', $1 || '/draft-item/draft-version/p1.jpg')`, [ORG_A]);
      for (const org of [ORG_A, ORG_B]) {
        await c.query(
          `insert into storage.objects (bucket_id, name) values
             ('print-files', $1 || '/item/v1/print.pdf'),
             ('attachments', $1 || '/revisions/logo.png'),
             ('attachments', $1 || '/payment-slips/slip.jpg')`, [org]);
      }
      await c.query(`insert into storage.objects (bucket_id, name) values ('assets', 'fonts/Inter.ttf')`);
      return fn(c);
    });
  }

  it("clients never see high-res print files, and only their own previews/attachments", async () => {
    for (const u of clientUsers) {
      await withObjects(async (c) => {
        await becomeUser(c, u.id);
        const { rows } = await c.query("select bucket_id, name from storage.objects");
        expect(rows.some((r) => r.bucket_id === "print-files"), u.label).toBe(false);
        expect(rows.some((r) => String(r.name).startsWith(u.other)), u.label).toBe(false);
        expect(rows.some((r) => r.bucket_id === "previews" && String(r.name).startsWith(u.own))).toBe(true);
        expect(rows.some((r) => String(r.name).includes("draft-version")), `${u.label} sees a preview with no approved version`).toBe(false);
        const slip = rows.some((r) => String(r.name).includes("payment-slips"));
        expect(slip, `${u.label} payment slip visibility`).toBe(!u.label.includes("viewer"));
      });
    }
  });

  it("clients cannot upload into another company's folder or into print-files", async () => {
    await withObjects(async (c) => {
      await becomeUser(c, U.aBuyer);
      await expect(c.query(
        `insert into storage.objects (bucket_id, name) values ('attachments', '${ORG_B}/revisions/x.png')`))
        .rejects.toThrow(/row-level security/);
    });
    await withObjects(async (c) => {
      await becomeUser(c, U.aAdmin);
      await expect(c.query(
        `insert into storage.objects (bucket_id, name) values ('print-files', '${ORG_A}/x/v9/hack.pdf')`))
        .rejects.toThrow(/row-level security/);
    });
    await withObjects(async (c) => {
      await becomeUser(c, U.aBuyer);
      const ok = await c.query(
        `insert into storage.objects (bucket_id, name) values ('attachments', '${ORG_A}/revisions/new-logo.png') returning id`);
      expect(ok.rowCount).toBe(1);
    });
  });

  it("staff: production can read print files of every client; sales only assigned", async () => {
    await withObjects(async (c) => {
      await becomeUser(c, U.production);
      const { rows } = await c.query("select name from storage.objects where bucket_id = 'print-files'");
      expect(rows).toHaveLength(2);
      await becomeUser(c, U.sales1);
      const s = await c.query("select name from storage.objects where bucket_id = 'print-files'");
      expect(s.rows.map((r) => String(r.name).slice(0, 36))).toEqual([ORG_A]);
    });
  });
});

describe("records that must never change", () => {
  it("an Approved for Print version cannot be edited or deleted, even by management", async () => {
    await as({ id: U.admin }, async (c) => {
      await expect(c.query(
        "update public.artwork_versions set change_notes = 'x' where id = '51000000-0000-4000-8000-0000000000a5'"))
        .rejects.toThrow(/locked/);
    });
    await as({ id: U.admin }, async (c) => {
      await expect(c.query("delete from public.artwork_versions where id = '51000000-0000-4000-8000-0000000000a5'"))
        .rejects.toThrow(/cannot be deleted/);
    });
    await asOwner(async (c) => {
      await expect(c.query("delete from public.files where id = '52000000-0000-4000-8000-0000000000a5'"))
        .rejects.toThrow(/cannot be deleted/);
    });
  });

  it("the audit log is append-only", async () => {
    await asOwner(async (c) => {
      await expect(c.query("update public.audit_logs set action = 'x'")).rejects.toThrow(/append-only/);
    });
    await asOwner(async (c) => {
      await expect(c.query("delete from public.audit_logs")).rejects.toThrow(/append-only/);
    });
  });
});

describe("account and invite rules", () => {
  it("a client cannot make themselves staff or re-activate a user", async () => {
    await as({ id: U.aAdmin }, async (c) => {
      await expect(c.query(`update public.profiles set staff_role = 'pa_admin' where id = '${U.aAdmin}'`))
        .rejects.toThrow(/not allowed/);
    });
    await as({ id: U.aAdmin }, async (c) => {
      const r = await c.query(`update public.profiles set full_name = 'Liza M.' where id = '${U.aAdmin}'`);
      expect(r.rowCount).toBe(1);
    });
  });

  it("only pa_admin can switch on high-res download", async () => {
    await as({ id: U.sales1 }, async (c) => {
      await expect(c.query(`update public.organizations set allow_highres_download = true where id = '${ORG_A}'`))
        .rejects.toThrow(/Only management/);
    });
    await as({ id: U.admin }, async (c) => {
      const r = await c.query(`update public.organizations set allow_highres_download = true where id = '${ORG_A}'`);
      expect(r.rowCount).toBe(1);
    });
  });

  it("client_admin invites outside the approved domain need staff approval", async () => {
    await as({ id: U.aAdmin }, async (c) => {
      const ins = (email: string) => c.query(
        `insert into public.invitations (organization_id, email, client_role, token_hash, invited_by)
         values ($1, $2, 'client_buyer', md5(random()::text), $3) returning status`, [ORG_A, email, U.aAdmin]);
      expect((await ins("new.hire@abccorp-demo.test")).rows[0].status).toBe("pending");
      const outside = await ins("someone@gmail.com");
      expect(outside.rows[0].status).toBe("needs_approval");
      await expect(c.query("update public.invitations set status = 'pending' where email = 'someone@gmail.com'"))
        .rejects.toThrow(/must approve/);
    });
  });

  it("client_viewer and client_buyer cannot invite users", async () => {
    for (const id of [U.aViewer, U.aBuyer]) {
      await as({ id }, async (c) => {
        await expect(c.query(
          `insert into public.invitations (organization_id, email, client_role, token_hash, invited_by)
           values ($1, 'x@abccorp-demo.test', 'client_buyer', 'h-${id}', $2)`, [ORG_A, id]))
          .rejects.toThrow(/row-level security/);
      });
    }
  });
});

describe("permission helpers never answer 'unknown'", () => {
  it("returns false (not NULL) for people outside the company", async () => {
    for (const id of [U.production, U.bAdmin, U.sales2]) {
      await as({ id }, async (c) => {
        const { rows } = await c.query(`select private.can_order($1) a, private.is_client_admin($1) b, private.can_see_prices($1) c,
          private.staff_can_manage($1) d, private.can_read_org($1) e`, [ORG_A]);
        for (const v of Object.values(rows[0])) expect(v === null, `${id}`).toBe(false);
      });
    }
  });
});

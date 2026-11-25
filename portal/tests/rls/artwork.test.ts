import { afterAll, describe, expect, it } from "vitest";
import { as, asOwner, becomeUser, pool, U } from "./db";

afterAll(async () => { await pool.end(); });

const BROCHURE = "50000000-0000-4000-8000-0000000000a1";      // ABC
const BROCHURE_V2 = "51000000-0000-4000-8000-0000000000a5";   // approved
const LABEL = "50000000-0000-4000-8000-0000000000b1";         // Sunrise

describe("artwork versions and approval", () => {
  it("staff create v3, add a file, approve it: v2 becomes superseded, the approval is recorded", async () => {
    await as({ id: U.sales1 }, async (c) => {
      const { rows: [{ id: v3 }] } = await c.query("select public.create_artwork_version($1, 'New hotline') as id", [BROCHURE]);
      const { rows: [{ version_no }] } = await c.query("select version_no from public.artwork_versions where id = $1", [v3]);
      expect(version_no).toBe(3);
      await expect(c.query("select public.approve_artwork_version($1)", [v3])).rejects.toThrow(/at least one file/);
    });
    await as({ id: U.sales1 }, async (c) => {
      const { rows: [{ id: v3 }] } = await c.query("select public.create_artwork_version($1) as id", [BROCHURE]);
      await c.query(`insert into public.files (organization_id, artwork_version_id, purpose, kind, external_url, uploaded_by)
                     select organization_id, id, 'artwork', 'drive_link', 'https://drive.google.com/x', $2 from public.artwork_versions where id = $1`, [v3, U.sales1]);
      await c.query("select public.approve_artwork_version($1, '203.0.113.9', 'test')", [v3]);
      const { rows } = await c.query("select id, status, is_locked from public.artwork_versions where print_item_id = $1 order by version_no", [BROCHURE]);
      expect(rows.map((r) => r.status)).toEqual(["superseded", "superseded", "approved"]);
      expect(rows.every((r) => r.is_locked)).toBe(true);
      const item = await c.query("select approved_version_id from public.print_items where id = $1", [BROCHURE]);
      expect(item.rows[0].approved_version_id).toBe(v3);
      const appr = await c.query("select approved_by_name, host(ip) ip from public.approvals where artwork_version_id = $1", [v3]);
      expect(appr.rows[0]).toMatchObject({ approved_by_name: "Paolo Reyes", ip: "203.0.113.9" });
      await expect(c.query("select public.approve_artwork_version($1)", [BROCHURE_V2])).rejects.toThrow(/cannot be approved again/);
    });
  });

  it("other people cannot create or approve versions", async () => {
    for (const id of [U.sales2, U.production, U.aAdmin, U.aBuyer, U.bAdmin]) {
      await as({ id }, async (c) => {
        await expect(c.query("select public.create_artwork_version($1)", [BROCHURE])).rejects.toThrow(/not found/);
      });
    }
    for (const id of [U.sales1, U.aAdmin]) {
      await as({ id }, async (c) => {
        await expect(c.query("select public.create_artwork_version($1)", [LABEL])).rejects.toThrow(/not found/);
      });
    }
  });

  it("signed-out visitors cannot call the functions at all", async () => {
    await as("anon", async (c) => {
      await expect(c.query("select public.approve_artwork_version($1)", [BROCHURE_V2])).rejects.toThrow(/permission denied/);
    });
  });

  it("clients can't approve directly by editing rows", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aAdmin);
      const r = await c.query("update public.artwork_versions set status = 'approved' where print_item_id = $1 and status = 'draft'", [BROCHURE]);
      expect(r.rowCount).toBe(0);
      await expect(c.query(`insert into public.approvals (organization_id, artwork_version_id, approved_by, approved_by_name)
        values ('20000000-0000-4000-8000-00000000000a', $1, $2, 'x')`, [BROCHURE_V2, U.aAdmin])).rejects.toThrow(/row-level security/);
    });
  });
});

describe("files on approved versions", () => {
  const LETTERHEAD_V1 = "51000000-0000-4000-8000-0000000000a3"; // approved, Drive link only
  it("can't get new files or lose files — except the archive copy of a Drive link", async () => {
    await as({ id: U.sales1 }, async (c) => {
      await expect(c.query(`update public.files set deleted_at = now() where artwork_version_id = $1`, [BROCHURE_V2])).rejects.toThrow(/cannot be removed/);
    });
    await as({ id: U.sales1 }, async (c) => {
      await expect(c.query(`insert into public.files (organization_id, artwork_version_id, purpose, kind, bucket, storage_path)
        values ('20000000-0000-4000-8000-00000000000a', $1, 'artwork', 'upload', 'print-files', 'x/y.pdf')`, [BROCHURE_V2])).rejects.toThrow(/locked/);
    });
    await as({ id: U.sales1 }, async (c) => {
      const ok = await c.query(`insert into public.files (organization_id, artwork_version_id, purpose, kind, bucket, storage_path)
        values ('20000000-0000-4000-8000-00000000000a', $1, 'artwork', 'upload', 'print-files', 'x/letterhead.pdf') returning id`, [LETTERHEAD_V1]);
      expect(ok.rowCount).toBe(1);
      const mark = await c.query(`update public.files set copied_to_archive_at = now() where artwork_version_id = $1 and kind = 'drive_link'`, [LETTERHEAD_V1]);
      expect(mark.rowCount).toBe(1);
    });
  });
});

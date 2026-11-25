import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asOwner, becomeUser, pool, U, ORG_A, ORG_B } from "./db";

afterAll(async () => { await pool.end(); });

const CARD = "50000000-0000-4000-8000-0000000000a2";          // ABC business card (approved v1)
const CARD_V1 = "51000000-0000-4000-8000-0000000000a2";
const CARD_P1 = "53000000-0000-4000-8000-0000000000a2";       // its preview page
const TAG = "50000000-0000-4000-8000-0000000000b2";           // Sunrise price tag
const TAG_V1 = "51000000-0000-4000-8000-0000000000b2";
const TAG_P1 = "53000000-0000-4000-8000-0000000000b2";
const ORDER_TAG = "70000000-0000-4000-8000-0000000000b2";

const pin = (rendition: string, comment: string, extra: Record<string, unknown> = {}) =>
  ({ rendition_id: rendition, page_no: 1, shape: "pin", x_pct: 40, y_pct: 60, comment, ...extra });

async function asRoot(c: PoolClient) { await c.query("reset role"); }

/** Expect a statement to fail without aborting the surrounding test transaction. */
async function expectFail(c: PoolClient, sql: string, params: unknown[], re: RegExp) {
  await c.query("savepoint sp");
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query("rollback to savepoint sp");
}

async function submit(c: PoolClient, item: string, base: string, markups: unknown[], opts: { notes?: string; fields?: unknown[]; files?: string[]; order?: string | null; parent?: string | null } = {}) {
  const { rows } = await c.query(
    "select public.submit_revision_request($1, $2, $3, $4::jsonb, $5::jsonb, $6::uuid[], $7, $8) as id",
    [item, base, opts.notes ?? "", JSON.stringify(markups), JSON.stringify(opts.fields ?? []), opts.files ?? [], opts.order ?? null, opts.parent ?? null]);
  return rows[0].id as string;
}

/** Staff create a new version with an uploaded file and a ready preview (storage simulated). */
async function makeProofVersion(c: PoolClient, item: string, org: string, staff: string) {
  await becomeUser(c, staff);
  const { rows: [{ id: version }] } = await c.query("select public.create_artwork_version($1, 'Revised') as id", [item]);
  const { rows: [{ id: file }] } = await c.query(
    `insert into public.files (organization_id, artwork_version_id, purpose, kind, bucket, storage_path, uploaded_by)
     values ($1::uuid, $2::uuid, 'artwork', 'upload', 'print-files', $1::text || '/x/' || $2::text || '/proof.pdf', $3) returning id`, [org, version, staff]);
  await asRoot(c);
  await c.query(`insert into public.preview_renditions (organization_id, file_id, page_no, side, preview_path, width, height, status)
                 values ($1::uuid, $2::uuid, 1, 'front', $1::text || '/proof/' || $2::text || '/p1.jpg', 1000, 600, 'ready')`, [org, file]);
  return { version, previewPath: `${org}/proof/${file}/p1.jpg` };
}

describe("revision requests: who can submit", () => {
  it("buyer and company admin can; viewer, other companies and staff cannot", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      const id = await submit(c, CARD, CARD_V1, [pin(CARD_P1, "Change mobile to 0917 123 4567"), { ...pin(CARD_P1, "Bigger logo"), shape: "box", w_pct: 20, h_pct: 10 }]);
      const { rows } = await c.query("select round_no, status, thread_id from public.revision_requests where id = $1", [id]);
      expect(rows[0]).toMatchObject({ round_no: 1, status: "open", thread_id: id });
      const m = await c.query("select count(*)::int n from public.revision_markups where revision_request_id = $1", [id]);
      expect(m.rows[0].n).toBe(2);
    });
    for (const who of [U.aViewer, U.bAdmin, U.bBuyer, U.production]) {
      await asOwner(async (c) => {
        await becomeUser(c, who);
        await expect(submit(c, CARD, CARD_V1, [pin(CARD_P1, "x")]), who).rejects.toThrow(/not found/);
      });
    }
  });

  it("rejects empty requests, wrong pages, draft bases and a second open revision", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      await expect(submit(c, CARD, CARD_V1, [])).rejects.toThrow(/at least one change/);
    });
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      await expect(submit(c, CARD, CARD_V1, [pin(TAG_P1, "page from another company")])).rejects.toThrow(/wrong page/);
    });
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      await submit(c, CARD, CARD_V1, [pin(CARD_P1, "first")]);
      await expect(submit(c, CARD, CARD_V1, [pin(CARD_P1, "second")])).rejects.toThrow(/already a revision in progress/);
    });
  });

  it("clients can attach only their own uploaded files", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      const { rows: [{ id: file }] } = await c.query(
        `insert into public.files (organization_id, purpose, kind, bucket, storage_path, uploaded_by, original_name)
         values ($1::uuid, 'revision_attachment', 'upload', 'attachments', $1::text || '/revisions/logo.png', $2, 'logo.png') returning id`, [ORG_A, U.aBuyer]);
      const id = await submit(c, CARD, CARD_V1, [pin(CARD_P1, "Use this logo", { attachment_file_ids: [file] })], { files: [] });
      const a = await c.query("select markup_id is not null as on_markup from public.revision_attachments where revision_request_id = $1", [id]);
      expect(a.rows).toEqual([{ on_markup: true }]);
      // another company's file id is refused
      await expect(submit(c, TAG, TAG_V1, [], { notes: "x", files: [file] })).rejects.toThrow(/not found/);
    });
  });
});

describe("the full loop: markups → revised proof → client approval", () => {
  it("works end to end, with order status following along and drafts hidden from the client", async () => {
    await asOwner(async (c) => {
      // Sunrise admin reviews the price tag for order PA-2026-000199
      await becomeUser(c, U.bAdmin);
      const rev = await submit(c, TAG, TAG_V1, [pin(TAG_P1, "Price is now ₱139.00")], {
        fields: [{ template_field_id: await fieldId(c, "price"), value: "₱139.00" }], order: ORDER_TAG,
      });
      await asRoot(c);
      expect((await c.query("select status from public.orders where id = $1", [ORDER_TAG])).rows[0].status).toBe("waiting_for_revisions");

      // staff prepare the proof — the client can't see the draft yet
      const { version, previewPath } = await makeProofVersion(c, TAG, ORG_B, U.sales2);
      await becomeUser(c, U.bAdmin);
      expect((await c.query("select count(*)::int n from public.artwork_versions where id = $1", [version])).rows[0].n).toBe(0);
      expect((await c.query("select count(*)::int n from public.preview_renditions where preview_path = $1", [previewPath])).rows[0].n).toBe(0);

      // only the assigned sales person can send it
      await becomeUser(c, U.sales1);
      await expectFail(c, "select public.send_revised_proof($1, $2)", [rev, version], /not found/);
      await becomeUser(c, U.sales2);
      await c.query("select public.send_revised_proof($1, $2, 'New price applied')", [rev, version]);
      await asRoot(c);
      expect((await c.query("select status from public.orders where id = $1", [ORDER_TAG])).rows[0].status).toBe("waiting_for_client_approval");
      const notes = await c.query("select count(*)::int n from public.notifications where kind = 'proof_ready' and link like '%' || $1", [rev]);
      expect(notes.rows[0].n).toBeGreaterThan(0);

      // now the client sees the proof and its preview
      await becomeUser(c, U.bAdmin);
      expect((await c.query("select status from public.artwork_versions where id = $1", [version])).rows[0].status).toBe("proof");
      expect((await c.query("select count(*)::int n from public.preview_renditions where preview_path = $1", [previewPath])).rows[0].n).toBe(1);

      // a viewer can't approve; another company can't approve
      await becomeUser(c, U.bViewer);
      await expectFail(c, "select public.approve_revised_proof($1)", [rev], /not found/);
      await becomeUser(c, U.aAdmin);
      await expectFail(c, "select public.approve_revised_proof($1)", [rev], /not found/);

      // the client approves
      await becomeUser(c, U.bAdmin);
      await c.query("select public.approve_revised_proof($1, '198.51.100.7', 'iPhone')", [rev]);
      await asRoot(c);
      const item = await c.query("select approved_version_id from public.print_items where id = $1", [TAG]);
      expect(item.rows[0].approved_version_id).toBe(version);
      const old = await c.query("select status from public.artwork_versions where id = $1", [TAG_V1]);
      expect(old.rows[0].status).toBe("superseded");
      const appr = await c.query("select approved_by_name, host(ip) ip, order_id from public.approvals where revision_request_id = $1", [rev]);
      expect(appr.rows[0]).toMatchObject({ approved_by_name: "Carlo Tan", ip: "198.51.100.7", order_id: ORDER_TAG });
      expect((await c.query("select status from public.revision_requests where id = $1", [rev])).rows[0].status).toBe("approved");
      expect((await c.query("select status from public.orders where id = $1", [ORDER_TAG])).rows[0].status).toBe("approved_for_print");
      await becomeUser(c, U.bAdmin);
      await expect(c.query("select public.approve_revised_proof($1)", [rev])).rejects.toThrow(/no longer waiting/);
    });
  });

  it("asking for more changes on a proof starts Revision 2 on that proof", async () => {
    await asOwner(async (c) => {
      await becomeUser(c, U.aBuyer);
      const r1 = await submit(c, CARD, CARD_V1, [pin(CARD_P1, "New title")]);
      await asRoot(c);
      const { version } = await makeProofVersion(c, CARD, ORG_A, U.sales1);
      await becomeUser(c, U.sales1);
      await c.query("select public.send_revised_proof($1, $2)", [r1, version]);
      await asRoot(c);
      const proofPage = (await c.query(`select r.id from public.preview_renditions r join public.files f on f.id = r.file_id where f.artwork_version_id = $1`, [version])).rows[0].id;
      await becomeUser(c, U.aBuyer);
      const r2 = await submit(c, CARD, version, [pin(proofPage, "Title still wrong")], { parent: r1 });
      const rows = (await c.query("select id, round_no, status, thread_id from public.revision_requests where thread_id = $1 order by round_no", [r1])).rows;
      expect(rows.map((r) => [r.round_no, r.status])).toEqual([[1, "changes_requested"], [2, "open"]]);
      expect(rows[1].id).toBe(r2);
      // the old proof can't be approved any more
      await expect(c.query("select public.approve_revised_proof($1)", [r1])).rejects.toThrow(/no longer waiting/);
    });
  });
});

async function fieldId(c: PoolClient, key: string): Promise<string> {
  const { rows } = await c.query("select id from public.template_fields where key = $1 and organization_id = $2", [key, ORG_B]);
  return rows[0].id;
}

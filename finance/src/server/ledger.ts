import type { Tx } from "./db";
import { finalize, type DraftEntry } from "@/lib/domain/posting";

export async function accountIdsByCode(tx: Tx, orgId: string): Promise<Map<string, string>> {
  const rows = await tx<{ id: string; code: string }[]>`select id, code from accounts where org_id = ${orgId}`;
  return new Map(rows.map((r) => [r.code, r.id]));
}

async function insertEntry(
  tx: Tx,
  orgId: string,
  draft: DraftEntry,
  meta: { kind: "auto" | "manual" | "reversal" | "opening"; sourceDocType?: string | null; sourceDocId?: string | null; reversesId?: string | null },
): Promise<string> {
  const entry = finalize(draft);
  const ids = await accountIdsByCode(tx, orgId);
  const [row] = await tx<{ id: string }[]>`
    insert into journal_entries (org_id, entry_date, memo, kind, source_doc_type, source_doc_id, reverses_id)
    values (${orgId}, ${entry.date}, ${entry.memo}, ${meta.kind}, ${meta.sourceDocType ?? null}, ${meta.sourceDocId ?? null}, ${meta.reversesId ?? null})
    returning id`;
  const entryId = row!.id;
  const lines = entry.lines.map((l, i) => {
    const accountId = ids.get(l.account);
    if (!accountId) throw new Error(`Account ${l.account} is missing from the chart of accounts`);
    return {
      org_id: orgId,
      entry_id: entryId,
      line_no: i + 1,
      account_id: accountId,
      debit_c: l.debit,
      credit_c: l.credit,
      party_type: l.partyType ?? null,
      party_id: l.partyId ?? null,
      project_id: l.projectId ?? null,
      memo: l.memo ?? null,
    };
  });
  await tx`insert into journal_lines ${tx(lines)}`;
  return entryId;
}

/** Reverse the live automatic entry for a document, if there is one. */
export async function reverseDocumentEntry(tx: Tx, orgId: string, docType: string, docId: string, reason: string): Promise<void> {
  const [live] = await tx<{ id: string; entry_date: string; memo: string }[]>`
    select id, entry_date, memo from journal_entries
    where org_id = ${orgId} and source_doc_type = ${docType} and source_doc_id = ${docId} and kind = 'auto' and reversed_at is null`;
  if (!live) return;
  const lines = await tx<{ code: string; debit_c: number; credit_c: number; party_type: DraftEntry["lines"][number]["partyType"]; party_id: string | null; project_id: string | null; memo: string | null }[]>`
    select a.code, l.debit_c, l.credit_c, l.party_type, l.party_id, l.project_id, l.memo
    from journal_lines l join accounts a on a.id = l.account_id
    where l.entry_id = ${live.id} order by l.line_no`;
  await tx`update journal_entries set reversed_at = now() where id = ${live.id}`;
  await insertEntry(
    tx,
    orgId,
    {
      date: live.entry_date,
      memo: `Reversal: ${live.memo} (${reason})`,
      lines: lines.map((l) => ({ account: l.code, debit: l.credit_c, credit: l.debit_c, partyType: l.party_type ?? undefined, partyId: l.party_id ?? undefined, projectId: l.project_id, memo: l.memo ?? undefined })),
    },
    { kind: "reversal", sourceDocType: docType, sourceDocId: docId, reversesId: live.id },
  );
}

/**
 * Post (or re-post) the automatic entry for a document: any previous live entry
 * is reversed first, so the ledger keeps a full history of corrections.
 */
export async function postDocument(tx: Tx, orgId: string, docType: string, docId: string, draft: DraftEntry | null): Promise<string | null> {
  await reverseDocumentEntry(tx, orgId, docType, docId, "document changed");
  if (!draft) return null;
  return insertEntry(tx, orgId, draft, { kind: "auto", sourceDocType: docType, sourceDocId: docId });
}

export async function postManualEntry(tx: Tx, orgId: string, draft: DraftEntry): Promise<string> {
  return insertEntry(tx, orgId, draft, { kind: "manual" });
}

export async function postOpeningEntry(tx: Tx, orgId: string, draft: DraftEntry): Promise<string> {
  await tx`select set_config('app.allow_opening', 'on', true)`;
  return insertEntry(tx, orgId, draft, { kind: "opening" });
}

export async function bumpVersion(tx: Tx, orgId: string, tables: string[]) {
  await tx`select app.bump_data_version(${orgId}, ${tables})`;
}

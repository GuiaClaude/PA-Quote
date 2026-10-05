"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalSide } from "@/lib/domain/coa";
import { PostingError } from "@/lib/domain/posting";
import { withUser } from "../db";
import { UserInputError } from "../documents";
import { bumpVersion, postManualEntry } from "../ledger";
import { requireEditor, requireSession } from "../session";
import { isoDate, peso, toError, uuid, type ActionResult } from "./util";

const jeSchema = z.object({
  date: isoDate,
  memo: z.string().trim().min(3, "Describe the entry."),
  lines: z
    .array(z.object({ account: z.string().min(1, "Pick an account on every line."), debit: peso, credit: peso, memo: z.string().optional() }))
    .min(2, "An entry needs at least two lines."),
});

export async function createManualEntryAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const d = jeSchema.parse(input);
    const id = await withUser(s, async (tx) => {
      try {
        const id = await postManualEntry(tx, s.orgId, {
          date: d.date,
          memo: d.memo,
          lines: d.lines.map((l) => ({ account: l.account, debit: l.debit, credit: l.credit, memo: l.memo || undefined })),
        });
        await bumpVersion(tx, s.orgId, ["journal_entries"]);
        return id;
      } catch (e) {
        if (e instanceof PostingError) throw new UserInputError(e.message);
        throw e;
      }
    });
    revalidatePath("/journal");
    return { ok: true, id };
  } catch (e) {
    return toError(e);
  }
}

const accountSchema = z.object({
  code: z.string().trim().regex(/^\d{4}$/, "Account codes are 4 digits."),
  name: z.string().trim().min(2, "Enter the account name."),
  type: z.enum(["asset", "liability", "equity", "revenue", "cogs", "expense", "other_income", "other_expense"]),
});

export async function createAccountAction(input: unknown): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const d = accountSchema.parse(input);
    await withUser(s, (tx) => tx`insert into accounts (org_id, code, name, type, normal_side) values (${s.orgId}, ${d.code}, ${d.name}, ${d.type}, ${normalSide(d.type)})`);
    revalidatePath("/accounts");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function lockPeriodAction(start: string, end: string): Promise<ActionResult> {
  try {
    const s = await requireEditor();
    const [a, b] = [isoDate.parse(start), isoDate.parse(end)];
    if (b < a) return { ok: false, error: "The end date is before the start date." };
    await withUser(s, (tx) => tx`insert into period_locks (org_id, period_start, period_end, locked_by) values (${s.orgId}, ${a}, ${b}, ${s.userId})`);
    revalidatePath("/settings");
    return { ok: true, message: "Period closed." };
  } catch (e) {
    return toError(e);
  }
}

export async function unlockPeriodAction(lockId: string, reason: string): Promise<ActionResult> {
  try {
    const s = await requireSession();
    if (s.role !== "owner") return { ok: false, error: "Only the Owner can unlock a closed period." };
    const r = z.string().trim().min(5, "Give a reason for unlocking (it is kept in the audit log).").parse(reason);
    await withUser(s, async (tx) => {
      await tx`select set_config('app.audit_reason', ${r}, true)`;
      await tx`update period_locks set unlocked_at = now(), unlocked_by = ${s.userId}, unlock_reason = ${r} where id = ${uuid.parse(lockId)}`;
    });
    revalidatePath("/settings");
    return { ok: true, message: "Period unlocked." };
  } catch (e) {
    return toError(e);
  }
}

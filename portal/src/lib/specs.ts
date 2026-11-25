import { createHash } from "node:crypto";
import { canonicalSpec, type Spec } from "./spec-canonical";

export { specSchema, canonicalSpec, splitList, type Spec } from "./spec-canonical";

/** SHA-256 of the canonical specs — compared for instant reorder quotes. */
export function specSignature(spec: Partial<Spec>): string {
  return createHash("sha256").update(canonicalSpec(spec)).digest("hex");
}

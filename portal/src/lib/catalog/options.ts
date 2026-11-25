import type { Spec } from "@/lib/spec-canonical";

/** Catalog option kinds and how each one fills the specs. */
export const OPTION_KINDS = ["size", "material", "colors", "finishing", "packaging", "quantity"] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];
export const OPTION_LABELS: Record<OptionKind, string> = {
  size: "Size", material: "Paper / material", colors: "Colours", finishing: "Finishing", packaging: "Packaging", quantity: "Quantities",
};

export type CatalogOption = { id: string; kind: OptionKind; label: string; value: Record<string, unknown> };

/** Turn the option a staff member typed into its stored value. */
export function optionValue(kind: OptionKind, label: string, extra: { gsm?: number | null; quantities?: number[] } = {}): Record<string, unknown> {
  switch (kind) {
    case "size": return { size: label };
    case "material": return { material: label, gsm: extra.gsm ?? null };
    case "colors": return { colors: label };
    case "finishing": return { finishing: [label] };
    case "packaging": return { packaging: label };
    case "quantity": return { quantities: (extra.quantities ?? []).filter((q) => q > 0).sort((a, b) => a - b) };
  }
}

/** Specs from the options a client picked (one per kind; finishing can be several). */
export function specFromSelection(options: CatalogOption[], selected: { single: Partial<Record<OptionKind, string>>; finishing: string[] }): Partial<Spec> {
  const byId = new Map(options.map((o) => [o.id, o]));
  const spec: Partial<Spec> = { finishing: [] };
  for (const kind of ["size", "material", "colors", "packaging"] as const) {
    const o = selected.single[kind] ? byId.get(selected.single[kind]!) : undefined;
    if (!o) continue;
    if (kind === "material") { spec.material = String(o.value.material ?? o.label); spec.gsm = (o.value.gsm as number | null) ?? null; }
    else (spec as Record<string, unknown>)[kind] = String(o.value[kind] ?? o.label);
  }
  spec.finishing = selected.finishing.map((id) => byId.get(id)).filter(Boolean).flatMap((o) => (o!.value.finishing as string[]) ?? [o!.label]);
  return spec;
}

/** Human summary: "A5 · Gloss Art 120gsm · 4/0 · matte lamination" */
export function specSummary(spec: Partial<Spec>): string {
  return [spec.size, [spec.material, spec.gsm ? `${spec.gsm}gsm` : ""].filter(Boolean).join(" "), spec.colors, ...(spec.finishing ?? []), spec.packaging]
    .filter((x) => x && String(x).trim()).join(" · ");
}

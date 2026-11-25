const LABELS: Record<string, string> = {
  size: "Size", material: "Material / paper", gsm: "GSM", colors: "Colours", finishing: "Finishing", packaging: "Packaging", notes: "Notes",
};

export function SpecList({ spec }: { spec: Record<string, unknown> }) {
  const rows = Object.entries(spec ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (!rows.length) return <p className="text-sm text-muted-foreground">No specs recorded.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{LABELS[k] ?? k}</dt>
          <dd className="font-medium">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

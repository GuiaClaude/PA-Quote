/** Print Amplified hexagon mark (same artwork as the PA-Quote CE builder). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="#fff" />
      <polygon points="50,50 50,5 93,28" fill="#E0245A" />
      <polygon points="50,50 93,28 93,72" fill="#00AEBF" />
      <polygon points="50,50 93,72 50,95" fill="#E8457A" />
      <polygon points="50,50 50,95 7,72" fill="#3BBFC8" />
      <polygon points="50,50 7,72 7,28" fill="#00AEBF" opacity=".75" />
      <polygon points="50,50 7,28 50,5" fill="#D4185A" opacity=".85" />
      <polygon points="50,5 93,28 93,72 50,95 7,72 7,28" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="text-[15px] tracking-tight">
      <span className="font-light text-[#0097a7]">Print</span>
      <span className="font-bold text-accent">Amplified</span>
      <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-strong">Finance</span>
    </span>
  );
}

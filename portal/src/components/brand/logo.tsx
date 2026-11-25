/** Print Amplified hexagon mark + wordmark (placeholder until the final logo is uploaded in Settings). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden className={className}>
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

export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={className} style={{ letterSpacing: "-0.02em" }}>
      <span style={{ color: inverted ? "#7fdbe3" : "#007C89", fontWeight: 300 }}>Print</span>
      <span style={{ color: inverted ? "#ff6f93" : "#C81E4E", fontWeight: 800 }}>Amplified</span>
    </span>
  );
}

export function Logo({ logoUrl, inverted, size = 30 }: { logoUrl?: string | null; inverted?: boolean; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="Print Amplified" style={{ height: size }} className="w-auto" />;
  }
  return (
    <span className="inline-flex items-center gap-2 text-lg">
      <LogoMark size={size} />
      <Wordmark inverted={inverted} />
    </span>
  );
}

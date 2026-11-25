import { Hammer } from "lucide-react";
import { t } from "@/i18n";

export function PhaseNotice({ phase, children }: { phase: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed bg-surface p-4 text-sm">
      <Hammer className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div><p className="font-medium">{t.common.phaseNote(phase)}</p>{children ? <div className="mt-1 text-muted-foreground">{children}</div> : null}</div>
    </div>
  );
}

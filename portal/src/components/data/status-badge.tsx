import {
  Ban, CheckCircle2, CircleDot, Clock, Cog, Eye, FileCheck2, Hourglass, PackageCheck, PauseCircle,
  PenLine, Printer, ScanSearch, Scissors, Send, Truck, Wallet, CircleDashed,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { t } from "@/i18n";

/** One colour + icon + label per status, used everywhere (lists, timelines, cards). */
export const ORDER_STATUS_META: Record<string, { tone: BadgeTone; Icon: typeof Clock; group: "new" | "action" | "production" | "done" | "stopped" }> = {
  submitted: { tone: "info", Icon: Send, group: "new" },
  confirmed: { tone: "brand", Icon: CheckCircle2, group: "production" },
  prepress: { tone: "brand", Icon: Cog, group: "production" },
  waiting_for_revisions: { tone: "warning", Icon: PenLine, group: "action" },
  waiting_for_client_approval: { tone: "warning", Icon: Eye, group: "action" },
  approved_for_print: { tone: "brand", Icon: FileCheck2, group: "production" },
  printing: { tone: "brand", Icon: Printer, group: "production" },
  finishing: { tone: "brand", Icon: Scissors, group: "production" },
  quality_check: { tone: "brand", Icon: ScanSearch, group: "production" },
  ready_for_pickup: { tone: "success", Icon: PackageCheck, group: "production" },
  out_for_delivery: { tone: "success", Icon: Truck, group: "production" },
  delivered: { tone: "success", Icon: CheckCircle2, group: "done" },
  closed: { tone: "neutral", Icon: CircleDot, group: "done" },
  on_hold: { tone: "danger", Icon: PauseCircle, group: "stopped" },
  cancelled: { tone: "neutral", Icon: Ban, group: "stopped" },
};

export function OrderStatusBadge({ status, audience = "client" }: { status: string; audience?: "client" | "staff" }) {
  const meta = ORDER_STATUS_META[status] ?? { tone: "neutral" as const, Icon: Clock };
  let label = (t.status as Record<string, string>)[status] ?? status;
  if (audience === "staff" && status === "waiting_for_client_approval") label = "Waiting for Client Approval";
  return (
    <Badge tone={meta.tone}>
      <meta.Icon aria-hidden />
      {label}
    </Badge>
  );
}

const PAY: Record<string, { tone: BadgeTone; Icon: typeof Clock }> = {
  unpaid: { tone: "danger", Icon: CircleDashed },
  partially_paid: { tone: "warning", Icon: Hourglass },
  paid: { tone: "success", Icon: Wallet },
};

export function PaymentBadge({ status }: { status: string }) {
  const meta = PAY[status] ?? PAY.unpaid!;
  return (
    <Badge tone={meta.tone}>
      <meta.Icon aria-hidden />
      {(t.payment as Record<string, string>)[status] ?? status}
    </Badge>
  );
}

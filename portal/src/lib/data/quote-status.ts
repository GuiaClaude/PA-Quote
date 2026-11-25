import type { BadgeTone } from "@/components/ui/badge";

export const REQUEST_STATUS: Record<string, { client: string; staff: string; tone: BadgeTone }> = {
  draft: { client: "Draft", staff: "Draft", tone: "neutral" },
  submitted: { client: "Waiting for your quote", staff: "Waiting for reply", tone: "warning" },
  quoted: { client: "Quote ready", staff: "Quote sent", tone: "accent" },
  accepted: { client: "Accepted — ordered", staff: "Accepted", tone: "success" },
  declined: { client: "Declined", staff: "Declined", tone: "neutral" },
  expired: { client: "Expired", staff: "Expired", tone: "neutral" },
  cancelled: { client: "Cancelled", staff: "Cancelled", tone: "neutral" },
};

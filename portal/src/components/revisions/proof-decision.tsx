"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PenLine } from "lucide-react";
import { approveProof } from "@/lib/actions/revisions";
import { CompareSlider } from "./compare-slider";
import { ReviewClient } from "./review-client";
import type { ViewerPage } from "@/components/files/preview-viewer";
import type { CanvasField } from "@/components/templates/template-canvas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-submit";

/** The revised proof: compare with the previous version, then Approve or ask for more changes. */
export function ProofDecision({ revisionId, canAct, proofMessage, before, after, printItemId, organizationId, itemName, resultVersionId, template, maxMb }: {
  revisionId: string; canAct: boolean; proofMessage: string | null; before: ViewerPage[]; after: ViewerPage[];
  printItemId: string; organizationId: string; itemName: string; resultVersionId: string;
  template: { backgroundUrl: string; previewWidth: number; previewHeight: number; pageWidthPt: number | null; fields: CanvasField[] } | null; maxMb: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"compare" | "changes">("compare");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (mode === "changes") {
    return (
      <Card>
        <CardHeader><CardTitle>Mark more changes on the revised proof</CardTitle></CardHeader>
        <CardContent>
          <ReviewClient printItemId={printItemId} organizationId={organizationId} itemName={itemName} baseVersionId={resultVersionId}
            pages={after} template={template} parentRevisionId={revisionId} startInRevise maxMb={maxMb} />
          <Button variant="ghost" className="mt-2" onClick={() => setMode("compare")}>Back to the proof</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-accent/40">
      <CardHeader><CardTitle>Your revised proof is ready</CardTitle>{proofMessage ? <p className="rounded-lg bg-surface-muted p-3 text-sm"><b>Print Amplified:</b> {proofMessage}</p> : null}</CardHeader>
      <CardContent className="space-y-4">
        <CompareSlider before={before} after={after} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canAct ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <ConfirmButton destructive={false} size="lg" className="h-14 text-base" disabled={pending}
              title="Approve this proof for print?"
              message="This becomes the Approved for Print version used for production and future reorders. Your name, the date and time, and your IP address are recorded."
              confirmLabel="Approve for print"
              onConfirm={() => start(async () => { const r = await approveProof(revisionId); if (r?.error) setError(r.error); else router.replace(`/app/revisions/${revisionId}?approved=1`); })}>
              <CheckCircle2 />Approve
            </ConfirmButton>
            <Button size="lg" variant="outline" className="h-14 text-base" onClick={() => setMode("changes")}><PenLine />I have more changes</Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">Your company admin or buyer can approve this proof.</p>}
      </CardContent>
    </Card>
  );
}

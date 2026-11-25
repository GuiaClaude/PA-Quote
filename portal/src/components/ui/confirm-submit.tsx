"use client";
import { useRef, useState } from "react";
import { Button, type ButtonProps } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { t } from "@/i18n";

/** A submit button that asks "Are you sure?" first (for destructive actions inside a <form>). */
export function ConfirmSubmit({ title, message, confirmLabel, destructive = true, children, ...props }: ButtonProps & {
  title: string; message: string; confirmLabel: string; destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button type="button" {...props} onClick={() => setOpen(true)}>{children}</Button>
      <button ref={ref} type="submit" hidden aria-hidden tabIndex={-1} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
            <Button variant={destructive ? "destructive" : "default"} onClick={() => { setOpen(false); ref.current?.form?.requestSubmit(); }}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Same, but runs a callback instead of submitting a form. */
export function ConfirmButton({ title, message, confirmLabel, onConfirm, destructive = true, children, ...props }: ButtonProps & {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" {...props} onClick={() => setOpen(true)}>{children}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
            <Button variant={destructive ? "destructive" : "default"} onClick={() => { setOpen(false); onConfirm(); }}>{confirmLabel}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

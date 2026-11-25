"use client";
import { useEffect } from "react";

/** Registers the service worker (offline page + push notifications). Production only. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* not fatal */ });
  }, []);
  return null;
}

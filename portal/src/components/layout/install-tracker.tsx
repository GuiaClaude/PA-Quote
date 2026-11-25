"use client";
import { useEffect } from "react";

/**
 * Remembers (in a cookie) whether the app is running as an installed app
 * ("Add to Home Screen"). Installed apps get the longer "remember me" session.
 */
export function InstallTracker() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    document.cookie = `pa_app=${standalone ? "1" : "0"}; path=/; max-age=34560000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, []);
  return null;
}

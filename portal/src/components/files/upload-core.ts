"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** SHA-256 of a file, computed in the browser (used to spot duplicates before uploading). */
export async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload straight from the browser to the private "print-files" bucket with
 * the user's own login (storage security rules apply), reporting progress.
 * Large files never pass through our web server.
 */
export async function uploadToPrintFiles(path: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return uploadToBucket("print-files", path, file, onProgress);
}

/** Same, for any private bucket the user may write to (e.g. "attachments"). */
export async function uploadToBucket(bucket: "print-files" | "attachments", path: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status}).`;
      try { const b = JSON.parse(xhr.responseText) as { message?: string }; if (b.message) msg = b.message; } catch { /* keep default */ }
      if (xhr.status === 413 || /size/i.test(msg)) msg = "This file is larger than the storage limit.";
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network problem — check your connection and try again."));
    xhr.send(file);
  });
}

export function newObjectPath(orgId: string, itemId: string, folder: string, fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-90) || "file";
  return `${orgId}/${itemId}/${folder}/${crypto.randomUUID()}-${safe}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

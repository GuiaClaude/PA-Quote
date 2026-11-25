import { createHash, createHmac, randomBytes } from "node:crypto";

/** Random single-use token for invite links (sent by email, never stored). */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What we store: the SHA-256 of the token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Device ids are stored as a keyed hash, never raw. */
export function hashDeviceId(deviceId: string, secret: string): string {
  return createHmac("sha256", secret).update(deviceId).digest("hex");
}

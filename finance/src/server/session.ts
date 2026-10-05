import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { sql } from "./db";

export type Role = "owner" | "bookkeeper" | "viewer";

export interface Session {
  userId: string;
  orgId: string;
  role: Role;
  name: string;
  email: string;
  orgName: string;
}

const COOKIE = "pa_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to a long random string (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user with their organisation and role, or null. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }
  // Membership lookup runs as the server (not under RLS) because it decides who the user is.
  const rows = await sql<{ org_id: string; role: Role; full_name: string; email: string; org_name: string }[]>`
    select m.org_id, m.role, p.full_name, u.email, o.name as org_name
    from memberships m
    join auth.users u on u.id = m.user_id
    join profiles p on p.user_id = m.user_id
    join organizations o on o.id = m.org_id
    where m.user_id = ${userId}
    order by m.created_at
    limit 1`;
  const r = rows[0];
  if (!r) return null;
  return { userId, orgId: r.org_id, role: r.role, name: r.full_name, email: r.email, orgName: r.org_name };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export function canEdit(s: Session) {
  return s.role === "owner" || s.role === "bookkeeper";
}

export async function requireEditor(): Promise<Session> {
  const s = await requireSession();
  if (!canEdit(s)) throw new Error("Your role (Viewer) can only read. Ask the Owner for Bookkeeper access.");
  return s;
}

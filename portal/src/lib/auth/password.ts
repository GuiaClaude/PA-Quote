import { z } from "zod";

/**
 * Password rule (shown to users in plain words in i18n `auth.passwordRules`):
 * at least 12 characters, at least 3 of the 4 character groups, and not
 * containing the user's name or the part of the email before the @.
 */
export function passwordProblems(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("Use at least 12 characters.");
  if (password.length > 128) problems.push("Use at most 128 characters.");
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (groups < 3) problems.push("Mix at least 3 of: lowercase, uppercase, numbers, symbols.");
  const lower = password.toLowerCase();
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) problems.push("Don't use your email in the password.");
  for (const part of (context.name ?? "").toLowerCase().split(/\s+/)) {
    if (part.length >= 3 && lower.includes(part)) {
      problems.push("Don't use your name in the password.");
      break;
    }
  }
  if (/^(.)\1+$/.test(password) || /^(?:password|qwerty|123456)/i.test(password)) {
    problems.push("Choose a less common password.");
  }
  return problems;
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

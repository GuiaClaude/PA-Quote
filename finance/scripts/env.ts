import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env.local loader for scripts (Next.js loads it automatically for the app). */
export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(__dirname, "..", name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
}

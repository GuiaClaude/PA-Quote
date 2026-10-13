// Usage: npm run user:create -- --email a@b.com --name "Name" --roles sysadmin,approver   (password read from PA_NEW_PASSWORD or prompted)
import readline from 'node:readline/promises';
import { migrate } from '../migrate.js';
import { createUser } from '../services/auth.js';
import { getPool } from '../db.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => { const [k, ...v] = s.trim().split(' '); return [k, v.join(' ').replace(/^"|"$/g, '')]; }));
await migrate();
let password = process.env.PA_NEW_PASSWORD;
if (!password) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question('Password (min 10 chars): ');
  rl.close();
}
const u = await createUser({ email: args.email, name: args.name || args.email, password, roles: (args.roles || '').split(',').filter(Boolean) }, { type: 'system', id: null, label: 'cli' });
console.log('Created user', u);
await getPool().end();

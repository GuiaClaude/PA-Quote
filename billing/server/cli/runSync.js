import { migrate } from '../migrate.js';
import { runSync } from '../services/sync.js';
import { getPool } from '../db.js';
await migrate();
const r = await runSync({ trigger: 'manual' });
console.log(JSON.stringify(r, null, 2));
await getPool().end();
process.exit(r.status === 'failed' ? 1 : 0);

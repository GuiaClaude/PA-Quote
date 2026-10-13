// Runs the weekly collection run now (idempotent for the current week). Suitable for an external cron.
import { migrate } from '../migrate.js';
import { runCollection } from '../services/collection.js';
import { getPool } from '../db.js';
await migrate();
const r = await runCollection({ trigger: process.env.PA_TRIGGER || 'external_cron' });
console.log(JSON.stringify(r, null, 2));
await getPool().end();
process.exit(r.status === 'failed' ? 1 : 0);

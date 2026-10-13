import { migrate } from '../migrate.js';
import { getPool } from '../db.js';
const ran = await migrate();
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date');
await getPool().end();

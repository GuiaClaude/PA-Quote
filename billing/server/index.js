import { config } from './config.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

const ran = await migrate();
if (ran.length) console.log('Applied migrations:', ran.join(', '));
if (!config.encryptionKey) console.warn('WARNING: APP_ENCRYPTION_KEY is not set — Google cannot be connected until it is.');
createApp().listen(config.port, () => console.log(`PA Billing listening on :${config.port}`));
if (config.enableInternalScheduler) await startScheduler();
else console.log('Internal scheduler disabled (ENABLE_INTERNAL_SCHEDULER=false); use POST /api/cron/monday from an external scheduler.');

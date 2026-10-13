// Central configuration. All secrets come from the environment; nothing here is sent to the browser.
const env = process.env;

export const config = {
  port: Number(env.PORT || 8080),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres@127.0.0.1:54329/pa_billing',
  appBaseUrl: env.APP_BASE_URL || 'http://localhost:8080',
  // 32-byte key (hex or base64) used to encrypt the Google refresh token at rest.
  encryptionKey: env.APP_ENCRYPTION_KEY || '',
  sessionTtlHours: Number(env.SESSION_TTL_HOURS || 12),
  cookieSecure: env.COOKIE_SECURE !== 'false',
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: env.GOOGLE_REDIRECT_URI || `${env.APP_BASE_URL || 'http://localhost:8080'}/api/google/oauth/callback`,
  },
  // Shared secret for an external scheduler (e.g. Cloud Scheduler) calling the cron endpoint.
  cronSecret: env.CRON_SECRET || '',
  // Run the in-process Monday scheduler. Disable when an external scheduler is used.
  enableInternalScheduler: env.ENABLE_INTERNAL_SCHEDULER !== 'false',
  timezone: 'Asia/Manila',
};

export const ROLES = ['accounting', 'approver', 'sender', 'management', 'sysadmin'];

import { google } from 'googleapis';
import { query } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { oauthClient } from './index.js';
import { ALL_SCOPES } from './scopes.js';
import { audit } from '../services/audit.js';

export function buildAuthUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline', prompt: 'consent', include_granted_scopes: false, scope: ALL_SCOPES, state,
  });
}

export async function handleCallback(code, actor) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('Google did not return a refresh token. Remove the app from your Google account permissions and reconnect.');
  client.setCredentials(tokens);
  const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  const granted = String(tokens.scope || '').split(/\s+/).filter(Boolean);
  await query(
    `INSERT INTO google_credentials(id, account_email, refresh_token_enc, scopes, connected_at, connected_by)
     VALUES (1,$1,$2,$3,now(),$4)
     ON CONFLICT (id) DO UPDATE SET account_email=EXCLUDED.account_email, refresh_token_enc=EXCLUDED.refresh_token_enc,
       scopes=EXCLUDED.scopes, connected_at=now(), connected_by=EXCLUDED.connected_by`,
    [data.email, encrypt(tokens.refresh_token), granted, actor.id],
  );
  await audit(null, actor, 'google.connected', 'integration', 'google', { after: { account: data.email, scopes: granted } });
  return { account: data.email, scopes: granted };
}

export async function disconnect(actor) {
  await query('DELETE FROM google_credentials WHERE id=1');
  await audit(null, actor, 'google.disconnected', 'integration', 'google');
}

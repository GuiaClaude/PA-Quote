import { google } from 'googleapis';
import { config } from '../config.js';
import { query } from '../db.js';
import { decrypt } from '../lib/crypto.js';
import { SCOPES } from './scopes.js';

export class IntegrationError extends Error {
  constructor(integration, message, { uncertain = false } = {}) {
    super(message);
    this.integration = integration;
    this.uncertain = uncertain;  // true when the remote side may have applied the action
  }
}

let override = null;
/** Tests inject in-memory fakes here. */
export function setIntegrationsOverride(x) { override = x; }

export function oauthClient() {
  if (!config.google.clientId || !config.google.clientSecret) throw new IntegrationError('oauth', 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export async function getCredentialRow() {
  const { rows } = await query('SELECT account_email, scopes, connected_at FROM google_credentials WHERE id=1');
  return rows[0] || null;
}

async function authorizedClient() {
  const { rows } = await query('SELECT * FROM google_credentials WHERE id=1');
  if (!rows.length) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(rows[0].refresh_token_enc) });
  return { client, account: rows[0].account_email, scopes: rows[0].scopes };
}

const has = (scopes, needed) => needed.every((s) => scopes.includes(s));

export async function logIntegrationError(integration, message, context) {
  await query('INSERT INTO integration_errors(integration, message, context) VALUES ($1,$2,$3)', [integration, message, context ? JSON.stringify(context) : null]).catch(() => {});
}

/**
 * Returns adapters. Each is null when not authorized for that function, so callers can
 * report precisely which integration is unconfigured.
 */
export async function getIntegrations() {
  if (override) return override;
  let auth;
  try { auth = await authorizedClient(); } catch (e) {
    await logIntegrationError('oauth', e.message);
    return { connected: false, error: e.message, sheets: null, drive: null, gmail: null };
  }
  if (!auth) return { connected: false, sheets: null, drive: null, gmail: null };
  const { client, account, scopes } = auth;
  return {
    connected: true,
    account,
    sheets: has(scopes, SCOPES.sheets) ? makeSheets(client) : null,
    drive: has(scopes, SCOPES.drive) ? makeDrive(client) : null,
    gmail: has(scopes, SCOPES.gmail) ? makeGmail(client, account) : null,
  };
}

const quoteTab = (t) => `'${String(t).replace(/'/g, "''")}'`;

function wrapErr(integration, fn) {
  return async (...a) => {
    try { return await fn(...a); } catch (e) {
      if (e instanceof IntegrationError) throw e;
      const msg = e?.response?.data?.error?.message || e.message;
      await logIntegrationError(integration, msg);
      // Network errors / timeouts / 5xx leave the remote outcome unknown.
      const status = e?.response?.status;
      throw new IntegrationError(integration, msg, { uncertain: !status || status >= 500 });
    }
  };
}

function makeSheets(auth) {
  const api = google.sheets({ version: 'v4', auth });
  return {
    getMetadata: wrapErr('sheets', async (spreadsheetId) => {
      const { data } = await api.spreadsheets.get({
        spreadsheetId,
        fields: 'properties(title,timeZone,locale),sheets(properties(title,sheetId,gridProperties),protectedRanges(range,description,warningOnly),basicFilter(range))',
      });
      return {
        title: data.properties.title,
        timeZone: data.properties.timeZone,
        locale: data.properties.locale,
        tabs: data.sheets.map((s) => ({
          title: s.properties.title,
          sheetId: s.properties.sheetId,
          rowCount: s.properties.gridProperties?.rowCount,
          columnCount: s.properties.gridProperties?.columnCount,
          protectedRanges: (s.protectedRanges || []).length,
          hasFilter: !!s.basicFilter,
        })),
      };
    }),
    getValues: wrapErr('sheets', async (spreadsheetId, tabName, render = 'UNFORMATTED_VALUE') => {
      const { data } = await api.spreadsheets.values.get({
        spreadsheetId, range: quoteTab(tabName), valueRenderOption: render,
        dateTimeRenderOption: render === 'FORMATTED_VALUE' ? undefined : 'SERIAL_NUMBER', majorDimension: 'ROWS',
      });
      return data.values || [];
    }),
    /** Formula (if any) and effective value of a single cell. */
    getCell: wrapErr('sheets', async (spreadsheetId, tabName, a1) => {
      const range = `${quoteTab(tabName)}!${a1}`;
      const [f, v] = await Promise.all([
        api.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'FORMULA' }),
        api.spreadsheets.values.get({ spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }),
      ]);
      const formula = f.data.values?.[0]?.[0];
      return { formula: typeof formula === 'string' && formula.startsWith('=') ? formula : null, value: v.data.values?.[0]?.[0] ?? null };
    }),
    /** Writes ONE cell's value only — formatting, validation and other cells are untouched. */
    updateCell: wrapErr('sheets', async (spreadsheetId, tabName, a1, value) => {
      const range = `${quoteTab(tabName)}!${a1}`;
      const { data } = await api.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [[value]] } });
      return { updatedRange: data.updatedRange };
    }),
  };
}

function makeDrive(auth) {
  const api = google.drive({ version: 'v3', auth });
  return {
    createFolder: wrapErr('drive', async (name) => {
      const { data } = await api.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id,name,webViewLink' });
      return data;
    }),
    getFile: wrapErr('drive', async (fileId) => (await api.files.get({ fileId, fields: 'id,name,mimeType,webViewLink,trashed' })).data),
    uploadPdf: wrapErr('drive', async ({ folderId, name, buffer, appProperties }) => {
      const { Readable } = await import('node:stream');
      const { data } = await api.files.create({
        requestBody: { name, parents: folderId ? [folderId] : undefined, mimeType: 'application/pdf', appProperties },
        media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
        fields: 'id,webViewLink',
      });
      return data;
    }),
  };
}

function makeGmail(auth, account) {
  const api = google.gmail({ version: 'v1', auth });
  return {
    account,
    profile: wrapErr('gmail', async () => (await api.users.getProfile({ userId: 'me' })).data),
    createDraft: wrapErr('gmail', async (raw) => (await api.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } })).data),
    updateDraft: wrapErr('gmail', async (id, raw) => (await api.users.drafts.update({ userId: 'me', id, requestBody: { message: { raw } } })).data),
    draftExists: wrapErr('gmail', async (id) => {
      try { await api.users.drafts.get({ userId: 'me', id, format: 'minimal' }); return true; } catch (e) {
        if (e?.response?.status === 404) return false;
        throw e;
      }
    }),
    sendDraft: wrapErr('gmail', async (id) => {
      const { data } = await api.users.drafts.send({ userId: 'me', requestBody: { id } });
      return { id: data.id, threadId: data.threadId, labelIds: data.labelIds };
    }),
    sendMessage: wrapErr('gmail', async (raw) => (await api.users.messages.send({ userId: 'me', requestBody: { raw } })).data),
    /** Look through recent SENT mail for our X-PA-Send-Key header (metadata only, no bodies). */
    findSentBySendKey: wrapErr('gmail', async (sendKey) => {
      const { data } = await api.users.messages.list({ userId: 'me', labelIds: ['SENT'], maxResults: 100 });
      for (const m of data.messages || []) {
        const { data: md } = await api.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['X-PA-Send-Key'] });
        const h = (md.payload?.headers || []).find((x) => x.name.toLowerCase() === 'x-pa-send-key');
        if (h?.value === sendKey) return { id: md.id, threadId: md.threadId, labelIds: md.labelIds };
      }
      return null;
    }),
    /** Bounce detection: delivery-status notifications referencing a sent thread. */
    threadLabels: wrapErr('gmail', async (id) => (await api.users.messages.get({ userId: 'me', id, format: 'minimal' })).data.labelIds || []),
  };
}

// Least-privilege scopes, one per function. Each is requested explicitly at consent time.
export const SCOPES = {
  identity: ['openid', 'email'],
  // Read the Job Order List and write approved values back to mapped cells.
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  // drive.file: only files/folders this app creates (the SOA folder and PDFs) — no access to the rest of Drive.
  drive: ['https://www.googleapis.com/auth/drive.file'],
  // gmail.compose: create/update drafts and send them. gmail.metadata: read headers of sent mail
  // (no bodies) to reconcile an uncertain send before any retry.
  gmail: ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.metadata'],
};
export const ALL_SCOPES = [...SCOPES.identity, ...SCOPES.sheets, ...SCOPES.drive, ...SCOPES.gmail];

-- Print Amplified OPC - Billing / AR / Collection system
-- Initial schema. Money is stored as NUMERIC(14,2) in PHP; JS converts to integer centavos.

-- ───────────────────────── Users, roles, sessions ─────────────────────────
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  roles         TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT roles_valid CHECK (roles <@ ARRAY['accounting','approver','sender','management','sysadmin']::TEXT[])
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- ───────────────────────── Settings & Google credentials ─────────────────────────
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  INT REFERENCES users(id)
);

CREATE TABLE google_credentials (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single integration account
  account_email      TEXT NOT NULL,
  refresh_token_enc  TEXT NOT NULL,                             -- AES-256-GCM, never sent to browser
  scopes             TEXT[] NOT NULL,
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by       INT REFERENCES users(id)
);

CREATE TABLE integration_errors (
  id          BIGSERIAL PRIMARY KEY,
  integration TEXT NOT NULL,          -- sheets | drive | gmail | oauth
  message     TEXT NOT NULL,
  context     JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Clients ─────────────────────────
CREATE TABLE clients (
  id                        SERIAL PRIMARY KEY,
  client_code               TEXT NOT NULL UNIQUE,
  registered_name           TEXT NOT NULL,
  trade_name                TEXT,
  billing_contact           TEXT,
  ap_contact_name           TEXT,
  approved_billing_email    TEXT,
  additional_recipients     TEXT[] NOT NULL DEFAULT '{}',
  billing_address           TEXT,
  payment_terms_days        INT,
  credit_limit              NUMERIC(14,2),
  preferred_payment_method  TEXT,
  payment_instructions      TEXT,       -- client-specific override; else company default from settings
  collection_notes          TEXT,
  account_status            TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','on_hold','disputed','closed')),
  is_sample                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validated matching: a spreadsheet client name maps to a client ONLY through an explicit alias.
CREATE TABLE client_aliases (
  alias_normalized TEXT PRIMARY KEY,
  alias_display    TEXT NOT NULL,
  client_id        INT NOT NULL REFERENCES clients(id),
  created_by       INT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Google Sheets sync ─────────────────────────
CREATE TABLE sync_runs (
  id              SERIAL PRIMARY KEY,
  trigger         TEXT NOT NULL,      -- manual | scheduled | collection_run | pre_send
  spreadsheet_id  TEXT,
  tab_name        TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  rows_read       INT NOT NULL DEFAULT 0,
  inserted        INT NOT NULL DEFAULT 0,
  updated         INT NOT NULL DEFAULT 0,
  unchanged       INT NOT NULL DEFAULT 0,
  flagged         INT NOT NULL DEFAULT 0,
  removed         INT NOT NULL DEFAULT 0,
  error           TEXT,
  triggered_by    INT REFERENCES users(id)
);

CREATE TABLE job_orders (
  id                    SERIAL PRIMARY KEY,
  jo_number             TEXT NOT NULL UNIQUE,        -- business identifier from the sheet
  client_id             INT REFERENCES clients(id),  -- NULL until matched via alias
  client_name_source    TEXT,
  project_name          TEXT,
  description           TEXT,
  delivery_status       TEXT,
  delivery_date         DATE,
  production_status     TEXT,
  jo_amount_source      NUMERIC(14,2),
  invoice_number_source TEXT,
  billing_date_source   DATE,
  billing_amount_source NUMERIC(14,2),
  payment_terms_source  TEXT,
  due_date_source       DATE,
  amount_paid_source    NUMERIC(14,2),
  payment_status_source TEXT,
  is_paid_in_source     BOOLEAN NOT NULL DEFAULT FALSE,
  remarks_source        TEXT,
  assigned_staff_source TEXT,
  -- application-managed attributes
  exception_state       TEXT CHECK (exception_state IN ('on_hold','disputed','cancelled','for_verification')),
  billable_status       TEXT NOT NULL DEFAULT 'per_source' CHECK (billable_status IN ('per_source','billable','not_yet_billable','not_billable')),
  billing_terms_note    TEXT,
  next_followup_date    DATE,
  staff_remarks         TEXT,
  -- source tracking
  source_row_number     INT,                 -- last seen position only; NEVER used as identity
  source_row_hash       TEXT,
  source_raw            JSONB,
  source_present        BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_sync_id     INT REFERENCES sync_runs(id),
  is_sample             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_orders_client ON job_orders(client_id);

-- Controlled write-back of approved changes to mapped, writable spreadsheet columns.
CREATE TABLE sheet_writebacks (
  id               SERIAL PRIMARY KEY,
  job_order_id     INT NOT NULL REFERENCES job_orders(id),
  field            TEXT NOT NULL,
  expected_value   TEXT,       -- value the requester saw; used for concurrent-edit detection
  new_value        TEXT NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','conflict','rejected','failed')),
  requested_by     INT NOT NULL REFERENCES users(id),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by       INT REFERENCES users(id),
  decided_at       TIMESTAMPTZ,
  applied_range    TEXT,
  error            TEXT
);

-- ───────────────────────── Ledger ─────────────────────────
CREATE TABLE invoices (
  id                 SERIAL PRIMARY KEY,
  invoice_number     TEXT NOT NULL UNIQUE,      -- one ledger row per invoice, regardless of how many sources mention it
  client_id          INT REFERENCES clients(id),
  invoice_date       DATE,
  due_date           DATE,
  amount             NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  status             TEXT NOT NULL DEFAULT 'unreconciled' CHECK (status IN ('unreconciled','issued','void')),
  sent_confirmed_at  TIMESTAMPTZ,
  source             TEXT NOT NULL CHECK (source IN ('sheet','app')),
  reconciled_by      INT REFERENCES users(id),
  reconciled_at      TIMESTAMPTZ,
  voided_reason      TEXT,
  is_sample          BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         INT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_job_orders (
  invoice_id    INT NOT NULL REFERENCES invoices(id),
  job_order_id  INT NOT NULL REFERENCES job_orders(id),
  amount_portion NUMERIC(14,2),
  PRIMARY KEY (invoice_id, job_order_id)
);

CREATE TABLE adjustments (
  id              SERIAL PRIMARY KEY,
  invoice_id      INT NOT NULL REFERENCES invoices(id),
  kind            TEXT NOT NULL CHECK (kind IN ('debit','credit_note')),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  effective_date  DATE NOT NULL,
  reference       TEXT,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reversed')),
  requested_by    INT REFERENCES users(id),
  decided_by      INT REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  reversed_at     TIMESTAMPTZ,
  reversed_reason TEXT,
  is_sample       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id              SERIAL PRIMARY KEY,
  client_id       INT NOT NULL REFERENCES clients(id),
  payment_date    DATE NOT NULL,              -- effective date
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method          TEXT,
  reference_no    TEXT,
  status          TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','verified','rejected','reversed')),
  notes           TEXT,
  recorded_by     INT REFERENCES users(id),
  verified_by     INT REFERENCES users(id),
  verified_at     TIMESTAMPTZ,
  reversed_at     TIMESTAMPTZ,
  reversed_reason TEXT,
  is_sample       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_client_ref ON payments(client_id, reference_no) WHERE reference_no IS NOT NULL AND status <> 'rejected';

CREATE TABLE payment_allocations (
  id              SERIAL PRIMARY KEY,
  payment_id      INT NOT NULL REFERENCES payments(id),
  invoice_id      INT NOT NULL REFERENCES invoices(id),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  effective_date  DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at     TIMESTAMPTZ,
  reversed_reason TEXT
);

CREATE TABLE receipts (
  id              SERIAL PRIMARY KEY,
  payment_id      INT NOT NULL REFERENCES payments(id),
  receipt_number  TEXT NOT NULL UNIQUE,
  issued_date     DATE NOT NULL,
  drive_file_id   TEXT,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id            SERIAL PRIMARY KEY,
  invoice_id    INT REFERENCES invoices(id),
  job_order_id  INT REFERENCES job_orders(id),
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  opened_by     INT REFERENCES users(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by   INT REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  resolution    TEXT
);

CREATE TABLE payment_promises (
  id             SERIAL PRIMARY KEY,
  job_order_id   INT REFERENCES job_orders(id),
  client_id      INT NOT NULL REFERENCES clients(id),
  promised_date  DATE NOT NULL,
  amount         NUMERIC(14,2),
  note           TEXT,
  recorded_by    INT REFERENCES users(id),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE collection_activities (
  id            BIGSERIAL PRIMARY KEY,
  job_order_id  INT REFERENCES job_orders(id),
  client_id     INT REFERENCES clients(id),
  kind          TEXT NOT NULL,   -- note | call | email_sent | promise | escalation
  note          TEXT,
  actor_id      INT REFERENCES users(id),
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Reconciliation exceptions ─────────────────────────
CREATE TABLE exceptions (
  id            SERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  dedupe_key    TEXT NOT NULL,
  job_order_id  INT REFERENCES job_orders(id),
  client_id     INT REFERENCES clients(id),
  invoice_id    INT REFERENCES invoices(id),
  message       TEXT NOT NULL,
  details       JSONB,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by   INT REFERENCES users(id),
  resolved_at   TIMESTAMPTZ,
  resolution    TEXT
);
CREATE UNIQUE INDEX exceptions_open_dedupe ON exceptions(dedupe_key) WHERE status = 'open';

-- ───────────────────────── Statements of Account ─────────────────────────
CREATE TABLE soa_statements (
  id                SERIAL PRIMARY KEY,
  statement_number  TEXT NOT NULL,
  version           INT NOT NULL,
  client_id         INT NOT NULL REFERENCES clients(id),
  statement_date    DATE NOT NULL,
  mode              TEXT NOT NULL CHECK (mode IN ('outstanding','full_history')),
  basis             TEXT NOT NULL CHECK (basis IN ('as_known','restated')),
  content_hash      TEXT NOT NULL,   -- hash of lines+totals: detects whether a statement is still current
  totals            JSONB NOT NULL,
  lines             JSONB NOT NULL,
  included_refs     JSONB NOT NULL,
  recon_report      JSONB NOT NULL,
  has_discrepancy   BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','reviewed','rejected','superseded')),
  pdf               BYTEA NOT NULL,
  pdf_sha256        TEXT NOT NULL,
  drive_file_id     TEXT,
  drive_web_link    TEXT,
  drive_error       TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by      INT REFERENCES users(id),   -- NULL = system (scheduled run)
  reviewed_by       INT REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_note       TEXT,
  UNIQUE (statement_number, version)
);

-- ───────────────────────── Collection runs & email workflow ─────────────────────────
CREATE TABLE collection_runs (
  id              SERIAL PRIMARY KEY,
  run_key         TEXT NOT NULL UNIQUE,        -- Manila date of the Monday, e.g. 2026-10-12
  trigger         TEXT NOT NULL,               -- scheduled | manual | catch_up | external_cron
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial')),
  attempts        INT NOT NULL DEFAULT 1,
  sync_run_id     INT REFERENCES sync_runs(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  stats           JSONB,
  error           TEXT,
  triggered_by    INT REFERENCES users(id)
);

CREATE TABLE email_drafts (
  id                 SERIAL PRIMARY KEY,
  job_order_id       INT NOT NULL REFERENCES job_orders(id),
  covered_job_order_ids INT[] NOT NULL,
  client_id          INT REFERENCES clients(id),
  collection_run_id  INT REFERENCES collection_runs(id),
  soa_id             INT REFERENCES soa_statements(id),
  version            INT NOT NULL DEFAULT 1,
  to_recipients      TEXT[] NOT NULL DEFAULT '{}',
  cc_recipients      TEXT[] NOT NULL DEFAULT '{}',
  subject            TEXT NOT NULL,
  body_text          TEXT NOT NULL,
  amounts            JSONB NOT NULL,
  tone               TEXT,
  content_hash       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN
                     ('blocked','pending_approval','approved','returned','rejected','on_hold','sending','sent','send_failed','send_unknown','cancelled')),
  blocked_reasons    TEXT[] NOT NULL DEFAULT '{}',
  created_by         INT REFERENCES users(id),   -- NULL = system
  last_edited_by     INT REFERENCES users(id),
  gmail_draft_id     TEXT,
  gmail_message_id   TEXT,
  gmail_thread_id    TEXT,
  sent_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_draft_versions (
  draft_id       INT NOT NULL REFERENCES email_drafts(id),
  version        INT NOT NULL,
  to_recipients  TEXT[] NOT NULL,
  cc_recipients  TEXT[] NOT NULL,
  subject        TEXT NOT NULL,
  body_text      TEXT NOT NULL,
  soa_id         INT,
  amounts        JSONB NOT NULL,
  content_hash   TEXT NOT NULL,
  edited_by      INT REFERENCES users(id),
  edited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, version)
);

-- At most one scheduled outcome per job order per weekly run.
CREATE TABLE collection_run_items (
  run_id        INT NOT NULL REFERENCES collection_runs(id),
  job_order_id  INT NOT NULL REFERENCES job_orders(id),
  outcome       TEXT NOT NULL,   -- draft_created | draft_blocked | covered_by_other | excluded_paid | excluded_unbilled | exception_paid_with_balance | flagged_exception_policy | excluded_cancelled | excluded_not_present | error
  draft_id      INT REFERENCES email_drafts(id),
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, job_order_id)
);

CREATE TABLE approvals (
  id                  SERIAL PRIMARY KEY,
  draft_id            INT NOT NULL REFERENCES email_drafts(id),
  draft_version       INT NOT NULL,
  content_hash        TEXT NOT NULL,
  decision            TEXT NOT NULL CHECK (decision IN ('approve','return','reject','hold')),
  approver_id         INT NOT NULL REFERENCES users(id),
  note                TEXT,
  self_approval       BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ,
  invalidated_at      TIMESTAMPTZ,
  invalidated_reason  TEXT
);

CREATE TABLE send_attempts (
  id                SERIAL PRIMARY KEY,
  draft_id          INT NOT NULL REFERENCES email_drafts(id),
  approval_id       INT NOT NULL REFERENCES approvals(id),
  send_key          TEXT NOT NULL UNIQUE,      -- also placed in the email's Message-ID / X-PA-Send-Key header
  attempted_by      INT NOT NULL REFERENCES users(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','succeeded','failed','unknown','reconciled_sent','reconciled_not_sent')),
  gmail_message_id  TEXT,
  gmail_thread_id   TEXT,
  error             TEXT
);
-- Only one in-flight attempt per draft.
CREATE UNIQUE INDEX send_attempts_one_inflight ON send_attempts(draft_id) WHERE status IN ('in_progress','unknown');

CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  role        TEXT,
  user_id     INT REFERENCES users(id),
  kind        TEXT NOT NULL,
  message     TEXT NOT NULL,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

-- ───────────────────────── Audit log (append-only) ─────────────────────────
CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('user','system')),
  actor_id     INT REFERENCES users(id),
  actor_label  TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT,
  before       JSONB,
  after        JSONB,
  reason       TEXT,
  related      JSONB
);
CREATE INDEX audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX audit_at ON audit_log(at);

CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not permitted: use a reversal or adjustment', TG_OP, TG_TABLE_NAME;
END $$;

CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
-- Financial transactions are never deleted; corrections go through reversals/adjustments.
CREATE TRIGGER invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER allocations_no_delete BEFORE DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER adjustments_no_delete BEFORE DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER approvals_no_delete BEFORE DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER send_attempts_no_delete BEFORE DELETE ON send_attempts FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER soa_no_delete BEFORE DELETE ON soa_statements FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Amounts on a posted payment/allocation/adjustment may not be edited in place.
CREATE FUNCTION forbid_amount_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'amount on % is immutable: reverse and re-enter', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_amount_immutable BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION forbid_amount_edit();
CREATE TRIGGER allocations_amount_immutable BEFORE UPDATE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION forbid_amount_edit();
CREATE TRIGGER adjustments_amount_immutable BEFORE UPDATE ON adjustments FOR EACH ROW EXECUTE FUNCTION forbid_amount_edit();

-- ───────────────────────── Stored report snapshots ─────────────────────────
CREATE TABLE report_snapshots (
  id           SERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,           -- daily | monday | weekly | monthly | unbilled
  period_key   TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data         JSONB NOT NULL,
  UNIQUE (kind, period_key)
);

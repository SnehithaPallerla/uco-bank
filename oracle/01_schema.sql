-- Illustrative Oracle AI Database schema only. Not executed or validated
-- against a live Oracle instance. Run only in a dedicated demo schema.
-- No DROP or destructive statements are included.
CREATE TABLE demo_accounts (
  account_id VARCHAR2(40) PRIMARY KEY,
  display_name VARCHAR2(200) NOT NULL,
  account_kind VARCHAR2(30),
  city VARCHAR2(100),
  usual_credit NUMBER(18,2) CHECK (usual_credit > 0),
  internal_review_flag NUMBER(1) DEFAULT 0 CHECK (internal_review_flag IN (0,1))
);

CREATE TABLE demo_transfers (
  event_id VARCHAR2(100) PRIMARY KEY,
  event_version NUMBER(10) NOT NULL,
  sender_id VARCHAR2(40) NOT NULL REFERENCES demo_accounts(account_id),
  recipient_id VARCHAR2(40) NOT NULL REFERENCES demo_accounts(account_id),
  amount_inr NUMBER(18,2) NOT NULL CHECK (amount_inr > 0),
  tx_time TIMESTAMP WITH TIME ZONE NOT NULL,
  channel VARCHAR2(20),
  purpose VARCHAR2(500)
);
CREATE INDEX demo_transfers_sender_time ON demo_transfers(sender_id,tx_time);
CREATE INDEX demo_transfers_recipient_time ON demo_transfers(recipient_id,tx_time);

CREATE TABLE demo_devices (
  device_id VARCHAR2(100) PRIMARY KEY
);
CREATE TABLE demo_device_links (
  link_id VARCHAR2(100) PRIMARY KEY,
  account_id VARCHAR2(40) NOT NULL REFERENCES demo_accounts(account_id),
  device_id VARCHAR2(100) NOT NULL REFERENCES demo_devices(device_id)
);
CREATE TABLE demo_cases (
  case_id VARCHAR2(100) PRIMARY KEY,
  account_id VARCHAR2(40) NOT NULL REFERENCES demo_accounts(account_id),
  case_status VARCHAR2(30) NOT NULL,
  owner_id VARCHAR2(100),
  evidence JSON,
  row_version NUMBER DEFAULT 1 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- Add independent raw events, idempotency keys, model/policy versions,
-- evidence provenance, case notes, audit, access control and retention
-- tables before considering production use.

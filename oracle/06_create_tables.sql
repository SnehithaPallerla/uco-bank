-- UCO Credit Intelligence POC: relational tables plus JSON payload preservation.
-- Run in a dedicated UCO_POC schema on an Oracle release that supports VECTOR.
-- This file contains table DDL only; it does not load runtime/state.json.

CREATE TABLE uco_case (
  case_id VARCHAR2(80) PRIMARY KEY,
  cif_token VARCHAR2(100) NOT NULL,
  branch_code VARCHAR2(20) NOT NULL,
  facility_id VARCHAR2(100) NOT NULL,
  purpose VARCHAR2(500),
  project_id VARCHAR2(100),
  assessment_version NUMBER NOT NULL,
  status VARCHAR2(40) NOT NULL,
  owner_subject VARCHAR2(200),
  due_at TIMESTAMP WITH TIME ZONE,
  policy_version NUMBER NOT NULL,
  evidence_snapshot CLOB CHECK (evidence_snapshot IS JSON)
);

CREATE TABLE uco_case_acl (
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  principal_id VARCHAR2(200),
  can_review NUMBER(1) DEFAULT 0 CHECK (can_review IN (0,1)),
  PRIMARY KEY (case_id, principal_id)
);

CREATE TABLE uco_entity (
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  entity_id VARCHAR2(100),
  name VARCHAR2(250),
  entity_type VARCHAR2(50),
  identity_status VARCHAR2(40),
  identity_evidence_id VARCHAR2(120),
  PRIMARY KEY (case_id, entity_id)
);

CREATE TABLE uco_drawdown (
  drawdown_id VARCHAR2(100) PRIMARY KEY,
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  amount_inr NUMBER(20,2) CHECK (amount_inr > 0),
  posted_at TIMESTAMP WITH TIME ZONE,
  source_ref VARCHAR2(200) NOT NULL
);

CREATE TABLE uco_payment (
  tx_id VARCHAR2(120) PRIMARY KEY,
  case_id VARCHAR2(80) NOT NULL,
  from_entity VARCHAR2(100) NOT NULL,
  to_entity VARCHAR2(100) NOT NULL,
  amount_inr NUMBER(20,2) NOT NULL CHECK (amount_inr > 0),
  posted_at TIMESTAMP NOT NULL,
  original_event_time VARCHAR2(50) NOT NULL,
  currency CHAR(3) DEFAULT 'INR',
  posting_status VARCHAR2(20),
  payment_kind VARCHAR2(30),
  observed NUMBER(1),
  drawdown_id VARCHAR2(100) REFERENCES uco_drawdown(drawdown_id),
  reversal_of VARCHAR2(120),
  corrected_version NUMBER DEFAULT 1,
  evidence_id VARCHAR2(120),
  source_ref VARCHAR2(200) NOT NULL,
  FOREIGN KEY (case_id, from_entity) REFERENCES uco_entity(case_id, entity_id),
  FOREIGN KEY (case_id, to_entity) REFERENCES uco_entity(case_id, entity_id)
);

CREATE TABLE uco_relationship (
  relationship_id VARCHAR2(120) PRIMARY KEY,
  case_id VARCHAR2(80) NOT NULL,
  from_entity VARCHAR2(100) NOT NULL,
  to_entity VARCHAR2(100) NOT NULL,
  relationship_type VARCHAR2(60),
  verified NUMBER(1),
  evidence_id VARCHAR2(120),
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  FOREIGN KEY (case_id, from_entity) REFERENCES uco_entity(case_id, entity_id),
  FOREIGN KEY (case_id, to_entity) REFERENCES uco_entity(case_id, entity_id)
);

CREATE TABLE uco_evidence (
  evidence_id VARCHAR2(120),
  evidence_version NUMBER,
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  source_kind VARCHAR2(50),
  captured_at TIMESTAMP WITH TIME ZONE,
  effective_at TIMESTAMP WITH TIME ZONE,
  source_url VARCHAR2(2000),
  source_status VARCHAR2(40),
  content_hash VARCHAR2(64),
  content CLOB CHECK (content IS JSON),
  supersedes_version NUMBER,
  PRIMARY KEY (evidence_id, evidence_version)
);

CREATE TABLE uco_evidence_chunk (
  chunk_id VARCHAR2(120) PRIMARY KEY,
  evidence_id VARCHAR2(120),
  evidence_version NUMBER,
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  passage CLOB,
  embedding VECTOR,
  embedding_model VARCHAR2(200),
  FOREIGN KEY (evidence_id, evidence_version)
    REFERENCES uco_evidence(evidence_id, evidence_version)
);

CREATE TABLE uco_ingest_event (
  event_id VARCHAR2(120) PRIMARY KEY,
  source_system VARCHAR2(50),
  partition_id VARCHAR2(50),
  source_offset VARCHAR2(100),
  tx_id VARCHAR2(120),
  tx_version NUMBER,
  received_at TIMESTAMP WITH TIME ZONE,
  payload_hash VARCHAR2(64),
  status VARCHAR2(30),
  payload CLOB CHECK (payload IS JSON),
  error_reason VARCHAR2(1000),
  UNIQUE (source_system, partition_id, source_offset)
);

CREATE TABLE uco_policy_version (
  version_id NUMBER PRIMARY KEY,
  policy_json CLOB CHECK (policy_json IS JSON),
  maker_subject VARCHAR2(200),
  checker_subject VARCHAR2(200),
  approved_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT uco_independent_policy
    CHECK (checker_subject IS NULL OR maker_subject <> checker_subject)
);

CREATE TABLE uco_case_decision (
  decision_id VARCHAR2(100) PRIMARY KEY,
  case_id VARCHAR2(80) REFERENCES uco_case(case_id),
  maker_subject VARCHAR2(200) NOT NULL,
  checker_subject VARCHAR2(200),
  proposed_outcome VARCHAR2(60),
  rationale CLOB,
  evidence_snapshot CLOB CHECK (evidence_snapshot IS JSON),
  policy_version NUMBER,
  model_version VARCHAR2(100),
  created_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT uco_independent_case
    CHECK (checker_subject IS NULL OR maker_subject <> checker_subject)
);

-- Preserve every full record from runtime/state.json while relational mappings
-- are populated and validated. This is not an application database adapter.
CREATE TABLE uco_record_payload (
  record_id VARCHAR2(120) PRIMARY KEY,
  record_json CLOB NOT NULL CHECK (record_json IS JSON),
  row_version NUMBER DEFAULT 1 NOT NULL,
  stored_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- Holds top-level workspace state not represented by individual record rows.
CREATE TABLE uco_workspace_payload (
  workspace_key VARCHAR2(40) PRIMARY KEY,
  revision NUMBER NOT NULL,
  payload CLOB NOT NULL CHECK (payload IS JSON),
  stored_at TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL
);

-- Preserves the project's audit trail as structured events plus original JSON.
CREATE TABLE uco_audit_event (
  audit_id VARCHAR2(120) PRIMARY KEY,
  occurred_at TIMESTAMP WITH TIME ZONE,
  actor_id VARCHAR2(200),
  event_type VARCHAR2(100),
  record_id VARCHAR2(120),
  payload CLOB NOT NULL CHECK (payload IS JSON)
);

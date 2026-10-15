-- Illustrative Oracle AI Database 26ai starter extension for the v3 domain.
-- Not executed against Oracle. DBA review, security, indexing, migration,
-- tenancy/row access, retention and service-specific validation are required.
-- No real customer data or credentials are included.

CREATE TABLE uco_borrowers (
  borrower_id VARCHAR2(60) PRIMARY KEY,
  cif VARCHAR2(60) NOT NULL,
  display_name VARCHAR2(240) NOT NULL,
  industry VARCHAR2(120),
  data_mode VARCHAR2(30) NOT NULL,
  source_metadata JSON
);
CREATE TABLE uco_facilities (
  facility_id VARCHAR2(60) PRIMARY KEY,
  borrower_id VARCHAR2(60) NOT NULL REFERENCES uco_borrowers(borrower_id),
  product VARCHAR2(60) NOT NULL,
  sanction_limit NUMBER(20,2) NOT NULL,
  purpose VARCHAR2(500),
  sanction_document_id VARCHAR2(100),
  terms_and_approvals JSON
);
CREATE TABLE uco_drawdowns (
  drawdown_id VARCHAR2(100) PRIMARY KEY,
  facility_id VARCHAR2(60) NOT NULL REFERENCES uco_facilities(facility_id),
  amount_inr NUMBER(20,2) NOT NULL CHECK (amount_inr > 0),
  drawn_at TIMESTAMP WITH TIME ZONE NOT NULL,
  source_event_id VARCHAR2(100) NOT NULL
);
CREATE TABLE uco_entities (
  entity_id VARCHAR2(100) PRIMARY KEY,
  entity_type VARCHAR2(50) NOT NULL,
  display_name VARCHAR2(240),
  bank_identifier VARCHAR2(60),
  identity_metadata JSON
);
CREATE TABLE uco_transfers (
  transaction_id VARCHAR2(100) PRIMARY KEY,
  source_event_id VARCHAR2(100) NOT NULL,
  event_version NUMBER(10) NOT NULL,
  sender_id VARCHAR2(100) NOT NULL REFERENCES uco_entities(entity_id),
  recipient_id VARCHAR2(100) NOT NULL REFERENCES uco_entities(entity_id),
  amount_inr NUMBER(20,2) NOT NULL CHECK (amount_inr > 0),
  event_time TIMESTAMP WITH TIME ZONE NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  channel VARCHAR2(30),
  approval_status VARCHAR2(30),
  funding_drawdown_id VARCHAR2(100) REFERENCES uco_drawdowns(drawdown_id),
  original_payload JSON,
  CONSTRAINT uco_transfer_event_unique UNIQUE(source_event_id,event_version)
);
CREATE TABLE uco_relations (
  relation_id VARCHAR2(100) PRIMARY KEY,
  source_entity_id VARCHAR2(100) NOT NULL REFERENCES uco_entities(entity_id),
  target_entity_id VARCHAR2(100) NOT NULL REFERENCES uco_entities(entity_id),
  relation_type VARCHAR2(60) NOT NULL,
  evidence_reference VARCHAR2(240) NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by VARCHAR2(100),
  valid_from TIMESTAMP WITH TIME ZONE,
  valid_to TIMESTAMP WITH TIME ZONE
);
CREATE TABLE uco_evidence (
  evidence_id VARCHAR2(100) PRIMARY KEY,
  borrower_id VARCHAR2(60) REFERENCES uco_borrowers(borrower_id),
  data_mode VARCHAR2(30) NOT NULL,
  source_url VARCHAR2(2000),
  source_date TIMESTAMP WITH TIME ZONE,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  match_status VARCHAR2(100) NOT NULL,
  availability_status VARCHAR2(30) NOT NULL,
  sha256 VARCHAR2(64),
  object_storage_reference VARCHAR2(2000),
  evidence_metadata JSON
);
CREATE TABLE uco_policy_versions (
  policy_version NUMBER(10) PRIMARY KEY,
  definitions JSON NOT NULL,
  proposed_by VARCHAR2(100) NOT NULL,
  approved_by VARCHAR2(100),
  effective_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT uco_policy_independent CHECK (approved_by IS NULL OR proposed_by <> approved_by)
);
CREATE TABLE uco_cases (
  case_id VARCHAR2(100) PRIMARY KEY,
  borrower_id VARCHAR2(60) NOT NULL REFERENCES uco_borrowers(borrower_id),
  policy_version NUMBER(10) NOT NULL REFERENCES uco_policy_versions(policy_version),
  status VARCHAR2(60) NOT NULL,
  outcome VARCHAR2(60),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  snapshot JSON NOT NULL,
  review_and_decision JSON,
  row_version NUMBER(10) DEFAULT 1 NOT NULL
);
CREATE TABLE uco_case_events (
  case_event_id VARCHAR2(100) PRIMARY KEY,
  case_id VARCHAR2(100) NOT NULL REFERENCES uco_cases(case_id),
  actor_id VARCHAR2(100) NOT NULL,
  event_type VARCHAR2(60) NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  payload JSON NOT NULL
);
-- Distinct verified relationships and payment edges preserve provenance.
CREATE PROPERTY GRAPH uco_diversion_network
  VERTEX TABLES (
    uco_entities KEY(entity_id)
      LABEL entity PROPERTIES(entity_id, entity_type, display_name, bank_identifier)
  )
  EDGE TABLES (
    uco_transfers KEY(transaction_id)
      SOURCE KEY(sender_id) REFERENCES uco_entities(entity_id)
      DESTINATION KEY(recipient_id) REFERENCES uco_entities(entity_id)
      LABEL transfer PROPERTIES(transaction_id, amount_inr, event_time, funding_drawdown_id),
    uco_relations KEY(relation_id)
      SOURCE KEY(source_entity_id) REFERENCES uco_entities(entity_id)
      DESTINATION KEY(target_entity_id) REFERENCES uco_entities(entity_id)
      LABEL relationship PROPERTIES(relation_id, relation_type, evidence_reference, verified_at)
  );

-- Future adapters must add explicit FD placement, history, approval and document
-- tables/mappings. Do not treat an external transfer as proof of external FD use.
-- Enforce case state transitions and evidence access in authenticated services.
-- The table definition alone does not provide immutable auditing or maker-checker.

-- UCO Credit Intelligence / Oracle AI Database 26ai deployment template.
-- Not executed against Oracle in this delivery. DBA review in an isolated schema required.
-- Documentation checked 25 September 2026; verify target release, privileges and graph restrictions.
-- Authorised service identities only. No direct end-user grants on base tables or graph.
CREATE TABLE uco_case (
 case_id VARCHAR2(80) PRIMARY KEY, cif_token VARCHAR2(100) NOT NULL,
 branch_code VARCHAR2(20) NOT NULL, facility_id VARCHAR2(100) NOT NULL,
 purpose VARCHAR2(500), project_id VARCHAR2(100), assessment_version NUMBER NOT NULL,
 status VARCHAR2(40) NOT NULL, owner_subject VARCHAR2(200), due_at TIMESTAMP WITH TIME ZONE,
 policy_version NUMBER NOT NULL, evidence_snapshot CLOB CHECK (evidence_snapshot IS JSON)
);
CREATE TABLE uco_case_acl (
 case_id VARCHAR2(80) REFERENCES uco_case(case_id), principal_id VARCHAR2(200),
 can_review NUMBER(1) DEFAULT 0 CHECK (can_review IN (0,1)),
 PRIMARY KEY(case_id, principal_id)
);
CREATE TABLE uco_entity (
 case_id VARCHAR2(80) REFERENCES uco_case(case_id), entity_id VARCHAR2(100),
 name VARCHAR2(250), entity_type VARCHAR2(50), identity_status VARCHAR2(40),
 identity_evidence_id VARCHAR2(120), PRIMARY KEY(case_id,entity_id)
);
CREATE TABLE uco_drawdown (
 drawdown_id VARCHAR2(100) PRIMARY KEY, case_id VARCHAR2(80) REFERENCES uco_case(case_id),
 amount_inr NUMBER(20,2) CHECK(amount_inr>0), posted_at TIMESTAMP WITH TIME ZONE,
 source_ref VARCHAR2(200) NOT NULL
);
CREATE TABLE uco_payment (
 tx_id VARCHAR2(120) PRIMARY KEY, case_id VARCHAR2(80) NOT NULL,
 from_entity VARCHAR2(100) NOT NULL, to_entity VARCHAR2(100) NOT NULL,
 amount_inr NUMBER(20,2) NOT NULL CHECK(amount_inr>0), posted_at TIMESTAMP NOT NULL,
 -- posted_at normalized UTC for graph ordering; original offset retained separately.
 original_event_time VARCHAR2(50) NOT NULL, currency CHAR(3) DEFAULT 'INR',
 posting_status VARCHAR2(20), payment_kind VARCHAR2(30), observed NUMBER(1),
 drawdown_id VARCHAR2(100) REFERENCES uco_drawdown(drawdown_id),
 reversal_of VARCHAR2(120), corrected_version NUMBER DEFAULT 1,
 evidence_id VARCHAR2(120), source_ref VARCHAR2(200) NOT NULL,
 FOREIGN KEY(case_id,from_entity) REFERENCES uco_entity(case_id,entity_id),
 FOREIGN KEY(case_id,to_entity) REFERENCES uco_entity(case_id,entity_id)
);
CREATE TABLE uco_relationship (
 relationship_id VARCHAR2(120) PRIMARY KEY, case_id VARCHAR2(80) NOT NULL,
 from_entity VARCHAR2(100) NOT NULL, to_entity VARCHAR2(100) NOT NULL,
 relationship_type VARCHAR2(60), verified NUMBER(1), evidence_id VARCHAR2(120),
 valid_from TIMESTAMP, valid_to TIMESTAMP,
 FOREIGN KEY(case_id,from_entity) REFERENCES uco_entity(case_id,entity_id),
 FOREIGN KEY(case_id,to_entity) REFERENCES uco_entity(case_id,entity_id)
);
CREATE TABLE uco_evidence (
 evidence_id VARCHAR2(120), evidence_version NUMBER,
 case_id VARCHAR2(80) REFERENCES uco_case(case_id), source_kind VARCHAR2(50),
 captured_at TIMESTAMP WITH TIME ZONE, effective_at TIMESTAMP WITH TIME ZONE,
 source_url VARCHAR2(2000), source_status VARCHAR2(40), content_hash VARCHAR2(64),
 content CLOB CHECK(content IS JSON), supersedes_version NUMBER,
 PRIMARY KEY(evidence_id,evidence_version)
);
CREATE TABLE uco_evidence_chunk (
 chunk_id VARCHAR2(120) PRIMARY KEY, evidence_id VARCHAR2(120), evidence_version NUMBER,
 case_id VARCHAR2(80) REFERENCES uco_case(case_id), passage CLOB,
 embedding VECTOR, embedding_model VARCHAR2(200),
 FOREIGN KEY(evidence_id,evidence_version) REFERENCES uco_evidence(evidence_id,evidence_version)
);
-- Use an agreed fixed dimension/metric once an approved embedding model is selected.
-- HNSW/IVF index choice and approximation recall must be measured on the selected target.
CREATE TABLE uco_ingest_event (
 event_id VARCHAR2(120) PRIMARY KEY, source_system VARCHAR2(50), partition_id VARCHAR2(50),
 source_offset VARCHAR2(100), tx_id VARCHAR2(120), tx_version NUMBER,
 received_at TIMESTAMP WITH TIME ZONE, payload_hash VARCHAR2(64), status VARCHAR2(30),
 payload CLOB CHECK(payload IS JSON), error_reason VARCHAR2(1000),
 UNIQUE(source_system,partition_id,source_offset)
);
CREATE TABLE uco_policy_version (
 version_id NUMBER PRIMARY KEY, policy_json CLOB CHECK(policy_json IS JSON),
 maker_subject VARCHAR2(200), checker_subject VARCHAR2(200), approved_at TIMESTAMP WITH TIME ZONE,
 CONSTRAINT uco_independent_policy CHECK(checker_subject IS NULL OR maker_subject<>checker_subject)
);
CREATE TABLE uco_case_decision (
 decision_id VARCHAR2(100) PRIMARY KEY, case_id VARCHAR2(80) REFERENCES uco_case(case_id),
 maker_subject VARCHAR2(200) NOT NULL, checker_subject VARCHAR2(200),
 proposed_outcome VARCHAR2(60), rationale CLOB, evidence_snapshot CLOB CHECK(evidence_snapshot IS JSON),
 policy_version NUMBER, model_version VARCHAR2(100), created_at TIMESTAMP WITH TIME ZONE,
 CONSTRAINT uco_independent_case CHECK(checker_subject IS NULL OR maker_subject<>checker_subject)
);
CREATE OR REPLACE PROPERTY GRAPH uco_flow
 VERTEX TABLES (
  uco_entity KEY(case_id,entity_id) LABEL entity
   PROPERTIES(case_id,entity_id,name,entity_type,identity_status,identity_evidence_id)
 )
 EDGE TABLES (
  uco_payment KEY(tx_id)
   SOURCE KEY(case_id,from_entity) REFERENCES uco_entity(case_id,entity_id)
   DESTINATION KEY(case_id,to_entity) REFERENCES uco_entity(case_id,entity_id)
   LABEL payment PROPERTIES(tx_id,case_id,amount_inr,posted_at,posting_status,payment_kind,observed,evidence_id),
  uco_relationship KEY(relationship_id)
   SOURCE KEY(case_id,from_entity) REFERENCES uco_entity(case_id,entity_id)
   DESTINATION KEY(case_id,to_entity) REFERENCES uco_entity(case_id,entity_id)
   LABEL relationship PROPERTIES(relationship_id,case_id,relationship_type,verified,evidence_id,valid_from,valid_to)
 );
-- Query templates. The backend MUST derive authenticated_subject from validated SSO;
-- never accept it, authorized_case_id or a role from an untrusted model/tool payload.
SELECT g.* FROM GRAPH_TABLE(uco_flow
 MATCH (a IS entity)-[p IS payment]->(b IS entity)
 WHERE a.case_id=:authorized_case_id AND p.posting_status='posted' AND p.observed=1
 COLUMNS(a.case_id, a.name AS sender, b.name AS recipient, p.tx_id, p.amount_inr, p.posted_at, p.evidence_id)
) g WHERE EXISTS (SELECT 1 FROM uco_case_acl acl WHERE acl.case_id=g.case_id AND acl.principal_id=:authenticated_subject);
-- Exact three-leg chronological observed return. Longer paths use a bounded service query.
SELECT g.* FROM GRAPH_TABLE(uco_flow
 MATCH (a IS entity)-[p1 IS payment]->(b IS entity)-[p2 IS payment]->(c IS entity)-[p3 IS payment]->(a)
 WHERE a.case_id=:authorized_case_id AND a.entity_id=:borrower_entity_id
 AND p1.posted_at<p2.posted_at AND p2.posted_at<p3.posted_at
 AND p1.observed=1 AND p2.observed=1 AND p3.observed=1
 AND p1.posting_status='posted' AND p2.posting_status='posted' AND p3.posting_status='posted'
 AND p1.payment_kind='payment' AND p2.payment_kind='payment' AND p3.payment_kind='payment'
 COLUMNS(a.case_id,p1.tx_id AS initial_tx,p2.tx_id AS onward_tx,p3.tx_id AS return_tx,
 p1.amount_inr AS initial_outflow,p1.amount_inr+p2.amount_inr+p3.amount_inr AS gross_legs,
 p3.amount_inr AS observed_return,p1.amount_inr-p3.amount_inr AS net_outflow)
) g WHERE EXISTS (SELECT 1 FROM uco_case_acl acl WHERE acl.case_id=g.case_id AND acl.principal_id=:authenticated_subject);
-- Source-linked relationship discovery.
SELECT g.* FROM GRAPH_TABLE(uco_flow
 MATCH (a IS entity)-[r IS relationship]->(b IS entity)
 WHERE a.case_id=:authorized_case_id AND r.verified=1
 COLUMNS(a.case_id,a.entity_id AS from_id,b.entity_id AS to_id,r.relationship_type,r.evidence_id)
) g WHERE EXISTS (SELECT 1 FROM uco_case_acl acl WHERE acl.case_id=g.case_id AND acl.principal_id=:authenticated_subject);
-- Evidence retrieval filters BEFORE ranking; exact retrieval provides a measurable baseline.
SELECT c.chunk_id,c.evidence_id,c.evidence_version,c.passage,
 VECTOR_DISTANCE(c.embedding,:query_vector,COSINE) AS semantic_distance
 FROM uco_evidence_chunk c
 WHERE c.case_id=:authorized_case_id
 AND c.embedding_model=:approved_embedding_model
 AND EXISTS(SELECT 1 FROM uco_case_acl a WHERE a.case_id=c.case_id AND a.principal_id=:authenticated_subject)
 ORDER BY VECTOR_DISTANCE(c.embedding,:query_vector,COSINE)
 FETCH EXACT FIRST 5 ROWS ONLY;
-- No SQL result here is proof of fraud. Deployment also needs scoped grants, VPD or equivalent,
-- trusted session identity, encryption, audit retention and negative access tests on the exact target.

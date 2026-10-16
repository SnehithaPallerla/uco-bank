-- Additive ML storage. Existing case/payment/evidence tables are unchanged.
-- The server applies these CREATE statements once; SQLcl may also run this file.
CREATE TABLE uco_ml_model (
 model_version VARCHAR2(80) PRIMARY KEY,
 trained_at VARCHAR2(50) NOT NULL,
 artifact_hash VARCHAR2(64) NOT NULL,
 payload CLOB NOT NULL CHECK (payload IS JSON)
);
CREATE TABLE uco_ml_feature (
 snapshot_id VARCHAR2(64) PRIMARY KEY,
 case_id VARCHAR2(120) NOT NULL,
 feature_version VARCHAR2(80) NOT NULL,
 captured_at VARCHAR2(50) NOT NULL,
 payload CLOB NOT NULL CHECK (payload IS JSON)
);
CREATE TABLE uco_ml_prediction (
 prediction_id VARCHAR2(64) PRIMARY KEY,
 case_id VARCHAR2(120) NOT NULL,
 model_version VARCHAR2(80) NOT NULL REFERENCES uco_ml_model(model_version),
 snapshot_id VARCHAR2(64) NOT NULL REFERENCES uco_ml_feature(snapshot_id),
 scored_at VARCHAR2(50) NOT NULL,
 flagged NUMBER(1),
 payload CLOB NOT NULL CHECK (payload IS JSON)
);
CREATE TABLE uco_ml_label (
 label_id VARCHAR2(80) PRIMARY KEY,
 case_id VARCHAR2(120) NOT NULL,
 reviewer_id VARCHAR2(200) NOT NULL,
 recorded_at VARCHAR2(50) NOT NULL,
 outcome VARCHAR2(40) NOT NULL,
 payload CLOB NOT NULL CHECK (payload IS JSON)
);

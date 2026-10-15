-- Optional Oracle ML One-Class SVM candidate. Not trained or executed in this delivery.
-- Run only after UCO approves training period, representative normal data, features and thresholds.
-- uco_training_normal must contain ONLY: observation_id and the approved numeric features below.
-- It must exclude case outcome, fixture id, future evidence and post-review information.
CREATE TABLE uco_svm_settings(setting_name VARCHAR2(30),setting_value VARCHAR2(4000));
INSERT INTO uco_svm_settings VALUES(dbms_data_mining.algo_name,dbms_data_mining.algo_support_vector_machines);
INSERT INTO uco_svm_settings VALUES(dbms_data_mining.prep_auto,dbms_data_mining.prep_auto_on);
-- EXAMPLE tuning value, not a bank threshold or prevalence estimate.
INSERT INTO uco_svm_settings VALUES(dbms_data_mining.svms_outlier_rate,'0.05');
BEGIN
 dbms_data_mining.create_model(
  model_name=>'UCO_OCSVM_CANDIDATE_V1',mining_function=>dbms_data_mining.classification,
  data_table_name=>'UCO_TRAINING_NORMAL',case_id_column_name=>'OBSERVATION_ID',
  target_column_name=>NULL,settings_table_name=>'UCO_SVM_SETTINGS');
END;
/
SELECT observation_id,
 PREDICTION(UCO_OCSVM_CANDIDATE_V1 USING *) AS typical_pattern,
 PREDICTION_PROBABILITY(UCO_OCSVM_CANDIDATE_V1,0 USING *) AS anomaly_model_output
 FROM uco_scoring_features;
-- typical_pattern=0 is anomalous; the output is NOT a calibrated fraud probability.
-- No model activation without time-separated evaluation, independent validation and registry approval.

# Optional model evaluation

Decision for this delivery: defer trained ML. The acceptance catalogue is not a representative training population. The current rule score is a display heuristic, not a model output or fraud probability. One-Class SVM is a candidate anomaly detector; its anomaly output also does not establish fraud.

Candidate input dictionary (computed strictly as of scoring time):

| Feature | Source / transform | Leakage and quality controls |
|---|---|---|
| Payment amount / prior median | Posted outward amount divided by borrower historical median | Historical-only median; missing baseline explicit; cap outliers by training-fit transform |
| Minutes from drawdown | Event-time difference for verified linked drawdown | Reject future drawdowns and unknown links; do not infer from chronology alone |
| New recipient proportion | Counterparties with no verified prior relationship in trailing window | Same identity version and as-of history; unknown identities separate |
| Distinct beneficiaries / 60 min | Unique posted recipients in rolling event-time window | Deduplicated and correction-aware; distinguish approved batches |
| Outflow / available linked proceeds | Capped allocated outflow divided by eligible drawdowns | Mixed balances tagged uncertain; no double-counting downstream legs |
| History deviation | Current amount/speed versus trailing borrower and product cohort | Use only data prior to the scoring timestamp |

No case label, expected answer, scenario ID, future invoice, analyst decision or closure note is a training feature. Keep adjudication labels in a separate evaluation table. Train on an agreed historical period with representative normal data; validation and test periods follow chronologically. Group related customers where leakage can cross entities. Fit preprocessing on training data only. Version feature code, extraction query, period, dataset digest, model, threshold and evaluation results.

Register: candidate ID UCO_OCSVM_CANDIDATE_V1; owner unassigned; trained=no; validation=not run; approval=not requested; production score=null; incumbent=rules v1. There is no activate-model control for an untrained candidate. `oracle/05_oml_candidate.sql` is the proposed training/scoring template.

Compare rules alone against rules+graph and rules+graph+ML at the SAME officer review capacity. Measure officer-confirmed relevant cases, false alerts, and recall on available adjudicated cases with confidence intervals, sample sizes and selection bias. Review sampled unflagged transactions. Inspect errors by loan type, amount band, branch and documented business cohort. Do not infer population recall from curated known fraud cases.

Independent validation must review training representativeness, feature leakage, threshold, data/score drift, alerts per 1,000 screened transactions, case yield and override reasons. Agree drift limits and escalation before deployment. Retain the prior approved model/threshold pair for rollback; pause candidate scoring on schema or feature quality failure while deterministic screening continues. Log prediction/model/version/feature time and source lineage with the alert. Feature-level causal explanations require a supported method; ordinary amount, novelty and speed signals should be displayed as observed facts, not invented model attribution.

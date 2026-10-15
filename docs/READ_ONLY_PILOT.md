# Read-only shadow pilot

Goal: establish whether the platform helps UCO officers identify relevant end-use discrepancies, research recipients and prepare evidence faster without losing investigation quality. No automatic customer contact, account restriction, formal fraud classification, recovery or external publication.

1. Assign bank business, Finacle, investigation, security and model-validation owners. Approve scope: sole-banking, non-consortium facilities; products, branches, dates, masked identifiers and permissible sources. Confirm access and retention.
2. Define labels before results: supported payment, evidence gap, review-worthy discrepancy, bank-adjudicated diversion/fraud where that determination actually exists, and inconclusive. Distinguish these outcomes.
3. Select ordinary transactions, known adjudicated historical cases, legitimate comparison cases and a stratified random sample of unflagged transactions. Record sample frame, denominators and weighting. Prevent training/evaluation leakage and avoid using the demonstration expected answers as bank truth.
4. Establish the manual baseline from comparable officers and work. Use counterbalanced case assignment or another bank-approved design to reduce learning effects. Fix review capacity. Separately measure rules alone, graph context and incremental assistant/ML support where feasible.
5. Run read-only ingestion with source reconciliation and quarantines visible. Officers adjudicate blinded where practical; disagreements go to independent review. No UI-derived outcome automatically becomes the bank's formal status.
6. Collect measures below, including sample sizes, exclusions, uncertainty, denominators and data limitations. Record bank go/no-go, owner and evidence before any connected rollout.

| Measure | Definition | Interpretation |
|---|---|---|
| Review yield | Officer-confirmed relevant cases / reviewed alerts at fixed capacity | Relevant does not mean fraud |
| False alerts | Alerts adjudicated as no relevant concern / reviewed alerts | Count evidence-gap and unresolved outcomes separately |
| Known-case recall | Found adjudicated problems / eligible known problems | Selected historical cases are biased; not population recall |
| Unflagged sample findings | Officer-confirmed missed issues / sampled unflagged transactions | Report sample design; do not extrapolate without support |
| Research / handling time | Median and distribution of timed, comparable case tasks | Include corrections, rework and evidence quality |
| Identity errors | Incorrect verified matches / reviewed identity resolutions | Unknown is acceptable; forced matches are harmful |
| Trace quality | Amount reconciliation errors and unsupported inferred legs | No unseen external movement should appear |
| Workflow quality | Completeness, ageing, independent review, override reasons | Fast but unsupported closure is not a benefit |
| Reliability / cost | Event-to-alert percentiles, errors, backlog, model/provider and platform cost | State actual load and environment |

Success criteria must be agreed with UCO before measurement. The application allows administrator entry of observation counts and minutes, with count-reconciliation checks; these entries are explicitly officer-entered and are not independently verified pilot results. Production RTO/RPO, model value and fraud accuracy remain unmeasured.

Keep suspected amount, detection delay, investigation time, prevented loss and recovered funds separate. Claim prevention or recovery only if the bank supplies attributable evidence and a defensible comparison. A compelling demonstration alone cannot establish these benefits.

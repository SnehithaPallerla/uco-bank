> Historical implementation: the active review pipeline now uses a weakly supervised classifier. See [WEAKLY_SUPERVISED_ML.md](WEAKLY_SUPERVISED_ML.md) for the current behaviour.

# Unsupervised case flagging

The portfolio queue and borrower context use an Isolation Forest case flag. The
old `assess()` engine remains as explicitly labelled reference checks and frozen
legacy evidence snapshots; it does not control the ML flag. Officers still own
case requests, evidence review, submission and independent closure. Case opening
freezes the current ML prediction; its priority is ML review, Routine or Unscored.
Manual investigation opening remains available when the ML model is unavailable;
it is marked Unscored and receives no substitute rule-based ML flag.

## Run on Windows

From the project directory:

```powershell
python -m venv .venv-ml
.\.venv-ml\Scripts\python.exe -m pip install -r ml/requirements-lock.txt
npm.cmd run ml:train
npm.cmd run ml:check
npm.cmd run dev
```

The initial trained artifact is already present in this working copy under
`runtime/ml/`. It is deliberately ignored by version control. A fresh checkout
must install the dependencies and train. `UCO_ML_PYTHON` optionally overrides the
project virtual-environment interpreter; OCI model configuration is unchanged.

To train against the current Oracle payloads and actual property graph:

```powershell
npm.cmd run ml:train:oracle
node scripts/check-ml.mjs --oracle
```

The Oracle training command initializes the existing store, including its normal
graph projection synchronization, then reads `UCO_FLOW`. It does not manufacture
labels, replace source cases or close investigations. Training does not happen
when a page opens. Run training explicitly after a reviewed change to the
reference data; retain previous version files for rollback. To roll back, restore
the previous `active.json` manifest along with its referenced artifact. No remote
model training endpoint or automatic monthly retraining has been enabled.

## Data and features

One row represents a borrower/facility snapshot at `record.asOf`. Transaction
features use the preceding 30 days. Account-history features use events known at
the cutoff; evidence must be accepted and captured/effective by that time.
The extractor excludes future/unobserved transactions, respects corrections and
confirmed reversals, and caps explicit loan allocation using the existing
accounting utilities. It does not call `assess()` or read rule outcomes/scores.

The 28 measured features cover repeated flows (T01), verified investment activity
(T02), explicitly loan-linked UCO FDs (T03), same-CIF reopening and migration
context (T04), external transfers and sanctioned payees (T05), concentration,
timing, cash, observed cycles and related parties, invoices/delivery/approvals,
identity and funding coverage. Feature definitions are in
`server/ml-features.mjs`; these definitions have version `uco-features-1`.
No names, case IDs, `primaryTrigger`, expected outputs, rule scores, generated
profile names or officer outcomes enter the model matrix.

Missing numeric values have separate missingness indicators and are imputed with
training-only medians. Long-tailed values receive a sign-preserving log transform.
Rows with invalid/conflicting transactions or no usable payment/history events
are **Unable to score**, not negative examples. Beneficiary history with no supplied
count stays missing rather than being assumed to establish a new beneficiary.
Missing external-bank visibility never creates an inferred transfer.

In Oracle mode graph inputs come from authorized, revision-checked `GRAPH_TABLE`
queries. Path features are re-evaluated from those returned observed payments at
the snapshot cutoff. File mode uses the same bounded chronological traversal.

## Training and threshold

Exact duplicate feature rows are removed before training. Payment-structure
clones, authored comparator pairs and supplied scenario families are grouped
together before a 75/25 grouped training/calibration split. Group IDs are only
split metadata. All preprocessing is fitted on the training partition.

The forest has 300 trees, seed 42 and at most 128 samples per tree. It retains the
training-only fit. The flag threshold is the 90th percentile of grouped
calibration scores, chosen as a provisional workload setting. Calibration is
**not an independent accuracy test**. New batches use the fixed threshold and
are not forced to contain a specified percentage of anomalies. Scores are the
positive Isolation Forest anomaly measure (`-score_samples`); higher is more
unusual. Reference percentiles are empirical and can tie at 100. They are not
fraud probabilities.

The tiny sample supports only a **pooled synthetic reference**, not reliable
per-facility peer forests. The UI reports this and the evaluation file gives
cohort counts. A common suspicious pattern may be unflagged; a rare legitimate
pattern may be flagged. No monotonic "more trigger activity means more risk"
rule is imposed on the unsupervised learner.

## Inference and persistence

Node invokes a bounded Python inference worker through private stdin/stdout;
there is no extra public service port. The worker loads JSON tree arrays, not
executable pickle. Scoring is checked for exact parity with scikit-learn during
training. Artifacts and the active manifest carry hashes and feature versions.
Inference never retrains, sends data to OCI or falls back to rules on failure.

Authorized endpoints:

- `GET /api/ml/status`: active model and unlabelled evaluation summary.
- `GET /api/ml/predictions?revision=...&recordId=...`: optional selected case;
  otherwise branch-scoped cases. Saves model/features/predictions and returns
  the current revision. Stale work is rejected.
- `GET /api/ml/labels?recordId=...`: saved independently reviewed outcomes.
- `POST /api/ml/labels`: `{recordId, expectedRevision}`. Only the independent
  reviewer of the latest closed investigation may record its outcome.

The additive `oracle/09_ml_tables.sql` defines `UCO_ML_MODEL`, `UCO_ML_FEATURE`,
`UCO_ML_PREDICTION` and `UCO_ML_LABEL`. They are created on first use by the server,
using the existing schema's CREATE TABLE privilege. Existing objects are retained.
Feature snapshots and predictions are keyed by content/version, preserve earlier
versions and are committed in a transaction guarded by workspace revision.
Unchanged, version-matched feature snapshots can be restored from Oracle after a
server restart; changed source records require fresh graph-backed extraction.
File-backed workspaces instead save `runtime/ml/history.json`.

The screen shows observed feature differences from training reference quantiles.
These comparisons are explicitly **not exact model feature contributions**.
Flag-related assistant questions use the saved ML result. Other assistant and OCI
validation features retain their existing rule/evidence reference behaviour.

## Validation and officer feedback

`runtime/ml/evaluation.json` reports sample coverage, grouped split, seed rank
stability, top-decile overlap, group-resampling stability, score parity, per-peer
alert volume and each prediction. Accuracy/precision/recall are null because there
are no independent target labels. None is estimated from existing rule outputs.

`npm.cmd test` checks feature leakage, cutoff handling, documents, graph parity
and grouping. `npm.cmd run ml:check` exercises real inference, authorization,
staleness, persistence/reload and officer-label separation. The `--oracle` variant
checks all live Oracle cases and persists actual ML rows without changing
investigation state. `node scripts/check-ml-render.mjs` checks all case panels and
queue/error rendering.

Independent case outcomes are recorded as `explained`, `concern_retained` or
`inconclusive`, with reviewer, source case and rationale. They are not consumed by
unsupervised training. For meaningful detection evaluation, review a sample of
both flagged and unflagged cases with sufficient observation time, then measure
precision, recall and workload independently. Current synthetic data establishes
implementation behaviour and stability, not operational suspicious-case accuracy.

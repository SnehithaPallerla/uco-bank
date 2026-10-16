# Current ML review pipeline

The active pipeline replaces Isolation Forest with a classifier trained to
approximate the earlier review assessments. It uses direct trigger indicators,
pattern measurements and accepted evidence. The model decides the current flag;
an officer decides the investigation outcome. Earlier rule checks remain visible
as reference information and create provisional targets only during training.

## Training target

`server/ml-proxy-targets.mjs` creates versioned, explicitly provisional targets:

| Earlier assessment | Target |
| --- | --- |
| Review required | Needs review (1) |
| Evidence needed | Needs review (1) |
| Context review | Needs review (1) |
| Supported | No review target (0) |
| Data quality review | Excluded / unscored |

These are not independently verified suspicious-activity labels. Pending evidence
and context work are routed for review, rather than silently classified negative.
No stored expected answers, borrower names, catalogue profiles, case IDs, rule
score, total finding count or overall rule outcome enter the prediction matrix.
Inference rejects requests containing a training target.

## Features and evidence

`server/ml-features.mjs` defines schema `uco-review-features-2`: 53 inputs,
including direct T01-T05 and additional configured-pattern indicators, transaction
counts/concentration/timing, source-linked FDs, observed graph paths and related
parties, approvals, invoices, delivery, utilisation and data coverage.

Trigger features describe candidate patterns independently of their explanation.
For example, both Bluefin variants have T01=1. Their accepted invoice/delivery and
commercial coverage differ. Thus a trigger is an input, not an unconditional
rule-based final flag. Indicator construction still uses explicit definitions
and policy thresholds; this is not a claim to eliminate all coded conditions.

Transactions use a 30-day observation window at `asOf`; future transactions and
future/unaccepted evidence are excluded. The offline target uses the same
availability cutoff. Corrections, explicit allocation caps and confirmed
reversals use existing accounting utilities. Oracle mode reads authorized
`UCO_FLOW` data. Unchanged, policy-matched feature snapshots can be restored from
Oracle; changed source records require extraction again. A policy change requires
retraining rather than silently changing the meaning of deployed inputs.

Only accepted, matching evidence affects support coverage. Uploading a document
alone does not authenticate it or establish delivery. The existing demonstration
evidence action still generates prepared accepted records; no new document
upload/OCR/authentication system has been added by this change.

## Model comparison and validation

The pipeline `weak-review-classifier-3-holdout` deploys a model fitted only on a
fixed training partition. It also reduces fitting capacity:

- At most 24 transformed inputs are selected per training fit, instead of up to
  106 numeric/missingness inputs. Non-varying columns and duplicate candidate
  columns are removed. Direct T01-T05 and their evidence/context inputs remain
  eligible core inputs; additional inputs are ranked on training rows only.
- Logistic Regression uses L2 regularization, C=0.25 or 0.5. The final selected
  C=0.25 is stronger regularization than the earlier C=1 model.
- Gradient-boosted candidates are limited to depth 1 or 2, four leaves, minimum
  leaf size 6, L2=2 and 100 iterations. More complex candidates are not deployed
  solely to improve agreement with the current catalogue.
- The cutoff is fixed at 0.5; it is not optimized on this small dataset.
- Three-fold inner grouped validation selects configurations using balanced
  agreement. A one-standard-error heuristic prefers stronger regularization and
  simpler models when their validation results are comparable.

Before fitting, the split operation merges identical-feature groups and groups
related scenario/comparator cases together. It chooses the first fold of a
five-fold stratified group splitter with seed 42, then saves
`runtime/ml/holdout-split.json` with exclusive creation. No seeds or folds are
searched for a higher score. The target is roughly 80/20, but intact groups mean
the actual partition is 85/13 cases. Copies are not independent examples.

| Partition | Cases including copies | Distinct examples used for fitting/testing |
| --- | --- | --- |
| Training | 85 | 63 |
| Reserved test | 13 | 9 |
| Unable to score | 3 | Excluded |

Only training rows enter imputation, scaling, feature selection, three-fold
configuration selection, coefficient fitting and reference feature statistics.
The final deployed model uses those same training-only weights. It is never
refitted on all 98 scoreable cases. Test outcomes do not gate activation or
trigger a different split/configuration.

Current results for `WS-edcba7f046fb071c`, trained from Oracle case data:

- Model: Logistic Regression, C=0.25, 24 selected inputs, cutoff 0.5.
- Reserved test case agreement: **8/13 = 61.5%**. Confusion: 6 true negatives,
  2 false positives, 3 false negatives, 2 true positives against proxy targets.
- Agreement on distinct reserved test examples: **6/9 = 66.7%**.
- Training fit: **79/85 = 92.9%**. Training/test gap: **31.4 percentage points**.
- Training-only configuration-selection validation: **53/63 = 84.1%**; this was
  used for tuning and is not the reserved test result.
- Combined training/test catalogue agreement: **87/98 = 88.8%**. This mixes
  trained and held-out cases, so it is not a test accuracy estimate.
- Current flags: 57 flagged, 41 unflagged, 3 unable to score.

The earlier 74.5% nested cross-validation and 91.8% full-data fit describe the
previous deployment. They are not current holdout results. These same scenarios
were used during previous development, so this is an internal holdout, not a
fresh independent test dataset. Its nine distinct examples are particularly
small. The gap shows remaining generalization limits; merely making a split does
not eliminate overfitting. Real independently reviewed outcomes are still needed
to measure suspicious-activity detection accuracy. Never report the training fit
or combined catalogue agreement as test accuracy.

The split is reused on retraining. Changed dataset features or group membership
cause a clear mismatch error instead of silently redrawing the test set. A new
evaluation dataset requires a deliberate split/version decision before training;
do not remove the split file to search for a better score. Training never occurs
when the application scores a case.

`runtime/ml/evaluation.json` retains metrics and held-out predictions. The model
artifact retains the frozen `holdoutSplit`, actual `fitRecordIds`, training-only
`tuningAudit`, and `holdoutPredictions`. The holdout isolation check verifies that
flipping every reserved test label leaves the complete model bundle, selected
configuration and model version unchanged. It also verifies training-only
preprocessing/reference statistics and rejects overlapping or changed splits.

## Location in the application

Detailed model output and evaluation are shown **only in Portfolio**. Each queue
row has an **ML details** button for its case. Borrower, Transaction Investigation,
Funds & Relationships, Evidence Research, AI Assistant and Case Management no
longer automatically repeat the model panel or score badge. Their ordinary
investigation status and evidence functions remain available. ML scoring for
case workflows still runs server-side as needed.

## Scoring, review holds and persistence

Node invokes the fixed Python worker over private stdin/stdout. It loads hashed
JSON model artifacts with `WS-...` versions, not executable pickle. Exported tree
or coefficient inference is checked against scikit-learn to tolerance 1e-10.
No training occurs when a page opens and no OCI inference call is required.

The current flag (`flagged`) is separate from queue membership (`reviewRequired`).
A saved positive prediction from the active model version or an open investigation retains a case
for review when subsequent accepted evidence lowers its score. The UI displays
the new model result and "Review pending officer decision" together. Independent
officer closure resolves the same reviewed snapshot; subsequent changed data can
produce a new review. Model unavailability does not block a manual investigation.
Predictions from older model versions remain in history but do not retain alerts
in the current review queue. Existing open investigations still require officer closure.

`UCO_ML_MODEL`, `UCO_ML_FEATURE`, `UCO_ML_PREDICTION` and `UCO_ML_LABEL` retain
versions and history. Existing tables need no destructive migration. Writes and
reads are branch-authorized; stale revisions are rejected. Officer outcomes remain
separate from provisional training targets and do not automatically retrain.

Endpoints remain `/api/ml/status`, `/api/ml/predictions` and `/api/ml/labels`.
The prediction response distinguishes `modelStatus`, `status`, `reviewRequired`
and `reviewHeld`. Flag-related assistant answers use this saved model information.
File workspaces use their own `runtime/ml/history.json` equivalent.

## Windows commands

Dependencies are already installed in this working copy. For a fresh checkout:

```powershell
python -m venv .venv-ml
.\.venv-ml\Scripts\python.exe -m pip install -r ml/requirements-lock.txt
```

Train explicitly against either the current catalogue or current Oracle records:

```powershell
npm.cmd run ml:train
npm.cmd run ml:train:oracle
```

Validation and startup:

```powershell
npm.cmd test
npm.cmd run ml:check
npm.cmd run ml:check:holdout
node scripts/check-ml.mjs --oracle
node scripts/check-ml-render.mjs
npm.cmd run dev
```

`UCO_ML_PYTHON` can override the default project interpreter. Existing OCI `.env`
settings remain applicable to chat/research. Model files under `runtime/ml` and
the virtual environment are ignored by version control, so fresh installations
must install dependencies and train. No scheduled retraining has been configured.

Technical references: [HGBT](https://scikit-learn.org/1.7/modules/generated/sklearn.ensemble.HistGradientBoostingClassifier.html)
and [grouped model validation](https://scikit-learn.org/stable/modules/cross_validation.html).

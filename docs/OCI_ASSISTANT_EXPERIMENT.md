# Independent OCI assistant experiment

The original regular assistant remains the default. The experimental backend is opt-in and read-only; it does not change monitoring rules, assessments, decisions, or saved case data.

## Configuration

In `.env`:

```dotenv
UCO_ASSISTANT_MODE=local
OCI_ASSISTANT_MAX_TOKENS=4000
```

`local` preserves the original deterministic chat. `oci-rules` enables experimental OCI chat after restarting `npm.cmd run dev`. Each question can make a chargeable request. The server uses the configured OCI model, region, compartment and signing credentials. Opening `dist/index.html` directly retains local chat.

The model receives the actual canonicalisation, funds-tracing, chronological-path and assessment function definitions as text, plus raw case fields and policy parameters. It does not receive the computed rule assessment, expected answers, previous model reviews, case decisions or the original assistant response. Evidence is transmitted as supplied and may contain identifiers; use the existing generated cases for this experiment.

The server checks permissions before inference, permits four requests per session per minute, rejects foreign evidence IDs, invalid amounts, rule IDs and transaction references, and discards responses if the workspace changes during inference. Citation existence does not prove factual support. Invalid/provider-failed responses visibly fall back to the original assistant. Schema-valid but incorrect reasoning cannot be automatically detected by these serving checks; this is why the experiment is disabled unless independently evaluated.

## Test commands

```powershell
npm.cmd test
# Prints instructions; makes no model calls:
npm.cmd run test:assistant
# 20 cases, twice; 40 chargeable inference requests, plus bounded throttle retries:
npm.cmd run test:assistant -- --live
```

The test reads a fixed snapshot of the saved workspace and compares model output with the coded assessment after inference. The oracle is never sent to the model. Exact outcome, unique review amount, rule IDs, transaction sets, per-finding amounts, gap/context grouping and citation IDs are checked. Repetition consistency compares structured results, not wording. Explanations and citation support still require manual review.

The four known conflicting-input examples LAB-015, LAB-016, LAB-018 and LAB-019 are reported separately and excluded from the activation gate. The gate requires valid, exact results on all 32 clean-case requests and repeat consistency on all 16 clean cases. Even a passing synthetic test is not bank-data or production validation. The runner waits between calls and retries only provider throttling, not invalid answers.

## Initial result

The first experiment attempted 40 requests. Many were throttled, preventing a complete accuracy estimate. Accepted clean-case answers nevertheless demonstrated errors: LAB-001 missed repeated-payment review and returned zero instead of INR 4,500,000; LAB-012 classified the related-party rule as a gap and returned zero instead of INR 3,000,000. Valid citations also varied between repetitions. The activation gate failed, so `UCO_ASSISTANT_MODE=local` was retained. See `test-output/independent-assistant-report.json` for the raw run, including provider failures distinguished from model-answer failures.

The normal OCI validation and Model testing tabs are unchanged. They continue to review the already calculated rule assessment; they are separate from this independent-rule experiment.

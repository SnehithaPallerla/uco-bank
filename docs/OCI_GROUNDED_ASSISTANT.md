# OCI chat with calculated findings

This candidate regular-chat backend uses the existing deterministic assessment and OCI to explain it. It is separate from the independent-rules experiment and the OCI validation tab. The default remains `UCO_ASSISTANT_MODE=local` while test results are reviewed.

## How it works

1. The server checks the session and branch permissions.
2. Code calculates the rule outcome, unique review amount, findings, gaps and fund trace.
3. OCI receives the officer's question, computed results and source evidence. Expected test answers, previous OCI reviews and case decisions are excluded.
4. OCI returns brief cited paragraphs. Its structured outcome and review amount must equal the computed results. Monetary placeholders refer to a server-created fact list; code inserts formatted amounts and normalises currency prefixes. Raw monetary figures, invented placeholders, changed results and foreign or empty citations are rejected. Monetary claims must cite the bank records supporting the referenced fact; an unrelated identity/history record cannot substitute for a ledger. Approval and source-evidence amounts have separately named facts so contradictions are preserved.
5. The UI receives the existing chat response shape. Invalid/provider-failed answers visibly fall back to the original local assistant. Nothing is written to cases or assessments. Source-ID checks do not establish citation entailment or factual correctness of the prose.

Only the existing generated evaluation data should be used in this experiment; source payloads can contain identifiers. Each question can incur OCI charges when enabled.

## Configuration after evaluation

```dotenv
UCO_ASSISTANT_MODE=oci-grounded
OCI_ASSISTANT_MAX_TOKENS=4000
```

Restart `npm.cmd run dev` and open http://localhost:4174. Select AI Assistant's original chat tab. Sources & activity identifies the grounded OCI explanation and any local fallback. Directly opening `dist/index.html` retains local chat.

Restore the normal assistant with `UCO_ASSISTANT_MODE=local` and restart. The `oci-rules` option remains the separate failed independent-rules experiment.

## Tests

```powershell
npm.cmd test
# No calls:
npm.cmd run test:assistant-grounded
# 20 cases plus six repeat checks, 26 chargeable requests plus bounded throttle retries:
npm.cmd run test:assistant-grounded -- --live
```

The runner uses a fixed snapshot, waits 20 seconds between requests, and retries only throttling after a 60-second wait. It saves prompts' input packets, outputs and rejected response diagnostics to `test-output/grounded-assistant-report.json`. Known conflicting cases are tagged separately. Topic checks are only keyword checks. Preserved amounts/outcomes are enforced by code, so their agreement is not independent AI accuracy. Review each explanation against its cited evidence before enabling the candidate. One successful question does not establish general question-answering quality or production readiness.

## Evaluation result

The 26-request run (20 cases and six repeats) accepted 23 answers under the initial validator, rejected three, and encountered no throttling. Review found payment totals cited to history records and overly definitive circular-transfer wording. The final validator was tightened and replayed against the unchanged raw outputs: it accepts 18 of 26, including 17 of the 22 clean-case requests. Rejected answers trigger the local fallback; these numbers measure accepted output, not factual accuracy.

Four additional targeted live questions tested supplier history, ambiguous identity, the ten-recipient payment total and fund tracing with the updated prompt. Three initially passed; the supplier-history reply wrapped a valid cited evidence ID as a placeholder. A narrowly scoped rendering fix accepts only existing, explicitly cited source-reference placeholders. All four saved responses pass the final parser, and the amount/evidence explanations were manually inspected. The current parser tests cover that fix. It does not resolve all broader explanation issues or the four unchanged contradictory scenarios.

The candidate remains disabled with `UCO_ASSISTANT_MODE=local`. Results and distinctions between live acceptance and later parser replay are in `test-output/grounded-assistant-review.json`; raw outputs are in `grounded-assistant-report.json` and `grounded-assistant-followup.json`.

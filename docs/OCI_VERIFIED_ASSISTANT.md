# OCI assistant using verified response blocks

This version narrows the model's role to selecting relevant case explanations. It does not freely generate factual paragraphs. This is an intentional reliability tradeoff: more natural question understanding, with amounts, rule explanations and citations supplied by code.

The server prepares a block catalogue from the existing assessment, permitted loan uses, recipient mappings, supplier history, observed flows, relationships and research state. It also flags mismatches between structured fields and source evidence without editing the original data. OCI returns only a topic and a list of block IDs. The server rejects invented blocks, missing mandatory findings, unrelated block choices, extra factual text and wrong topics for standard question buttons. It renders the selected code-owned text and evidence IDs. Failed responses visibly fall back to the original local assistant.

This prevents the model from changing amounts or inventing citations in displayed text. It cannot guarantee correct topic selection for every free-form question or correct underlying code/data. Source evidence and computed results still require officer review. Known contradictions remain present and are explicitly shown rather than hidden.

## Configuration

```dotenv
UCO_ASSISTANT_MODE=oci-verified
```

Restart `npm.cmd run dev` and open http://localhost:4174. AI Assistant's regular chat and Ask assistant drawer use this mode. Sources & activity identifies OCI selection and the displayed evidence. Standalone HTML retains the local assistant. `UCO_ASSISTANT_MODE=local` restores the original regular chat. Existing OCI validation and Model testing remain separate.

## Verification

```powershell
npm.cmd test
# No calls:
npm.cmd run test:assistant-verified
# 28 chargeable requests, plus bounded throttle retries:
npm.cmd run test:assistant-verified -- --live
```

The automated suite checks all 101 fixtures and all response topics for outcome/amount preservation and case-scoped citations, plus forged/missing blocks, standard-question routing, contradiction visibility and fallback. The live runner checks 20 scenarios and eight additional intent/boundary questions with a fixed state snapshot and delays between calls. Expected topic labels remain outside the model input. Outputs and snapshots are saved to `test-output/verified-assistant-report.json`. Topic accuracy is distinct from factual accuracy: factual text comes from code, not from unconstrained model reasoning.

## Final evaluation and default

The first 28-call trial accepted 17 plans under the initial validator. Review found that several rejected selections contained legitimate contextual findings; other selections included excessive/unrelated blocks and were appropriately rejected. The validator was revised to allow relevant context while limiting excess blocks, and version 2 gives OCI an explicit required-block list for each topic. Code-owned supporting-record and scoped-approval explanations were expanded. Contradictions show both amounts/statuses or approval dates without changing source data.

All eight targeted version-2 live tests passed: approved margin deposit, conflicting approval, unresolved identity, permitted uses, related parties, funds tracing, fraud boundary and decline of case/account actions. All 162 automated tests and the HTTP delivery checks passed. The workspace `.env` now selects `oci-verified`, effective after restarting the server; local fallback remains available. See `test-output/verified-assistant-review.json` for the distinction between original live results, historical parser replay and final targeted live results. This is evaluated on generated fixtures, not a bank-data accuracy certification.

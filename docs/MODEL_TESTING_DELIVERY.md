# Model-testing delivery

Delivered 12 October 2026.

- Added 20 generated borrower cases (LAB-001 through LAB-020), bringing the catalogue to 101. These adapt existing acceptance templates; they are not independent bank data.
- Added Portfolio → Model test cases and AI Assistant → Model testing.
- Added a six-case quick check, selectable cases, one/two repetitions, sequential background jobs, stop-after-current-call, progress, answer inspection and downloadable reports.
- Expected dispositions and topic rubrics stay outside the model packet. Reports distinguish completed reviews, limited automated checks and request/format errors.
- Existing workspaces migrate without replacing case history, policies or saved OCI reviews.
- Added bounded OCI Cohere JSON schema output and rejection diagnostics. The application retains field limits and case-scoped citation checks.

Verification: 141 automated tests, 606 platform screen renders, retained legacy render checks, six model-testing browser workflows and eight existing OCI review browser workflows passed. Browser tests use isolated synthetic state and controlled responses. Desktop/mobile screenshots are under docs/evidence.

## Live OCI quick check

The first six-case run returned four valid reviews and rejected two incomplete answers. That initial report is retained in `docs/evidence/model-test-live-initial.json`. Structured-output checks exposed unsupported schema constraints in OCI's native Cohere API; the adapter now uses its basic schema subset, retaining stricter application validation.

The final six-case run used Cohere Command A in ap-hyderabad-1 and completed all six requests. Five reviews passed the limited automated checks; one disagreed with the authored disposition. `docs/evidence/model-test-live.json` contains the final inputs, outputs, citations, timings and provenance.

The disagreement is Harbour Distribution (LAB-002). The model recommended Evidence needed, asserting that TX02/TX03 lack commercial support. Its packet actually includes accepted invoices and goods receipts for all three payments. The system flagged the disposition disagreement and retained the model's answer for inspection rather than changing the Supported rule result or rewriting its output.

This is a small explanation sanity check with visible rule results, not standalone anomaly-detection validation, a held-out bank benchmark or fraud accuracy. Five of six passing these checks must not be presented as population accuracy. No bank records, account actions or customer messages were involved.

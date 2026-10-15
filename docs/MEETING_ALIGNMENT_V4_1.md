# UCO Credit Intelligence — meeting-aligned update

Version 4.1.0 · 25 September 2026

## Open the application

Open `dist/index.html` in a modern browser. The application is self-contained and works offline. For the persistent local server, install the dependencies with `npm ci`, then run `npm run dev` and open the address printed by the server. The standalone delivery is also available as `UCO_Bank_Credit_Monitoring_Demo.html`.

The default portfolio is **Five agreed triggers**. The previous 69 records remain available in the original, extended and boundary profiles; 12 meeting cases bring the complete catalogue to 81 records. Existing version 4 workspaces gain these cases without replacing investigation history or approved policy settings.

## What changed

- Five trigger cards show counts and filter directly to the relevant account tasks.
- Bluefin Logistics → Kaveri Trading is the featured investigation: three payments of ₹12 lakh, ₹15 lakh and ₹18 lakh, totalling ₹45 lakh, over 21–23 September.
- The exact source transaction, rule, time window, count and amount are visible. An explained procurement comparison shows how accepted commercial records can resolve the repeated-payment concern.
- Research counterparty replays prepared company captures, compares identity candidates, presents business activity and dated passages, and distinguishes public context from proof of payment purpose.
- The assistant answers questions about completed company research with references scoped to that case. It does not claim to have searched the web.
- Prepare document request opens an investigation and records a transaction-specific draft. No email or customer communication is sent.
- Repeated credits are context tasks with a zero loan-diversion amount. A market-related narration without verified classification creates an evidence task, rather than a verified investment-use finding.
- Account-history cases show the closed and new account under the same CIF and their evidence.
- Architecture shows the proposed Finacle / current 19c estate, GoldenGate capture, OCI ingestion, Oracle AI Database 26ai, company research, React and APEX review path.

## Five-trigger coverage

| Trigger | Main case | Documented comparison | Additional coverage |
|---|---|---|---|
| T01 repeated party flows | MT-BLUEFIN | MT-BLUEFIN-OK | MT-CREDITS: repeated receipts and sales-ledger reconciliation |
| T02 capital-market indicators | MT-CAPITAL | MT-CAPITAL-OK | MT-CAPITAL-PATTERN: unverified market narration |
| T03 UCO fixed deposit | MT-FD | MT-FD-OK | Source-linked FD and scoped margin approval |
| T04 account closure / reopening | MT-REOPEN | MT-REOPEN-OK | Same-CIF history and documented branch migration |
| T05 retail external-bank transfer | MT-RETAIL | MT-RETAIL-OK | Sanctioned builder and accepted payment documentation |

These are prepared demonstration scenarios, not assertions about real companies or customers. The capital-market comparison assumes an explicit facility-specific exception; it is not a recommendation that such use be permitted. Thresholds and exclusions remain subject to bank validation. The T01 defaults are three debits or credits in 168 hours, or two debits with a credit, and a minimum aggregate of ₹1 lakh. T04 uses a configurable 720-hour closure-to-reopening window.

## Customer walkthrough — approximately 12 minutes

1. **Five triggers (1 minute):** show the five cards and their queues. Explain that each is a reason to investigate, not a fraud conclusion.
2. **Bluefin payments (2 minutes):** select Investigate Bluefin. Show the ₹45 lakh aggregate, three payment references and T01 rationale. Open a ledger record and the sanction clause.
3. **Company research (3 minutes):** select Research counterparty to enter Evidence Research, then run the prepared research. Show Kaveri's business profile, identifier-matched candidate, unlinked name-only alternative, source timestamps and captured passages. Explain that trading activity can support warehouse procurement; the payment-specific documentation still needs checking.
4. **Assistant (1 minute):** ask “What does the company research show?” and “What should the officer do next?” Open a cited source.
5. **Officer workflow (2 minutes):** from Evidence Research, select Prepare document request. Show the exact payment references in the unsent draft. Record the explanation, select evidence and submit for review. Switch to Ravi for the independent decision.
6. **Explained comparison (1 minute):** return to Portfolio and select Compare documented procurement. Show the accepted commercial records, Supported outcome and zero review amount.
7. **Architecture (2 minutes):** explain GoldenGate extraction and the target Oracle services. Distinguish actual local execution from deployment connections.

Use a fresh browser workspace or isolated local server state for a clean run. The Guided walkthrough in the sidebar follows these screens. A new replay remains available in a new workspace; existing reviewed research is retained on reload.

## Actual execution and dependencies

Local deterministic rules, graph traversal, scoped assistant responses, recorded research and officer workflows run in the application. The server persists local state and checks persona/branch access; these personas are not production authentication. The standalone HTML uses browser storage.

Company captures use illustrative `.example` URLs and prepared registration references. They are not retrieved Google, GST or MCA records. Checking live availability records an unavailable attempt, retains existing evidence, and adds no adverse finding. Replay evidence retains its original capture date separately from the review time and does not create a verified corporate relationship.

Finacle / GoldenGate, Oracle 26ai, live external research, OCI Generative AI and APEX are target integrations. Deployment requires source compatibility and field mapping, approved extraction, service endpoints, bank identity controls, agreed rules and performance validation. The 19c reference reflects the estate mentioned in the meeting; the exact Finacle source platform/version must be confirmed.

## Verification

Run `npm test` for rule, evidence, authorization, migration and server controls. Run `npm run check:meeting` with Playwright and a Chromium installation for the meeting journey, desktop/mobile layouts and the offline HTML. `scripts/browser-check.mjs` retains the previous 16 workflow checks. Browser evidence and machine-readable results are in `docs/evidence/`.

No bank-scale performance measurement, live registry integration, production deployment or trained model evaluation is implied by these checks.

# UCO Credit Intelligence — v4.2

**More samples and model tests:** 20 additional borrowers bring the catalogue to 101 generated cases. Select Portfolio → Model test cases or AI Assistant → Model testing. Run a prepared report for free, or test selected cases once/twice against OCI. See [MODEL_TESTING.md](docs/MODEL_TESTING.md). Existing cases and model reviews are preserved. The sections below retain the original v4.1 delivery details.

**New OCI validation demo:** AI Assistant → OCI validation compares the rule assessment with a cited advisory review. Use Show prepared review immediately, or configure a live OCI model using [OCI_VALIDATION_SETUP.md](docs/OCI_VALIDATION_SETUP.md). `npm start` serves the prebuilt app and loads `.env`; `npm run dev` rebuilds first.

**Updated AI Assistant:** [Research the web and Bloomberg enrichment — setup, demo steps and validation](docs/AI_ASSISTANT_ADDITIONS.md). The original application flow is retained.

A working React evaluation platform for loan end-use monitoring and evidence-led investigation. All borrower, company, account and payment records are generated acceptance data. No real UCO customer data or live bank/Oracle integration is included. Professional operational screens use normal banking language; Administration → About and every evidence export retain provenance. Use the supplied data or approved masked evaluation data only.

## Open the application

**No installation:** open `dist/index.html` in a desktop browser. The HTML includes React, icons, CSS and the UCO emblem, with no CDN dependency. Work is retained in that browser's local storage.

**Persistent backend and API controls:** install Node.js 22 or later. In the extracted project folder run:

```sh
npm ci
npm run dev
```

Open **http://localhost:4173**. The server binds to the local computer and writes to `runtime/state.json`. Keep the terminal running. The offline browser state and server state are separate. This is a local evaluation server; selecting an officer persona is not bank authentication.

**Start the presentation:** keep Portfolio → Five agreed triggers selected, then choose Investigate Bluefin or Guided walkthrough. See `docs/MEETING_ALIGNMENT_V4_1.md` for the 12-minute customer script and the implementation boundaries. Use Asha for investigation, Ravi for independent review, Neha to show BBS-only access and Platform Administrator for operations and target/pilot entries.

## What changed

- The default dashboard leads with the five agreed triggers and Bluefin Logistics → Kaveri Trading. Recorded counterparty research includes identity alternatives, dated captures, cited assistant answers and an unsent document request.
- Repeated-credit and unverified capital-market indicators are separate context/evidence tasks; each core trigger has a documented comparison. The architecture view shows Finacle, GoldenGate and the proposed OCI path.

- Nine workspaces: Portfolio, Borrower & Loan 360, Transaction Investigation, Funds & Relationships, Evidence Research, AI Assistant, Case Management, Architecture and Administration.
- **81 records:** 12 new meeting cases plus the retained 69 records: 12 original presentation cases, 33 BRD/extension/legitimate-comparison cases and 24 boundary/failure cases. The original 18 legacy fixtures remain available and their existing tests are retained. Administration also opens the retained v3 evaluation tools, which use a separate state store.
- Original profile reconciles to **25 unique transactions, 26 events, ₹8.55 crore in drawdowns, five review cases, two evidence tasks, five supported cases and ₹1.35 crore direct outflow requiring review**. Expanded profiles calculate their own totals.
- Purpose taxonomy and exact recipient mapping; cumulative payee/purpose/project/date/amount approvals; accepted invoices and delivery; supported proprietor and collection-account mappings; ten-recipient rolling aggregation; repeated flows; FD, investment, cash, own-account, other-debt and utilisation checks.
- Corrected versions, cancelled/failed payments, duplicate events, full/partial reversals, partial refunds, multiple drawdowns and mixed-balance uncertainty. Verified reversal and ordinary return amounts stay distinct.
- Interactive sourced payment graph, chronological cycles, amount/time filters, common-director, account-ownership and project views. No unseen external-bank transfer is invented.
- Case-specific grounded assistant, exact evidence passages and allowed-tool activity. The assistant is a deterministic supported-intent implementation; no live LLM or model score is portrayed.
- Evidence reassessment and prior snapshots; notes, request drafts, response records, ownership, due dates, independent review, closure, reopening and downloadable evidence packets. No messages or account actions are sent.
- Backend session/role/branch checks on records, graph, evidence, retrieval, assistant and export; self-approval denial; optimistic concurrency; persisted local checkpoints, quarantine and replay. Evidence access and decisions are recorded. File-backed audit chaining is not production immutable retention.
- Policy proposals and independent activation; a **121-row requirement-to-proof matrix**; operating target register; read-only pilot measurement form; honest service status and deployment prerequisites.

## Test and visual evidence

```sh
npm test
npm run build
npm run check:platform
npm run check:render
node scripts/check-http.mjs
```

The delivery passed **114 automated tests**, **414 new platform screen renders** across 69 records, retained v3 screen checks, HTTP delivery/security checks, and **16 Chromium browser workflows** at 1440×1000 and 390×844. Browser checks cover the full reviewer journey, evidence links, exports, graph filters, source-backed director/account/project views, identity reassessment, branch restrictions, replay and persistence. Screenshots and machine-readable results are under `docs/evidence/`. Screenshots were visually inspected for desktop, mobile, graph, assistant, evidence and case layout. These results verify generated-record behaviour, not bank fraud accuracy or production scale.

Optional browser rerun: install Playwright and its Chromium browser in your development environment, then run `node scripts/browser-check.mjs`. It starts an isolated test server and removes its temporary state. Set `CHROMIUM_EXECUTABLE` and `PLAYWRIGHT_MODULE` if using an existing browser/runtime. Browser tooling is not required to open or run the application.

## Integration assets and remaining gates

- `oracle/04_platform.sql`: current proposed Oracle 26ai relational schema, SQL property graph, source-linked graph query templates and filtered vector retrieval. Not executed against an Oracle instance.
- `oracle/05_oml_candidate.sql`: optional One-Class SVM training/scoring template. Trained ML is deferred because representative approved bank data and independent validation are absent. No accuracy or calibrated fraud probability is claimed.
- `api/platform-openapi.json`: local API; `api/agent-tools-openapi.json`: restricted HTTPS agent-tool deployment contract.
- `server/adapters.mjs`: safe disconnected registry and Oracle adapters. Approved GST/MCA/search provider access, consent where applicable and backend credentials are prerequisites. The retained institutional collector is not borrower verification.
- `docs/Finacle_Field_Map.csv`: canonical field map with explicit bank mapping gaps; no Finacle tables or fields invented.
- `docs/INTEGRATION_V4.md`: OCI deployment boundaries, APEX/ORDS review contract, bank SSO and data/control requirements.
- `docs/MODEL_GOVERNANCE.md`, `RUNBOOK.md`, `READ_ONLY_PILOT.md`, `OPERATING_TARGETS.csv` and the proof matrix: validation and bank readiness handoff.

No Finacle, Oracle Database, ML, Vector Search, OCI Agents, APEX or live counterparty registry connection is configured. APEX is an integration contract, not a deployed application. Bank SSO/MFA, TLS/KMS, managed secrets, protected evidence/audit retention, live uploads and malware scanning, load/HA/DR tests, applicable-policy review and an authorised read-only bank pilot remain pending. No resources were provisioned or published externally.

Original BRD FR-01–FR-15, NFR-01–NFR-10 and AC-01–AC-05 are mapped. Detailed scope remains sole-banking, non-consortium monitoring; the contextual syndicated-bank scenario is not claimed. Thresholds and 48-hour case due dates are evaluation settings, not approved UCO policies or SLAs.

## Source layout

The regular assistant also has an opt-in independent OCI rules experiment. Its initial test failed the activation gate, so the original local assistant remains the default. Setup, fallback behavior and live-test commands are in [OCI_ASSISTANT_EXPERIMENT.md](docs/OCI_ASSISTANT_EXPERIMENT.md).

A separate [grounded OCI chat candidate](docs/OCI_GROUNDED_ASSISTANT.md) keeps the coded calculations and uses OCI for cited explanations. It is tested separately and remains opt-in pending explanation review.

The [verified-block OCI assistant](docs/OCI_VERIFIED_ASSISTANT.md) further constrains OCI to selecting explanations. Code supplies all factual text, amounts and evidence links, with automatic local fallback.

- `src/platform/`: v4 catalogue, shared rules/workflow, governance and React screens.
- `src/diversion/`: preserved v3 implementation and evaluation tools.
- `src/App.jsx`: v4 entry, retaining legacy screen export for regression checks.
- `server/platform.mjs`: persistent local service, sessions, authorization and audit chain.
- `fixtures/`: independent original expectations and expanded generated catalogue.
- `scripts/`, `tests/`: build, delivery and verification.
- Prior top-level engines and old docs/SQL remain historical references; v4 README, INTEGRATION_V4 and 04/05 SQL describe the active implementation.

The UCO name and unchanged bank emblem come from the official UCO website and belong to UCO Bank. This requested concept does not imply endorsement. Third-party notices are retained.

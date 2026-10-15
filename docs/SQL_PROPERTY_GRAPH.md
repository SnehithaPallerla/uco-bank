# Funds & Relationships with Oracle SQL Property Graph

The existing React/SVG display now loads `GET /api/records/{recordId}/graph` in server mode. With `UCO_STORAGE=oracle`, the backend queries the user's existing `UCO_FLOW` SQL property graph. No replacement tables or graph definition are created by this integration.

## Request flow

1. The officer opens Funds & Relationships. React sends the selected record ID and workspace revision to the backend.
2. The backend authenticates the officer, authorizes their branch and rejects an outdated revision before querying Oracle.
3. Oracle `GRAPH_TABLE` queries return case-scoped entities, posted payments through the case's as-of timestamp, and verified relationships. Separate SQL patterns find chronological return paths with three to six distinct payment legs and no repeated intermediate entities.
4. Existing deterministic code applies evidence-backed reversals and loan allocation rules to these payments. Fully reversed payments are excluded from eligible return paths. Graph totals remain separate from the loan-linked amount requiring review.
5. React draws the returned nodes and edges and preserves evidence drill-down, payment filters, relationship views and chronological paths. The view identifies its source as **Oracle SQL Property Graph - UCO_FLOW**. Account/project/director context nodes still come from linked case metadata.

## Data synchronization

`UCO_RECORD_PAYLOAD` remains the application's canonical record JSON. `UCO_ENTITY`, `UCO_PAYMENT` and `UCO_RELATIONSHIP` are derived projections. On Oracle server startup, these projections are refreshed for the loaded workspace under its revision lock. On subsequent saves, only records whose projected graph fields changed are refreshed in the same transaction as JSON and audit changes. Projection failure rolls back the entire save.

Rebuilding a selected record's projection replaces only its entity/payment/relationship rows, retains case and evidence IDs, canonicalizes corrected transaction versions and gives relationships without IDs stable per-record keys. It also upserts referenced drawdowns. Other cases, case decisions, evidence tables and audit history are not deleted. Make application changes through the backend; edits made directly to projection tables are overwritten by synchronization.

Graph reads use a read-only Oracle transaction and verify the workspace revision. Returned graph attributes are checked against the authorized record snapshot to detect stale projections. Missing/invalid graphs and Oracle failures are shown explicitly; server mode does not silently display a local graph instead. Offline/file-backed demonstrations are labelled **Local demonstration graph**.

Queries are bounded to 20,000 entities/payments/relationships and 500 return paths per record. Exceeding a limit returns an explicit error. Case branch scope is enforced before database access, and every graph query binds the authorized case ID. Browser requests cannot supply SQL or another officer's identity.

## Run and verify

Keep the existing Oracle wallet and connection settings in `.env` and `UCO_STORAGE=oracle`. Restart with `npm.cmd run dev`, then open Funds & Relationships. The existing `UCO_FLOW` graph must be VALID and queryable by the application user.

`node scripts/check-sql-graph.mjs` initializes the Oracle store (including projection synchronization), queries live graphs for every stored record and compares payment IDs, verified relationship counts, funds totals and chronological return paths with the deterministic baseline. Its report is saved to `test-output/sql-graph-live-check.json`. It does not create schema objects or change case decisions. This is an evaluation on the project's generated cases.

The graph endpoint includes `source`, `graph`, `pathEngine`, `recordId`, `revision`, `retrievedAt`, `metrics`, `entities`, `payments`, `relationships` and `paths`. Optional `?revision=N` prevents a graph from a different workspace revision being shown.

Reference: [Oracle GRAPH_TABLE operator](https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/graph_table-operator.html).

# Integration and deployment contract — v4

The application is a working local evaluation platform. No Finacle, Oracle, APEX, registry or live generative model connection has been established. Existing `01_`–`03_` SQL files are retained historical designs; use `04_platform.sql` and `05_oml_candidate.sql` as the current deployment starting point, not additive migrations. SQL was checked against official documentation, but requires execution and validation in the exact approved Oracle environment.

## Finacle to monitoring

1. UCO's Finacle owner confirms product/version, authorised API/event feed or approved extract/CDC route, transaction semantics and historical depth. No source table names are assumed.
2. An ingestion adapter maps source records using `Finacle_Field_Map.csv`. Join verified CIF/account/facility/drawdown identifiers; join sanction/DMS, KYC, FD, account history and milestone sources where needed.
3. Retain source event ID, payload version, extraction batch, source offset, received time and transformation version. Deduplicate events and transaction versions independently. Opposite ledger sides of one transfer must be combined by an approved transfer reference and mapping, never merely equal amount/time.
4. Validate schema, references, currency, positive amount, timezone and posting status. Quarantine malformed or conflicting versions. Compare source event counts and debit/credit control totals with accepted, replayed and rejected records. The local screen calculates supplied-record totals; reconciliation to a real Finacle extract remains a pilot gate.
5. Persist canonical transactions and checkpoints atomically in the bank deployment. Replay late events and corrections, preserving old assessments. The local server uses atomic file replacement, a previous snapshot and a serialized writer; it is not a distributed transaction engine.
6. Screen without waiting for research. Queue authorised enrichment separately; retries use bounded exponential backoff, a circuit breaker and dead-letter ownership in deployment. An unavailable provider produces an evidence task, never adverse evidence.

A debit/credit statement alone is insufficient for sanctioned purpose, verified account ownership, related directors, scoped approvals, invoices, delivery, utilisation deadlines, and authoritative FD linkage. Each has a named joined source in the field map. Missing fields remain unknown.

Funding uses exact drawdown references and caps each drawdown. Only a confirmed reversal replenishes its allocation in the current local engine. Ordinary return legs reduce observed net outward movement but do not automatically prove that original loan funds returned. Mixed balances produce an inferred upper bound and explicit uncertainty; UCO must approve attribution, partial-refund and return-reuse methodology before bank use.

## API and service identity

`api/platform-openapi.json` describes the implemented local endpoints. Browser sessions use an HttpOnly, SameSite cookie with a 30-minute evaluation expiry. The selected persona is assigned by the local server, and request bodies cannot override it. This is deliberate local impersonation for demonstrations, NOT authentication suitable for bank data. Replace `/api/session` with bank SSO/OIDC validation, MFA policy, secure cookies and session revocation before any bank pilot. Enforce issuer/audience/signature/expiry and derive subject/branch/role from authoritative assignments.

The server checks record scope for record, evidence, search, graph, assistant and export routes. A graph path cannot expand into an unauthorized case. Evidence IDs are resolved only within the selected authorized record. No arbitrary SQL, URL fetch, shell execution, account restriction, customer send or recovery endpoint is exposed to assistant tools. Unknown routes are rejected.

The offline HTML shares domain logic but stores data in browser storage. Offline controls are presentation behaviour, not a security boundary. Do not give it real confidential customer records.

## Oracle target and OCI components

| Component | Integration responsibility | Acceptance before enabling Connected |
|---|---|---|
| API Gateway + service on Functions/OKE/Compute | TLS, request validation, session/SSO verification, throttling, permitted tool endpoints | Signed identity, authorization negatives, input/size/rate-limit checks |
| OCI Streaming or approved queue | Ingestion decoupling, replay, partition/checkpoint ownership | Loss/duplicate/reordering and outage recovery under agreed load |
| Oracle AI Database 26ai | Canonical transactions, cases, policy and evidence metadata; transactional updates | Reconciliation, concurrency and migration tests |
| SQL Property Graph | Observed payment paths and sourced relationship edges | Execute supplied graph queries, verify time order and every edge source |
| AI Vector Search | Passage embeddings with case/customer/ACL filters | Approved embedding model and dimensions, exact baseline, retrieval recall and forbidden-case tests |
| OCI GenAI Agents | Tools using OpenAPI contracts, identity propagation and grounded response generation | Source citations, refusal of unsupported actions, injection and cross-customer tests |
| Oracle APEX / ORDS | Human review, case assignment and policy approval using the same backend | SSO mapping, separate maker/checker, version/closure consistency |
| OCI Object Storage + approved retention | Versioned original documents, capture hashes and retention/legal hold | Denied overwrite/delete, restore drill, retention and jurisdiction approval |
| IAM, Vault and Audit | Service identity, least privilege, managed secrets/key rotation and durable audit | Least-privilege review, rotation and audit-delivery verification |
| OCI Logging / Monitoring / APM | Correlated event, job and case metrics/traces | Alert routing, backlog/failure thresholds and operational ownership |

## APEX implementation contract

No APEX application is deployed. Create pages: 10 Work Queue; 20 Case Detail; 30 Evidence; 40 Review Decision; 50 Policy Approval; 60 Audit. Define Analyst, Reviewer and Administrator authorization schemes backed by validated bank identity. Use ORDS REST Data Sources to the governed API or equivalent secured packages; never allow client-supplied maker/checker or branch fields to confer access. Page 40 submits an immutable decision/evidence/policy snapshot; backend checks distinct reviewer and optimistic version before closure. Page 50 approves pending policy versions; existing case snapshots retain their prior version. Add APEX workflow tasks for owner, due date, reassignment and escalation, with exact APIs verified against the provisioned APEX release. Navigation to APEX requires a configured bank URL and SSO, so no fictitious live launch is displayed.

## Research adapters

`server/adapters.mjs` implements safe disconnected GST/MCA/Search interfaces. Configure only authorised endpoints and credentials in the backend. Registry records are public context, not proof of account ownership or delivery. Never put PAN, Aadhaar, account numbers, sanction documents or private case notes into public search. Provider contracts require source URL/name, captured/effective times, match basis, access basis/consent reference where required, expiry and status. Required statuses: matched, unresolved, unavailable, stale, conflicting and not found. The supplied GST/CIN tokens are invalid evaluation identifiers and must not be sent to live registries.

The retained institutional website collector accepts only its fixed source IDs. It is not a borrower verification adapter. Live external retrieval success was not claimed.

## Security and production gaps

Bank SSO/MFA, production TLS, encrypted database/storage, secret rotation, malware scanning of uploads, durable immutable audit, deletion/legal hold and independent security testing are not implemented by the local file server. The local app accepts evidence notes and prepared structured records rather than arbitrary file uploads; add an authenticated scanning/quarantine pipeline before enabling upload. Local audit chaining detects simple edits when compared with its retained head; an administrator who can rewrite the whole file can replace the chain. Anchor audit events in a bank-approved durable service.

Deployment location, retention, RBI/bank-policy applicability, customer communications, formal fraud classification and recovery workflow need bank legal/compliance and business owner mapping against requirements current at deployment. No regulatory compliance claim follows from the UI.

## Official technical references checked 25 September 2026

- https://docs.oracle.com/en/database/oracle/property-graph/26.3/spgdg/creating-sql-property-graph.html
- https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/graph_table-operator.html
- https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/perform-exact-similarity-search.html
- https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/23/mlsql/one-class-svm.html
- https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/23/dmprg/CREATE_MODEL-procedure.html
- https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/api-calling-tool.htm

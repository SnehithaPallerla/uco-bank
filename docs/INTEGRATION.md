# Integration boundary — v3

## Current runtime

Self-contained React client with local synthetic records and browser persistence. The optional local Node server provides `/api/health` and the three-source `/api/research` collector. There is no real Finacle, Oracle, APEX or GenAI connection and no automatic customer communication or recovery action.

## Proposed Oracle deployment

1. **Finacle adapters → OCI Streaming:** approved account, facility, drawdown, transaction, FD, history and reference feeds. Partition by an agreed key; define ordering and hot-key behaviour. At-least-once delivery requires idempotency and durable checkpoints.
2. **Functions/OKE processors → Oracle AI Database 26ai:** validate data, reconcile totals, maintain entity/facility links, evaluate approved policy versions and persist alerts. Handle multiple drawdowns, repayments, corrections, currencies and late event-time re-evaluation beyond this demo's simplified allocation.
3. **Oracle Graph:** typed entities and sourced relations; bounded chronological queries with supporting transaction IDs. Do not infer inaccessible external-bank legs.
4. **Asynchronous research workers:** approved registry APIs/licensed sources, exact identity resolution, caching, quotas, failure statuses and manual match review. Retrieve no private customer data through a public search engine. Treat text as untrusted evidence, not executable agent instructions.
5. **Object Storage:** permitted evidence captures, originals where retention rights allow, timestamps, hashes and policy retention. A hash is an integrity check only.
6. **GenAI Agents:** approved API tools invoke research/read-only graph services; RAG retrieves access-scoped evidence from Object Storage/26ai. Responses cite source IDs, timestamp/snapshot versions and evidence gaps. Keep writes outside the assistant's authority.
7. **React / APEX:** authenticated investigation experience, internal configuration and review workflows. Server-enforced distinct maker/checker actors decide outcomes.
8. **IAM/Vault/Audit/Monitoring:** bank SSO, least privilege, secrets, independent audit retention, metrics and alerts. Browser-selected roles never establish permission.

Official references: [API tools](https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/api-calling-tool.htm), [RAG](https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/RAG-tool.htm), [Streaming partitions](https://docs.oracle.com/en-us/iaas/Content/Streaming/Concepts/partitioningastream.htm).

## Collector contract (implemented locally)

POST `/api/research`, same origin, JSON:

```json
{"sourceId":"uco"}
```

Also accepts `oracle-agents` and `oracle-rag`. Extra fields, arbitrary URLs and customer data are rejected. Result: `{ "evidence": { ... } }` with mode, publisher, URL, source-date status, retrieval time, excerpt, full captured text, hash scope, SHA-256 and match status. HTML becomes plain text; scripts/styles are removed. The server follows no redirects, permits only text/HTML, sets a 12-second fetch deadline, caps captures at 1 MiB and caches for 15 minutes. HTTP wrapper limits requests to 10/minute and listens only on localhost:4173. No authentication is provided because this is a local demo; do not publish this server unchanged.

Public institutional sources remain separate from borrower evidence. A future counterparty API should return: legal entity ID and name, matching method, candidate matches, verification actor/time, source licence and publication/capture dates, individual claims, contradictions, stale/unavailable status and permitted evidence references. Never automatically attach a name-only match to a case.

## Candidate application contracts (not implemented)

- `POST /events`: idempotent authorised source-event ingestion; event ID, version, event time, receive time, payload and correction lineage.
- `GET /borrowers/:id`: permission-filtered facilities, approvals and transactions.
- `POST /research/jobs`: approved entity identifier and authorised source set; returns asynchronous job ID.
- `GET /research/jobs/:id`: queue/complete/unavailable status and evidence candidates.
- `POST /cases/:id/proposals`: outcome, rationale and valid evidence IDs; authenticated maker.
- `POST /cases/:id/review`: approve/return, rationale, expected case version; independent authenticated checker.
- `POST /assistant/query`: question and case scope; answer with per-claim citations, retrieval/version metadata and explicit limits. Role comes from the server session.

The file `api/openapi.json` documents only the implemented collector endpoints.

## Pilot gates

Agree Finacle field maps and history depth; validate source access and evidence retention; approve thresholds, windows and exclusions; independently review historical outcomes; split training/validation temporally; measure precision/recall and workload by segment; run shadow mode; benchmark sustained throughput and p95/p99 event-to-alert latency; test replay, duplicates, late/corrected events, outage recovery, access boundaries and evidence integrity. Websites are asynchronous enrichment, not a per-transaction blocking dependency.

No automatic diversion classification, customer messaging or recovery is implemented. Syndicated/consortium banking remains a separately scoped extension under the BRD.

# Local operation and bank deployment runbook

## Start and preserve work

Node.js 22+ is required. Run `npm ci`, then `npm run dev`; open http://localhost:4173. The server binds to loopback. `runtime/state.json` stores records, checkpoint, cases, policy, evidence, audit and pilot entries. Each successful write is serialized and replaces the file atomically; `state.previous.json` retains the preceding state. Do not run two server processes against the same directory. `UCO_STATE_DIR` may select an isolated local evaluation directory. No secrets are required for local operation.

`dist/index.html` works without installation or network. It persists a separate offline workspace in the browser. Server and offline states are intentionally distinct. Export evidence packets before clearing browser data. Switching identity on a local server uses a selectable test persona, not bank SSO.

## Routine health and reconciliation

- `/api/health`: version, availability, state revision and audit-chain validity; no bank connectivity claim.
- Administration → Operations: pause, resume, replay, checkpoint, quarantine, received/unique/replayed counts and record debit/credit totals.
- Compare real-source counts, posted totals, reversals and versions against approved batch controls before a bank pilot. A calculated fixture total is not source reconciliation.
- Case owners review due work; evaluation due dates are created at +48 hours and are not a bank SLA. Escalation owner is the East-circle credit manager placeholder until bank assignment.

## Failure handling

| Failure | Local response / bank implementation requirement | Owner |
|---|---|---|
| Portal unavailable | Record evidence gap; continue screening. Bounded retries and provider limits required in live worker. | Research service owner |
| Invalid / conflicting event | Preserve quarantine reason. Correct source event with a new version and ID; never edit the accepted raw history silently. | Finacle data owner |
| Ingestion paused | Queue approved canonical events. Resume then replay. Exact event IDs are idempotent. | Operations |
| Stale case write | HTTP 409; refresh workspace before resubmitting. No silent overwrite. | Officer |
| Session expiry | HTTP 401; reopen an authorised local session. Production bank SSO renewal required. | IAM owner |
| Audit-chain mismatch | Stop writes, preserve files and compare trusted backup. Local chain is not immutable storage. | Security/operations |
| Process restart | Read the persisted state; check revision, cases, checkpoint and audit chain. | Operations |
| Storage failure | Request fails; investigate free space and permissions. Do not claim success or retry destructive edits. | Operations |

## Backup and restore drill

1. Stop the local server. Copy `runtime/state.json` and record its SHA-256 into a restricted backup directory. Keep the state schema and application version together.
2. Restore into a separate `UCO_STATE_DIR`, leaving the original untouched. Start with that directory and inspect health, branch filtering, cases, policy, checkpoint and audit chain.
3. Compare expected record/event counts and original-profile totals. Verify the last acknowledged case action exists. Replaying source events must not duplicate transactions.
4. Record actual elapsed restore time and lost acknowledged events. The automated service test covers local file restart/backup restore only; it is not an OCI HA/DR or bank RTO/RPO measurement.

To reset: stop the server, archive the current runtime directory, and start with a fresh directory. The UI reset affects only offline browser state. Do not erase a bank dataset to reset a presentation.

## Bank observability and release gates

Instrument source-event-to-persisted-alert duration separately from ingestion delay, research latency and UI render time. Report p50/p95/p99 under specified volumes, queue depth, error/timeout rates, retry count, data-quality failures and model/provider cost. Correlate by non-sensitive event/case IDs. Route source lag to Finacle operations, enrichment failure to provider owner, denied access to security and overdue review to the circle manager. Redact private identifiers from logs.

Bank acceptance must agree accounts, transaction load/peaks, users, delay targets, dashboard latency, availability, RTO/RPO, retention and monthly budget. The target register starts unagreed and unmeasured. No generated browser timing establishes bank scale.

Before production: approved data map and labels; bank SSO/MFA and least privilege; TLS/KMS/secrets; protected original evidence and audit; upload scanning if enabled; provider access; exact Oracle execution checks; independent security/model review; load/failure/DR test; regulatory/bank-policy review; shadow-pilot outcome and authorised release. Roll back the app/schema and policy/model versions as an explicitly rehearsed release procedure.

# BRD coverage in the v3 demonstration

The supplied BRD v1.2 scopes detailed requirements to Scenario 2: sole-banking, non-consortium diversion monitoring. Scenario 1 (syndicated facilities) remains contextual and is not claimed as implemented.

| BRD requirement | Demo implementation | Pilot dependency |
|---|---|---|
| FR01 data ingestion | Synthetic facility, account, drawdown, transfer, FD/history data and event quality controls | Approved Finacle adapters and historical depth |
| FR02 borrower/facility linkage | CIF, facility, drawdown IDs, explicit allocation and sourced relations | Production master-data mapping and reliable funding attribution |
| FR03 configurable triggers | T01–T05; versioned thresholds, windows, exclusions, severity | Bank-approved definitions and acceptance tests |
| FR04 repeated counterparty flows | T01 and chronological transaction references | Payment codes, baseline behaviour and counterparty matching |
| FR05 investment use | T02 CC/OD and verified investment classification | Approved classification source and match review |
| FR06 UCO FD linkage | T03 explicit drawdown/payment/FD fixture linkage | Finacle FD mapping and margin exceptions |
| FR07 closure/new account | T04 matching CIF and ordered account-history dates | Customer key reliability and history availability |
| FR08 retail external transfers | T05 product/payee/bank checks and approved-dealer exception | Bank thresholds and exclusions |
| FR09 public context | Synthetic source statuses; separate live institutional collector | Approved counterparty sources, entity resolution and evidence policy |
| FR10 AI-assisted rationale | Explainable rules, severity, evidence completeness and template assistant | Validated ML/GenAI integration and appropriate confidence calibration |
| FR11 timely alerts | Immediate local evaluation and optional timing exercise | Measured bank event-to-alert SLA; asynchronous research workers |
| FR12 investigation actions | Notes, document requests/responses, proposed outcomes, independent review, closure | Production identity, ownership, communication and escalation integrations |
| FR13 lineage/audit | Frozen snapshots, source references, policy version, export packets and local audit | Durable access-controlled audit and immutable retention policies |
| FR14 approved configuration | Distinct demo maker/checker proposal and activation | Server-enforced permissions and configuration release governance |
| FR15 work queue | Priority, age/SLA, case status/outcome and baseline-trigger counts | Operational dashboards at bank scale |

Proposed extensions T06–T16 cover purpose mismatch, related-party routing, rapid outflow, splitting, external own accounts, debt repayment, cash, cycles, intermediaries, deployment-evidence gaps and invoice/payee mismatch. They require bank validation and a BRD scope update.

No automatic customer contact, fraud conclusion or recovery instruction is performed. A demo officer can record a synthetic investigation outcome with rationale and evidence; a separate demo reviewer approves it.

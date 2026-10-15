# UCO Bank platform build prompt

Version 2 | 25 September 2026 | Demo build, bank pilot and production readiness requirements

Build a polished, fully interactive React application called **UCO Credit Intelligence** for UCO Bank. Position it as a **loan end-use monitoring and investigation assistance platform** for credit monitoring officers, investigators and managers. Implement the scenario pack, preserve the original BRD requirements, and add the enterprise requirements below. Inspect the existing React project and extend it rather than discarding valid working functionality.

Use the supplied BRD, `UCO_Bank_Demo_Developer_Pack.zip`, `UCO_Bank_Demo_Scenarios.docx`, and existing source as inputs. The BRD's detailed scope is sole-banking, non-consortium diversion monitoring. Syndicated or multi-bank visibility remains a separate scope unless the bank supplies approved requirements and data. Distinguish original BRD requirements, proposed extensions and operational controls. Do not claim coverage of every possible banking fraud.

Execute this specification in the phases defined below, with shared data contracts and acceptance criteria. Complete locally executable work without waiting for production credentials. Record missing bank inputs and live-service dependencies explicitly; do not invent them or stop at a plan.

The central user journey is: **identify the payment → understand the sanctioned purpose → verify the beneficiary → inspect evidence and fund movement → explain the discrepancy → recommend the next action → obtain officer review.** Build the application and verify its behaviour; do not stop at a design proposal or static screenshots.

1. **Create a professional banking experience.** Use UCO Bank's official branding and available approved assets, referencing https://www.uco.bank.in/en/. Use a restrained blue and yellow palette, clear typography, readable tables, consistent spacing and concise business language. Support Indian currency formatting and India timestamps. Provide a persistent sidebar, search, breadcrumbs, filters and one-click drill-down from portfolio to transaction. Prefer meaningful charts and evidence views over decorative cards. Keep SQL, service names and model configuration in expandable technical views.

2. **Keep the main workflow free of demonstration clutter.** Remove repetitive labels such as “synthetic data,” “sample data,” “demo scenario” and “mock AI” from operational screens. Remove “Demo” from customer and company display names while preserving stable internal identifiers. Use normal product terms such as Portfolio, Borrowers, Transactions, Investigations and Evidence. Keep an accessible Administration or About view describing the evaluation environment, record provenance and actual integration status. Show Connected only after a successful verified connection. Do not portray local calculations as Oracle execution, generated records as real customer records, or prepared answers as live model responses. If asked about data or connection status, the assistant must answer accurately. Exports must retain environment and provenance metadata.

3. **Implement the complete scoped scenario catalogue.** Retain these 12 scenarios as the original presentation profile, then add the original BRD and boundary cases listed below. Each scenario needs an independent expected outcome and a meaningful legitimate comparator.

| ID | Scenario | Required behaviour |
|---|---|---|
| HL01 | Housing purchase pays an unapproved electronics trader | Flag the exact INR 12 lakh payment using the sanctioned payee restriction and conflicting invoice items. |
| HL02 | Self-construction borrower pays a cement trader | Recognise the INR 8 lakh purchase as consistent with the sanction and accepted site delivery. |
| HL03 | Personal recipient name belongs to a sole proprietor | Resolve the legal and trade names using bank evidence; accept the supported INR 6 lakh materials purchase. |
| CL01 | Construction company pays its usual steel supplier | Show why the INR 35 lakh purchase is supported by the purchase order, invoice and delivery. |
| CL02 | Construction finance buys unrelated resale inventory | Flag the INR 25 lakh payment based on invoice purpose, even though the vendor has previous payments. |
| CL03 | Related trading company receives funds without commercial support | Show the INR 30 lakh transfer, verified common director and missing approval; request evidence. |
| CL04 | Ten new beneficiaries receive INR 4.8 lakh each | Aggregate INR 48 lakh within 45 minutes; show all transactions and request batch justification. |
| CL05 | Funds pass through intermediaries and return | Show INR 20 lakh initial outflow, INR 57 lakh gross legs, INR 18 lakh return and INR 2 lakh net outflow separately. |
| DU01 | Beneficiary name matches two possible businesses | Preserve unresolved identity and request account ownership evidence; do not select a name match arbitrarily. |
| DU02 | GST lookup unavailable and MCA profile stale | Create an evidence task without treating source failure as an adverse finding. |
| EX01 | Written exception permits site equipment | Apply the INR 8 lakh approval only to its payee, purpose, project, validity and amount. |
| OP01 | Wrong payment reversed, corrected payment replayed | Retain the correction audit; four received events must produce three unique transactions and INR 12 lakh net outflow. |

Each case must include the loan conditions, transaction timeline, beneficiary identity, commercial documents, source references, explanation, evidence gaps and next action. Include interactions that demonstrate how a new document, verified identity or valid approval changes the assessment. Preserve assessment history and recalculate affected views consistently. Do not automatically label a trader, related company or multi-recipient payment fraudulent.

Preserve and explicitly test all five original BRD triggers:

| Scenario family | BRD mapping | Required review case | Required legitimate or contextual comparator |
|---|---|---|---|
| BR01 Repeated same-party flows | T-01 / existing T01 | Repeated debits or two-way flows with the same counterparty require a commercial explanation. | Supported recurring supplier payments or documented refunds. |
| BR02 CC/OD investment use | T-02 / existing T02 | Linked CC/OD proceeds reach a reliably identified investment counterparty for an unapproved use. | Permitted use or an unrelated customer receipt without a defensible loan-funding link. |
| BR03 Loan-funded UCO fixed deposit | T-03 / existing T03 | Finacle evidence links loan proceeds to an unapproved UCO FD. | A specifically approved margin FD with valid scope and funding evidence. |
| BR04 Account closure and reopening | T-04 / existing T04 | Ordered closure/opening records for the same verified CIF create a context-review task. | Documented account migration or ordinary reopening; neither case is automatically a diversion finding. |
| BR05 Retail external-bank payments | T-05 / existing T05 | Housing and car-loan payments to an external account require purpose and beneficiary checks under bank-approved rules. | Approved builder and car-dealer payments supported by the sanction and purchase documents. |

Retain the valid behaviour of the existing 18-fixture catalogue and extend the existing T06-T16 rules. Map overlaps explicitly; do not double-count one payment merely because multiple scenarios or rules describe it. Add these required cases and comparators:

| Scenario family | Required behaviour and comparator |
|---|---|
| EX02 Borrower-owned external account | Verify ownership, preserve unknown onward use and distinguish an unexplained transfer from an explicitly permitted reimbursement or routing arrangement. |
| EX03 Repayment of unrelated debt | Review loan-funded settlement of other debt; recognise a sanctioned refinancing arrangement. |
| EX04 Cash withdrawal | Review material cash use with missing purpose evidence; compare with permitted, supported labour payments. |
| EX05 Utilisation milestone shortfall | Compare due dates and accepted deployment evidence with disbursement; distinguish overdue gaps from a milestone not yet due. |
| EX06 Invoice and payee mismatch | Detect a genuine seller/payment-recipient mismatch; recognise supported trade-name mappings and approved payment assignments. |
| EX07 Intermediary routing | Show an observed intermediary transfer reaching a verified related entity; compare with documented distributor or subcontractor settlement. |
| EX08 Gradual same-recipient splitting | Aggregate smaller payments over the configured window; compare with a documented instalment schedule. Keep this distinct from CL04's ten-beneficiary pattern. |
| EX09 Non-loan receipts | Demonstrate that a sales receipt or another unlinked credit is not automatically treated as loan proceeds. |
| EX10 Rapid outward movement | Show speed and amount as review signals; compare with a legitimate immediate, sanctioned supplier payment. Speed alone must not establish diversion. |

Add boundary and failure variants for multiple drawdowns, mixed loan and operating balances, partial refunds, reversal followed by a corrected payment, partial bank authorisations, exhausted cumulative approvals, conflicting registry records, duplicated or potentially inflated invoices, delayed delivery evidence, and missing source data. Invoice authenticity or physical delivery must remain unresolved when the available evidence cannot establish it.

Test event-time windows crossing midnight and month end, exact threshold boundaries, payments just outside the window, out-of-order and duplicate events, corrected transaction versions, cancelled or failed payments, partial source outages and restored service. Use timestamps with explicit time zones and business-effective dates for approvals and relationships.

Create additional fixtures and expected results for these cases; do not merely add their names to a menu. Preserve meaningful negative cases when changing an existing rule. Record the reason for any intentional change to legacy expectations.

4. **Make Oracle AI Database 26ai capabilities visible through useful features.**

- **Property graph:** implement an interactive network of borrowers, accounts, companies, directors and projects. Show observed payment edges separately from ownership or director relationships. Support amount/time filters, chronological path tracing, related-party discovery, circular-flow detection and multi-beneficiary analysis. Every edge must open its source record. Provide compatible SQL property-graph definitions and SQL/PGQ query templates, including `GRAPH_TABLE`, in the technical view. Never invent downstream transfers at another bank.
- **Oracle Machine Learning:** combine explainable rules with a proposed One-Class SVM anomaly-detection pipeline. Display unusual amount, payment speed, recipient novelty and borrower-history deviation as separate signals. Show model identity, version, execution mode and available validation evidence. A rule score must remain labelled as a rule score, and an anomaly score must not be called a calibrated fraud probability. Keep expected scenario outcomes out of model inputs. The 12 cases are acceptance fixtures, not sufficient evidence of model accuracy; a trained demonstration needs separate training data and evaluation with time-based separation.
- **AI Vector Search:** enable evidence retrieval across sanction clauses, invoices, approvals and investigation notes. Combine semantic retrieval with exact loan, customer and access filters. Answers must open the exact supporting document passage. Keep identity matching based on reliable identifiers and account evidence, not vector similarity alone.
- **OCI Generative AI Agents:** implement a case-aware assistant with controlled tools for loan context, beneficiary verification, permitted external research, rule results and graph traversal. Show a concise activity log of tools, sources and results. Provide working local behaviour and adapter interfaces when external services are unavailable; display the actual execution mode in the technical view.
- **Oracle APEX:** provide an internal case-review and policy-approval integration path. If no APEX instance is available, deliver the integration contract and implementation design; do not describe a React screen as a deployed APEX application.

Verify capabilities against the exact Oracle deployment, version and available services before enabling live features. Use Oracle branding to identify the actual or proposed technology behind a feature, not to imply a service is connected when it is not.

Implement deterministic rules, evidence retrieval and case workflows before depending on ML. Compare rules alone with rules plus ML at the same analyst review capacity. Retain ML only where the measured benefit justifies its complexity. Do not arbitrarily attribute a model decision to features unless a supported explanation method produces that attribution; ordinary observed risk signals can be presented separately.

For a trained model, deliver a feature dictionary, training-data lineage, approved label definition, time-based evaluation, entity grouping where appropriate, leakage controls, model registry, model and threshold versions, independent validation, approval and rollback. Measure errors by loan type and relevant borrower cohorts. Monitor data and score drift, changing alert yield and investigator overrides. These are governed operational controls, not decorative readiness badges.

5. **Build eight coherent workspaces.** Provide Portfolio, Borrower and Loan 360, Transaction Investigation, Funds and Relationships, Evidence Research, AI Assistant, Case Management, and Administration. The dashboard must lead to a useful investigation rather than isolated charts. Add a persistent assistant drawer and an optional Technology view that explains how graph queries, ML, vector retrieval, APIs and APEX support the selected case.

The **original 12-scenario profile only** must reconcile to 25 unique transactions, 26 received events, INR 8.55 crore in drawdowns, five potential-diversion reviews, two evidence tasks, five cases without an active exception, and INR 1.35 crore of direct outflow for review. Compute expanded-catalogue totals from its own records; do not reuse these baseline numbers when extra cases are loaded. Present amounts as requiring review, never as confirmed fraud or loss. Show rule hits, unique alerts, cases, transactions and borrowers as separate counts.

6. **Make the assistant specific and evidence-based.** Include one-click questions: “Why was this payment flagged?”, “Is this recipient an individual, proprietor or company?”, “Is this a usual supplier?”, “What does the sanction permit?”, “Trace the money sent to ten accounts”, “What evidence supports this relationship?”, “What is missing?”, and “What should the officer do next?” Responses must identify the relevant transaction, explain the reasoning in plain language, cite available evidence, distinguish verified facts from inference, and suggest the next step. The assistant must admit when identity, purpose or external information remains unresolved.

7. **Build credible research and reviewer workflows.** Add backend adapters for approved GST, MCA and search providers. Preserve source identity, retrieval date, effective date, matching basis and limitations. Support unavailable, stale, conflicting, not-found and unresolved results. A registry profile does not prove recipient account ownership, invoice authenticity or delivery. Keep credentials in backend services and confidential customer identifiers out of public search. Respect provider authentication, consent, rate limits and access conditions; offer officer-assisted evidence entry when authorised automation is unavailable. Source content must never become instructions for agent actions.

Give every case a named owner, branch or circle scope, priority, assignment history, due date, escalation path and reasoned closure outcome. Support duplicate-alert consolidation while preserving all underlying signals and transaction references. Include analyst notes, document-request drafts, responses, new evidence, reassessment, independent review and reopening. Case states should distinguish an open concern, missing evidence, an explained transaction and a referral for suspected diversion.

Version documents and retain original and superseded evidence with timestamps, origin, content hashes, integrity checks and access history. Freeze the evidence, rule, model and policy versions supporting each assessment. A hash demonstrates capture integrity, not the truth of a document. Unverified invoices, certificates and supplier websites cannot replace physical inspection or independent commercial verification when those checks are needed.

Enforce maker/checker separation and approval scope in backend services. Account restrictions, customer communications, recovery actions, formal fraud classification and formal regulatory account statuses require the bank's authorised workflow and applicable due process. An AI recommendation or ordinary alert must not silently become one of those actions. Customer requests remain drafts unless separately approved for sending.

8. **Establish reliable Finacle data contracts and reconciliation.** Define canonical fields for CIF, account, facility, product, drawdown, transaction, payment reference, debit/credit direction, amount, currency, event time, posting state, beneficiary, reversal/correction reference, FD linkage and account history. Map each canonical field to the actual approved Finacle field, code or joined source; do not invent Finacle table names or assume that a statement contains all required information. Define where sanctions, beneficiary/KYC mapping, documents, project milestones and approvals originate.

Record field availability, transformation, matching method, owner, refresh frequency, retention, permitted use and lineage. Treat known identity, name-only candidates and unresolved ownership separately. Link alerts back to the authoritative source event. Keep loan-money allocation assumptions visible in technical and evidence details.

Reconcile ingestion counts and debit/credit totals with source extracts using documented treatment of reversals and corrections. Avoid counting both ledger sides of one transfer as two transfers. Detect missing feeds, delayed batches, missing required fields, inconsistent amounts and mapping failures. Quarantine invalid records with a remediation queue; distinguish data-quality work from a customer-risk alert.

Use idempotent ingestion, persisted processing checkpoints, replay, retry policies and an error queue. Recalculate affected assessments when late or corrected events arrive while preserving prior snapshots. Decouple external research from initial screening so a portal outage cannot stop ingestion or masquerade as adverse evidence.

For multiple drawdowns or mixed account balances, use an explicit, bank-agreed attribution method and disclose uncertainty. Cap allocated loan funds appropriately, account for returns consistently and distinguish observed movement from inferred allocation. A statement alone cannot establish the precise origin of every rupee in a commingled balance.

9. **Implement enterprise access and evidence protection.** Design bank SSO and MFA integration, least-privilege roles, branch/circle restrictions and customer-level access where required. Enforce permissions in APIs, database queries, exports, search retrieval and assistant tools; hiding a React button is not authorisation. Apply the same restrictions to vector retrieval and graph traversals. A local role switch is an evaluation convenience, not bank authentication.

Provide encryption in transit and at rest, managed secrets and rotation, access-controlled storage, upload validation and malware scanning integration, session controls, log redaction and data minimisation. Implement tamper-resistant audit retention using an appropriate durable service; browser storage is not an immutable audit trail. Retention, deletion, legal hold, deployment location and recovery controls must follow the bank's approved requirements. Document the applicable RBI and bank-policy mapping for bank review; do not claim regulatory compliance merely from the presence of these features.

Demonstrate denied cross-branch access, restricted document retrieval, export authorisation, analyst self-approval rejection, expired session handling and rejected unauthorised tool calls. Scope agent tools to approved endpoints and actions. Public research must not disclose customer account numbers, PAN, Aadhaar, confidential loan documents or private case notes.

10. **Specify measurable operating and recovery targets.** Maintain a target register with the bank owner, proposed target, agreed target, measured result, test environment and status. Obtain targets for monitored accounts, daily and peak transaction volume, concurrent analysts, ingestion delay, event-to-alert delay, dashboard response, availability, recovery time, recovery point, source retention and monthly operating cost. Distinguish proposed targets from agreed commitments and measured results; do not invent bank SLAs.

Measure latency from source event to persisted alert separately from external enrichment and screen rendering. Report percentile latency under stated loads, error rates and backlog growth. Account for external-provider limits and model/API costs. Provide health checks, metrics, traces, alerts, failure dashboards, backup and restore procedures, incident ownership and runbooks. Test service restart, connector failure, replay, recovery and restore. Browser fixture-generation timing cannot establish bank-scale performance or recovery capability.

11. **Create a requirement-to-proof matrix before implementation.** Link every original BRD functional and non-functional requirement, every new scenario and each enterprise control to its implementation and evidence. Use this structure:

| Requirement ID | Origin and priority | Source fields and joins | Rule or service | UI or API workflow | Review fixture | Legitimate or failure fixture | Expected result | Acceptance check | Owner | Proof and status |
|---|---|---|---|---|---|---|---|---|---|---|
| FR06 / BR03 | Original BRD | Facility, drawdown, payment and UCO FD references | T03 with scoped approval | FD investigation | Unapproved linked FD | Approved margin FD | Review first; explain second | Verify funding references, exception scope and no duplicate amount | Assigned build owner | Test evidence; bank data map pending |
| EXT / CL04 | Proposed extension | Account, payee, transaction ID, amount and event time | Distinct-beneficiary rolling aggregate | Batch investigation | Ten unexplained payments | Documented supplier or wage batch | Aggregate accurately; assess commercial evidence | All ten IDs, INR 48 lakh, 45 minutes | Assigned build owner | Computed result and UI walkthrough |
| CTRL / ACCESS | Enterprise control | Identity, role and branch assignments | API and retrieval authorisation | Case and assistant access | Authorised officer | Cross-branch or self-approval attempt | Allow permitted work; deny forbidden action | Negative access checks at backend boundary | Assigned security owner | Recorded security check |

These rows illustrate the matrix; populate every in-scope requirement. Record whether each row is implemented locally, verified against a connected service, awaiting a bank input, or not implemented. UI visibility, code presence, connected execution and production approval are different statuses. Any scope change must update the matrix and its acceptance checks.

12. **Measure whether the application actually helps the bank.** Prepare a read-only shadow pilot alongside the existing manual process. Include ordinary transactions, known historical cases and a bank-reviewed sample of unflagged transactions so missed issues can be assessed. Use masked or properly authorised bank data and experienced officers. Agree the outcome labels, sample selection, review capacity and success criteria before measuring results.

| Bank task | Measure against the manual baseline | Interpretation constraint |
|---|---|---|
| Find relevant payments | Officer-confirmed relevant cases per fixed review capacity; false alerts per defined denominator | A review-worthy case is not necessarily confirmed fraud. |
| Find known problems | Recall on available adjudicated cases and review of sampled unflagged transactions | Historical case selection is biased; do not claim population-wide recall. |
| Research beneficiaries | Research time and verified identity-matching errors | Unknown identity is a valid outcome. |
| Trace funds and compare end use | Time to a supported finding and reconciliation errors | Unobserved external legs remain unknown. |
| Prepare and close investigations | Handling time, corrections, evidence completeness, ageing and overrides | Fast closure without adequate evidence is not a benefit. |
| Operate the platform | Analyst workload, service latency, failure rate and cost | Compare under documented load and data conditions. |

Separate detection delay, investigation time, prevented loss, suspected amount and recovered funds. Do not claim loss prevention or recovery without attributable evidence. Report sample sizes, exclusions, uncertainty and limitations. Compare rules alone, rules plus graph context, and the incremental contribution of ML or assistant support where feasible. Define go/no-go criteria with the bank and record the pilot outcome. The demonstration suite and its expected answers are not proof of production fraud accuracy.

13. **Execute in phases with explicit completion evidence.**

| Phase | Deliverable | Completion evidence |
|---|---|---|
| A Scope and foundation | Requirements matrix, canonical data model, evidence model, scenario fixtures, service contracts and access design | Original BRD and extensions mapped; gaps and dependencies recorded; fixture amounts and references reconcile. |
| B Investigation core | Working React screens, rules, funding calculations, case workflow, assignment and approval scope | Review and legitimate cases behave correctly; duplicates, reversals, missing data and ownership controls pass. |
| C Graph and grounded assistance | Interactive graph, source-linked retrieval, assistant tools and Oracle scripts/adapters | Traceable edges and citations; permission boundaries tested; actual execution mode visible. |
| D Optional ML evaluation | Candidate pipeline, model registry and comparative validation | No label leakage; reproducible evaluation; documented incremental value or reason to defer ML. |
| E Connected read-only pilot | Approved bank integration, durable access/audit controls, load and recovery checks, pilot measurement | Bank-reviewed data map and outcomes; reconciled feeds; measured targets and operational owner. |
| F Production readiness | Independent security/model review as applicable, applicable-policy mapping, recovery evidence and release plan | Bank approvals and verified readiness criteria; no claim of readiness from presentation quality alone. |

Build all feasible application functions and tests in this task. Where services or bank approvals are unavailable, deliver working local counterparts and complete integration contracts, and identify the remaining prerequisite. Do not create cloud resources, publish externally or send messages merely to complete a visual proof point without the required authorisation. Security and data controls apply from the foundation phase; they are not deferred until the pilot.

Keep a reliable local presentation mode, persistent case state, scenario reset and a guided 15-minute walkthrough. All filters, graph selections, evidence links, assistant prompts and review actions must work. Use shared calculation services for consistent totals. Verify reversal handling, duplicate ingestion, approval scope, source failures, role separation, evidence citations, cross-customer retrieval restrictions and absence of evaluation leakage. Visually check desktop screens, keyboard navigation, readable error/empty states and responsive layouts.

Deliver runnable React source, startup instructions, a build artifact, Oracle schema and query scripts, service-adapter contracts, extended fixtures, the completed requirement-to-proof matrix, test and visual-review evidence, the target register, operational runbooks and a read-only pilot plan. Supply a concise completion report separating implemented functionality, connected services, measured results and outstanding dependencies. Do not substitute a plan or screenshots for working features, and do not claim tests or live integrations that were not executed.

The finished experience should let a bank officer explain exactly which transaction requires attention, what evidence supports that concern, what could legitimately explain it and which action comes next. Its impact should come from credible investigation workflows, complete scoped coverage and measured operational value. Enterprise readiness remains a verified implementation outcome, not a label attached to this prompt.

## Implementation references

- Oracle property graphs: https://docs.oracle.com/en/database/oracle/property-graph/
- Oracle AI Database 26ai AI ML and analytics: https://docs.oracle.com/en/database/oracle/oracle-database/26/ai.html
- Oracle Machine Learning One-Class SVM: https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/23/mlsql/one-class-svm.html
- OCI Generative AI Agents API tools: https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/api-calling-tool.htm

# Investigation Assistant v3

The React assistant uses deterministic supported-intent answers over the selected synthetic borrower and current policy. It is not connected to a language model. Conversation history is kept with demo state in this browser, scoped by borrower, and reset with the demo.

Supported questions:

1. Why was this borrower flagged?
2. Trace the loan funds.
3. What evidence links the beneficiary?
4. What evidence is missing?
5. What would justify closing this alert?
6. Does this prove fraud?
7. Summarise the monitoring portfolio.
8. Which Oracle components support this case?

Answers include relevant transaction, drawdown, KYC or sanction references. Navigation buttons open the evidence workbench or fund ledger. The assistant never changes case status, approves rules, sends customer messages or triggers recovery. Unsupported requests receive bounded guidance. A relationship is reported only when the observed transactions include the related beneficiary.

Questions about a borrower use the current policy. Frozen original assessments remain in case snapshots and exported case packets. The UI does not claim answer probabilities or trained-model accuracy.

For production, place OCI Generative AI Agents behind an authenticated API; add read-only scope-limited SQL/graph services and RAG over approved evidence. Enforce authorisation, query budgets and data minimisation in backend code. Returned web text is untrusted; never let it override instructions or invoke case mutations. Record the claim-to-source mapping, identity-match confidence, effective/source dates, missing evidence and retrieval version. Model-generated language cannot establish fraud by itself.

# Sample answers — v3

These are deterministic responses for DEMO-001 under baseline policy v1. They are not a real customer assessment.

## Why was this borrower flagged?

T07: Transfer to a verified related party; business justification and approval require review. T08: Material outward movement within 4 hours of drawdown. Approval status and missing evidence must be checked before a decision.

References: DEMO-001-TX1, SAN-1

## Trace the loan funds.

Drawdown DD-1: ₹1,00,00,000. Direct linked outflow: ₹30,00,000. 0 additional observed leg(s) are shown without adding them to unique funded outflow. Attribution is capped at the drawdown; unobserved external movement remains unknown.

References: DD-1, DEMO-001-TX1

## What evidence links the beneficiary?

Synthetic KYC records show a common-director relationship with Sarthak Ventures Demo, an observed beneficiary. This supports a relationship, not a finding of diversion. Public-source research must be separately matched and reviewed.

References: SYN-KYC-1

## What evidence is missing?

The review still needs: Written approval / business-purpose confirmation; Downstream external-bank utilisation records; Invoices or accepted end-use documents. Unavailable evidence is an information gap, not adverse proof.

References: SAN-1

## What would justify closing this alert?

A defensible closure needs a matching invoice/payee or end-use record, a permitted sanction purpose or written exception, and a recorded explanation. The analyst submits referenced evidence; a different reviewer approves the proposed outcome. An insufficient-evidence outcome must explain remaining gaps.

References: SAN-1

## Does this prove fraud?

This evidence does not by itself establish fraud. Rule matches are review signals. Public sources can support identity or relationships; actual end use requires bank records, approvals and documents. Only an authorised officer can record an investigation outcome. All selected financial records are fictional.

References: SAN-1, DEMO-001-TX1, DEMO-001-TX1

## Summarise the monitoring portfolio.

12 fictional borrowers are loaded. 7 have risk-rule matches; 0 cases remain open. These are synthetic screening results, not confirmed fraud.

References: Portfolio · active policy v1

## Which Oracle components support this case?

Oracle 26ai is the proposed data, graph and evidence-retrieval layer; OCI Streaming ingests events; Functions/OKE run APIs and collectors; Object Storage retains evidence; GenAI Agents can ground answers; APEX supports internal review workflows. This download runs locally without those services.

References: Architecture · integration design

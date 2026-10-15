# OCI validation delivery

Delivered 12 October 2026.

- New AI Assistant → OCI validation tab with a local prepared review and optional live OCI native Chat API invocation.
- Bluefin repeated payments and documented procurement comparison; cited evidence, legitimate explanation, gaps, next steps, review downloads and history.
- Official OCI SDK 2.139.2 with API-signing configuration, COHERE/GENERIC chat formats, on-demand serving, a bounded request and no automatic retries.
- Server-generated authorised packet, out-of-case citation rejection, persisted snapshots and audit, stale-workspace checks, and unchanged rules/case outcomes.
- Windows build dependency repaired; npm start serves the built app and loads .env when present.
- .env.example, OpenAPI endpoints and OCI_VALIDATION_SETUP.md for configuration.

Validation: 135 automated tests passed; 486 platform screen renders passed; retained legacy render checks passed; eight browser workflows passed in headless Edge, including the offline HTML and a 390px mobile viewport. Desktop/mobile screenshots were visually inspected. Browser and SDK transport tests used controlled responses and synthetic credentials; they made no live OCI inference calls.

The existing runtime workspace was preserved. A local OCI DEFAULT profile was found with region ap-hyderabad-1; its credentials were not copied into the project. The initial delivery was tested without live inference. No bank integration or external deployment was performed.

## Live configuration verified

After the user supplied the demo compartment and Hyderabad region, .env was configured for on-demand Cohere Command A (`cohere.command-a-03-2025`, COHERE native Chat format). The local server was restarted and one real synthetic Bluefin review succeeded in approximately 12 seconds on 12 October 2026. The model returned Evidence needed with three cited observations. The existing rule result remained Review required with INR 45 lakh for review, and the officer case remained Evidence needed. The saved review's citations exist in the selected case and the audit chain remains valid.

This verifies authentication, model access, request/response handling and saved review execution for one synthetic case. It does not establish model accuracy, bank data access or production readiness. Credentials remain in the user's existing OCI configuration outside this project; .env is excluded from version control.

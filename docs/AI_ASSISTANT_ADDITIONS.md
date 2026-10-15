# AI Assistant additions

This update uses the attached v4.1 project as its baseline. It adds two tabs under **AI Assistant**. The original assistant remains the default tab. Sidebar navigation, the meeting-aligned five-trigger flow, the Evidence Research replay, the assistant drawer, transaction rules, the Funds & Relationships graph, administration and existing case actions are retained.

## Open the demo

Open `dist/index.html` directly in a desktop browser. The original offline workspace continues to use its existing browser storage key. Select **AI Assistant → Research the web** or **AI Assistant → Bloomberg enrichment**. No installation is required for the recorded web walkthrough or Bloomberg examples.

For the local server, use Node.js 22 or later:

```bash
npm install
node --env-file=.env scripts/dev.mjs
```

Open `http://localhost:4173`. The existing `runtime/state.json` from the attached project is preserved. The server and standalone HTML retain their existing separate workspaces. The server uses local evaluation personas, not production bank SSO.

## Research the web

- Choose an observed company recipient or enter another public company name.
- Optionally supply a city and public CIN, GSTIN or LEI; preview the exact public query.
- **Open in Google** opens that query in a separate tab. The application cannot read that tab or automatically import its results.
- **Recorded walkthrough** produces a clearly identified prepared example, with no internet request.
- **Search & summarise** uses Grok 4.20 Multi-Agent through the model-specific OCI Responses API, with the built-in web_search tool. It retains source links, model-cited passages, retrieval time, executed queries and a response digest. A completed search call and usable citation annotations are required before a result is labelled Grounded.
- Review the identity assessment and write an officer note before attaching a sourced result to an investigation. A name match does not establish beneficiary account ownership. Citation-linked passages are model claims, not independently fetched source quotations.

### Chicago model configuration

The local .env selects OCI_REGION=us-chicago-1, OCI_MODEL_ID=openai.gpt-5.4-mini and OCI_CHAT_FORMAT=GENERIC for the existing oci-verified assistant. Live research independently selects OCI_WEB_SEARCH_MODEL_ID=xai.grok-4.20-multi-agent. The existing compartment, signing profile and database settings are preserved.

The research backend sends signed POST requests to https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/v1/responses with tools=[{type:'web_search'}]. This is Grok's model-specific route, separate from Chat and the general /openai/v1 Responses endpoint. No additional search-service API key or Generative AI project was needed for the verified route. Requests set store=false, use a 120-second timeout and do not retry automatically.

On 15 October 2026 a live Oracle Corporation query returned HTTP 200, a completed web_search_call, Oracle website results and a cited summary. GPT Mini's Chat endpoint separately rejected web_search_options; that result does not apply to this Grok Responses route. Model availability and quotas can still differ by tenancy.

The app sends only the validated public company name, city, public identifier and research topic to OCI/xAI. It does not send internal case IDs, account details or transaction amounts for research. The existing verified assistant continues to use its case packet independently. All source identity and commercial conclusions require officer review.

Restart with npm.cmd run dev. The launcher loads .env before building and starting the server. Keep credentials private. Open in Google and Recorded walkthrough remain available.

References: [Oracle Grok Multi-Agent endpoint and models](https://docs.oracle.com/en-us/iaas/Content/generative-ai/xai-grok-4-20-multi-agent.htm), [xAI Multi-Agent request format](https://docs.x.ai/developers/model-capabilities/text/multi-agent). Actual OCI search support was established by the live test, rather than inferred from the general OCI tools list.

## Live research in Evidence Research

The selected counterparty's Evidence Research screen now includes **Live company research**. It reads the actual `/api/assistant/research/status` endpoint, and **Search & summarise live** calls the same `/api/assistant/research` endpoint as the AI Assistant web-research tab. No extra `.env` settings or search-service key are required for this screen.

The selected recipient's public name is supplied automatically. City, public registration identifier and topic can be entered explicitly; internal bank identifiers and seeded demonstration registration references are not copied into public search fields. Only the validated public subject is forwarded by the backend to Grok. Status checks do not launch a search.

Results are saved using `assistantSaveRun`, which accepts only the session-bound canonical capture held by the server. Both screens share the saved history on the borrower record. Evidence Research filters that history to the current recipient's live web results and displays cited claims, safe source links, retrieval time and provenance. Navigating away aborts the client request and prevents a late result being saved through the abandoned screen.

Officers use the existing review note and identity assessment before attaching supplementary evidence. Uncited results cannot be attached, and existing branch, case-review locking and audit checks still apply. The original **Recorded research example** remains labelled separately; live results do not replace its prepared profile, automatically verify registry identity, create company relationships or change transaction findings. The prepared document-request workflow remains available below the live panel, and attached live evidence is also accessible through Case Management.

Validation: `tests/research-client.test.mjs` exercises actual HTTP status/search/save/attachment routes with a controlled provider, plus failed saves, input limits, recipient history and abandoned requests. `scripts/check-evidence-research-render.mjs` checks offline/server rendering, shared saved results, recorded examples and blocked uncited attachments. These are HTTP and server-render checks; the provider itself was live-tested separately as described above.

## Bloomberg enrichment

The tab provides seven mock examples: supplier activity, capital-market activity, common parent, similar company names, a screening name-match candidate, a stale profile and provider unavailability. Each result shows the selected recipient, company context, linked bank transactions and suggested follow-up questions.

The common-parent illustration is contained within this tab. It does not insert ownership or payment edges into the existing graph. Mock identifiers are explicitly demonstration identifiers. Individual recipients return no corporate coverage. Ambiguous, stale, unavailable and screening-candidate results never establish an exact identity, screening clearance or fraud finding.

There is no live Bloomberg connector in this update. A real integration requires the relevant licensed product, approved interface, credentials and entitlements. Ownership, private-company coverage, screening, PEP and adverse-media fields must be confirmed for the purchased product; this demonstration does not promise that any specific dataset is included.

## Evidence and case behaviour

Research history is stored on the selected record and included in its existing evidence-packet export. Only permitted investigation roles can save or attach results. The live provider response is captured by the authenticated server; client-edited live results cannot substitute their own content. New records use the existing revision checks, branch restrictions, server persistence, evidence digests and audit chain.

An officer-reviewed attachment is supplementary `recorded` evidence (or `stale` for the stale example), not automatically accepted evidence. It adds a case note and history entry. If no case exists, the normal case-opening workflow creates one. Closed cases must be reopened through existing Case Management; attachments are blocked while the case is awaiting independent review. The original submission step freezes the evidence snapshot for reviewer approval.

Neither tab changes detection scores, verified identities, bank-observed transactions, sanctions decisions, case outcomes or the existing prepared counterparty-research replay. There is no automatic account blocking or customer communication. The original independent-review process remains in control.

## Short customer demo

1. Follow the original Bluefin Logistics → Kaveri Trading investigation flow and show the repeated-payment trigger.
2. Open **AI Assistant** and demonstrate an existing investigation question.
3. Open **Research the web**. Select Kaveri Trading and choose **Recorded walkthrough**. Explain that an industrial-materials trader could legitimately supply the warehouse project; identity, invoices and delivery must be corroborated.
4. Enter **Possible match** and a note such as “Name match only; obtain beneficiary CIN/GSTIN, purchase order, invoice and delivery evidence.” Select **Attach to investigation** and inspect the evidence through the existing case workflow.
5. Return to **AI Assistant → Bloomberg enrichment**, load **Common parent**, and ask **Are the parties related?** Explain the illustrative group relationship and required related-party commercial support.
6. Load **Capital-market activity**, **Similar company names** or **Provider unavailable** to show the different investigation next steps. These examples leave the original transaction assessment unchanged.

## Validation for this update

`npm test` passes 130 tests: the original 121 and nine additional tests covering public-query limits, citation grounding, provider failures, seven Bloomberg scenarios, evidence attachment, unchanged assessments, branch and role permissions, review locking, session-bound captures and persisted integrity.

The attached baseline was also compared using React server rendering: 405 non-assistant workspace renders match exactly across 81 records; all 81 original assistant renders are preserved inside the new tab container. There are 170 additional renders covering the new workspaces and prepared examples. The original styles, meeting components, catalogue and supplied runtime files are unchanged.

Chromium was not available in the execution environment, so new browser interaction and visual checks were not run. Existing screenshots and browser reports supplied in the original project are historical results, not evidence of browser validation for these new tabs. `ASSISTANT_EXTENSION_VALIDATION.json` records this update's checks. Live Google and Bloomberg connectivity was not tested.

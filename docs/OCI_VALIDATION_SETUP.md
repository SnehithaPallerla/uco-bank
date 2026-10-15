# OCI model validation demo

This PoC adds **AI Assistant → OCI validation**. It is ready to present using generated cases. No client contact, bank data or bank connection is required.

## Demonstrate it now

1. Open http://localhost:4173. Select Asha as the officer.
2. Open AI Assistant and select OCI validation.
3. Select Bluefin and click Show prepared review. The panel explains the repeated payments, links to case evidence and lists the next checks.
4. Click a cited evidence reference to inspect its source.
5. Select Documented procurement and click Show prepared review again. This comparison remains Supported because the supplied commercial evidence explains the payments.
6. Download the review. Saved history also appears in the record's normal evidence packet.

**Show prepared review** executes local demonstration logic; it does not invoke an LLM. **Validate with OCI model** makes a real, chargeable inference request once configured. Its output is an advisory draft and does not activate rules, verify an identity or close a case.

## Choose a model in OCI

Sign in to the OCI Console. Select a region, open **Analytics & AI → Generative AI**, select the desired compartment and open the chat playground. Console menu wording can vary; search for Generative AI if necessary.

Use an **on-demand chat model** for this implementation. A dedicated cluster is not required for an available on-demand model. Check [Oracle's model availability table](https://docs.oracle.com/en-us/iaas/Content/generative-ai/model-endpoint-regions.htm) because availability differs by region and serving mode.

A convenient starting choice for Hyderabad is **Cohere Command A**, model ID `cohere.command-a-03-2025`, chat format `COHERE`. Oracle currently lists on-demand availability in Hyderabad. See the [model documentation](https://docs.oracle.com/en-us/iaas/Content/generative-ai/cohere-command-a-03-2025.htm). Confirm access in your own tenancy's playground. Regional availability does not prove your user has the required permissions or quota.

Compatible Meta chat models use `GENERIC`; copy their exact ID from the playground/code sample and confirm on-demand availability. This adapter implements OCI's native Chat API, not arbitrary OpenAI-compatible APIs. Other model families can require different parameters or response formats; do not assume every model in the catalog is supported.

OCI access does not necessarily mean processing stays within OCI: some models are externally hosted proxy models. Check the availability page's external-call notes when selecting a model.

## Prepare local authentication

The server uses an OCI **API signing key**, not your OCI website password. If you already have a working API-key SDK configuration, reuse it; no new key is necessary.

Otherwise, open your OCI user profile, find API Keys, and add an API key. Use the console's generated configuration snippet and retain the private PEM key on your computer. See [Oracle's signing-key instructions](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm).

Save the configuration at `C:\Users\YOUR_USER\.oci\config`, outside this project:

```ini
[DEFAULT]
user=YOUR_USER_OCID
fingerprint=YOUR_PUBLIC_KEY_FINGERPRINT
tenancy=YOUR_TENANCY_OCID
region=ap-hyderabad-1
key_file=C:/Users/YOUR_USER/.oci/oci_api_key.pem
```

Use the exact values provided by OCI. An absolute key path avoids path-expansion problems on Windows. This demo uses the API-key configuration provider; a short-lived CLI security-token profile is not interchangeable. The server reads the credentials locally and never sends them to the browser. Do not put private key contents in the project, screenshots or chat. See [SDK configuration](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm).

## Give your user inference access

If inference is already permitted, reuse the existing permission. Otherwise ask your OCI administrator to grant the group inference access to the selected model in the selected demo compartment. A model-restricted example is:

```text
allow group <YOUR_GROUP> to inspect generative-ai-model in compartment <YOUR_COMPARTMENT_NAME>
allow group <YOUR_GROUP> to use generative-ai-family in compartment <YOUR_COMPARTMENT_NAME> where target.model.id = 'cohere.command-a-03-2025'
```

The first statement permits model listing; the second permits inference for the selected model. Identity-domain group naming may require your tenancy's qualified group syntax. Your administrator should apply the appropriate syntax and scope. See [Oracle's model-access policy guidance](https://docs.oracle.com/en-us/iaas/Content/generative-ai/limit-model-access.htm).

## Configure this app

In PowerShell, from the project folder:

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
notepad .env
```

Fill in these values, replacing the compartment placeholder with the compartment's OCID, which you can copy from its details page:

```dotenv
OCI_REGION=ap-hyderabad-1
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..YOUR_VALUE
OCI_MODEL_ID=cohere.command-a-03-2025
OCI_CHAT_FORMAT=COHERE
OCI_CONFIG_PROFILE=DEFAULT
```

Leave `OCI_CONFIG_FILE` blank for the default `.oci/config` location, or set it to an absolute path using forward slashes. Do not put your signing key in `.env`. Existing Google web-search settings are separate and are not needed for OCI validation.

Stop the running demo server with Ctrl+C in its terminal, then start:

```powershell
npm start
```

`npm start` serves the prebuilt app and automatically loads `.env` if present. For source changes, `npm run dev` rebuilds before starting. On a fresh extraction, install dependencies with `npm ci` first. This delivery includes the Windows build dependency, correcting the copied macOS installation.

Refresh the browser, select OCI validation and check the connection panel. Configured means the required settings are present; it does not check the private key, profile, IAM permission or live model availability. Click **Validate with OCI model** to perform the actual check. A successful saved review displays Live OCI model, model ID, region, request ID and response provenance.

## What the model receives and returns

The packet contains the selected case's generated borrower name, loan purpose/conditions, policy settings, computed rule results, transaction references and amounts, recipient identity status, and structured case evidence. It excludes account/CIF fields from the dedicated transaction/recipient summaries, case notes, stored AI review history and previously attached external enrichment. Source evidence payloads are included as supplied: they may contain identifiers. Inspect the packet preview before using any dataset beyond these generated fixtures.

No live request runs on page load. The officer explicitly clicks the live button. The browser sends only the record ID and revision to the local server; the server retrieves the authorised packet and signs the OCI request.

The response includes an advisory disposition, explanation, cited claims, a possible legitimate explanation, missing evidence and suggested next steps. Every claim must reference an evidence ID in the packet. The server rejects malformed JSON or invented/out-of-case references. These checks do not establish that the model interpreted the evidence correctly or that the claimed fact is supported by the cited passage. An officer still reviews its content.

Reviews retain the exact input snapshot, input and response digests, model/region, prompt version and time. They are saved with the existing revision and audit controls and included in evidence exports. A changed packet makes the previous review visibly stale. If the workspace changes during a live request, the result is not saved; refresh and rerun against the current state.

## Common problems

| Message | What to check |
|---|---|
| Not configured | The region, compartment, model and config-file checklist; restart after editing `.env`. |
| OCI denied access | Registered public signing key, corresponding private key, selected profile, compartment and IAM permissions. |
| OCI rejected the model request | Exact model ID, regional on-demand availability and COHERE/GENERIC format. |
| OCI could not complete the request | Network/firewall access to the region's inference endpoint and model availability. |
| OCI quota or request limit reached | Wait before trying again; check tenancy limits if it persists. |
| Model did not return valid JSON | Retry; use a compatible model capable of following the review format. |
| Model cited evidence outside this case | The response was rejected; no review was saved. |
| Workspace changed | Refresh and retry; another action changed the case during the request. |
| Port 4173 already in use | Stop the earlier demo server before starting another instance. |

The server allows four validation attempts per session per minute, uses a 60-second request abort signal and disables SDK retries to avoid silently repeating chargeable calls. Provider limits can be lower. This is a local single-user evaluation service with selectable personas, not bank authentication.

## Validation evidence

The automated suite covers prepared reviews across all 81 fixtures, cited output parsing, both native chat formats, provider failures, branch/role restrictions, forged client reviews, audit/persistence, unchanged assessments and concurrent revisions. Browser testing uses an isolated synthetic workspace and a controlled provider response. No actual OCI model-quality or bank-data claim follows from these tests. The live model call must be confirmed in your configured tenancy.

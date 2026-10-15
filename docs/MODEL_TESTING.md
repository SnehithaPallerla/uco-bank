# Sample data and model testing

The catalogue now contains **101 generated cases**, including **20 new model-test borrowers**. These samples adapt the existing accepted scenario templates with unique record/evidence IDs and borrower names. They cover repeated payments, supported procurement, capital-market use, fixed deposits, identity ambiguity, account migration, retail payments, related parties, new beneficiaries, circular payments, approval limits, reversals and conflicting evidence. They are not real customers or independent bank-labelled examples.

## Browse the new records

Open http://localhost:4173, refresh and select **Portfolio → Portfolio profile → Model test cases**. Select a borrower to inspect its transactions and documents. The original 81 cases remain available in their existing profiles. The server and offline browser workspace upgrade automatically without replacing investigations, approved policies or saved model reviews.

## Test from the app

1. Select Asha, then open **AI Assistant → Model testing**.
2. Keep **Select quick check** selected for the first run. It covers six cases: repeated payments, supported procurement, investment use, an approved margin deposit, an ambiguous recipient and missing delivery evidence.
3. Click **Show prepared test report** to see the process without any OCI call. This uses local prepared logic and is not a model benchmark.
4. Click **Run OCI model test** for a real test against the model configured in .env. Six selected cases run once means six chargeable model calls. Calls run sequentially; allow several minutes.
5. Inspect the completed results and expand **read the answer** for each case. **Open case** takes you to its saved review and source records.
6. Select **Runs per case → Twice** and rerun to check whether the recommendation changes between repetitions. This doubles the calls. Stable wording/dispositions do not establish factual correctness.
7. Download the JSON report before restarting the server. Reports remain available across browser reloads to the same officer while the server stays running. Individual live reviews are persistently saved in their sample cases.

You can select any subset of the 20 samples or all 20. One server test runs at a time. **Stop after current call** prevents later calls; it does not cancel an already submitted, chargeable inference request. Editing cases or policies during a run can cause a revision conflict: the report records the error instead of silently saving against a changed workspace. Ordinary interactive validation has its own request limit; the explicit batch test has a separately bounded maximum of 40 calls (20 cases, twice).

## Understand the automated checks

| Check | Meaning | What it does not establish |
|---|---|---|
| Disposition agreement | The suggestion is among the authored acceptable outcomes for that case. | An official bank decision or calibrated fraud accuracy. |
| Citation validity | The answer cites evidence IDs present in the selected packet. | That the cited passage supports the claimed fact. |
| Expected topic | The response mentions a keyword associated with the intended issue. | That it reasoned correctly about that topic. |
| Repetition consistency | Repeated completed calls produced the same disposition. | That the common answer is correct. |
| Request errors | Calls failed or results could not be saved. | Model disagreement; these are reported separately. |

Agreement percentages use completed reviews as the denominator, with request errors shown separately. **Checks passed** means those limited checks passed; it is not a certification that an answer is correct. A flagged topic check may be a wording difference, so inspect the response before treating it as a model error.

The expected dispositions and topic rubric are stored separately in `fixtures/model-validation-expectations.json`. The model receives the case packet and the existing rule assessment, but never this answer key. Therefore this tests **AI-assisted review and explanation**, not standalone anomaly detection. It is an initial sanity check on familiar generated scenarios rather than an independent held-out accuracy benchmark. The rubric assumes the supplied evaluation policy; inspect disagreements if you have changed policy thresholds.

Malformed answers are rejected and shown as request errors. Where available, expand **inspect rejected response** to see the raw reply or provider diagnostic; this output is not saved as an accepted case review. Cohere calls now use OCI's basic JSON output schema, with additional field and citation checks in the application. Rejected output remains a test failure; it is never silently rewritten into a successful model answer.

## Manually review every answer

Use a spreadsheet with one row per case/repetition:

| Case | Facts correct? | Citations support facts? | Legitimate explanation handled? | Uncertainty acknowledged? | Next steps useful? | Notes |
|---|---|---|---|---|---|---|

Open the cited evidence and check these points:

- Did the model describe the actual amount, recipient and loan conditions accurately?
- Did it recognise accepted invoices, delivery or a valid approval when present?
- Did it avoid choosing an identity from a name-only match?
- Did it distinguish a reversal from an ordinary refund?
- Did it avoid inventing external-bank transfers, company relationships or documents?
- Did it avoid turning missing evidence or a trigger into a proven fraud conclusion?
- Are the recommended follow-up questions appropriate to this particular case?

Compare different models by changing OCI_MODEL_ID/OCI_CHAT_FORMAT, restarting the server and repeating the same case selection. Keep the policy, sample evidence and prompt version fixed. Save each report; it contains the input snapshot, model, region, response provenance and timing. Use model families and regions supported by the existing native Chat adapter; see OCI_VALIDATION_SETUP.md.

## Optional command-line testing

From the project folder:

```powershell
# No model call; writes test-output/model-test-prepared.json
npm run test:model

# Six real calls against the running server
npm run test:model -- --live

# Two cases, each twice
npm run test:model -- --live --cases LAB-001,LAB-002 --repeats 2
```

These commands do not upload an answer key or modify detection rules. Live reviews are saved through the same authenticated local service as the app. The CLI exits unsuccessfully for request errors but does not treat a model disagreement as a software crash.

Use these tests to demonstrate how the assistant behaves and identify obvious issues. Claims about performance on real banking data require separate approved examples and independent officer assessment.

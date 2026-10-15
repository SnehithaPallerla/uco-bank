import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const statePath = resolve(root, 'runtime/state.json');
const outputPath = resolve(root, 'oracle/07_seed_data.sql');
const state = JSON.parse(await readFile(statePath, 'utf8'));
const records = Array.isArray(state.records) ? state.records : [];
const statements = [
  '-- Generated from runtime/state.json by scripts/export-oracle-seed.mjs.',
  '-- Run once against the UCO_POC schema after oracle/06_create_tables.sql.',
  'SET DEFINE OFF;',
  'SET SQLBLANKLINES ON;',
];

function sqlString(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : 'NULL';
}

function sqlFlag(value) {
  return value === true ? '1' : value === false ? '0' : 'NULL';
}

function sqlTimestamp(value, withZone = true) {
  if (!value) return 'NULL';
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return 'NULL';
  if (withZone) {
    const iso = d.toISOString();
    return `TO_TIMESTAMP_TZ(${sqlString(`${iso.slice(0, 19).replace('T', ' ')} +00:00`)}, 'YYYY-MM-DD HH24:MI:SS TZH:TZM')`;
  }
  return `TO_TIMESTAMP(${sqlString(d.toISOString().slice(0, 19).replace('T', ' '))}, 'YYYY-MM-DD HH24:MI:SS')`;
}

function sqlClob(value) {
  if (value === null || value === undefined) return 'NULL';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return "TO_CLOB('')";
  // Keep each Oracle VARCHAR2 literal comfortably below the 4,000-byte SQL limit.
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > 900) {
      chunks.push(chunk);
      chunk = '';
      bytes = 0;
    }
    chunk += char;
    bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((part) => `TO_CLOB(${sqlString(part)})`).join(' || ');
}

function merge(table, columns, values, keyColumns, updateColumns = [], updateCondition = '') {
  const select = columns.map((column, index) => `${values[index]} ${column}`).join(',\n    ');
  const on = keyColumns.map((column) => `t.${column} = s.${column}`).join(' AND ');
  const insertColumns = columns.join(', ');
  const insertValues = columns.map((column) => `s.${column}`).join(', ');
  const update = updateColumns.length
    ? `WHEN MATCHED THEN UPDATE SET ${updateColumns.map((column) => `t.${column} = s.${column}`).join(', ')}${updateCondition ? ` WHERE ${updateCondition}` : ''}\n`
    : '';
  statements.push(`MERGE INTO ${table} t\nUSING (SELECT\n    ${select}\n  FROM dual) s\nON (${on})\n${update}WHEN NOT MATCHED THEN INSERT (${insertColumns})\nVALUES (${insertValues});`);
}

const uniqueDrawdowns = new Set();
const uniquePolicies = new Set();

for (const record of records) {
  const facility = record.facility ?? {};
  const borrower = record.borrower ?? {};
  const caseId = String(record.id);
  const policyVersion = Number(state.policy?.version ?? 1);
  merge('uco_case', [
    'case_id', 'cif_token', 'branch_code', 'facility_id', 'purpose', 'project_id',
    'assessment_version', 'status', 'owner_subject', 'due_at', 'policy_version', 'evidence_snapshot',
  ], [
    sqlString(caseId), sqlString(borrower.cif ?? borrower.id ?? caseId), sqlString(record.branch ?? 'UNK'),
    sqlString(facility.id ?? `FAC-${caseId}`), sqlString(facility.purpose), sqlString(facility.project),
    '1', sqlString('Imported'), 'NULL', 'NULL', String(policyVersion), sqlClob(record.evidence ?? []),
  ], ['case_id']);

  merge('uco_record_payload', ['record_id', 'record_json'],
    [sqlString(caseId), sqlClob(record)], ['record_id']);

  for (const entity of record.entities ?? []) {
    merge('uco_entity', [
      'case_id', 'entity_id', 'name', 'entity_type', 'identity_status', 'identity_evidence_id',
    ], [
      sqlString(caseId), sqlString(entity.id), sqlString(entity.name), sqlString(entity.type),
      sqlString(entity.identityStatus), sqlString(entity.identityEvidenceIds?.[0]),
    ], ['case_id', 'entity_id']);
  }

  const drawdowns = record.drawdowns?.length
    ? record.drawdowns
    : (facility.drawdownId ? [{ id: facility.drawdownId, amountInr: facility.drawdownAmountInr, at: facility.drawdownAt }] : []);
  for (const drawdown of drawdowns) {
    const drawdownId = `${caseId}:${drawdown.id}`;
    if (uniqueDrawdowns.has(drawdownId)) continue;
    uniqueDrawdowns.add(drawdownId);
    merge('uco_drawdown', ['drawdown_id', 'case_id', 'amount_inr', 'posted_at', 'source_ref'], [
      sqlString(drawdownId), sqlString(caseId), sqlNumber(drawdown.amountInr),
      sqlTimestamp(drawdown.at), sqlString(drawdown.id),
    ], ['drawdown_id']);
  }

  const latestTransactions = new Map();
  for (const tx of record.transactions ?? []) {
    const old = latestTransactions.get(tx.id);
    if (!old || Number(tx.version ?? 1) > Number(old.version ?? 1)) latestTransactions.set(tx.id, tx);
  }
  for (const tx of latestTransactions.values()) {
    if (!(Number(tx.amountInr) > 0)) {
      statements.push(`-- Skipped invalid non-positive payment ${caseId}:${tx.id}; preserved in UCO_RECORD_PAYLOAD.`);
      continue;
    }
    const txId = `${caseId}:${tx.id}`;
    const sourceEntity = (record.entities ?? []).some((entity) => entity.id === tx.from) ? tx.from : null;
    const targetEntity = (record.entities ?? []).some((entity) => entity.id === tx.to) ? tx.to : null;
    if (!sourceEntity || !targetEntity) {
      throw new Error(`Transaction ${txId} references an entity missing from record ${caseId}.`);
    }
    const namespacedDrawdown = tx.drawdownReference ? `${caseId}:${tx.drawdownReference}` : null;
    merge('uco_payment', [
      'tx_id', 'case_id', 'from_entity', 'to_entity', 'amount_inr', 'posted_at',
      'original_event_time', 'currency', 'posting_status', 'payment_kind', 'observed',
      'drawdown_id', 'reversal_of', 'corrected_version', 'evidence_id', 'source_ref',
    ], [
      sqlString(txId), sqlString(caseId), sqlString(tx.from), sqlString(tx.to), sqlNumber(tx.amountInr),
      sqlTimestamp(tx.postedAt, false), sqlString(tx.postedAt), sqlString(tx.currency ?? 'INR'),
      sqlString(tx.status), sqlString(tx.kind), sqlFlag(tx.observed),
      namespacedDrawdown ? sqlString(namespacedDrawdown) : 'NULL',
      tx.reversalOf ? sqlString(`${caseId}:${tx.reversalOf}`) : 'NULL',
      sqlNumber(tx.version ?? 1), sqlString(tx.evidenceId ?? tx.useEvidenceId), sqlString(tx.bankTransactionId ?? tx.id),
    ], ['tx_id'], [
      'case_id', 'from_entity', 'to_entity', 'amount_inr', 'posted_at', 'original_event_time',
      'currency', 'posting_status', 'payment_kind', 'observed', 'drawdown_id', 'reversal_of',
      'corrected_version', 'evidence_id', 'source_ref',
    ], 's.corrected_version > t.corrected_version');
  }

  for (const relation of record.relationships ?? []) {
    merge('uco_relationship', [
      'relationship_id', 'case_id', 'from_entity', 'to_entity', 'relationship_type',
      'verified', 'evidence_id', 'valid_from', 'valid_to',
    ], [
      sqlString(`${caseId}:${relation.id}`), sqlString(caseId), sqlString(relation.from ?? relation.sourceEntityId),
      sqlString(relation.to ?? relation.targetEntityId), sqlString(relation.type ?? relation.relationshipType),
      sqlFlag(relation.verified), sqlString(relation.evidenceId), sqlTimestamp(relation.validFrom, false),
      sqlTimestamp(relation.validTo, false),
    ], ['relationship_id']);
  }

  for (const evidence of record.evidence ?? []) {
    merge('uco_evidence', [
      'evidence_id', 'evidence_version', 'case_id', 'source_kind', 'captured_at', 'effective_at',
      'source_url', 'source_status', 'content_hash', 'content', 'supersedes_version',
    ], [
      sqlString(evidence.id), sqlNumber(evidence.version ?? 1), sqlString(caseId), sqlString(evidence.kind),
      sqlTimestamp(evidence.capturedAt), sqlTimestamp(evidence.effectiveAt), sqlString(evidence.sourceUrl ?? evidence.source),
      sqlString(evidence.status), sqlString(evidence.contentSha256), sqlClob(evidence),
      sqlNumber(evidence.supersedesVersion),
    ], ['evidence_id', 'evidence_version']);
  }

  for (const event of record.events ?? []) {
    const eventId = `${caseId}:${event.id}`;
    merge('uco_ingest_event', [
      'event_id', 'source_system', 'partition_id', 'source_offset', 'tx_id', 'tx_version',
      'received_at', 'payload_hash', 'status', 'payload', 'error_reason',
    ], [
      sqlString(eventId), sqlString('runtime-state.json'), sqlString(caseId), sqlString(event.id),
      event.transactionId ? sqlString(`${caseId}:${event.transactionId}`) : 'NULL',
      sqlNumber(event.version ?? 1), sqlTimestamp(event.receivedAt), 'NULL', sqlString('received'),
      sqlClob(event), 'NULL',
    ], ['event_id']);
  }
}

if (state.policy && !uniquePolicies.has(Number(state.policy.version ?? 1))) {
  uniquePolicies.add(Number(state.policy.version ?? 1));
  merge('uco_policy_version', [
    'version_id', 'policy_json', 'maker_subject', 'checker_subject', 'approved_at',
  ], [
    sqlNumber(state.policy.version ?? 1), sqlClob(state.policy), 'NULL', 'NULL', 'NULL',
  ], ['version_id']);
}

for (const workflowCase of state.cases ?? []) {
  if (!workflowCase.recordId || !(state.records ?? []).some((record) => record.id === workflowCase.recordId)) continue;
  if (workflowCase.owner) {
    merge('uco_case_acl', ['case_id', 'principal_id', 'can_review'], [
      sqlString(workflowCase.recordId), sqlString(workflowCase.owner), '0',
    ], ['case_id', 'principal_id']);
  }
}

for (const audit of state.audit ?? []) {
  merge('uco_audit_event', ['audit_id', 'occurred_at', 'actor_id', 'event_type', 'record_id', 'payload'], [
    sqlString(audit.id), sqlTimestamp(audit.at), sqlString(audit.user), sqlString(audit.action),
    sqlString(audit.recordId), sqlClob(audit),
  ], ['audit_id']);
}

const workspace = { ...state };
delete workspace.records;
merge('uco_workspace_payload', ['workspace_key', 'revision', 'payload'], [
  sqlString('CURRENT'), sqlNumber(state.revision ?? 1), sqlClob(workspace),
], ['workspace_key'], ['revision', 'payload'], 's.revision >= t.revision');

statements.push('COMMIT;', 'PROMPT Seed merge complete. Review the counts before using the data.');
await writeFile(outputPath, `${statements.join('\n\n')}\n`, 'utf8');
console.log(`Wrote ${outputPath}`);
console.log(`Records: ${records.length}; entities: ${records.reduce((n, r) => n + (r.entities?.length ?? 0), 0)}; payments: ${records.reduce((n, r) => n + (r.transactions?.length ?? 0), 0)}; evidence: ${records.reduce((n, r) => n + (r.evidence?.length ?? 0), 0)}; audit events: ${(state.audit ?? []).length}`);

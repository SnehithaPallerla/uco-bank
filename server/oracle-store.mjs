import { writeFile } from 'node:fs/promises';
import { VERSION, command as applyCommand, scopedState, upgradeState, authorize } from '../src/platform/domain.js';
import { digest, verifyChain } from './platform.mjs';
import {graphProjection,synchronizeGraphRecords,queryOracleGraph} from './oracle-graph.mjs';

const WORKSPACE_KEY = 'CURRENT';

/** Oracle-backed persistence for the local evaluation server.
 * The JSON payload tables are canonical for app state; normalized tables are projections.
 */
export class OracleStore {
  constructor(env = process.env, driver = null) {
    this.env = env;
    this.driver = driver;
    this.pool = null;
    this.connected = false;
    this.backend = 'oracle';
    this.state = null;
    this.tail = Promise.resolve();
  }

  async init() {
    const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING', 'ORACLE_CONFIG_DIR', 'ORACLE_WALLET_PASSWORD'];
    const missing = required.filter((name) => !this.env[name]);
    if (missing.length) throw Error(`Oracle storage is selected, but these .env settings are missing: ${missing.join(', ')}`);

    if (!this.driver) {
      const module = await import('oracledb');
      this.driver = module.default ?? module;
    }
    const poolConfig = {
      user: this.env.ORACLE_USER,
      password: this.env.ORACLE_PASSWORD,
      connectString: this.env.ORACLE_CONNECT_STRING,
      configDir: this.env.ORACLE_CONFIG_DIR,
      walletLocation: this.env.ORACLE_CONFIG_DIR,
      walletPassword: this.env.ORACLE_WALLET_PASSWORD,
      poolMin: 1,
      poolMax: 4,
      poolIncrement: 1,
    };
    this.pool = await this.driver.createPool(poolConfig);
    const connection = await this.pool.getConnection();
    try {
      const workspaceResult = await connection.execute(
        'SELECT revision, payload FROM uco_workspace_payload WHERE workspace_key = :workspace_key',
        { workspace_key: WORKSPACE_KEY },
        { outFormat: this.driver.OUT_FORMAT_OBJECT, fetchInfo: { PAYLOAD: { type: this.driver.STRING } } },
      );
      const workspaceRow = workspaceResult.rows?.[0];
      if (!workspaceRow) throw Error('No Oracle workspace seed found. Run the current oracle/07_seed_data.sql first.');
      const workspace = JSON.parse(workspaceRow.PAYLOAD);
      const recordResult = await connection.execute(
        'SELECT record_id, record_json FROM uco_record_payload ORDER BY record_id',
        {},
        { outFormat: this.driver.OUT_FORMAT_OBJECT, fetchInfo: { RECORD_JSON: { type: this.driver.STRING } } },
      );
      const records = (recordResult.rows ?? []).map((row) => JSON.parse(row.RECORD_JSON));
      this.state = { ...workspace, revision: Number(workspaceRow.REVISION), records };
      if (!Array.isArray(this.state.audit) || !Array.isArray(this.state.auditHashChain)) {
        throw Error('Oracle workspace is missing its audit trail. Regenerate and rerun oracle/07_seed_data.sql.');
      }
      if (!verifyChain(this.state)) throw Error('Oracle audit integrity check failed; refusing to start with altered or incomplete state.');
      if (this.state.schema !== 4) throw Error(`Oracle state schema ${this.state.schema} is unsupported by this app.`);
      if (this.state.appVersion !== VERSION) {
        const upgraded = upgradeState(this.state);
        await this.save(upgraded);
      }
      // Refresh derived graph tables from the same committed JSON workspace.
      // The workspace lock serializes this with another application's save.
      const lock = await connection.execute('SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key FOR UPDATE', {key: WORKSPACE_KEY}, {outFormat: this.driver.OUT_FORMAT_OBJECT});
      if(Number(lock.rows?.[0]?.REVISION)!==this.state.revision)throw Error('Workspace changed while starting Oracle. Restart to load the latest state.');
      await synchronizeGraphRecords(connection,this.driver,this.state.records);
      await connection.commit();
      this.connected = true;
      return this;
    } catch (error) {
      await connection.rollback().catch(()=>{});
      await this.pool.close(0).catch(() => {});
      this.pool = null;
      throw error;
    } finally {
      await connection.close();
    }
  }

  async withConnection(callback) {
    if (!this.pool) throw Error('Oracle storage is not initialized.');
    const connection = await this.pool.getConnection();
    try {
      return await callback(connection);
    } finally {
      await connection.close();
    }
  }

  async save(state) {
    for (const record of state.records) {
      for (const evidence of record.evidence ?? []) {
        evidence.version = evidence.version || 1;
        evidence.captureDigest = digest(evidence.payload);
        evidence.digestAlgorithm = 'SHA-256 over JSON.stringify payload';
      }
    }
    const chain = state.auditHashChain || [];
    for (let index = chain.length; index < state.audit.length; index += 1) {
      const previousHash = chain.at(-1)?.hash || 'GENESIS';
      chain.push({ index, previousHash, hash: digest({ previousHash, event: state.audit[index] }) });
    }
    state.auditHashChain = chain;

    const previous=new Map((this.state?.records||[]).map(record=>[record.id,JSON.stringify(graphProjection(record))]));
    const changed=state.records.filter(record=>previous.get(record.id)!==JSON.stringify(graphProjection(record)));
    await this.withConnection(async (connection) => {
      try {
      await connection.execute('SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key FOR UPDATE', { key: WORKSPACE_KEY });
      const revisionResult = await connection.execute(
        'SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key',
        { key: WORKSPACE_KEY },
        { outFormat: this.driver.OUT_FORMAT_OBJECT },
      );
      const currentRevision = Number(revisionResult.rows?.[0]?.REVISION);
      if (this.state && currentRevision !== this.state.revision) throw Error('Workspace changed in Oracle. Restart the server to refresh before retrying.');

        await synchronizeGraphRecords(connection,this.driver,changed);
        for (const record of state.records) {
          await connection.execute(
            `MERGE INTO uco_record_payload t
             USING (SELECT :record_id record_id, :record_json record_json FROM dual) s
             ON (t.record_id = s.record_id)
             WHEN MATCHED THEN UPDATE SET t.record_json = s.record_json, t.row_version = t.row_version + 1, t.stored_at = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT (record_id, record_json) VALUES (s.record_id, s.record_json)`,
            { record_id: record.id, record_json: { val: JSON.stringify(record), type: this.driver.CLOB } },
          );
        }

        for (const event of state.audit) {
          await connection.execute(
            `MERGE INTO uco_audit_event t
             USING (SELECT :audit_id audit_id, TO_TIMESTAMP_TZ(:occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') occurred_at, :actor_id actor_id, :event_type event_type, :record_id record_id, :payload payload FROM dual) s
             ON (t.audit_id = s.audit_id)
             WHEN MATCHED THEN UPDATE SET t.occurred_at = s.occurred_at, t.actor_id = s.actor_id, t.event_type = s.event_type, t.record_id = s.record_id, t.payload = s.payload
             WHEN NOT MATCHED THEN INSERT (audit_id, occurred_at, actor_id, event_type, record_id, payload)
             VALUES (s.audit_id, s.occurred_at, s.actor_id, s.event_type, s.record_id, s.payload)`,
            {
              audit_id: event.id,
              occurred_at: event.at ? new Date(event.at).toISOString() : null,
              actor_id: event.user ?? null,
              event_type: event.action ?? null,
              record_id: event.recordId ?? null,
              payload: { val: JSON.stringify(event), type: this.driver.CLOB },
            },
          );
        }

        const workspace = { ...state };
        delete workspace.records;
        await connection.execute(
          `UPDATE uco_workspace_payload
           SET revision = :revision, payload = :payload, stored_at = SYSTIMESTAMP
           WHERE workspace_key = :workspace_key`,
          { revision: state.revision, payload: { val: JSON.stringify(workspace), type: this.driver.CLOB }, workspace_key: WORKSPACE_KEY },
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    this.state = state;
  }

  async readGraph(record,user){
    authorize(user,record);
    return this.withConnection(async connection=>{
      try{
        await connection.execute('SET TRANSACTION READ ONLY');
        const result=await connection.execute('SELECT revision FROM uco_workspace_payload WHERE workspace_key = :key',{key:WORKSPACE_KEY},{outFormat:this.driver.OUT_FORMAT_OBJECT});
        if(Number(result.rows?.[0]?.REVISION)!==this.state.revision)throw Object.assign(Error('Workspace changed in Oracle. Restart the server to refresh the graph.'),{status:409});
        return await queryOracleGraph(connection,this.driver,record,user,this.state.revision);
      }catch(error){
        if(error.status)throw error;
        throw Object.assign(Error('Oracle UCO_FLOW graph query failed. Check that the graph is VALID and the application user can query it.'),{status:502,cause:error});
      }finally{await connection.rollback();}
    });
  }

  mutate(user, command, context = {}) {
    const work = this.tail.then(async () => {
      if (!verifyChain(this.state)) throw Error('Audit integrity failure; restore a verified state before writing');
      if (command.expectedRevision !== undefined && command.expectedRevision !== this.state.revision) throw Error('Workspace changed. Refresh before retrying.');
      const next = applyCommand(this.state, user, command, context);
      await this.save(next);
      return scopedState(next, user);
    });
    this.tail = work.catch(() => {});
    return work;
  }

  async backup(target) {
    await this.tail;
    const bytes = JSON.stringify(this.state);
    await writeFile(target, bytes, { mode: 0o600 });
    return digest(bytes);
  }

  async close() {
    if (this.pool) await this.pool.close(10);
    this.pool = null;
    this.connected = false;
  }
}

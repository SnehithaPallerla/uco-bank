export const accounts = [
 {id:'A101',name:'Aarav Textiles',city:'Surat',kind:'Business',usual:180000,device:'D01',flag:false},
 {id:'A102',name:'Kaveri Trading',city:'Mumbai',kind:'Business',usual:120000,device:'D01',flag:false},
 {id:'A103',name:'Northstar Supplies',city:'Delhi',kind:'Business',usual:150000,device:'D02',flag:true},
 {id:'A104',name:'Meera Shah',city:'Pune',kind:'Individual',usual:65000,device:'D03',flag:false},
 {id:'A105',name:'Arjun Rao',city:'Bengaluru',kind:'Individual',usual:85000,device:'D04',flag:false},
 {id:'A106',name:'Nila Services',city:'Chennai',kind:'Business',usual:90000,device:'D05',flag:false},
 {id:'A107',name:'Riverbend Retail',city:'Hyderabad',kind:'Business',usual:110000,device:'D06',flag:false},
 {id:'A108',name:'Dev Iyer',city:'Kochi',kind:'Individual',usual:55000,device:'D07',flag:false},
 {id:'A109',name:'Sunrise Payroll',city:'Mumbai',kind:'Business',usual:500000,device:'D08',flag:false},
 {id:'A110',name:'Priya Sen',city:'Kolkata',kind:'Individual',usual:75000,device:'D09',flag:false},
 {id:'A111',name:'Bluefin Logistics',city:'Ahmedabad',kind:'Business',usual:160000,device:'D01',flag:false},
 {id:'A112',name:'Metro Collections',city:'Mumbai',kind:'Business',usual:100000,device:'D10',flag:false}
];
export const accountById=Object.fromEntries(accounts.map(a=>[a.id,a]));
export const stamp=m=>new Date(Date.UTC(2026,8,22,3,30+m)).toISOString();
const t=(id,from,to,amount,minute,channel='NEFT',purpose='Trade payment')=>({id:'TX'+id,version:1,from,to,amount,at:stamp(minute),channel,purpose});
export const initialTransactions=[
 t(1001,'A109','A104',65000,0,'NEFT','Salary'),t(1002,'A109','A105',85000,3,'NEFT','Salary'),
 t(1003,'A109','A108',55000,5,'NEFT','Salary'),t(1004,'A109','A110',75000,8,'NEFT','Salary'),
 t(1005,'A106','A107',32000,12,'UPI'),t(1006,'A107','A106',28000,16,'IMPS'),
 t(1007,'A111','A101',90000,20),t(1008,'A101','A102',920000,25,'RTGS'),
 t(1009,'A102','A103',890000,32,'RTGS'),t(1010,'A103','A101',870000,39,'RTGS'),
 t(1011,'A104','A112',48000,44,'UPI'),t(1012,'A105','A112',47000,47,'IMPS'),
 t(1013,'A108','A112',49000,50,'UPI'),t(1014,'A110','A112',46000,53,'IMPS'),
 t(1015,'A112','A103',180000,58),t(1016,'A106','A111',40000,65),
 t(1017,'A107','A101',72000,72),t(1018,'A110','A106',9000,76,'UPI'),
 t(1019,'A101','A111',105000,80),t(1020,'A105','A107',18000,87,'UPI'),
 t(1021,'A108','A106',5000,93,'UPI'),t(1022,'A111','A102',310000,100),
 t(1023,'A109','A104',65000,108,'NEFT','Salary'),t(1024,'A104','A107',12000,115,'UPI')
];
export const products=[
 {key:'assistant',title:'OCI Generative AI Agents',tag:'AI Assistant layer',demo:'Sample questions produce deterministic answers grounded in local transactions, cases and graph findings, with clickable evidence references.',production:'Use approved SQL and retrieval tools behind an authenticated assistant API. Route graph questions to bounded query endpoints; require server-side access controls, source attribution and human decisions.',areas:'AI Assistant · Investigations',url:'https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/sql-tool.htm'},
 {key:'vector',title:'26ai AI Vector Search',tag:'Document retrieval',demo:'The assistant explains the proposed retrieval layer. No embeddings or internal UCO Bank documents are loaded.',production:'Store embeddings alongside governed data and retrieve relevant passages from approved documents. Oracle Generative AI Agents RAG supports an Oracle AI Database 26ai vector-search knowledge-base option.',areas:'AI Assistant · Oracle architecture',url:'https://docs.oracle.com/en-us/iaas/Content/generative-ai-agents/RAG-tool.htm'},
 {key:'database',title:'Oracle AI Database 26ai',tag:'Data foundation',demo:'Accounts, transactions, case evidence and graph properties share a local data model.',production:'Store governed relational and JSON data, with SQL property graphs over the appropriate tables. Enforce row access, constraints and retention on the server.',areas:'Intake · Graph · Cases',url:'https://docs.oracle.com/en/database/oracle/oracle-database/26/sqlrf/create-property-graph.html'},
 {key:'graph',title:'Oracle Graph',tag:'Connected intelligence',demo:'Real JavaScript queries calculate cycles, fan-in, device links and proximity from the sample ledger.',production:'Use SQL GRAPH_TABLE for relational graph patterns. Use Oracle Graph tooling for graph analytics and exploration appropriate to the selected service.',areas:'Graph investigations',url:'https://docs.oracle.com/en/database/oracle/property-graph/26.2/spgdg/sql-property-graph.html'},
 {key:'oml',title:'Oracle Machine Learning',tag:'Anomaly detection',demo:'A transparent heuristic produces illustrative anomaly scores. No trained Oracle model runs in this demo.',production:'Evaluate One-Class SVM for anomaly detection; compare supervised models when reviewed labels exist. Validate precision, recall, workload and drift before approval.',areas:'Detection · Model governance',url:'https://docs.oracle.com/en/database/oracle/machine-learning/oml4sql/23/mlsql/one-class-svm.html'},
 {key:'apex',title:'Oracle APEX',tag:'Investigator experience',demo:'React implements an APEX-style case queue with notes, evidence, escalation and reviewer approval.',production:'Implement authenticated investigator pages and human tasks in APEX, backed by server-side authorization and database evidence.',areas:'Case management',url:'https://docs.oracle.com/en/database/oracle/apex/23.2/htmdb/managing-tasks.html'},
 {key:'stream',title:'OCI Streaming + Connector Hub',tag:'Event intake',demo:'Event simulation, ID/version deduplication, quarantine and outage replay.',production:'Ingest events with OCI Streaming. Configure supported Connector Hub transfers, durable checkpoints, consumer retries and raw retention.',areas:'Transaction intake · Operations',url:'https://docs.oracle.com/en-us/iaas/Content/connector-hub/overview.htm'},
 {key:'compute',title:'OCI Functions / OKE',tag:'Processing & APIs',demo:'Local reducers validate events, score transactions and transition cases.',production:'Use Functions or OKE services for enrichment, scoring orchestration and APIs; select according to latency, runtime and scale requirements.',areas:'Intake · Detection · Cases',url:'https://docs.oracle.com/en-us/iaas/Content/Functions/Concepts/functionsoverview.htm'},
 {key:'ds',title:'OCI Data Science',tag:'Model lifecycle',demo:'A local model registry demonstrates validation, approval, activation and rollback.',production:'Build reproducible training pipelines and evaluate model artifacts. Choose in-database OML or deployed inference based on the workload.',areas:'Model governance',url:'https://docs.oracle.com/en-us/iaas/data-science/using/overview.htm'},
 {key:'security',title:'OCI IAM, Vault & Audit',tag:'Governance',demo:'Role switching and an event history illustrate control points; neither is a security boundary.',production:'Enforce identity and least privilege, manage keys and secrets, collect independent audit records, and evaluate Data Safe controls for the database.',areas:'All areas',url:'https://docs.oracle.com/en-us/iaas/Content/Identity/Concepts/overview.htm'},
 {key:'ops',title:'Object Storage & recovery',tag:'Operations',demo:'Queue replay, notification outbox and a recovery checklist operate locally.',production:'Retain raw events and review packets in Object Storage; configure Notifications and Monitoring. Evaluate Autonomous Data Guard for the chosen database service.',areas:'Operations · Reporting',url:'https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/autonomous-data-guard.html'}
];

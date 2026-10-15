/** Provider contracts are intentionally disconnected until approved access is supplied. */
export class RegistryAdapter{
 constructor(provider){if(!['GST','MCA','Search'].includes(provider))throw Error('Provider not permitted');this.provider=provider;}
 async lookup({publicEntityName,registryIdentifier,consentReference}){
  if(publicEntityName&&/\b\d{8,}\b/.test(publicEntityName))throw Error('Public search must not contain private account identifiers');
  return {provider:this.provider,status:'unavailable',liveRequestMade:false,content:null,sourceUrl:null,retrievedAt:new Date().toISOString(),effectiveAt:null,matchedOn:null,limitations:'Approved provider agreement, consent where required, endpoint and credentials must be configured. No adverse inference.',adverseFinding:false};
 }
}
export class OracleAdapter{
 constructor(){this.connected=false;}
 async graph(){throw Error('Oracle connection not configured; use local graph service or deploy SQL assets');}
 async vectorSearch(){throw Error('Embedding model, vector index and authorised Oracle session not configured');}
 async anomalyScore(){return {model:'One-Class SVM candidate',version:null,score:null,execution:'Not trained or connected',validation:null};}
}

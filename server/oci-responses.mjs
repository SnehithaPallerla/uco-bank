import {homedir} from 'node:os';
import path from 'node:path';

// Grok's model-specific OCI route, verified separately from the general
// /openai/v1 Responses API. Keep signing credentials on the server.
export async function sdkResponses(body,env=process.env){
 const region=env.OCI_REGION;
 if(!/^[a-z]{2}-[a-z0-9-]+-\d+$/.test(region||''))throw Error('Invalid OCI region.');
 const common=await import('oci-common');
 const auth=new common.ConfigFileAuthenticationDetailsProvider(env.OCI_CONFIG_FILE||path.join(homedir(),'.oci','config'),env.OCI_CONFIG_PROFILE||'DEFAULT');
 const signer=new common.DefaultRequestSigner(auth);
 const request={uri:`https://inference.generativeai.${region}.oci.oraclecloud.com/v1/responses`,method:'POST',headers:new Headers({'Content-Type':'application/json','opc-compartment-id':env.OCI_COMPARTMENT_ID}),body:JSON.stringify(body)};
 await signer.signHttpRequest(request);
 // No automatic retries: a retry could launch another paid research run.
 const response=await fetch(request.uri,{method:request.method,headers:request.headers,body:request.body,signal:AbortSignal.timeout(120000),redirect:'error'});
 if(!response.ok){await response.body?.cancel();throw Object.assign(Error('OCI Responses request failed.'),{statusCode:response.status});}
 const raw=await response.text();
 if(raw.length>2000000)throw Error('OCI research response is too large.');
 return JSON.parse(raw);
}

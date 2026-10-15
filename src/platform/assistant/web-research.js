export const RESEARCH_INTENTS={
 activity:'Business activity and products',
 identity:'Legal company identity',
 relationships:'Public ownership and group relationships',
 news:'Recent public news and reported events'
};
export function validateSubject(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['name','city','publicId','intent'].includes(k)))throw Error('Use only a public company name, city, registration identifier and research topic.');
 const out={};
 for(const [k,max] of [['name',120],['city',80],['publicId',24]]){
  const value=input[k]??'';if(typeof value!=='string'||value.length>max)throw Error('Check the public company details.');out[k]=value.trim();
 }
 if(out.name.length<3)throw Error('Enter a public company name with at least 3 characters.');
 if(!/^[\p{L}\p{N}\s&.,()'’/-]+$/u.test(out.name+out.city)||/\d{8,}|\b(?:CIF|IFSC|password|account\s*(?:no|number)|Aadhaar|PAN)\b/i.test(out.name+' '+out.city))throw Error('Use public company details only. Remove account numbers, customer IDs and personal identifiers.');
 out.publicId=out.publicId.toUpperCase();
 if(out.publicId&&!/^(?:[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]|[A-Z0-9]{18}\d{2})$/.test(out.publicId))throw Error('Use a complete public CIN, GSTIN or LEI, or leave the identifier empty.');
 if(!Object.hasOwn(RESEARCH_INTENTS,input.intent))throw Error('Choose a supported research topic.');
 return {...out,intent:input.intent};
}
export function queryFor(input){const s=validateSubject(input);return ['"'+s.name+'"',s.city,s.publicId,RESEARCH_INTENTS[s.intent]].filter(Boolean).join(' ');}
export function googleURL(input){return 'https://www.google.com/search?q='+encodeURIComponent(queryFor(input));}
export function publicURL(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;const h=u.hostname.toLowerCase();if(!h.includes('.')||h.endsWith('.local')||h.endsWith('.localhost')||h==='localhost'||h.endsWith('.internal')||/^[\d.]+$/.test(h)||h.includes(':'))return null;return u.href;}catch{return null;}}
export function walkthrough(subject,recordId){
 const clean=validateSubject(subject);
 return {id:'WEB-WALK-'+Date.now(),recordId,subject:clean,query:queryFor(clean),mode:'Recorded walkthrough',status:'Walkthrough',provider:'Prepared investigation example',retrievedAt:null,createdAt:new Date().toISOString(),identity:'Unverified',summary:'Example research suggests an industrial-materials trading business. Such supplies may support construction, but a name match does not establish the recipient’s identity or the purpose of a payment. Confirm the legal identifier, invoice and delivery evidence before drawing a conclusion.',sources:[{id:'S1',title:'Example company-profile excerpt',url:null,excerpt:'Illustrative profile: industrial materials and general trading.',sourceDate:null,kind:'Prepared example'}],claims:[{text:'Industrial materials may be relevant to construction procurement; actual end use remains unverified.',sourceIds:['S1']}],queries:[],suggestionsHTML:'',limitations:'Prepared workflow only. No internet request was made and no real company finding is asserted.'};
}

// OFFLINE training only. No target/rule aggregate is passed to inference.
import {assess} from '../src/platform/domain.js';
import {availableRecord,featurePolicy,featureDigest} from './ml-features.mjs';
export const TARGET_VERSION='rule-review-proxy-1';
export const TARGET_MAPPING={'Review required':1,'Evidence needed':1,'Context review':1,'Supported':0,'Data quality review':null};
export function proxyTarget(record,policy){
 const a=assess(availableRecord(record),featurePolicy(policy)),outcome=a.outcome;
 return {label:TARGET_MAPPING[outcome]??null,sourceOutcome:outcome,targetVersion:TARGET_VERSION,source:'Historical rule assessment; provisional review target, not an officer finding',policyDigest:featureDigest(featurePolicy(policy))};
}

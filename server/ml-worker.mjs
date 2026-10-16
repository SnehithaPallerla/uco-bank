import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ML_ROOT=fileURLToPath(new URL('../',import.meta.url));
export const ML_DIR=path.join(ML_ROOT,'runtime','ml');
export function runMLWorker(operation,input,artifact=null,{timeout=120000}={}){
 if(!['split','train','score'].includes(operation))throw Error('Unsupported ML operation');
 const venv=path.join(ML_ROOT,'.venv-ml',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const python=process.env.UCO_ML_PYTHON||(existsSync(venv)?venv:'python');
 return new Promise((resolve,reject)=>{
  const child=spawn(python,[path.join(ML_ROOT,'ml','review_classifier.py'),operation,...(artifact?[artifact]:[])],{cwd:ML_ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='',settled=false;
  const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(result);};
  const timer=setTimeout(()=>{child.kill();finish(Error('ML worker timed out. No rule fallback was applied.'));},timeout);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>32*1024*1024){child.kill();finish(Error('ML worker response exceeded its limit.'));}});
  child.stderr.on('data',chunk=>{if(error.length<2000)error+=chunk;});
  child.on('error',()=>finish(Error('Unable to start ML Python. Install ml/requirements.txt into .venv-ml.')));
  child.on('close',code=>{try{const value=JSON.parse(output);if(code||value.error)throw Error(value.error||'ML worker failed');finish(null,value);}catch(e){finish(Error(code?`ML worker failed. ${error.includes('ModuleNotFoundError')?'Install ml/requirements.txt into .venv-ml.':e.message}`:'Invalid ML worker response.'));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(input));
 });
}

import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const result = await build({entryPoints:['src/main.jsx'],bundle:true,write:false,minify:true,format:'iife',target:['es2020'],loader:{'.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},legalComments:'inline'});
const js=result.outputFiles.find(f=>f.path.endsWith('.js'))?.text || result.outputFiles[0].text;
const css=(await readFile('src/diversion/styles.css','utf8'))+'\n'+(await readFile('src/platform/styles.css','utf8'))+'\n'+(await readFile('src/platform/assistant/styles.css','utf8'));
await mkdir('dist',{recursive:true});
await writeFile('dist/index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="UCO Credit Intelligence: loan end-use monitoring and investigation assistance"><title>UCO Bank | Credit Intelligence</title><style>${css}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);
console.log('Built dist/index.html — self-contained; no network or CDN required.');

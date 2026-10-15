import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store,createPlatformServer} from '../server/platform.mjs';
import {validateWithOCI} from '../server/oci-validation.mjs';
import {preparedValidation} from '../src/platform/assistant/validation.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
await mkdir('test-output',{recursive:true});await mkdir('docs/evidence',{recursive:true});
const dir=await mkdtemp(path.resolve('test-output','model-testing-browser-')),store=await new Store(dir).init(),env={OCI_REGION:'us-chicago-1',OCI_MODEL_ID:'browser-test-model',OCI_COMPARTMENT_ID:'ocid1.compartment.oc1..test'};
const server=createPlatformServer({store,ociStatus:()=>({configured:true}),ociValidate:async packet=>{await new Promise(resolve=>setTimeout(resolve,35));return validateWithOCI(packet,{env,config:()=>({configured:true,model:env.OCI_MODEL_ID,region:env.OCI_REGION}),invoke:async()=>({chatResult:{chatResponse:{text:JSON.stringify(preparedValidation(packet))}}})});}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!document.querySelector('select[aria-label="Officer persona"]').disabled);
 await page.getByLabel('Portfolio profile').selectOption('model-lab');assert.equal(await page.locator('tbody tr').count(),20);checks.push('20 additional portfolio samples');
 await page.locator('.sidebar nav').getByRole('button',{name:'AI Assistant',exact:true}).click();await page.getByRole('tab',{name:'Model testing',exact:true}).click();const panel=page.getByRole('tabpanel',{name:'Model testing'});
 await panel.getByRole('button',{name:'Show prepared test report'}).click();assert.ok((await panel.innerText()).includes('Prepared test walkthrough'));assert.equal(await panel.locator('tbody tr').count(),6);checks.push('Free six-case test walkthrough');
 await panel.getByRole('button',{name:'Run OCI model test'}).click();await panel.getByText('Completed',{exact:true}).waitFor({timeout:30000});assert.equal(await panel.locator('tbody tr').count(),6);assert.ok((await panel.innerText()).includes('Live OCI model test'));checks.push('Controlled six-case live test with report');
 const dl=page.waitForEvent('download');await panel.getByRole('button',{name:'Download test report'}).click();assert.match((await dl).suggestedFilename(),/UCO_Model_Test/);checks.push('Downloadable model report');
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/evidence/model-testing-desktop.png',fullPage:true});
 await page.reload();await page.waitForFunction(()=>!document.querySelector('select[aria-label="Officer persona"]').disabled);await page.locator('.sidebar nav').getByRole('button',{name:'AI Assistant',exact:true}).click();await page.getByRole('tab',{name:'Model testing',exact:true}).click();await panel.getByText('Live OCI model test',{exact:false}).first().waitFor();checks.push('Report available after browser reload');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'docs/evidence/model-testing-mobile.png',fullPage:true});checks.push('390px test report layout');
 assert.deepEqual(errors,[]);await writeFile('docs/evidence/model-testing-browser-results.json',JSON.stringify({status:'passed',checks,pageErrors:errors,limitations:'Controlled provider responses; genuine OCI model-quality results are reported separately.'},null,2));console.log('PASS',checks.length,'model-testing browser workflows; zero page errors.');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}

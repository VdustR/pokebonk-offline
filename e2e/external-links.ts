import {_electron as electron} from 'playwright-core';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-links-'));
await writeFile(path.join(temp,'index.html'),'<title>External link fixture</title>');
const app=await electron.launch({args:[process.argv[2]??'dist/desktop/main.js',...(process.env['CI']&&process.platform==='linux'?['--no-sandbox']:[])],env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}});
try {
  const page=await app.firstWindow();
  await page.waitForURL('pokebonk://game/index.html');
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({shell})=>{
    Reflect.set(globalThis,'openedUrls',[]);
    shell.openExternal=async(url:string)=>{Reflect.get(globalThis,'openedUrls').push(url);};
  });
  await page.evaluate(()=>window.open('https://example.com/help','_blank','noopener'));
  assert.deepEqual(await app.evaluate(()=>Reflect.get(globalThis,'openedUrls')),['https://example.com/help']);
  await page.evaluate(()=>{location.href='https://example.com/about';});
  await page.waitForTimeout(150);
  assert.deepEqual(await app.evaluate(()=>Reflect.get(globalThis,'openedUrls')),['https://example.com/help','https://example.com/about']);
  for(const url of ['file:///tmp/test','mailto:test@example.com','custom:launch','https://user:pass@example.com/']) {
    await page.evaluate(url=>{window.open(url,'_blank');},url);
  }
  assert.equal(await app.evaluate(()=>Reflect.get(globalThis,'openedUrls').length),2);
  assert.equal(page.url(),'pokebonk://game/index.html');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  assert.equal(await page.evaluate(()=>fetch('https://example.com').then(()=>false,()=>true)),true);
  await page.goto('pokebonk://game/index.html');
  await app.evaluate(({shell,dialog})=>{
    shell.openExternal=async()=>{throw new Error('Browser unavailable');};
    Reflect.set(globalThis,'launchErrors',[]);
    dialog.showMessageBox=async(...args:unknown[])=>{
      Reflect.get(globalThis,'launchErrors').push(args.at(-1));
      return {response:0,checkboxChecked:false};
    };
  });
  await page.evaluate(()=>{window.open('https://example.com/failure','_blank');});
  const failure=await app.evaluate(()=>Reflect.get(globalThis,'launchErrors'));
  assert.deepEqual(failure,[{type:'error',message:'The link could not be opened in your default browser.'}]);
  console.log('External navigation routing, unsafe scheme denial, offline fetch and browser failure reporting passed.');
} finally {
  await app.close().catch(()=>{});
  await rm(temp,{recursive:true,force:true});
}

import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createStaticServer } from '../scripts/serve.mjs';

const root=path.resolve(process.argv[2]??'build/game');
const meta=JSON.parse(await readFile(path.join(root,'offline-build.json'),'utf8'));
const server=createStaticServer(root);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
let browser, page;
const external=[],missing=[],errors=[],runs=[];
await mkdir('evidence',{recursive:true});
try {
  browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:800},locale:'zh-TW',serviceWorkers:'allow'});
  page=await context.newPage();
  await page.addInitScript(()=>{
    if(!localStorage.getItem('pokebonk.local.profile.v1'))localStorage.setItem('pokebonk.local.profile.v1',JSON.stringify({settings:{quality:'low',pixel:2,tips:false}}));
  });
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(origin+'/'))external.push(request.url());});
  context.on('response',response=>{if(response.status()>=400)missing.push({url:response.url(),status:response.status()});});
  await page.goto(origin+'/?lang=zht');
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
  for(const label of ['跳過','知道了']) {
    const button=page.getByRole('button',{name:label,exact:true});
    if(await button.first().isVisible().catch(()=>false))await button.first().click();
  }
  console.log('Game loaded; waiting for full offline cache.');
  await page.waitForFunction(()=>window.__pokebonkOfflineState==='ready',null,{timeout:180000});
  console.log('Complete offline cache ready.');
  const profile=await page.evaluate(()=>window.__pokebonkLocalApp.meta.profile);
  assert.equal(profile.league.length,meta.league);
  assert.equal(Object.keys(profile.lab).length,meta.lab);
  assert.equal(profile.itemsOwned.length,meta.items);
  assert.equal(profile.stardust,1e9);
  await page.evaluate(async()=>{
    const app=window.__pokebonkLocalApp;
    await app.backend.chooseStarter(null,150);
    localStorage.setItem('offline-test-marker','preserved');
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.lastSpecies===150,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('offline-test-marker')),'preserved');
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
  console.log('Offline reload and save persistence passed.');
  for(const config of [
    {species:4,biome:'forest',tier:0},
    {species:150,biome:'desert',tier:2},
    {species:7,biome:'coast',tier:1},
    {species:144,biome:'glacier',tier:2},
    {species:92,biome:'graveyard',tier:0,mode:'tower'},
  ]) {
    assert.equal(await page.evaluate(config=>window.__pokebonkLocalApp.startRun({...config,boosts:[]}),config),true);
    // Software rendering can show the game's informational GPU notice after a
    // run starts. Acknowledge it through the UI so its pause does not mask play.
    for(let notice=0;notice<5;notice++) {
      const state=await page.waitForFunction(()=>{
        if(window.__pokebonkLocalApp.run?.time>3)return 'playing';
        return [...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='知道了'&&button.getClientRects().length)?'notice':false;
      },null,{timeout:60000,polling:100});
      if(await state.jsonValue()==='playing')break;
      await page.getByRole('button',{name:'知道了',exact:true}).first().click();
    }
    assert.ok(await page.evaluate(()=>window.__pokebonkLocalApp.run.time>3),'Gameplay must advance after dismissing informational notices');
    runs.push(await page.evaluate(()=>{const r=window.__pokebonkLocalApp.run;return {species:r.startSpecies,biome:r.biome.id,time:r.time,mode:r.mode,state:r.state};}));
    console.log('Offline gameplay passed:',config.biome);
    await page.evaluate(async()=>{const app=window.__pokebonkLocalApp;app.run.endHow='quit';await app.run.finish(false,true);app.toMenu();});
  }
  const graphicsNotice=page.getByRole('button',{name:'知道了',exact:true});
  for(let index=0;index<5&&await graphicsNotice.first().isVisible().catch(()=>false);index++)await graphicsNotice.first().click();
  await page.screenshot({path:'evidence/pwa-offline-desktop.png'});
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:'evidence/pwa-offline-mobile.png'});
  await writeFile('evidence/pwa.json',JSON.stringify({meta,offlineReload:true,runs,external,missing,errors},null,2));
  assert.deepEqual(external,[],'No external/official-account requests');
  assert.deepEqual([...new Set(missing.map(x=>new URL(x.url).pathname))],[],'Every requested asset must be bundled');
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  console.log('PWA cache, offline reload, persistence and five gameplay scenarios passed.');
} catch(error) {
  const state=page?await page.evaluate(()=>({offline:window.__pokebonkOfflineState,status:document.getElementById('offline-status')?.textContent,profile:!!window.__pokebonkLocalApp?.meta?.profile,runTime:window.__pokebonkLocalApp?.run?.time})).catch(()=>null):null;
  if(page)await page.screenshot({path:'evidence/pwa-failure.png'}).catch(()=>{});
  await writeFile('evidence/pwa-failure.json',JSON.stringify({state,runs,external,missing,errors},null,2));
  throw error;
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

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
let browser;
const external=[],missing=[],errors=[],runs=[];
await mkdir('evidence',{recursive:true});
try {
  browser=await chromium.launch({executablePath,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1280,height:800},locale:'zh-TW',serviceWorkers:'allow'});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>{if(/^https?:/.test(request.url())&&!request.url().startsWith(origin+'/'))external.push(request.url());});
  context.on('response',response=>{if(response.status()>=400)missing.push({url:response.url(),status:response.status()});});
  await page.goto(origin+'/?lang=zht');
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
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
    await app.backend.chooseStarter(null,4);
    localStorage.setItem('offline-test-marker','preserved');
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.lastSpecies===4,null,{timeout:120000});
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
    await page.waitForFunction(()=>window.__pokebonkLocalApp.run?.time>3,null,{timeout:60000});
    runs.push(await page.evaluate(()=>{const r=window.__pokebonkLocalApp.run;return {species:r.startSpecies,biome:r.biome.id,time:r.time,mode:r.mode,state:r.state};}));
    await page.evaluate(async()=>{const app=window.__pokebonkLocalApp;app.run.endHow='quit';await app.run.finish(false,true);app.toMenu();});
  }
  await page.screenshot({path:'evidence/pwa-offline-desktop.png'});
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:'evidence/pwa-offline-mobile.png'});
  await writeFile('evidence/pwa.json',JSON.stringify({meta,offlineReload:true,runs,external,missing,errors},null,2));
  assert.deepEqual(external,[],'No external/official-account requests');
  assert.deepEqual([...new Set(missing.map(x=>new URL(x.url).pathname))],[],'Every requested asset must be bundled');
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  console.log('PWA cache, offline reload, persistence and five gameplay scenarios passed.');
} catch(error) {
  await writeFile('evidence/pwa-failure.json',JSON.stringify({runs,external,missing,errors},null,2));
  throw error;
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

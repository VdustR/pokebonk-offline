import { _electron as electron } from 'playwright-core';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const game=path.resolve(process.argv[2]??'build/game');
const executablePath=process.argv[3];
const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-e2e-'));
const meta=JSON.parse(await readFile(path.join(game,'offline-build.json'),'utf8'));
const env={...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:userData};
const options={env,timeout:120000,args:executablePath?[]:['desktop/main.mjs']};
if(executablePath)options.executablePath=path.resolve(executablePath);
if(process.env.CI) options.args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
await mkdir('evidence',{recursive:true});
let app;
const errors=[],missing=[],external=[];
try {
  app=await electron.launch(options);
  const page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)missing.push({url:response.url(),status:response.status()});});
  page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
  const before=await page.evaluate(()=>{
    const app=window.__pokebonkLocalApp;
    return {keys:Object.keys(app),metaKeys:Object.keys(app.meta),profile:app.meta.profile};
  });
  assert.equal(before.profile.league.length,meta.league);
  assert.equal(Object.keys(before.profile.lab).length,meta.lab);
  assert.equal(before.profile.itemsOwned.length,meta.items);
  assert.equal(before.profile.stardust,1e9);
  await page.evaluate(async()=>{
    const app=window.__pokebonkLocalApp;
    const backend=Object.values(app).find(v=>v?.kind==='local');
    if(!backend)throw new Error('Local backend missing');
    await backend.chooseStarter(null,4);
  });
  await page.reload();
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.lastSpecies===4,null,{timeout:120000});
  const runs=[];
  for(const config of [
    {species:4,biome:'forest',tier:0},
    {species:150,biome:'desert',tier:2},
    {species:7,biome:'coast',tier:1},
    {species:144,biome:'glacier',tier:2},
    {species:92,biome:'graveyard',tier:0,mode:'tower'},
  ]) {
    assert.equal(await page.evaluate(config=>window.__pokebonkLocalApp.startRun({...config,boosts:[]}),config),true);
    await page.waitForFunction(()=>window.__pokebonkLocalApp.run?.time>3,null,{timeout:60000});
    runs.push(await page.evaluate(()=>{
      const r=window.__pokebonkLocalApp.run;
      return {species:r.startSpecies,biome:r.biome.id,time:r.time,mode:r.mode,state:r.state};
    }));
    await page.evaluate(async()=>{
      const app=window.__pokebonkLocalApp;
      app.run.endHow='quit';await app.run.finish(false,true);app.toMenu();
    });
  }
  await page.screenshot({path:'evidence/electron.png'});
  assert.deepEqual(external,[],'Official/network requests must never occur');
  assert.deepEqual(errors,[],'No uncaught runtime errors');
  assert.deepEqual(missing,[],'Every requested asset must be bundled');
  await writeFile('evidence/electron.json',JSON.stringify({upstream:meta,runs,external,missing,errors,profile:{league:before.profile.league.length,lab:Object.keys(before.profile.lab).length}},null,2));
} finally {if(app)await app.close();await rm(userData,{recursive:true,force:true});}

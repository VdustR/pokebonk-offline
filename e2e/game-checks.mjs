import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

async function dismissMenuNotices(page) {
  for(let attempt=0;attempt<3;attempt++) {
    const gpu=page.getByRole('button',{name:'知道了',exact:true}).first();
    if(await gpu.isVisible().catch(()=>false))await gpu.click();
    const tour=page.getByRole('button',{name:'跳過',exact:true}).first();
    if(await tour.waitFor({state:'visible',timeout:2000}).then(()=>true,()=>false))await tour.click();
  }
}

export async function checkGame(page,metadata,label,{gameplay=true}={}) {
  await page.addInitScript(()=>{
    const key='pokebonk.local.profile.v1';
    const profile=JSON.parse(localStorage.getItem(key)||'{}');
    profile.settings={...profile.settings,quality:'low',pixel:2,tips:false};
    localStorage.setItem(key,JSON.stringify(profile));
  });
  await page.reload();
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
  await page.getByRole('button',{name:/^成就 /}).waitFor({state:'visible',timeout:120000});
  await dismissMenuNotices(page);
  const profile=await page.evaluate(()=>window.__pokebonkLocalApp.meta.profile);
  assert.equal(profile.league.length,metadata.league);
  assert.equal(Object.keys(profile.lab).length,metadata.lab);
  assert.equal(profile.itemsOwned.length,metadata.items);
  assert.equal(profile.stardust,1e9);
  assert.equal(Object.keys(profile.quests).length,metadata.achievements);
  assert.equal(Object.values(profile.medals).filter(rank=>rank===metadata.medalRank).length,metadata.medals);
  for(const period of ['daily','weekly'])assert.deepEqual(profile[period].claimed,[1,1,1,1]);
  assert.equal(await page.evaluate(()=>window.__pokebonkLocalApp.meta.tasksReady()),0);
  assert.equal(await page.evaluate(()=>typeof window.process),'undefined');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker?.controller)),false);
  await page.getByRole('button',{name:/^成就 /}).click();
  const general=await page.locator('.q-card.done').count();
  await page.getByRole('button',{name:'外觀',exact:true}).click();
  assert.equal(general+await page.locator('.q-card.done').count(),metadata.achievements);
  await page.evaluate(()=>window.__pokebonkLocalApp.toMenu());
  await page.evaluate(async()=>{await window.__pokebonkLocalApp.backend.chooseStarter(null,150);localStorage.setItem('native-proof','saved');});
  await page.reload();
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.lastSpecies===150,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('native-proof')),'saved');
  assert.equal(await page.evaluate(()=>Object.keys(window.__pokebonkLocalApp.meta.profile.quests).length),metadata.achievements);
  await dismissMenuNotices(page);
  const runs=[];
  if(gameplay)for(const config of [
    {species:4,biome:'forest',tier:0},
    {species:150,biome:'desert',tier:2},
    {species:7,biome:'coast',tier:1},
    {species:144,biome:'glacier',tier:2},
    {species:92,biome:'graveyard',tier:0,mode:'tower'},
  ]) {
    assert.equal(await page.evaluate(config=>window.__pokebonkLocalApp.startRun({...config,boosts:[]}),config),true);
    await page.waitForFunction(()=>window.__pokebonkLocalApp.run?.time>3,null,{timeout:90000});
    runs.push(await page.evaluate(()=>{const r=window.__pokebonkLocalApp.run;return {species:r.startSpecies,biome:r.biome.id,time:r.time,mode:r.mode};}));
    await page.evaluate(async()=>{const a=window.__pokebonkLocalApp;a.run.endHow='quit';await a.run.finish(false,true);a.toMenu();});
    console.log(label,'gameplay passed:',config.biome);
  }
  await page.waitForFunction(()=>document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).every(a=>a.playState!=='running'),null,{timeout:10000});
  await page.screenshot({path:`evidence/${label}.png`});
  await writeFile(`evidence/${label}.json`,JSON.stringify({metadata,runs,persistence:true,achievements:metadata.achievements,medals:metadata.medals,tasksClaimed:true},null,2));
}

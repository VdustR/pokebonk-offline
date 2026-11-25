import type {Page} from 'playwright-core';
import type {BuildMetadata} from '../types/metadata.ts';
import assert from 'node:assert/strict';
import {waitForGameplay} from './gameplay-ready.ts';

export async function checkNativeSmoke(page:Page,metadata:BuildMetadata,assertHealthy:()=>void) {
  const profile=await page.evaluate(()=>window.__pokebonkLocalApp.meta.profile);
  assert.equal(profile.league.length,metadata.league);assert.equal(Object.keys(profile.quests).length,metadata.achievements);
  for(const config of [{species:4,biome:'forest',tier:0},{species:160,biome:'furia',tier:0},{species:248,biome:'plateado',tier:1},{species:4,biome:'newisland',tier:0,mode:'bossrush'}]) {
    assert.equal(await page.evaluate(config=>window.__pokebonkLocalApp.startRun({...config,boosts:[]}),config),true);
    await waitForGameplay(page,1);await page.waitForLoadState('networkidle');assertHealthy();
    assert.equal(await page.evaluate(()=>window.__pokebonkLocalApp.run?.biome.id),config.biome);
    if(config.mode)assert.equal(await page.evaluate(()=>window.__pokebonkLocalApp.run?.mode),config.mode);
    await page.evaluate(async()=>{const app=window.__pokebonkLocalApp,run=app.run;if(!run)throw Error('Missing smoke run');run.endHow='quit';await run.finish(false,true);app.toMenu();});
    console.log('Native smoke passed:',config.biome);
  }
}

import type {Page} from 'playwright-core';
import assert from 'node:assert/strict';

// Additional upstream fields used only by the victory fixture.
declare global {
  interface GameRun {
    stage:number;
    stats:{captured:number[];shinies:number[];classics:number[];killsBy:Record<number,number>;newSeen:number[];kills:number;damage:number;itemDamage:Record<string,number>};
  }
}

export async function decodeVictoryImages(page:Page) {
  const summary=page.locator('.sm-modal .sm');
  await summary.waitFor({state:'visible'});
  assert.ok(await summary.locator('img').count()>0,'Victory summary must render images');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.sm-modal .sm img')).every(image=>
    image instanceof HTMLImageElement && Boolean(image.getAttribute('src'))
  ),null,{timeout:30000});
  return summary.evaluate(async root=>{
    const sources=new Set<string>();
    const decode=async(image:HTMLImageElement)=>{
      try {await image.decode();}
      catch(error){throw new Error('Undecoded victory image: '+image.src,{cause:error});}
      if(!image.naturalWidth)throw new Error('Undecoded victory image: '+image.src);
      sources.add(image.src);
    };
    await Promise.all(Array.from(root.querySelectorAll('img'),decode));
    for(const element of [root,...root.querySelectorAll('*')]) {
      for(const pseudo of [null,'::before','::after']) {
        const background=getComputedStyle(element,pseudo).backgroundImage;
        for(const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
          const url=match[1];if(!url)throw new Error('Empty victory background URL');
          const image=new Image();image.src=url;await decode(image);
        }
      }
    }
    return [...sources];
  });
}

export const missingGraphicsNotice=/還有 (?:1 個圖像未載入|\d+ 張影象尚未載入)/;

export async function checkVictory(page:Page,{species=4,biome='forest',tier=0}={}) {
  assert.equal(await page.evaluate(config=>window.__pokebonkLocalApp.startRun({...config,boosts:[]}),{species,biome,tier}),true);
  await page.waitForFunction(()=>window.__pokebonkLocalApp.run?.state==='play',null,{timeout:90000});
  await page.evaluate(async()=>{
    const run=window.__pokebonkLocalApp.run;
    if(!run)throw new Error('Expected active run');
    // Seed only gameplay outcomes, then use the real result, settlement and UI.
    // These branches are otherwise absent from a short, empty run.
    run.stats.captured=[25];run.stats.shinies=[6];run.stats.classics=[9];
    run.stats.killsBy={16:12,19:8};run.stats.newSeen=[16,19];run.stats.kills=20;
    run.time=900;run.stage=4;run.stats.damage=1200;
    if(!('moves' in run.player)||!Array.isArray(run.player.moves))throw new Error('Expected player moves');
    const move=run.player.moves.find((move):move is {damageDone:number}=>
      typeof move==='object'&&move!==null&&'damageDone' in move&&typeof move.damageDone==='number'
    );
    if(!move)throw new Error('Expected starter move');
    move.damageDone=1000;run.stats.itemDamage={'rocky-helmet':200};
    await run.finish(true,false);
  });
  await page.locator('.sm-modal .sm-hero.win').waitFor({state:'visible'});
  for(const selector of ['.sm-av img','.sm-mon.league img','.sm-mon.shiny img','.sm-mon.classic img','.sm-kill img','.mv-dmg img']) {
    assert.ok(await page.locator('.sm-modal '+selector).count()>0,'Missing victory section: '+selector);
  }
  const images=await decodeVictoryImages(page);
  // The upstream retry indicator appears only after 8 seconds. Checking the
  // DOM immediately after decode would miss failures in off-screen loaders.
  await page.waitForTimeout(9000);
  assert.equal(await page.getByText(missingGraphicsNotice).count(),0,'Victory must not leave the missing-graphics retry notice');
  const last=await page.evaluate(()=>window.__pokebonkLocalApp.meta.profile.runs[0]);
  assert.equal(last?.['victory'],true,'Victory must reach local settlement');
  assert.equal(last?.['species'],species);
  return images;
}

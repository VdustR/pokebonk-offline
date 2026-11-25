import type {Page} from 'playwright-core';

export async function waitForGameplay(page:Page,seconds=3,timeout=90000) {
  const handle=await page.waitForFunction(minimum=>{
    const run=window.__pokebonkLocalApp?.run;
    if(!run)return null;
    if(run.state!=='paused'&&run.time<=minimum)return null;
    return {ready:run.time>minimum&&run.state!=='paused',state:run.state,time:run.time,biome:run.biome?.id,focused:document.hasFocus(),visibility:document.visibilityState,pointerLocked:Boolean(document.pointerLockElement)};
  },seconds,{timeout});
  try {const result=await handle.jsonValue();if(!result?.ready)throw new Error(`Unexpected gameplay pause: ${JSON.stringify(result)}`);}
  finally {await handle.dispose();}
}

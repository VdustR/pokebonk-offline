import type {Page} from 'playwright-core';
import assert from 'node:assert/strict';

export async function checkEventAssets(page:Page) {
  const card=page.locator('.mm-item.event').first();
  // The backend only advertises live events; static snapshot checks cover
  // required assets even after their event has ended.
  if(!await card.count())return;
  await card.click();
  const tabs=page.locator('.ev-tabs .pill');
  await tabs.first().waitFor({state:'visible'});
  const count=await tabs.count();
  assert.ok(count>=4,'An event must expose its play, track, quests and prizes tabs');
  for(let index=0;index<count;index++) {
    await tabs.nth(index).click();
    const images=page.locator('.ev-scr img');
    assert.ok(await images.count(),'Event image checks must exercise rendered images');
    await images.evaluateAll(async images=>{
      await Promise.all(images.map(async image=>{
        if(!(image instanceof HTMLImageElement))throw new Error('Invalid event image');
        try {await image.decode();}
        catch(error){throw new Error('Undecoded event image: '+image.src,{cause:error});}
        if(!image.naturalWidth)throw new Error('Undecoded event image: '+image.src);
      }));
    });
    if(index===1)await page.screenshot({path:'evidence/electron-event-track.png'});
  }
  await page.getByRole('button',{name:'Esc 返回',exact:true}).click();
}

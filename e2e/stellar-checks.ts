import assert from 'node:assert/strict';
import type {Page} from 'playwright-core';

export async function checkStellarShop(page:Page) {
  await page.locator('.shop-btn').click();
  await page.getByRole('tab',{name:'外觀',exact:true}).click();
  const sets=page.locator('.sc-set');
  await sets.first().waitFor({state:'visible'});
  assert.equal(await sets.count(),5);
  for(const set of await sets.all()) {
    assert.equal(await set.locator('.sc-tile.has').count(),3);
    await set.evaluate(async element=>{
      const background=getComputedStyle(element).backgroundImage;
      const frame=element.querySelector('.ef');
      if(!frame)throw new Error('Missing Stellar frame preview');
      const urls=[background,getComputedStyle(frame).getPropertyValue('--tf-img')];
      const glow=element.querySelector('.bf-glow');
      if(!(glow instanceof HTMLImageElement))throw new Error('Missing Stellar banner glow');
      await glow.decode();
      await Promise.all(urls.map(async value=>{
        const url=/^url\(["']?(.*?)["']?\)$/.exec(value.trim())?.[1];
        if(!url)throw new Error('Missing Stellar preview URL');
        const image=new Image();
        image.src=url;
        await image.decode();
      }));
    });
  }
  await page.getByRole('button',{name:'Esc 返回',exact:true}).click();

  const tracks=await page.evaluate(async()=>{
    const context=new AudioContext();
    try {
      return await Promise.all(['ogg','mp3'].map(async extension=>{
        const response=await fetch('assets/music/menu.'+extension);
        if(!response.ok)throw new Error('Missing offline menu audio: '+extension);
        return (await context.decodeAudioData(await response.arrayBuffer())).duration;
      }));
    } finally {await context.close();}
  });
  assert.ok(tracks.every(duration=>duration>60),'Both offline menu audio formats must decode');
}

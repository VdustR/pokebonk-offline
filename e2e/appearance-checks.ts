import type {Page} from 'playwright-core';
import assert from 'node:assert/strict';

export async function checkAppearanceAssets(page:Page) {
  await page.locator('.mm-item').filter({hasText:'排行榜'}).click();
  await page.locator('.bd-me-av').click();
  const appearanceTabs=page.locator('.lk-card .seg .pill');
  await appearanceTabs.first().waitFor({state:'visible'});
  assert.equal(await appearanceTabs.count(),5);
  for(let index=0;index<5;index++) {
    await appearanceTabs.nth(index).click();
    if(index===2) {
      // The pinned research catalog exposes 17 type frames.
      assert.equal(await page.locator('.lk-card .av-frame[src*="/type-"]').count(),17);
      assert.equal(await page.locator('.lk-card .av-frame[src*="/mon-"]').count(),2);
      assert.equal(await page.locator('.lk-card .av-frame[src*="/top100.png"]').count(),1);
    }
    await page.locator('.lk-card img').evaluateAll(async images=>{
      await Promise.all(images.map(async image=>{
        if(!(image instanceof HTMLImageElement))throw new Error('Invalid appearance image');
        await image.decode();
        if(!image.naturalWidth)throw new Error('Undecoded appearance image: '+image.src);
      }));
    });
    await page.locator('.lk-bg-pic').evaluateAll(async backgrounds=>{
      await Promise.all(backgrounds.map(async element=>{
        const background=getComputedStyle(element).backgroundImage;
        for(const match of background.matchAll(/url\(["']?(.*?)["']?\)/g)) {
          const url=match[1];if(!url)throw new Error('Empty appearance background URL');
          const image=new Image();image.src=url;await image.decode();
          if(!image.naturalWidth)throw new Error('Undecoded appearance background: '+url);
        }
      }));
    });
    if(index===2)await page.screenshot({path:'evidence/electron-appearance-frames.png'});
  }
  await page.locator('.lk-card').getByRole('button',{name:'取消',exact:true}).click();
  await page.getByRole('button',{name:'Esc 返回',exact:true}).click();
}

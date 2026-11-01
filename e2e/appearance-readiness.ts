import {_electron as electron,type ElectronApplication} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,copyFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {decodeAppearanceImages} from './appearance-checks.ts';

// Generated portraits intentionally start hidden without src while their async
// palette job runs. Exercise that real image state in the production shell.
const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-appearance-ready-'));
let app:ElectronApplication|undefined;
try {
  await writeFile(path.join(root,'index.html'),'<title>Appearance readiness</title><div class="lk-card"></div>');
  await copyFile('vendor/pokebonk/game/assets/ui/frames/type-fire.png',path.join(root,'valid.png'));
  await writeFile(path.join(root,'corrupt.png'),'not a PNG');
  const args=['dist/desktop/main.js'];
  if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
  app=await electron.launch({args,env:{...process.env,POKEBONK_GAME_DIR:root,POKEBONK_USER_DATA_DIR:path.join(root,'profile')}});
  const page=await app.firstWindow();
  await page.locator('.lk-card').waitFor({state:'attached'});
  await page.evaluate(()=>{
    const image=new Image();image.style.visibility='hidden';document.querySelector('.lk-card')?.append(image);
  });
  await assert.rejects(page.locator('.lk-card img').evaluate(async image=>{
    if(!(image instanceof HTMLImageElement))throw new Error('Missing fixture image');
    await image.decode();
  }),/EncodingError/,'Immediate decoding must reproduce the pending-source failure');
  await page.evaluate(()=>{
    // Hold the asynchronous palette result long enough to reach the pending
    // source boundary even on a fast renderer; this is fixture timing only.
    setTimeout(()=>{
      const image=document.querySelector('.lk-card img');
      if(!(image instanceof HTMLImageElement))throw new Error('Missing fixture image');
      image.src='/valid.png';image.style.visibility='';
    },2000);
  });
  await decodeAppearanceImages(page);
  for(const src of ['/corrupt.png','/missing.png']) {
    await page.evaluate(src=>{
      const image=document.querySelector('.lk-card img');
      if(!(image instanceof HTMLImageElement))throw new Error('Missing fixture image');
      image.src=src;
    },src);
    await assert.rejects(decodeAppearanceImages(page),/cannot be decoded|Undecoded appearance image/);
  }
  console.log('Pending generated portraits wait for source readiness; corrupt and missing images still fail.');
} finally {
  if(app){await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy()});await app.close()}
  await rm(root,{recursive:true,force:true});
}

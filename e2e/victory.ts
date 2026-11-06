import {_electron as electron,type ElectronApplication} from 'playwright-core';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {checkVictory,decodeVictoryImages,missingGraphicsNotice} from './victory-checks.ts';
import {dismissMenuNotices} from './game-checks.ts';

export async function checkVictoryRegression(game:string,executablePath?:string,negativeControl=false) {
  const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-victory-'));
  const args=executablePath?[]:['dist/desktop/main.js'];
  if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
  const errors:string[]=[],missing:string[]=[],failed:string[]=[];
  const controlRequests:string[]=[];
  const scenarios:{species:number;biome:string;tier:number;images:number}[]=[];
  let app:ElectronApplication|undefined;
  await mkdir('evidence',{recursive:true});
  try {
    app=await electron.launch({args,...(executablePath?{executablePath:path.resolve(executablePath)}:{}),env:{...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:userData},timeout:120000});
    const page=await app.firstWindow();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)missing.push(response.status()+' '+response.url());});
    page.on('requestfailed',request=>{if(request.resourceType()==='image')failed.push(request.url()+': '+request.failure()?.errorText);});
    await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
    await dismissMenuNotices(page);
    for(const config of [{species:4,biome:'forest',tier:0},{species:150,biome:'iris',tier:2}]) {
      const images=await checkVictory(page,config);
      scenarios.push({...config,images:images.length});
      await page.screenshot({path:`evidence/victory-${config.biome}.png`});
      assert.equal(missing.length,0,'Victory must not request missing resources: '+JSON.stringify(missing));
      assert.equal(failed.length,0,'Victory image requests must succeed: '+JSON.stringify(failed));
      assert.deepEqual(errors,[],'Victory must not raise page errors');
      if(negativeControl&&config.biome==='iris') {
        // Use a fresh image at the rendered portrait location: the game's own
        // error handler may restore the original source, hiding a failed decode.
        const image=page.locator('.sm-modal .sm-av img').first();
        const original=await image.getAttribute('src');assert.ok(original);
        await image.evaluate(image=>image.replaceWith(image.cloneNode()));
        for(const src of ['data:image/png;base64,bm90IGEgcG5n','/assets/victory-regression-missing.png']) {
          await image.evaluate((image,src)=>image.setAttribute('src',src),src);
          await assert.rejects(decodeVictoryImages(page),/Undecoded victory image:/);
        }
        await page.getByText(missingGraphicsNotice).waitFor({state:'visible',timeout:15000});
        await page.screenshot({path:'evidence/victory-missing-notice-control.png'});
        assert.ok(missing.some(entry=>entry.includes('404 pokebonk://game/assets/victory-regression-missing.png')),'Network observer must catch a missing image');
        await image.evaluate((image,src)=>image.setAttribute('src',src),original);
        await decodeVictoryImages(page);
        // Keep injected requests separate from the normal scenario evidence.
        controlRequests.push(...missing);
        assert.ok(missing.every(entry=>entry.includes('/assets/victory-regression-missing.png')));
        assert.ok(failed.every(entry=>entry.includes('/assets/victory-regression-missing.png')));
        missing.length=0;failed.length=0;
      }
      await page.locator('.sm-foot').getByRole('button',{name:'選單',exact:true}).click();
      await page.locator('.mm-nav').waitFor({state:'visible'});
    }
    assert.equal(missing.filter(entry=>!negativeControl||!entry.includes('/assets/victory-regression-missing.png')).length,0,'Unexpected resource errors after returning to menu');
    assert.equal(failed.length,0,'Image requests must succeed after returning to menu');
    assert.equal(errors.length,0,'Victory control must not raise page errors');
    await writeFile('evidence/victory.json',JSON.stringify({scenarios,errors,missing,failed,controlRequests,negativeControl},null,2));
    await rm('evidence/victory-failure.json',{force:true});
    await rm('evidence/victory-failure.png',{force:true});
    console.log('Victory settlement, summary images and return to menu passed.');
  } catch(error) {
    const page=app?.windows()[0];
    if(page)await page.screenshot({path:'evidence/victory-failure.png'}).catch(()=>{});
    await writeFile('evidence/victory-failure.json',JSON.stringify({error:String(error),errors,missing,failed},null,2));
    throw error;
  } finally {
    if(app){await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();});await app.close();}
    await rm(userData,{recursive:true,force:true});
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkVictoryRegression(path.resolve(process.argv[2]??'build/game'),process.argv[3],process.env['VICTORY_CHECK_NEGATIVE']==='1');
}

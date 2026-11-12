import {parseMetadata} from '../types/metadata.ts';
import type {ElectronApplication} from 'playwright-core';
import {_electron as electron} from 'playwright-core';
import {readFile,mkdtemp,rm,mkdir,writeFile,cp,lstat} from 'node:fs/promises';
import {readdirSync,readlinkSync,statfsSync} from 'node:fs';
import type {StatsFs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkGame,dismissMenuNotices} from './game-checks.ts';
import {focusNativeInput} from './native-input-focus.ts';
import {checkOfflineFriends} from './friends-checks.ts';
import {checkRunSaves,checkCorruptRecovery} from './run-save-checks.ts';
import {checkEventAssets} from './event-checks.ts';
import {checkAppearanceAssets} from './appearance-checks.ts';
import {checkVictoryRegression} from './victory.ts';
import {checkStellarShop} from './stellar-checks.ts';
import {readStorageDiagnostics} from './storage-diagnostics.ts';
const game=path.resolve(process.argv[2]??'build/game');
const executablePath=process.argv[3];
const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-e2e-'));
const metadata=parseMetadata(JSON.parse(await readFile(path.join(game,'offline-build.json'),'utf8')));
const options={env:{...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:userData},timeout:120000,args:executablePath?[]:['dist/desktop/main.js'],...(executablePath?{executablePath:path.resolve(executablePath)}:{})};
// SwiftShader is required for headless Linux; macOS uses its native Metal backend.
if(process.env['CI'] && process.platform==='linux')options.args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
await mkdir('evidence',{recursive:true});
let app: ElectronApplication | undefined;
let failed=false;
let beforeSaveStorage:Awaited<ReturnType<typeof readStorageDiagnostics>>|{captureError:string}|undefined;
let initialPaths:{pid:number;userData:string;sessionData:string;storage:string|null}|undefined;
const closeReturns:{pid:number|undefined;exitCode:number|null;signalCode:NodeJS.Signals|null}[]=[];
const errors: string[]=[],missing: {url:string;status:number}[]=[],external: string[]=[];
try {
  await checkVictoryRegression(game,executablePath,true);
  app=await electron.launch(options);
  let page=await app.firstWindow();
  if(executablePath)assert.equal(await app.evaluate(({app})=>app.getVersion()),metadata.offlineVersion,'Packaged native version must match offline release');
  const isolation=await app.evaluate(({app,BrowserWindow,session})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('No Electron window');
    // Electron exposes this runtime method without a public declaration.
    const read: unknown=Reflect.get(window.webContents,'getLastWebPreferences');
    if(typeof read!=='function')throw new Error('Missing Electron preferences probe');
    const value: unknown=read.call(window.webContents);
    if(typeof value!=='object'||value===null)throw new Error('Invalid Electron preferences');
    const p=value as Record<string,unknown>;
    return {
      preferences:{sandbox:p['sandbox'],nodeIntegration:p['nodeIntegration'],contextIsolation:p['contextIsolation'],webSecurity:p['webSecurity']},
      paths:{pid:process.pid,userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),storage:session.defaultSession.storagePath},
    };
  });
  initialPaths=isolation.paths;
  assert.deepEqual(isolation.preferences,{sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true});
  const observe=(page:import('playwright-core').Page)=>{
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
  };
  observe(page);
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.waitForFunction(()=>document.hasFocus());
  await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
  await dismissMenuNotices(page);
  await checkOfflineFriends(page);
  await checkEventAssets(page);
  await page.locator('.dk-btn').click();
  await page.locator('.dk-card .dk-ic svg').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.dk-card .dk-ic svg').count(),4);
  await page.locator('.dk-scr img').evaluateAll(async images=>{
    await Promise.all(images.map(async image=>{
      if(!(image instanceof HTMLImageElement))throw new Error('Invalid desktop page image');
      await image.decode();
      if(!image.naturalWidth)throw new Error('Undecoded desktop page image: '+image.src);
    }));
  });
  assert.equal(await page.locator('.dk-bg').count(),5);
  await page.locator('.dk-bg').evaluateAll(async backgrounds=>{
    await Promise.all(backgrounds.map(async element=>{
      const url=/^url\(["']?(.*?)["']?\)$/.exec(getComputedStyle(element).backgroundImage)?.[1];
      if(!url)throw new Error('Missing desktop CSS background');
      const image=new Image();image.src=url;await image.decode();
      if(!image.naturalWidth)throw new Error('Undecoded desktop CSS background: '+url);
    }));
  });
  await page.screenshot({path:'evidence/electron-desktop-page.png'});
  await page.keyboard.press('Escape');
  await checkStellarShop(page);
  await checkAppearanceAssets(page);
  await checkGame(page,metadata,executablePath?'electron-packaged':'electron',{pointerLock:true,focusPointerInput:async()=>{if(!app)throw new Error('Missing Electron application');await focusNativeInput(app);}});
  // Retain the original process's counters: after restart they cannot tell us
  // whether the writer had already fallen back to nonpersistent storage.
  beforeSaveStorage=await readStorageDiagnostics(page).catch(error=>({captureError:String(error)}));
  const restart=async(ready=true)=>{
    if(!app)throw Error('Missing native application');
    const nativeProcess=app.process();
    await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();});
    await app.close();
    closeReturns.push({pid:nativeProcess.pid,exitCode:nativeProcess.exitCode,signalCode:nativeProcess.signalCode});
    app=await electron.launch(options);
    const next=await app.firstWindow();observe(next);
    if(ready){
      await next.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
      await next.locator('.mm-nav').waitFor({state:'visible',timeout:30000});
    }
    return next;
  };
  page=await checkRunSaves(page,()=>restart(),async()=>{if(!app)throw Error('Missing native application');await focusNativeInput(app);});
  page=await checkCorruptRecovery(page,()=>restart(false));
  assert.deepEqual(external,[]);assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
  const gameRequests=[...external];
  assert.equal(await page.evaluate(()=>fetch('https://example.com/').then(()=>false,()=>true)),true,'Network must be blocked');
  await writeFile('evidence/electron-network.json',JSON.stringify({gameRequests,missing,errors,networkBlocked:true},null,2));
  console.log('Electron runtime, unlocks, persistence and network isolation passed.');
} catch(error) {
  failed=true;
  try {
    if(app) {
      // Inspect only after failure: observing shutdown itself can change a race.
      const nativeProcess=app.process(),descriptors:string[]=[],captureErrors:string[]=[];
      if(process.platform==='linux'&&nativeProcess.pid) {
        try {
          for(const fd of readdirSync(`/proc/${nativeProcess.pid}/fd`)) {
            try {
              const target=readlinkSync(`/proc/${nativeProcess.pid}/fd/${fd}`);
              if(target.includes('/Local Storage/')||target.includes('/Session Storage/'))descriptors.push(target);
            } catch(captureError) {
              if(typeof captureError!=='object'||captureError===null||!('code' in captureError)||captureError.code!=='ENOENT')captureErrors.push(String(captureError));
            }
          }
        } catch(captureError) {captureErrors.push(String(captureError));}
      }
      let disk:StatsFs|undefined;
      try {disk=statfsSync(userData);}catch(captureError){captureErrors.push(String(captureError));}
      let timer:ReturnType<typeof setTimeout>|undefined;
      const paths=await Promise.race([
        app.evaluate(({app,session})=>({requested:process.env['POKEBONK_USER_DATA_DIR'],userData:app.getPath('userData'),sessionData:app.getPath('sessionData'),storage:session.defaultSession.storagePath,persistent:session.defaultSession.isPersistent()})),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Native storage-path capture timed out')),5000);}),
      ]).catch(captureError=>({captureError:String(captureError)})).finally(()=>clearTimeout(timer));
      const pages=app.windows();
      const page=pages[0];
      const currentStorage=page?await readStorageDiagnostics(page).catch(captureError=>({captureError:String(captureError)})):undefined;
      await writeFile('evidence/electron-storage-failure.json',JSON.stringify({error:String(error),pid:nativeProcess.pid,initialPaths,closeReturns,paths,descriptors,captureErrors,beforeSaveStorage,currentStorage,diskFreeBytes:disk?disk.bavail*disk.bsize:null,diskFreeInodes:disk?.ffree??null},null,2));
      if(page) {
        await page.screenshot({path:'evidence/electron-failure.png'}).catch(()=>{});
        await writeFile('evidence/electron-failure.json',JSON.stringify({errors,missing,external,url:page.url(),runtime:await page.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus(),savedDialogs:document.querySelectorAll('.sv-card').length,run:window.__pokebonkLocalApp?.run?{state:window.__pokebonkLocalApp.run.state,time:window.__pokebonkLocalApp.run.time}:null})).catch(()=>null),text:await page.locator('body').innerText().catch(()=>''),error:String(error)},null,2));
      }
    }
  } catch(captureError) {console.error('Native failure capture failed:',captureError);}
  throw error;
} finally {
  if(app) {
    const nativeProcess=app.process();
    // The exit wait is failure-only and follows the original close sequence.
    const exited=failed?new Promise<void>(resolve=>{
      if(nativeProcess.exitCode!==null||nativeProcess.signalCode!==null)resolve();
      else nativeProcess.once('close',()=>resolve());
    }):undefined;
    // Test profiles are disposable. Bypass gameplay beforeunload dialogs so a
    // failed assertion remains visible instead of a teardown dialog race.
    await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();});
    await app.close();
    if(exited) {
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        await Promise.race([exited,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Native process did not exit before storage capture')),10000);})]);
        assert.ok(path.basename(userData).startsWith('pokebonk-e2e-')&&path.dirname(userData)===os.tmpdir());
        // Copy only the owned acceptance profile, even if native paths differ.
        const destination='evidence/electron-cold-profile';
        await mkdir(destination,{recursive:true});
        for(const name of ['Local Storage','Session Storage','Preferences','Local State']) {
          const source=path.join(userData,name);
          const entry=await lstat(source).catch(captureError=>{
            if(typeof captureError==='object'&&captureError!==null&&'code' in captureError&&captureError.code==='ENOENT')return null;
            throw captureError;
          });
          if(entry)await cp(source,path.join(destination,name),{recursive:true});
        }
        await writeFile(path.join(destination,'native-exit.json'),JSON.stringify({exitCode:nativeProcess.exitCode,signalCode:nativeProcess.signalCode},null,2));
      } catch(captureError) {console.error('Cold storage capture failed:',captureError);}
      finally {clearTimeout(timer);}
    }
  }
  await rm(userData,{recursive:true,force:true});
}

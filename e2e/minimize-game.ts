import {_electron as electron} from 'playwright-core';
import type {ElectronApplication} from 'playwright-core';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {dismissMenuNotices} from './game-checks.ts';

type Sample={event:string;wall:number;now:number;pointer:string|null;focus:boolean;hidden:boolean;visibility:string;state:string|null;time:number|null;lockedAt:number|null;unlockAt:number|null;flicker:boolean|null};
declare global {
  interface Window {
    __minimizeSamples:Sample[];
    __minimizeSample(event:string):Sample;
    __minimizeNative():Promise<void>;
    __minimizeTriggered?:boolean;
  }
}
const executable=process.argv[2];
const modes=process.argv.slice(3);
await mkdir('evidence/minimize',{recursive:true});
// Repeat immediate/stable/immediate/stable: the OS must perform every release.
for(const [index,mode] of (modes.length?modes:['immediate','stable','immediate','stable']).entries()) {
  assert.ok(mode==='immediate'||mode==='stable','Expected immediate or stable');
  const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-minimize-'));
  let app:ElectronApplication|undefined;
  const result:Record<string,unknown>={mode,index,observedAt:new Date().toISOString(),executable:executable??'development shell'};
  try {
    app=await electron.launch({...(executable?{executablePath:path.resolve(executable)}:{}),args:[...(executable?[]:['dist/desktop/main.js']),...(process.platform==='linux'&&process.env['CI']?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])],env:{...process.env,POKEBONK_GAME_DIR:path.resolve('build/game'),POKEBONK_USER_DATA_DIR:userData},timeout:120000});
    const running=app,page=await app.firstWindow();
    await page.addInitScript(()=>{
      window.__minimizeSamples=[];
      window.__minimizeSample=event=>{
        const app=window.__pokebonkLocalApp,run=app?.run,input:unknown=app?Reflect.get(app,'input'):null;
        const read=(key:string):unknown=>typeof input==='object'&&input!==null?Reflect.get(input,key):null;
        const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
        const method=read('lockFlicker'),flicker:unknown=typeof method==='function'?Reflect.apply(method,input,[]):null;
        const sample={event,wall:Date.now(),now:performance.now(),pointer:document.pointerLockElement?.tagName??null,focus:document.hasFocus(),hidden:document.hidden,visibility:document.visibilityState,state:run?.state??null,time:run?.time??null,lockedAt:number(read('lockedAt')),unlockAt:number(read('unlockAt')),flicker:typeof flicker==='boolean'?flicker:null};
        window.__minimizeSamples.push(sample);return sample;
      };
      for(const event of ['pointerlockchange','visibilitychange'])document.addEventListener(event,()=>{window.__minimizeSample(event);setTimeout(()=>window.__minimizeSample(event+'-settled'),0);});
      for(const event of ['blur','focus'])window.addEventListener(event,()=>window.__minimizeSample(event));
    });
    await page.reload();
    await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
    await app.evaluate(({app,BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];if(!window)throw new Error('Missing native window');
      const events:{event:string;wall:number;minimized:boolean;visible:boolean;focused:boolean}[]=[];
      Reflect.set(globalThis,'minimizeNativeEvents',events);
      const capture=(event:string)=>()=>{events.push({event,wall:Date.now(),minimized:window.isMinimized(),visible:window.isVisible(),focused:window.isFocused()});};
      window.on('minimize',capture('minimize'));
      window.on('restore',capture('restore'));
      window.on('blur',capture('blur'));
      window.on('focus',capture('focus'));
      window.on('hide',capture('hide'));
      window.on('show',capture('show'));
      app.focus({steal:true});window.focus();
    });
    await dismissMenuNotices(page);
    await page.evaluate(()=>window.__pokebonkLocalApp.startRun({species:4,biome:'forest',tier:0,boosts:[]}));
    await page.waitForFunction(()=>(window.__pokebonkLocalApp.run?.time??0)>1,null,{timeout:90000});
    // Use the game's existing release method, keeping play state and avoiding
    // separate transition/resume guards before trusted keyboard reacquisition.
    await page.evaluate(()=>{
      const input:unknown=Reflect.get(window.__pokebonkLocalApp,'input');
      if(typeof input!=='object'||input===null)throw new Error('Missing game input');
      const release:unknown=Reflect.get(input,'releaseLock');
      if(typeof release!=='function')throw new Error('Missing game releaseLock');
      Reflect.apply(release,input,[]);
    });
    await page.waitForFunction(()=>document.pointerLockElement===null&&window.__pokebonkLocalApp.run?.state==='play');
    const minimize=async()=>{
      result['request']=await running.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];if(!window)throw new Error('Missing native window');const wall=Date.now();window.minimize();return {wall,minimized:window.isMinimized()};});
    };
    if(mode==='immediate') {
      await page.exposeFunction('__minimizeNative',minimize);
      await page.evaluate(()=>{
        const onLock=()=>{if(!document.pointerLockElement)return;document.removeEventListener('pointerlockchange',onLock);window.__minimizeSample('before-minimize');void window.__minimizeNative().then(()=>{window.__minimizeTriggered=true;});};
        document.addEventListener('pointerlockchange',onLock);
      });
    }
    await page.keyboard.press('w');
    if(mode==='immediate')await page.waitForFunction(()=>window.__minimizeTriggered===true,null,{polling:50});
    else {
      await page.waitForFunction(()=>{const sample=window.__minimizeSample('stable-precondition');return sample.pointer==='CANVAS'&&sample.state==='play'&&sample.lockedAt!==null&&sample.now-sample.lockedAt>=700;});
      await page.evaluate(()=>window.__minimizeSample('before-minimize'));
      await minimize();
    }
    // A bounded observation window; the smoke test keeps its original timeout.
    await new Promise(resolve=>setTimeout(resolve,1500));
    const native=await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];return {events:Reflect.get(globalThis,'minimizeNativeEvents') as unknown,minimized:window?.isMinimized(),visible:window?.isVisible(),focused:window?.isFocused()};});
    const after=await page.evaluate(()=>window.__minimizeSample('after-minimize'));
    result['native']=native;result['after']=after;result['samples']=await page.evaluate(()=>window.__minimizeSamples);
    assert.equal(native.minimized,true);assert.equal(after.pointer,null);
    assert.notEqual(after.lockedAt,null);assert.notEqual(after.unlockAt,null);
    if(after.lockedAt===null||after.unlockAt===null)throw new Error('Missing actual input timestamps');
    const age=after.unlockAt-after.lockedAt;result['lockDurationMs']=age;
    assert.equal(age<700,mode==='immediate','Requested timing precondition was not achieved');
    assert.equal(after.flicker,mode==='immediate');assert.equal(after.state,mode==='immediate'?'play':'paused');
    await app.evaluate(({app,BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window?.restore();app.focus({steal:true});window?.focus();});
    await page.waitForFunction(()=>document.hasFocus());
    const restored=await page.evaluate(()=>window.__pokebonkLocalApp.run?.state);result['restored']=restored;
    assert.equal(restored,after.state);
    console.log(`${mode}: native minimized, lock ${age.toFixed(1)} ms, ${after.state}, restore ${restored}`);
  }catch(error){result['error']=String(error);throw error;}
  finally {
    await writeFile(`evidence/minimize/${index}-${mode}.json`,JSON.stringify(result,null,2));
    try {if(app){await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await app.close();}}
    finally {await rm(userData,{recursive:true,force:true});}
  }
}

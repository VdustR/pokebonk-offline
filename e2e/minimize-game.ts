import {_electron as electron} from 'playwright-core';
import type {ElectronApplication} from 'playwright-core';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {dismissMenuNotices} from './game-checks.ts';
import {focusNativeInput,restoreNativeInput} from './native-input-focus.ts';
import {readGameCapture,waitForPauseEligibleCapture} from './pause-capture.ts';

type Sample={event:string;wall:number;now:number;pointer:string|null;focus:boolean;hidden:boolean;visibility:string;state:string|null;time:number|null;locked:boolean;lockedAt:number|null;unlockAt:number|null;resumedAt:number|null;resumedFrom:string|null;flicker:boolean|null};
declare global {
  interface Window {
    __minimizeSamples:Sample[];
    __minimizeSample(event:string):Sample;
    __minimizeNative():Promise<void>;
    __minimizeTriggered?:boolean;
    __minimizeDelayedHandlers:number;
    __minimizeHoldAcquisition:boolean;
    __minimizePendingAcquisitions:(()=>void)[];
    __minimizeReleaseAcquisition():void;
  }
}
export async function checkMinimizeInput(executable?:string,modes:readonly string[]=[],game=path.resolve('build/game')) {
await mkdir('evidence/minimize',{recursive:true});
// Repeat immediate/stable/immediate/stable: the OS must perform every release.
for(const [index,mode] of (modes.length?modes:['immediate','stable','immediate','stable']).entries()) {
  assert.ok(['immediate','stable','ack-legacy','ack-resume-only','ack-stable'].includes(mode),'Unknown minimize probe mode');
  const delayed=mode==='ack-legacy'||mode==='ack-resume-only'||mode==='ack-stable';
  const legacy=mode==='ack-legacy'||mode==='ack-resume-only';
  const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-minimize-'));
  let app:ElectronApplication|undefined;
  const result:Record<string,unknown>={mode,index,observedAt:new Date().toISOString(),executable:executable??'development shell'};
  try {
    app=await electron.launch({...(executable?{executablePath:path.resolve(executable)}:{}),args:[...(executable?[]:['dist/desktop/main.js']),...(process.platform==='linux'&&process.env['CI']?['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])],env:{...process.env,POKEBONK_GAME_DIR:path.resolve(game),POKEBONK_USER_DATA_DIR:userData},timeout:120000});
    const running=app,page=await app.firstWindow();
    await page.addInitScript(delayed=>{
      window.__minimizeDelayedHandlers=0;
      window.__minimizeHoldAcquisition=false;
      window.__minimizePendingAcquisitions=[];
      window.__minimizeReleaseAcquisition=()=>{
        window.__minimizeHoldAcquisition=false;
        for(const deliver of window.__minimizePendingAcquisitions.splice(0))deliver();
      };
      if(delayed) {
        const original=document.addEventListener;
        document.addEventListener=function(this:Document,type:string,listener:EventListenerOrEventListenerObject,options?:boolean|AddEventListenerOptions) {
          if(type==='pointerlockchange'&&typeof listener==='function'&&listener.toString().includes('this.lockedAt=performance.now')) {
            window.__minimizeDelayedHandlers++;
            return original.call(this,type,function(this:Document,event:Event) {
              if(document.pointerLockElement&&window.__minimizeHoldAcquisition)window.__minimizePendingAcquisitions.push(()=>{listener.call(this,event);window.__minimizeSample('released-input-handler');});
              else listener.call(this,event);
            },options);
          }
          return original.call(this,type,listener,options);
        };
      }
      window.__minimizeSamples=[];
      window.__minimizeSample=event=>{
        const app=window.__pokebonkLocalApp,run=app?.run,input:unknown=app?Reflect.get(app,'input'):null;
        const read=(key:string):unknown=>typeof input==='object'&&input!==null?Reflect.get(input,key):null;
        const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
        const method=read('lockFlicker'),flicker:unknown=typeof method==='function'?Reflect.apply(method,input,[]):null;
        const from:unknown=run?Reflect.get(run,'resumedFrom'):null;
        const sample={event,wall:Date.now(),now:performance.now(),pointer:document.pointerLockElement?.tagName??null,focus:document.hasFocus(),hidden:document.hidden,visibility:document.visibilityState,state:run?.state??null,time:run?.time??null,locked:read('locked')===true,lockedAt:number(read('lockedAt')),unlockAt:number(read('unlockAt')),resumedAt:number(run?Reflect.get(run,'resumedAt'):null),resumedFrom:typeof from==='string'?from:null,flicker:typeof flicker==='boolean'?flicker:null};
        window.__minimizeSamples.push(sample);return sample;
      };
      for(const event of ['pointerlockchange','visibilitychange'])document.addEventListener(event,()=>{window.__minimizeSample(event);setTimeout(()=>window.__minimizeSample(event+'-settled'),0);});
      for(const event of ['blur','focus'])window.addEventListener(event,()=>window.__minimizeSample(event));
    },delayed);
    await page.reload();
    await page.waitForFunction(()=>window.__pokebonkLocalApp?.meta?.profile?.localSandbox,null,{timeout:120000});
    if(delayed)assert.equal(await page.evaluate(()=>window.__minimizeDelayedHandlers),1,'Control only the actual input acquisition consumer');
    await app.evaluate(({BrowserWindow})=>{
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
    });
    await focusNativeInput(app);
    await dismissMenuNotices(page);
    await page.evaluate(()=>window.__pokebonkLocalApp.startRun({species:4,biome:'forest',tier:0,boosts:[]}));
    await page.waitForFunction(()=>(window.__pokebonkLocalApp.run?.time??0)>1,null,{timeout:90000});
    if(delayed) {
      await waitForPauseEligibleCapture(page);
      await page.evaluate(()=>window.__pokebonkLocalApp.run?.pause());
      await page.waitForFunction(()=>{const sample=window.__minimizeSample('paused-ready');return sample.pointer===null&&sample.state==='paused'&&!sample.locked;});
      await page.evaluate(()=>{window.__minimizeHoldAcquisition=true;window.__pokebonkLocalApp.run?.resume();});
    }else {
      // Isolate lock age from transition/resume guards in the original modes.
      await page.evaluate(()=>{
        const input:unknown=Reflect.get(window.__pokebonkLocalApp,'input');
        if(typeof input!=='object'||input===null)throw new Error('Missing game input');
        const release:unknown=Reflect.get(input,'releaseLock');
        if(typeof release!=='function')throw new Error('Missing game releaseLock');
        Reflect.apply(release,input,[]);
      });
      await page.waitForFunction(()=>document.pointerLockElement===null&&window.__pokebonkLocalApp.run?.state==='play');
    }
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
      if(delayed) {
        await page.waitForFunction(resumeOnly=>{const sample=window.__minimizeSample('held-precondition');return sample.pointer==='CANVAS'&&sample.state==='play'&&sample.lockedAt!==null&&sample.now-sample.lockedAt>=700&&(!resumeOnly||(sample.resumedAt!==null&&sample.now-sample.resumedAt>=(sample.resumedFrom==='modal'?1500:800)));},mode!=='ack-legacy');
        const held=await readGameCapture(page);
        const queued=await page.evaluate(()=>window.__minimizePendingAcquisitions.length);
        result['held']=held;result['queuedAcquisitions']=queued;
        assert.equal(held.locked,false);assert.equal(held.eligible,false);
        assert.ok(queued>0,'The actual acquisition consumer must be held');
        if(!legacy)await page.evaluate(()=>window.__minimizeReleaseAcquisition());
      }
      if(!legacy)await waitForPauseEligibleCapture(page);
      await page.evaluate(()=>window.__minimizeSample('before-minimize'));
      await minimize();
      if(legacy) {
        await page.waitForFunction(()=>document.pointerLockElement===null,null,{timeout:1500,polling:50});
        await page.evaluate(()=>window.__minimizeReleaseAcquisition());
      }
    }
    // A bounded observation window; the smoke test keeps its original timeout.
    await new Promise(resolve=>setTimeout(resolve,1500));
    const native=await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];return {events:Reflect.get(globalThis,'minimizeNativeEvents') as unknown,minimized:window?.isMinimized(),visible:window?.isVisible(),focused:window?.isFocused()};});
    const after=await page.evaluate(()=>window.__minimizeSample('after-minimize'));
    const delivery=await page.evaluate(()=>({samples:window.__minimizeSamples,pending:window.__minimizePendingAcquisitions.length}));
    result['native']=native;result['after']=after;result['samples']=delivery.samples;result['pendingAcquisitions']=delivery.pending;
    assert.equal(delivery.pending,0,'Forward every queued acquisition callback');
    assert.equal(native.minimized,true);assert.equal(after.pointer,null);
    assert.notEqual(after.lockedAt,null);assert.notEqual(after.unlockAt,null);
    if(after.lockedAt===null||after.unlockAt===null)throw new Error('Missing actual input timestamps');
    const age=after.unlockAt-after.lockedAt;
    result[legacy?'legacyRecordedDurationMs':'lockDurationMs']=age;
    if(legacy) {
      const before=(await page.evaluate(()=>window.__minimizeSamples)).find(sample=>sample.event==='before-minimize');
      assert.ok(before);assert.equal(before.pointer,'CANVAS');assert.equal(before.locked,false);
      assert.ok(before.lockedAt!==null&&before.unlockAt!==null&&before.lockedAt<=before.unlockAt,'Legacy control must use an older acquisition clock');
      if(mode==='ack-resume-only')assert.ok(before.resumedAt!==null&&before.now-before.resumedAt>=(before.resumedFrom==='modal'?1500:800));
      assert.equal(after.state,'play');
    }else {
      assert.equal(age<700,mode==='immediate','Requested timing precondition was not achieved');
      assert.equal(after.flicker,mode==='immediate');assert.equal(after.state,mode==='immediate'?'play':'paused');
      if(mode==='ack-stable')assert.ok(after.resumedAt!==null&&after.unlockAt-after.resumedAt>=(after.resumedFrom==='modal'?1500:800));
    }
    await restoreNativeInput(app);
    await page.waitForFunction(()=>document.hasFocus());
    const restored=await page.evaluate(()=>window.__pokebonkLocalApp.run?.state);result['restored']=restored;
    assert.equal(restored,after.state);
    const clock=legacy?'previous input clock':'lock';
    console.log(`${mode}: native minimized, ${clock} ${age.toFixed(1)} ms, ${after.state}, restore ${restored}`);
  }catch(error){result['error']=String(error);throw error;}
  finally {
    await writeFile(`evidence/minimize/${index}-${mode}.json`,JSON.stringify(result,null,2));
    try {if(app){await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await app.close();}}
    finally {await rm(userData,{recursive:true,force:true});}
  }
}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await checkMinimizeInput(process.argv[2]||undefined,process.argv.slice(3));
}

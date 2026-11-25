import type {BrowserContext} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {record,text} from '../types/data.ts';

function observeDocument() {
  if(Reflect.get(window,'__pokebonkDiagnosticsAttached'))return;
  Reflect.set(window,'__pokebonkDiagnosticsAttached',true);
  const send=(event:string,key?:string)=>{
    const run=window.__pokebonkLocalApp?.run,callback:unknown=Reflect.get(window,'__pokebonkDiagnosticEvent');
    if(typeof callback==='function')void callback({event,key,at:performance.now(),focused:document.hasFocus(),visibility:document.visibilityState,pointerLocked:Boolean(document.pointerLockElement),run:run?{state:run.state,time:run.time,biome:run.biome?.id,mode:run.mode}:null});
  };
  const handlers=['blur','focus','visibilitychange','pointerlockchange','keydown'].map(event=>{const listener=(value:Event)=>send(event,value instanceof KeyboardEvent?value.code:undefined);addEventListener(event,listener,true);return {event,listener};});
  let previous='',frame=0;const sample=()=>{const run=window.__pokebonkLocalApp?.run,key=run?`${run.biome?.id}:${run.state}`:'menu';if(key!==previous){previous=key;send('run-state');}frame=requestAnimationFrame(sample);};
  frame=requestAnimationFrame(sample);
  Reflect.set(window,'__pokebonkStopDiagnostics',()=>{cancelAnimationFrame(frame);for(const {event,listener} of handlers)removeEventListener(event,listener,true);});
}

export function nativeDiagnostics(directory=path.join('evidence',`native-${Date.now()}-${randomUUID()}`)) {
  const events:Record<string,unknown>[]=[];let active:BrowserContext|undefined,index=0;
  const append=(value:Record<string,unknown>)=>{events.push({observed:new Date().toISOString(),...value});if(events.length>2000)events.shift();};
  return {directory,
    async attach(context:BrowserContext) {
      if(active)throw new Error('Close diagnostic context before attaching another');
      active=context;index++;
      await context.tracing.start({snapshots:true,screenshots:true,sources:false});
      await context.exposeBinding('__pokebonkDiagnosticEvent',(_source,payload:unknown)=>{const value=record(payload);text(value['event']);append(value);});
      context.on('response',response=>{if(response.status()>=400)append({event:'http-error',url:response.url(),status:response.status()});});
      context.on('weberror',error=>append({event:'page-error',message:error.error().message}));
      await context.addInitScript(observeDocument);
      for(const page of context.pages())await page.evaluate(observeDocument);
    },
    async finish(failed:boolean) {
      const context=active;if(!context)return;active=undefined;
      if(failed){await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'events.json'),JSON.stringify(events,null,2)+'\n');await context.tracing.stop({path:path.join(directory,`trace-${index}.zip`)});console.error('Native failure diagnostics:',directory);}
      else {
        for(const page of context.pages())await page.evaluate(()=>{const stop:unknown=Reflect.get(window,'__pokebonkStopDiagnostics');if(typeof stop==='function')stop();});
        await context.tracing.stop();
      }
    },
  };
}

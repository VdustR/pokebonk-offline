import {_electron as electron} from 'playwright-core';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {nativeDiagnostics} from './native-diagnostics.ts';
import {waitForGameplay} from './gameplay-ready.ts';

const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-diagnostics-'));let app;const diagnostics=nativeDiagnostics(path.join(root,'diagnostics'));
try {
  const game=path.join(root,'game');await mkdir(game);
  await writeFile(path.join(game,'index.html'),`<html><body>Diagnostic fixture<script>window.__pokebonkLocalApp={run:{state:'play',time:0,biome:{id:'fixture'}}};setInterval(()=>{const r=window.__pokebonkLocalApp.run;if(r.state==='play')r.time+=.1},50)</script></body></html>`);
  app=await electron.launch({args:['dist/desktop/main.js'],env:{...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:path.join(root,'profile')}});
  const page=await app.firstWindow();await diagnostics.attach(app.context());await page.waitForFunction(()=>Boolean(window.__pokebonkLocalApp?.run));
  await waitForGameplay(page,.2,2000);
  await page.evaluate(async()=>{dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA'}));const callback:unknown=Reflect.get(window,'__pokebonkDiagnosticEvent');if(typeof callback==='function')await callback({event:'barrier'});});
  await page.evaluate(()=>{const run=window.__pokebonkLocalApp.run;if(!run)throw Error('Missing fixture run');run.time=2.65;run.state='paused';});
  const started=performance.now();await assert.rejects(waitForGameplay(page,3,500),/Unexpected gameplay pause.*fixture/);assert.ok(performance.now()-started<300);
  await page.reload();await page.waitForFunction(()=>Boolean(window.__pokebonkLocalApp?.run));
  await page.evaluate(async()=>{dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP'}));const callback:unknown=Reflect.get(window,'__pokebonkDiagnosticEvent');if(typeof callback==='function')await callback({event:'barrier'});});
  assert.equal(await page.evaluate(()=>fetch('/missing-fixture.png').then(response=>response.status)),404);
  await diagnostics.finish(true);
  const {readFile,stat}=await import('node:fs/promises');const events:unknown=JSON.parse(await readFile(path.join(root,'diagnostics/events.json'),'utf8'));
  const {list,record}=await import('../types/data.ts');for(const key of ['KeyA','KeyP'])assert.ok(list(events,record).some(event=>event['event']==='keydown'&&event['key']===key));assert.ok(list(events,record).some(event=>event['event']==='http-error'&&String(event['url']).includes('missing-fixture.png')));
  assert.ok((await stat(path.join(root,'diagnostics/trace-1.zip'))).size>0);
  console.log('Native readiness accepts a playing run and diagnoses an unexpected pause.');
}finally{if(app){await diagnostics.finish(false);await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy()});await app.close()}await rm(root,{recursive:true,force:true})}

import {parseMetadata} from '../types/metadata.ts';
import type {ElectronApplication} from 'playwright-core';
import {_electron as electron} from 'playwright-core';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkGame} from './game-checks.ts';
const game=path.resolve(process.argv[2]??'build/game');
const executablePath=process.argv[3];
const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-e2e-'));
const metadata=parseMetadata(JSON.parse(await readFile(path.join(game,'offline-build.json'),'utf8')));
const options={env:{...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:userData},timeout:120000,args:executablePath?[]:['dist/desktop/main.js'],...(executablePath?{executablePath:path.resolve(executablePath)}:{})};
// SwiftShader is required for headless Linux; macOS uses its native Metal backend.
if(process.env['CI'] && process.platform==='linux')options.args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
await mkdir('evidence',{recursive:true});
let app: ElectronApplication | undefined;
const errors: string[]=[],missing: {url:string;status:number}[]=[],external: string[]=[];
try {
  app=await electron.launch(options);
  const page=await app.firstWindow();
  if(executablePath)assert.equal(await app.evaluate(({app})=>app.getVersion()),metadata.offlineVersion,'Packaged native version must match offline release');
  const isolation=await app.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('No Electron window');
    // Electron exposes this runtime method without a public declaration.
    const read: unknown=Reflect.get(window.webContents,'getLastWebPreferences');
    if(typeof read!=='function')throw new Error('Missing Electron preferences probe');
    const value: unknown=read.call(window.webContents);
    if(typeof value!=='object'||value===null)throw new Error('Invalid Electron preferences');
    const p=value as Record<string,unknown>;
    return {sandbox:p['sandbox'],nodeIntegration:p['nodeIntegration'],contextIsolation:p['contextIsolation'],webSecurity:p['webSecurity']};
  });
  assert.deepEqual(isolation,{sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.waitForFunction(()=>document.hasFocus());
  await checkGame(page,metadata,executablePath?'electron-packaged':'electron',{pointerLock:true});
  assert.deepEqual(external,[]);assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
  const gameRequests=[...external];
  assert.equal(await page.evaluate(()=>fetch('https://example.com/').then(()=>false,()=>true)),true,'Network must be blocked');
  await writeFile('evidence/electron-network.json',JSON.stringify({gameRequests,missing,errors,networkBlocked:true},null,2));
  console.log('Electron runtime, unlocks, persistence and network isolation passed.');
} catch(error) {
  if(app) {
    const pages=app.windows();
    const page=pages[0];
    if(page) {
      await page.screenshot({path:'evidence/electron-failure.png'}).catch(()=>{});
      await writeFile('evidence/electron-failure.json',JSON.stringify({errors,missing,external,url:page.url(),text:await page.locator('body').innerText().catch(()=>''),error:String(error)},null,2));
    }
  }
  throw error;
} finally {if(app)await app.close();await rm(userData,{recursive:true,force:true});}

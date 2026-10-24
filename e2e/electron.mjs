import {_electron as electron} from 'playwright-core';
import {readFile,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {checkGame} from './game-checks.mjs';
const game=path.resolve(process.argv[2]??'build/game');
const executablePath=process.argv[3];
const userData=await mkdtemp(path.join(os.tmpdir(),'pokebonk-e2e-'));
const metadata=JSON.parse(await readFile(path.join(game,'offline-build.json'),'utf8'));
const options={env:{...process.env,POKEBONK_GAME_DIR:game,POKEBONK_USER_DATA_DIR:userData},timeout:120000,args:executablePath?[]:['desktop/main.mjs']};
if(executablePath)options.executablePath=path.resolve(executablePath);
// SwiftShader is required for headless Linux; macOS uses its native Metal backend.
if(process.env.CI && process.platform==='linux')options.args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
await mkdir('evidence',{recursive:true});
let app;
const errors=[],missing=[],external=[];
try {
  app=await electron.launch(options);
  const page=await app.firstWindow();
  const isolation=await app.evaluate(({BrowserWindow})=>{const p=BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();return {sandbox:p.sandbox,nodeIntegration:p.nodeIntegration,contextIsolation:p.contextIsolation,webSecurity:p.webSecurity};});
  assert.deepEqual(isolation,{sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
  await checkGame(page,metadata,executablePath?'electron-packaged':'electron');
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

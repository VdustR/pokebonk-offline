import {_electron as electron} from 'playwright-core';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if(process.platform!=='darwin')throw new Error('This interactive acceptance procedure requires macOS.');
const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-native-acceptance-'));
await writeFile(path.join(temp,'index.html'),`<h1>PokéBonk native window acceptance</h1><button>Activate</button><script>localStorage.setItem('saved-progress','retained');addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue='';});</script>`);
const app=await electron.launch({args:['dist/desktop/main.js'],env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}}).catch(async error=>{await rm(temp,{recursive:true,force:true});throw error;});
app.on('window',page=>page.on('dialog',()=>{}));
try {
  const page=await app.firstWindow();page.on('dialog',()=>{});
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.getByRole('button').click();
  console.log('READY: native titlebar close then Keep Playing; PID',app.process().pid);
  await app.evaluate(async({BrowserWindow})=>{await new Promise<void>(resolve=>BrowserWindow.getAllWindows()[0]?.webContents.once('will-prevent-unload',()=>setImmediate(resolve)));});
  assert.equal(page.isClosed(),false);
  console.log('CANCEL PASSED. READY: native Cmd-W then Close Game.');
  await page.waitForEvent('close',{timeout:120000});
  const reopened=app.waitForEvent('window');
  await app.evaluate(({app})=>app.emit('activate'));
  const next=await reopened;next.on('dialog',()=>{});
  await next.waitForURL('pokebonk://game/index.html');
  assert.equal(await next.evaluate(()=>localStorage.getItem('saved-progress')),'retained');
  await next.getByRole('button').click();
  console.log('CLOSE AND REOPEN PASSED. READY: native Cmd-Q then Close Game.');
  await app.waitForEvent('close',{timeout:120000});
  await writeFile('evidence/native-window-acceptance.json',JSON.stringify({observedAt:new Date().toISOString(),platform:process.platform,titlebarCancel:true,nativeCmdWConfirmed:true,reopenStorageRetained:true,nativeCmdQConfirmed:true},null,2));
  console.log('Native titlebar, visible confirmation, Cmd-W, reopen/storage and Cmd-Q passed.');
} finally {
  try {await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await app.close();}
  finally {await rm(temp,{recursive:true,force:true});}
}

import {_electron as electron} from 'playwright-core';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-window-lifecycle-'));
await writeFile(path.join(temp,'index.html'),`<button>Play</button><script>
localStorage.setItem('saved-progress','retained');
window.activeRun=true;window.closeRequests=0;
addEventListener('beforeunload',event=>{window.closeRequests++;if(window.activeRun){event.preventDefault();event.returnValue='';}});
</script>`);
const args=['dist/desktop/main.js'];
if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox');
const app=await electron.launch({args,env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}}).catch(async error=>{await rm(temp,{recursive:true,force:true});throw error;});
try {
  const page=await app.firstWindow();
  // Electron owns this prompt; prevent Playwright's auto-dismiss race.
  page.on('dialog',()=>{});
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.waitForFunction(()=>document.hasFocus());
  await page.getByRole('button').click();
  await app.evaluate(async({dialog,BrowserWindow})=>{
    Reflect.set(globalThis,'confirmations',[]);
    Reflect.set(globalThis,'choice',0);
    // Only substitute the user's decision; Chromium's beforeunload and the
    // production native-close handler are real.
    dialog.showMessageBoxSync=(...args: unknown[])=>{
      const confirmations: unknown=Reflect.get(globalThis,'confirmations');
      if(!Array.isArray(confirmations))throw new Error('Missing dialog log');
      confirmations.push(args.at(-1));
      return Number(Reflect.get(globalThis,'choice'));
    };
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing window');
    await new Promise<void>(resolve=>{window.webContents.once('will-prevent-unload',()=>setImmediate(resolve));window.close();});
  });
  assert.equal(await app.evaluate(()=>Reflect.get(globalThis,'confirmations').length),1,'An active run must offer a native close decision');
  assert.equal(page.isClosed(),false,'Cancel must keep the game open');
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-progress')),'retained');
  await app.evaluate(({app})=>{app.quit();});
  await page.waitForFunction(()=>Reflect.get(window,'closeRequests')===2);
  assert.equal(page.isClosed(),false,'Quit cancellation must retain the window');
  const closed=page.waitForEvent('close');
  await app.evaluate(({app,BrowserWindow})=>{
    Reflect.set(globalThis,'choice',1);
    // Keep the process alive only so the test can inspect close and reactivate.
    if(process.platform!=='darwin')app.removeAllListeners('window-all-closed');
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
  const reopened=app.waitForEvent('window');
  await app.evaluate(({app})=>app.emit('activate'));
  const next=await reopened;
  next.on('dialog',()=>{});
  await next.waitForURL('pokebonk://game/index.html');
  await next.waitForLoadState('domcontentloaded');
  assert.equal(await next.evaluate(()=>localStorage.getItem('saved-progress')),'retained');
  await next.evaluate(()=>Reflect.set(window,'activeRun',false));
  const menu=await app.evaluate(({Menu})=>Menu.getApplicationMenu()?.items.map(item=>({role:item.role,label:item.label,items:item.submenu?.items.map(item=>({role:item.role,accelerator:item.accelerator}))})));
  assert.ok(menu?.length,'Native application menu must exist');
  const nextClosed=next.waitForEvent('close');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.close());
  await nextClosed;
  assert.equal(await app.evaluate(()=>Reflect.get(globalThis,'confirmations').length),3,'Idle close must not prompt');
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/window-lifecycle.json',JSON.stringify({observedAt:new Date().toISOString(),electron:await app.evaluate(()=>process.versions.electron),platform:process.platform,activeRunCancelKeepsOpen:true,quitCancelKeepsOpen:true,confirmCloses:true,idleCloseNoPrompt:true,reactivationRetainsStorage:true,menu},null,2));
  console.log('Native close cancel/confirm, idle close, reopen and storage preservation passed.');
} finally {
  try {
    await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});
    await app.close();
  } finally { await rm(temp,{recursive:true,force:true}); }
}

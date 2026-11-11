import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {focusNativeInput,restoreNativeInput} from './native-input-focus.ts';

export async function checkRestoreInput() {
const temporary=await mkdtemp(path.join(os.tmpdir(),'pokebonk-restore-input-'));
const domOnly=process.env['RESTORE_CHECK_DOM_ONLY']==='1';
await writeFile(path.join(temporary,'index.html'),`<canvas width="320" height="200"></canvas><script>
addEventListener('keydown',async()=>{
  try {await document.querySelector('canvas').requestPointerLock();}
  catch(error) {window.lockError=error.name;}
});
</script>`);
const args=['dist/desktop/main.js'];
const binary=process.env['RESTORE_ELECTRON_BINARY'];
if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
const app=await electron.launch({args,...(binary?{executablePath:path.resolve(binary)}:{}),env:{...process.env,POKEBONK_GAME_DIR:temporary,POKEBONK_USER_DATA_DIR:path.join(temporary,'profile')},timeout:120000}).catch(async error=>{await rm(temporary,{recursive:true,force:true});throw error;});
const minimize=async()=>app.evaluate(async({BrowserWindow})=>{
  const window=BrowserWindow.getAllWindows()[0];
  if(!window)throw new Error('Missing native test window');
  await new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(deadline);window.removeListener('minimize',done);};
    const done=()=>{cleanup();resolve();};
    const deadline=setTimeout(()=>{cleanup();reject(new Error('Native test window did not minimize'));},5000);
    window.once('minimize',done);window.minimize();
  });
});
const results:unknown[]=[];
try {
  assert.equal(await app.evaluate(({app})=>app.isPackaged),false,'The isolated fixture requires the development shell');
  const page=await app.firstWindow();
  await focusNativeInput(app);
  for(let trial=0;trial<2;trial++) {
    await page.keyboard.press('w');
    await page.waitForFunction(()=>document.pointerLockElement?.tagName==='CANVAS');
    await minimize();
    await page.waitForFunction(()=>document.pointerLockElement===null);
    const domFocusWhileMinimized=await page.evaluate(()=>document.hasFocus());
    await app.evaluate(({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];
      if(!window)throw new Error('Missing native test window');
      const restore=window.restore.bind(window);
      Reflect.set(window,'restore',()=>{setTimeout(restore,400);});
      Reflect.set(globalThis,'originalRestore',restore);
    });
    if(domOnly) {
      // Negative control retains the original fullscreen-smoke ordering.
      await app.evaluate(({app,BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window?.restore();app.focus({steal:true});window?.focus();});
      await page.waitForFunction(()=>document.hasFocus());
    } else await restoreNativeInput(app);
    const beforeInput=await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];if(!window)throw new Error('Missing native test window');return {minimized:window.isMinimized(),focused:window.isFocused(),contentsFocused:window.webContents.isFocused()};});
    await page.keyboard.press('w');
    const captured=await page.waitForFunction(()=>document.pointerLockElement?.tagName==='CANVAS',null,{timeout:5000}).then(()=>true,()=>false);
    results.push({trial,domOnly,domFocusWhileMinimized,beforeInput,captured});
    assert.deepEqual(beforeInput,{minimized:false,focused:true,contentsFocused:true});
    assert.equal(captured,true,'Restored native input must reacquire pointer lock');
    await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];if(window)Reflect.set(window,'restore',Reflect.get(globalThis,'originalRestore'));});
  }
  await minimize();
  await app.evaluate(({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing native test window');
    Reflect.set(window,'restore',()=>{});
  });
  await assert.rejects(()=>restoreNativeInput(app),/Native input window did not restore/);
  results.push({withheldRestoreRejected:true});
  console.log('Delayed native restore/input focus and withheld-restore rejection passed.');
} finally {
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/restore-input.json',JSON.stringify({observedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,results},null,2));
  try {await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await app.close();}
  finally {await rm(temporary,{recursive:true,force:true});}
}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await checkRestoreInput();

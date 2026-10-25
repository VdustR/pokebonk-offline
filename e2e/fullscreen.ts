import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Drive the real Fullscreen API through the production permission boundary.
const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-fullscreen-'));
const fixture=`<button id="toggle">Toggle fullscreen</button><script>
window.result='idle';
document.addEventListener('fullscreenchange',()=>window.result=document.fullscreenElement?'entered':'exited');
document.addEventListener('fullscreenerror',()=>window.result='denied');
document.querySelector('button').onclick=async()=>{
  window.result='pending';
  setTimeout(()=>{if(window.result==='pending')window.result='pending-timeout';},1500);
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({navigationUI:'hide'});
    window.result=document.fullscreenElement?'entered':'exited';
  } catch { window.result='denied'; }
};
</script>`;
await writeFile(path.join(temp,'index.html'),fixture+'<iframe src="/frame.html" allowfullscreen></iframe>');
await writeFile(path.join(temp,'frame.html'),fixture);
const args=['dist/desktop/main.js'];
if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
const app=await electron.launch({args,env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}}).catch(async error=>{await rm(temp,{recursive:true,force:true});throw error;});
try {
  const page=await app.firstWindow();
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.waitForFunction(()=>document.hasFocus());
  for(const trigger of ['button','F11']) {
    const activate=async()=>{
      if(trigger==='F11')await app.evaluate(({BrowserWindow})=>{
        const contents=BrowserWindow.getAllWindows()[0]?.webContents;
        contents?.sendInputEvent({type:'keyDown',keyCode:'F11'});
        contents?.sendInputEvent({type:'keyUp',keyCode:'F11'});
      });
      else {await page.focus('#toggle');await page.keyboard.press('Space');}
    };
    await app.evaluate(({BrowserWindow})=>{
      Reflect.set(globalThis,'nativeEntered',false);
      BrowserWindow.getAllWindows()[0]?.once('enter-full-screen',()=>Reflect.set(globalThis,'nativeEntered',true));
    });
    await page.evaluate(()=>Reflect.set(window,'result','idle'));
    await activate();
    if(trigger==='button') {
      await page.waitForFunction(()=>['entered','denied','pending-timeout'].includes(Reflect.get(window,'result')));
      assert.equal(await page.evaluate(()=>Reflect.get(window,'result')),'entered');
    }
    await page.waitForFunction(()=>document.fullscreenElement===document.documentElement);
    await page.waitForFunction(()=>innerWidth===screen.width&&innerHeight===screen.height);
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isFullScreen()),true);
    await app.evaluate(async({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];
      if(window&&!Reflect.get(globalThis,'nativeEntered'))await new Promise<void>((resolve,reject)=>{window.once('enter-full-screen',()=>resolve());setTimeout(()=>reject(new Error('No native enter-full-screen event')),3000);});
    });
    await activate();
    await page.waitForFunction(()=>!document.fullscreenElement,null,{timeout:5000}).catch(async error=>{console.log('Exit state',await page.evaluate(()=>({result:Reflect.get(window,'result'),fullscreen:!!document.fullscreenElement,focus:document.hasFocus(),active:document.activeElement?.outerHTML})));throw error;});
    await app.evaluate(async({BrowserWindow})=>{
      const window=BrowserWindow.getAllWindows()[0];
      if(window?.isFullScreen())await new Promise<void>((resolve,reject)=>{window.once('leave-full-screen',()=>resolve());setTimeout(()=>reject(new Error('No native leave-full-screen event')),5000);});
    });
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isFullScreen()),false);
  }
  // macOS's green button/native menu can enter fullscreen without an HTML
  // fullscreen element. The shell shortcut must still offer an exit.
  await app.evaluate(async({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing native window');
    await new Promise<void>((resolve,reject)=>{window.once('enter-full-screen',()=>resolve());setTimeout(()=>reject(new Error('Native-only fullscreen entry timed out')),5000);window.setFullScreen(true);});
  });
  assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.webContents.sendInputEvent({type:'keyDown',keyCode:'F11'}));
  await app.evaluate(async({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(window?.isFullScreen())await new Promise<void>((resolve,reject)=>{window.once('leave-full-screen',()=>resolve());setTimeout(()=>reject(new Error('Native-only fullscreen exit timed out')),5000);});
  });
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]?.isFullScreen()),false);
  const frame=page.frames().find(frame=>frame.url().endsWith('/frame.html'));
  assert.ok(frame);
  await frame.click('#toggle');
  await frame.waitForFunction(()=>['denied','pending-timeout'].includes(Reflect.get(window,'result'))&&!document.fullscreenElement);
  for(const name of ['geolocation','notifications'] as const) {
    assert.equal(await page.evaluate(async name=>(await navigator.permissions.query({name})).state,name),'denied');
  }
  await app.evaluate(async({BrowserWindow},html)=>{
    await BrowserWindow.getAllWindows()[0]?.loadURL('data:text/html,'+encodeURIComponent(html));
  },fixture);
  await page.click('#toggle');
  await page.waitForFunction(()=>['denied','pending-timeout'].includes(Reflect.get(window,'result'))&&!document.fullscreenElement);
  await app.evaluate(async({BrowserWindow})=>{
    await BrowserWindow.getAllWindows()[0]?.loadURL('pokebonk://game/index.html');
  });
  // Restore the original policy only in this disposable test process.
  await app.evaluate(({session})=>{
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  });
  await page.click('#toggle');
  await page.waitForFunction(()=>['denied','pending-timeout'].includes(Reflect.get(window,'result'))&&!document.fullscreenElement);
  assert.deepEqual(errors,[]);
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/fullscreen.json',JSON.stringify({observedAt:new Date().toISOString(),electron:await app.evaluate(()=>process.versions.electron),platform:process.platform,arch:process.arch,cycles:2,buttonAndF11:true,nativeOnlyExit:true,domAndNativeFullscreen:true,screenDimensionsMatched:true,originalPolicyDenied:true,childFrameDenied:true,foreignOriginDenied:true,geolocationDenied:true,notificationsDenied:true},null,2));
  console.log('Fullscreen enter/exit, native state, and permission denial controls passed.');
} finally {
  try {
    await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});
    await app.close();
  } finally { await rm(temp,{recursive:true,force:true}); }
}

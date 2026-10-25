import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Exercise Chromium's real Pointer Lock boundary through the production shell.
const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-pointer-lock-'));
const fixture=`<button id="lock">Lock pointer</button><script>
window.result='idle';
document.addEventListener('pointerlockchange',()=>window.result=document.pointerLockElement?'locked':'released');
document.addEventListener('pointerlockerror',()=>window.result='denied');
document.querySelector('button').onclick=async()=>{
  try {
    try { await document.body.requestPointerLock({unadjustedMovement:true}); }
    catch(error) { if(error.name!=='NotSupportedError')throw error;await document.body.requestPointerLock(); }
  } catch { window.result='denied'; }
};
</script>`;
await writeFile(path.join(temp,'index.html'),fixture+'<iframe src="/frame.html"></iframe>');
await writeFile(path.join(temp,'frame.html'),fixture);
const args=['dist/desktop/main.js'];
if(process.env['CI']&&process.platform==='linux')args.push('--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader');
const app=await electron.launch({args,env:{...process.env,POKEBONK_GAME_DIR:temp,POKEBONK_USER_DATA_DIR:path.join(temp,'profile')}});
try {
  const page=await app.firstWindow();
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0]?.focus();});
  await page.waitForFunction(()=>document.hasFocus());
  await page.click('#lock');
  await page.waitForFunction(()=>Reflect.get(window,'result')!=='idle');
  const result=await page.evaluate(()=>Reflect.get(window,'result'));
  console.log('Pointer lock result:',result);
  assert.equal(result,'locked','The bundled game must be able to acquire real pointer lock');
  await page.evaluate(()=>document.exitPointerLock());
  await page.waitForFunction(()=>document.pointerLockElement===null);
  const frame=page.frames().find(frame=>frame.url().endsWith('/frame.html'));
  assert.ok(frame,'Expected same-origin child frame');
  await frame.click('#lock');
  await frame.waitForFunction(()=>Reflect.get(window,'result')==='denied');
  for(const name of ['geolocation','notifications'] as const) {
    assert.equal(await page.evaluate(async name=>(await navigator.permissions.query({name})).state,name),'denied');
  }
  await app.evaluate(async({BrowserWindow},html)=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing probe window');
    await window.loadURL('data:text/html,'+encodeURIComponent(html));
  },fixture);
  await page.click('#lock');
  await page.waitForFunction(()=>Reflect.get(window,'result')==='denied');
  await app.evaluate(async({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows()[0];
    if(!window)throw new Error('Missing probe window');
    await window.loadURL('pokebonk://game/index.html');
  });
  // A control using the original policy must reproduce the denial.
  await app.evaluate(({session})=>{
    session.defaultSession.setPermissionCheckHandler(()=>false);
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  });
  await page.evaluate(()=>Reflect.set(window,'result','idle'));
  await page.click('#lock');
  await page.waitForFunction(()=>Reflect.get(window,'result')==='denied');
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/pointer-lock.json',JSON.stringify({observedAt:new Date().toISOString(),electron:await app.evaluate(()=>process.versions.electron),platform:process.platform,arch:process.arch,acquired:true,released:true,originalPolicyDenied:true,childFrameDenied:true,foreignOriginDenied:true,geolocationDenied:true,notificationsDenied:true},null,2));
  console.log('Pointer lock acquire/release and original-policy denial control passed.');
} finally {
  await app.close();
  await rm(temp,{recursive:true,force:true});
}

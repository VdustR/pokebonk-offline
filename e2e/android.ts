import {parseMetadata} from '../types/metadata.ts';
import {_android as android} from 'playwright-core';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {checkGame} from './game-checks.ts';
const serial=process.argv[2];
if(!serial)throw new Error('Usage: node e2e/android.ts <adb serial>');
const adb=(...args:string[])=>execFileSync('adb',['-s',serial,...args],{encoding:'utf8'}).trim();
const packageName='dev.vdustr.pokebonk.offline';
const meta=parseMetadata(JSON.parse(await readFile('build/game/offline-build.json','utf8')));
adb('shell','am','force-stop',packageName);
adb('shell','am','start','-W','-n',packageName+'/.MainActivity');
let device;
try {
  device=(await android.devices()).find(device=>device.serial()===serial);
  if(!device)throw new Error('Requested Android device is unavailable');
  const webview=await device.webView({pkg:packageName},{timeout:60000});
  const page=await webview.page();
  const missing:{url:string;status:number}[]=[],errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
  await mkdir('evidence',{recursive:true});
  await checkGame(page,meta,'android',{gameplay:process.env['ANDROID_FULL_GAMEPLAY']==='1'});
  // Menu automation uses mouse input; restore real touch mode before measuring.
  const physicalWidth=await page.evaluate(()=>screen.width*devicePixelRatio);
  adb('shell','input','tap',String(Math.round(physicalWidth/2)),'2');
  await page.waitForFunction(()=>document.documentElement.classList.contains('touch'));
  const viewport=await page.evaluate(()=>({content:document.querySelector<HTMLMetaElement>('meta[name=viewport]')?.content ?? '',width:innerWidth,height:innerHeight,scale:visualViewport?.scale}));
  const declaredWidth=Number(viewport.content.match(/(?:^|, )width=(\d+)/)?.[1]);
  if(declaredWidth)assert.ok(Math.abs(viewport.width-declaredWidth)<=2,'WebView must honor the responsive viewport width');
  await writeFile('evidence/android-viewport.json',JSON.stringify(viewport,null,2));
  await writeFile('evidence/android-touch.png',execFileSync('adb',['-s',serial,'exec-out','screencap','-p'],{maxBuffer:32*1024*1024}));
  assert.deepEqual(missing,[]);assert.deepEqual(errors,[]);
  await writeFile('evidence/android-errors.json',JSON.stringify({missing,errors},null,2));
  console.log('Android WebView unlocks, assets and persistence passed.');
} finally {if(device)await device.close();adb('shell','am','force-stop',packageName);}

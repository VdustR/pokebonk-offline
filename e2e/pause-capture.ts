import type {Page} from 'playwright-core';

// This function runs in the renderer; keep its dependencies inside the function.
function captureSnapshot(eligibleOnly:boolean) {
  const app=window.__pokebonkLocalApp,run=app?.run;
  const read=(target:unknown,key:string):unknown=>typeof target==='object'&&target!==null?Reflect.get(target,key):null;
  const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
  const input:unknown=read(app,'input'),from:unknown=read(run,'resumedFrom');
  const snapshot={
    now:performance.now(),pointer:document.pointerLockElement?.tagName??null,state:run?.state??null,
    locked:read(input,'locked')===true,lockedAt:number(read(input,'lockedAt')),unlockAt:number(read(input,'unlockAt')),
    resumedAt:number(read(run,'resumedAt')),resumedFrom:typeof from==='string'?from:null,
  };
  // DOM capture can precede the game's pointerlockchange consumer. Its last
  // recorded transition must be acquisition before its clock can establish age.
  const eligible=snapshot.pointer==='CANVAS'&&snapshot.state==='play'&&snapshot.locked
    &&snapshot.lockedAt!==null&&snapshot.unlockAt!==null&&snapshot.lockedAt>snapshot.unlockAt
    &&snapshot.now-snapshot.lockedAt>=700
    &&snapshot.resumedAt!==null&&snapshot.now-snapshot.resumedAt>=(snapshot.resumedFrom==='modal'?1500:800);
  return eligibleOnly&&!eligible?false:{...snapshot,eligible};
}

export async function waitForPauseEligibleCapture(page:Page):Promise<void> {
  const result=await page.waitForFunction(captureSnapshot,true);
  await result.dispose();
}

export async function readGameCapture(page:Page) {
  const snapshot=await page.evaluate(captureSnapshot,false);
  if(snapshot===false)throw new Error('Game capture snapshot was unexpectedly withheld');
  return snapshot;
}

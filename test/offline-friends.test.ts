import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchOfflineFriends} from '../scripts/offline-friends.ts';

const fixture=`function friendsRoute(app,back=()=>home(app)){
if(app.meta.account.guest){screen(app,'fr',translate('Amigos'),'guest',back,[],dom('div',{class:'panel cl-guest'},icon('friends',96),dom('h2',{},'guest')));return;}
app.backend.friends();dom('div',{class:'fr-list'});screen(app,'fr',translate('Amigos'),'online',back,[],dom('button',{},'Add friend'));
}`;
function run(source:string,kind:string,language:string|null){
  let calls=0;const screens:unknown[][]=[];let returned=false;
  vm.runInNewContext(source+';friendsRoute(app,back);',{
    app:{backend:{kind,friends(){calls++;}},meta:{account:{guest:false}}},
    localStorage:{getItem(){return language;}},
    screen(...args:unknown[]){screens.push(args);},
    translate:(text:string)=>text,dom:(...args:unknown[])=>args,icon:()=>null,
    renamedScreen(...args:unknown[]){screens.push(args);},renamedDom:(...args:unknown[])=>args,renamedIcon:()=>null,
    back(){returned=true;},
  });
  const back=screens[0]?.[4];if(typeof back==='function')back();
  return {calls,rendered:JSON.stringify(screens),screenCount:screens.length,returned};
}
test('offline friends explains the local boundary without calling social APIs',()=>{
  for(const source of [fixture,fixture.replaceAll('screen','renamedScreen').replaceAll('dom','renamedDom').replaceAll('icon','renamedIcon')]){
    const patched=patchOfflineFriends(source);
    assert.equal(run(patched,'local','zht').calls,0);
    assert.match(run(patched,'local','zht').rendered,/好友功能僅適用線上版/);
  }
  const patched=patchOfflineFriends(fixture);
  const local=run(patched,'local','zht');
  assert.equal(local.calls,0);assert.equal(local.screenCount,1);
  const rendered=local.rendered;
  assert.match(rendered,/好友功能僅適用線上版/);assert.match(rendered,/進度仍保留/);
  assert.doesNotMatch(rendered,/Add friend|undefined|fr-list/);
  assert.match(run(patched,'local','__proto__').rendered,/Friends are available/);
  assert.match(run(patched,'local',null).rendered,/Los amigos/);
  assert.deepEqual(run(patched,'http','zht'),run(fixture,'http','zht'));
  assert.equal(local.returned,true);
  const failing=patchOfflineFriends(fixture.replace('app.backend.friends();',"throw new Error('social failure');app.backend.friends();"));
  assert.throws(()=>run(failing,'http','en'),/social failure/);
  assert.equal(run(failing,'local','en').calls,0);
});
test('unknown or ambiguous friends routes fail closed',()=>{
  assert.throws(()=>patchOfflineFriends('function nothing(){}'),/friends route/);
  assert.throws(()=>patchOfflineFriends(fixture+fixture.replaceAll('friendsRoute','duplicate')),/friends route/);
  assert.throws(()=>patchOfflineFriends(fixture.replace("icon('friends',96)","icon('friends',48)")),/friends icon helper/);
});

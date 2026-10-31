import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

import type {SandboxBackend} from '../types/backend.d.ts';
import type {Profile} from '../types/profile.d.ts';
import {record} from '../types/data.ts';

const template = await readFile('dist/runtime/local-backend.js', 'utf8');
function backend(storage = new Map<string,string>()): SandboxBackend {
  const defaults = () => ({ settings:{audio:1},league:[],unlocked:[],seen:[],forms:[],shinies:[],classics:[],research:{},lab:{},biomes:{},bag:{},cosmetics:[],itemsOff:[],quests:{},counters:{},runs:[],stardust:0 });
  const context = { structuredClone,crypto:webcrypto,Date,document:{title:''},
    localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},
    __PROFILE__:defaults,__SEASON__:()=>({season:2}),__ROSTER__:[{id:4},{id:150}],__REGISTRY__:{pokemon:[{id:4},{id:5},{id:150}],get:(id:number)=>({family:id}),root:(id:number)=>({id})},
    __TREASURES__:[{id:'fire',starter:4,prizes:[{id:'candy',cosmetics:[]},{id:'grand',cosmetics:['tlook:4:4','frame:tr-fire-2']}]},{id:'water',starter:7,prizes:[{id:'look',cosmetics:['tlook:7:3']}]}],__LAB__:[{id:'move',max:4}],__ITEMS__:[{key:'soda-pop'}],__BIOMES__:[{id:'forest',size:100},{id:'future'}],__EVENTS__:[],__MEDALS__:4,__REFRESH__:(profile:Profile)=>{for(const period of ['daily','weekly'] as const)profile[period]??={ids:['task1','task2','task3'],prog:[],claimed:[]};},__TASK__:()=>({goal:3}),__QUESTS__:[{id:"kills100",title:"Veteran"},{id:"look4",look:{member:4,n:1}}],__SCORE__:()=>0,__COSMETICS__:['frame:master'],__PREPARATIONS__:['rare-candy','honey'] };
  const value: unknown = new vm.Script(template+'\n;createLocalSandboxBackend()').runInNewContext(context);
  const api=record(value);
  for (const method of ['loadProfile','savePrefs','chooseStarter','startRun','finishRun']) assert.equal(typeof api[method],'function');
  // The VM executes the compiled implementation, which implements this contract.
  // Runtime assertions above plus the behavior tests below cover the realm boundary.
  return value as SandboxBackend;
}
test('new profile unlocks catalogs and reload preserves preferences and starter',async()=>{
  const storage=new Map<string,string>(), b=backend(storage);
  const p=await b.loadProfile();
  assert.equal(p.medals['forest-2'],4);assert.equal(p.medals['future-0'],undefined);assert.equal(p.daily.prog[0],3);assert.equal(p.daily.claimed.join(','),'1,1,1,1');assert.equal(p.weekly.claimed.join(','),'1,1,1,1');
  assert.deepEqual(JSON.parse(JSON.stringify(p.treasures)),{fire:{won:['candy','grand']},water:{won:['look']}});
  assert.equal(p.wins[4],7);assert.equal(p.wins[150],7);
  assert.equal(p.stardust,1e9);assert.equal(p.league.length,2);assert.equal(p.lab['move'],4);assert.equal(p.itemsOwned[0],'soda-pop');
  p.settings['audio']=0;await b.savePrefs(null,p);await b.chooseStarter(null,150);
  const reload=await backend(storage).loadProfile();assert.equal(reload.lastSpecies,150);assert.equal(reload.settings['audio'],0);
});
test('finished runs persist counters and finite rewards without external fetch',async()=>{
  const b=backend();await b.loadProfile();const ticket=await b.startRun(null,{boosts:[]});
  const result=await b.finishRun(null,ticket,{victory:true,kills:7,progress:{counters:{kills:7},seen:[5]}});
  assert.equal(result.profile.counters['kills'],7);assert.equal(result.profile.counters['wins'],1);assert.equal(result.profile.runs.length,1);assert.equal(result.stardust,0);
  const unavailable: unknown = Reflect.get(b, 'signIn');
  assert.equal(typeof unavailable, 'function');
  if (typeof unavailable !== 'function') throw new Error('Expected fallback method');
  await assert.rejects(unavailable(),/online feature/);
});
test('corrupt saves fail visibly instead of silently replacing progress',async()=>{
  await assert.rejects(backend(new Map([['pokebonk.local.profile.v1','invalid-json']])).loadProfile(),/JSON/);
});

test('existing saves receive every achievement and cosmetic without fabricating run counters',async()=>{
  const storage=new Map([['pokebonk.local.profile.v1',JSON.stringify({lastSpecies:4,quests:{old:1},counters:{kills:7,wins:1},settings:{audio:0},runs:[{id:'real-run'}],cosmetics:['frame:custom']})]]);
  const b=backend(storage),p=await b.loadProfile();
  assert.equal(p.quests['kills100'],1);assert.equal(p.quests['look4'],1);assert.equal(p.quests['old'],1);
  assert.ok(p.cosmetics.includes('title:q:kills100'));assert.ok(p.cosmetics.includes('look:4:1'));assert.ok(p.cosmetics.includes('frame:custom'));
  assert.equal(p.counters['kills'],7);assert.equal(p.counters['wins'],1);assert.equal(p.runs[0]?.id,'real-run');assert.equal(p.lastSpecies,4);assert.equal(p.settings['audio'],0);
  await b.savePrefs(null,p);const reloaded=await backend(storage).loadProfile();
  assert.equal(reloaded.quests['look4'],1);assert.equal(reloaded.cosmetics.filter(x=>x==='look:4:1').length,1);assert.equal(reloaded.counters['kills'],7);
});

test('structurally invalid saves reject without overwriting stored progress',async()=>{
  for(const profile of [{counters:{kills:'seven'}},{settings:[]},{runs:[{id:42}]},{treasures:{fire:{won:[42]}}},{treasures:{fire:[]}},{wins:{4:'all'}},{wins:{4:-1}},{wins:{4:1.5}},{wins:{4:2147483648}}]) {
    const saved=JSON.stringify(profile),storage=new Map([['pokebonk.local.profile.v1',saved]]);
    await assert.rejects(backend(storage).loadProfile(),/Invalid local profile/);
    assert.equal(storage.get('pokebonk.local.profile.v1'),saved);
  }
});

test('unrecognized upstream fields and equipped looks survive normalization',async()=>{
  const storage=new Map([['pokebonk.local.profile.v1',JSON.stringify({futureField:{keep:true},settings:{quality:'low'},look:'spectral'})]]);
  const p=await backend(storage).loadProfile();
  assert.deepEqual(p['futureField'],{keep:true});assert.equal(p['look'],'spectral');
  assert.equal(p.settings['quality'],'low');
});

test('treasure completion grants every prize once and preserves existing profile data',async()=>{
  const saved={treasures:{fire:{won:['old-prize'],future:42},future:{won:['future-prize']}},cosmetics:['frame:custom'],counters:{wins:2},runs:[{id:'real-run'}],bonk:17,settings:{audio:0},lastSpecies:150,look:'classic'};
  const storage=new Map([['pokebonk.local.profile.v1',JSON.stringify(saved)]]),b=backend(storage);
  const p=await b.loadProfile();
  assert.deepEqual(p['treasures'],{fire:{won:['old-prize','candy','grand'],future:42},future:{won:['future-prize']},water:{won:['look']}});
  assert.ok(p.cosmetics.includes('tlook:4:4'));assert.ok(p.cosmetics.includes('frame:tr-fire-2'));assert.ok(p.cosmetics.includes('tlook:7:3'));
  assert.equal(p.cosmetics.filter(id=>id==='tlook:4:4').length,1);
  for(const key of ['counters','runs','bonk','lastSpecies','look'] as const)assert.deepEqual(p[key],saved[key]);
  const before=JSON.parse(JSON.stringify(p));await b.savePrefs(null,p);
  assert.deepEqual(JSON.parse(JSON.stringify(await backend(storage).loadProfile())),before);
});

test('all roster members have every victory mark without changing actual run records',async()=>{
  const original={wins:{4:1,150:4,999:8},counters:{wins:2,kills:7},runs:[{id:'real-run',species:150,victory:true,tier:2}],best:{'forest-0':123},times:{'forest-0':456},settings:{audio:0},lastSpecies:150};
  const storage=new Map([['pokebonk.local.profile.v1',JSON.stringify(original)]]),b=backend(storage);
  const p=await b.loadProfile();
  assert.deepEqual(p['wins'],{4:7,150:7,999:8});
  for(const key of ['counters','runs','best','times','lastSpecies'] as const)assert.deepEqual(p[key],original[key]);
  await b.savePrefs(null,p);
  const reloaded=await backend(storage).loadProfile();assert.deepEqual(reloaded['wins'],{4:7,150:7,999:8});
  assert.equal(reloaded.counters['wins'],2);assert.equal(reloaded.runs.length,1);
});

test('victory completion preserves additional existing bits',async()=>{
  const storage=new Map([['pokebonk.local.profile.v1',JSON.stringify({wins:{4:8}})]]);
  assert.equal((await backend(storage).loadProfile()).wins[4],15);
});

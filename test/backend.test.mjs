import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const template = await readFile('runtime/local-backend.js', 'utf8');
function backend(storage = new Map()) {
  const defaults = () => ({ settings:{audio:1},league:[],unlocked:[],seen:[],forms:[],shinies:[],classics:[],research:{},lab:{},biomes:{},bag:{},cosmetics:[],itemsOff:[],quests:{},counters:{},runs:[],stardust:0 });
  const context = { structuredClone,crypto:webcrypto,Date,document:{title:''},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    __PROFILE__:defaults,__SEASON__:()=>({season:2}),__ROSTER__:[{id:4},{id:150}],__REGISTRY__:{pokemon:[{id:4},{id:5},{id:150}],get:id=>({family:id}),root:id=>({id})},
    __LAB__:[{id:'move',max:4}],__ITEMS__:[{key:'soda-pop'}],__BIOMES__:[{id:'forest'}],__EVENTS__:[],__SCORE__:()=>0,__COSMETICS__:['frame:master'],__PREPARATIONS__:['rare-candy','honey'] };
  return new vm.Script(template+'\n;createLocalSandboxBackend()').runInNewContext(context);
}
test('new profile unlocks catalogs and reload preserves preferences and starter',async()=>{
  const storage=new Map(), b=backend(storage);
  const p=await b.loadProfile();
  assert.equal(p.stardust,1e9);assert.equal(p.league.length,2);assert.equal(p.lab.move,4);assert.equal(p.itemsOwned[0],'soda-pop');
  p.settings.audio=0;await b.savePrefs(null,p);await b.chooseStarter(null,150);
  const reload=await backend(storage).loadProfile();assert.equal(reload.lastSpecies,150);assert.equal(reload.settings.audio,0);
});
test('finished runs persist counters and finite rewards without external fetch',async()=>{
  const b=backend();await b.loadProfile();const ticket=await b.startRun(null,{boosts:[]});
  const result=await b.finishRun(null,ticket,{victory:true,kills:7,progress:{counters:{kills:7},seen:[5]}});
  assert.equal(result.profile.counters.kills,7);assert.equal(result.profile.counters.wins,1);assert.equal(result.profile.runs.length,1);assert.equal(result.stardust,0);
  await assert.rejects(b.signIn(),/online feature/);
});
test('corrupt saves fail visibly instead of silently replacing progress',async()=>{
  await assert.rejects(backend(new Map([['pokebonk.local.profile.v1','invalid-json']])).loadProfile(),/JSON/);
});

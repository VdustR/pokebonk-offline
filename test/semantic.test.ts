import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {ast,nodesOf,maybeName} from '../scripts/source.ts';
import { patchGame } from '../scripts/patch-game.ts';

const config = `
const rosterSymbol=[{id:4,start:true,kit:[],passive:'flame'}];
const labSymbol=[{id:'slot-move',max:1,cost:()=>1}];
const shopSymbol=[{key:'soda-pop',price:1}];
const biomeSymbol=[{id:'forest',size:10}];
const seasonSymbol={maxDex:151,season:2};
const versionsSymbol={'data/pokemon.json':'a',models:'b',pmd:'c'};
const rankSymbol=[{id:'champion',name:'Champion',icon:'champion'}];
const questSymbol=[{id:'k100',counter:'kills',goal:100,reward:50}];
const preparationSymbol=[{id:'rare-candy',desc:'Preparation'}];
const scoreSymbol=r=>r.kills+r.time+(r.victory?1:0);
const assetSymbol=e=>\`./assets/\${e}\`;
const dataSymbol=e=>\`./data/\${e}\`;
function wardrobeSymbol(p,m,look,x){switch(look){case 'shiny':case 'spectral':case 'classic':case 'm1':case 'm2':return false;}}
export {questSymbol as questExport,rosterSymbol as rosterExport,labSymbol as labExport,shopSymbol as shopExport,biomeSymbol as biomeExport,scoreSymbol as scoreExport};`;
const main = `
import {questExport as questAlias,rosterExport as rosterAlias,labExport as labAlias,shopExport as shopAlias,biomeExport as biomeAlias,scoreExport as scoreAlias} from './config.js';
const registrySymbol=new class{pokemon=[];movesByKey=new Map;};
function profileSymbol(){return {stardust:0,lab:{},league:[],lastSpecies:4,settings:{}};}
function backendSymbol(){return new Http('https://api.pokebonk.com');}
class Http{season(){return this.info??seasonFunction(Date.now());}}
function refreshSymbol(p,now){for(const period of ['daily','weekly'])p[period]={idx:now,ids:['task1','task2','task3'],prog:[0,0,0],claimed:[0,0,0,0]};}
function taskSymbol(id){return {goal:3};}
function progressSymbol(p,q){return p.counters[q.counter]??0;}
class Application{boot(){}tasksReady(){refreshSymbol(this.profile,Date.now());}task(period,index){return taskSymbol(this.profile[period].ids[index]);}claimable(){return questAlias.filter(q=>!this.profile.quests[q.id]).length;}questProgress(q){return progressSymbol(this.profile,q);}}
await new Application().boot();`;

test('semantic patches survive renamed upstream identifiers',()=>{
  const rename = (source:string) => source.replace(/\b\w*(?:Symbol|Alias|Export)\b/g, (name:string)=>'renamed_'+name);
  const result=patchGame(rename(main),rename(config),'const catalogs=[__ROSTER__,__LAB__,__ITEMS__,__BIOMES__];const profile=__PROFILE__;const score=__SCORE__;');
  assert.match(result.main,/p\.localSandbox&&p\.quests\[q\.id\]\)return q\.goal/);
  assert.match(result.main,/const catalogs=\[renamed_rosterAlias/);
  assert.match(result.main,/window\.__pokebonkLocalApp=new Application/);
  assert.match(result.config,/p\.localSandbox&&p\.league\.includes\(m\)/);
  assert.match(result.config,/document\.baseURI/);
});
test('missing wardrobe cases reject the complete patch',()=>{
  assert.throws(()=>patchGame(main,config.replace("case 'm2':",''),''),/wardrobe eligibility/);
});

test('incompatible achievement catalogs fail closed',()=>{
  assert.throws(()=>patchGame(main,config.replace("counter:'kills',goal:100", "counter:'kills',goal:NaN"),''),/achievement catalog/);
});

test('period changes grant local task rewards while ordinary profiles keep progression',()=>{
  const patched=patchGame(main,config,'').main;
  const functions=nodesOf(ast(patched),'FunctionDeclaration',n=>['refreshSymbol','taskSymbol'].includes(maybeName(n.id) ?? '')).map(n=>patched.slice(n.start,n.end)).join('\n');
  for(const localSandbox of [false,true]) {
    const p: {localSandbox:boolean;daily?:{idx:number;prog:number[]};weekly?:{claimed:number[]}}={localSandbox};
    new vm.Script(functions+';refreshSymbol(p,42);').runInNewContext({p});
    assert.equal(p.daily?.idx,42);assert.equal(p.daily?.prog.join(','),localSandbox?'3,3,3':'0,0,0');
    assert.equal(p.weekly?.claimed.join(','),localSandbox?'1,1,1,1':'0,0,0,0');
  }
});

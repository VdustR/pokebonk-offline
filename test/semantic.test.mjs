import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchGame } from '../scripts/patch-game.mjs';

const config = `
const rosterSymbol=[{id:4,start:true,kit:[],passive:'flame'}];
const labSymbol=[{id:'slot-move',max:1,cost:()=>1}];
const shopSymbol=[{key:'soda-pop',price:1}];
const biomeSymbol=[{id:'forest',size:10}];
const seasonSymbol={maxDex:151,season:2};
const versionsSymbol={'data/pokemon.json':'a',models:'b',pmd:'c'};
const preparationSymbol=[{id:'rare-candy',desc:'Preparation'}];
const scoreSymbol=r=>r.kills+r.time+(r.victory?1:0);
const assetSymbol=e=>\`./assets/\${e}\`;
const dataSymbol=e=>\`./data/\${e}\`;
function wardrobeSymbol(p,m,look,x){switch(look){case 'shiny':case 'spectral':case 'classic':case 'm1':case 'm2':return false;}}
export {rosterSymbol as rosterExport,labSymbol as labExport,shopSymbol as shopExport,biomeSymbol as biomeExport,scoreSymbol as scoreExport};`;
const main = `
import {rosterExport as rosterAlias,labExport as labAlias,shopExport as shopAlias,biomeExport as biomeAlias,scoreExport as scoreAlias} from './config.js';
const registrySymbol=new class{pokemon=[];movesByKey=new Map;};
function profileSymbol(){return {stardust:0,lab:{},league:[],lastSpecies:4,settings:{}};}
function backendSymbol(){return new Http('https://api.pokebonk.com');}
class Http{season(){return this.info??seasonFunction(Date.now());}}
class Application{boot(){}}
await new Application().boot();`;

test('semantic patches survive renamed upstream identifiers',()=>{
  const rename = source => source.replace(/\b\w*(?:Symbol|Alias|Export)\b/g, name=>'renamed_'+name);
  const result=patchGame(rename(main),rename(config),'const catalogs=[__ROSTER__,__LAB__,__ITEMS__,__BIOMES__];const profile=__PROFILE__;const score=__SCORE__;');
  assert.match(result.main,/const catalogs=\[renamed_rosterAlias/);
  assert.match(result.main,/window\.__pokebonkLocalApp=new Application/);
  assert.match(result.config,/p\.localSandbox&&p\.league\.includes\(m\)/);
  assert.match(result.config,/document\.baseURI/);
});
test('missing wardrobe cases reject the complete patch',()=>{
  assert.throws(()=>patchGame(main,config.replace("case 'm2':",''),''),/wardrobe eligibility/);
});

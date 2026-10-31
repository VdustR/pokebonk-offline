import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectTreasureCatalog,treasureAssetPaths} from '../scripts/treasure-catalog.ts';
const catalog="const renamed=[{id:'fire',starter:4,prizes:[{id:'grand',cosmetics:['tlook:4:4','frame:tr-fire-2']}]},{id:'new-wheel',starter:7,prizes:[{id:'bag',cosmetics:[]}]}];";
test('treasure catalog resolves every prize, cosmetic and background independent of bindings',()=>{
  assert.deepEqual(treasureAssetPaths(catalog),['assets/ui/treasures/bg-fire.png','assets/ui/treasures/bg-new-wheel.png']);
  assert.deepEqual(inspectTreasureCatalog(catalog)[0],{id:'fire',starter:4,prizes:[{id:'grand',cosmetics:['tlook:4:4','frame:tr-fire-2']}]});
});
test('unsafe, ambiguous, duplicate and empty treasure catalogs reject',()=>{
  for(const invalid of [catalog+catalog,catalog.replace("id:'fire'","id:'../fire'"),catalog.replace("id:'new-wheel'","id:'fire'"),catalog.replace('starter:4','starter:0'),catalog.replace("'tlook:4:4'","'tlook:../../file'"),catalog.replace("[{id:'bag',cosmetics:[]}]","[]"),catalog.replace("[{id:'bag',cosmetics:[]}]","[{id:'bag',cosmetics:[]},{id:'bag',cosmetics:[]}]")])assert.throws(()=>inspectTreasureCatalog(invalid));
});

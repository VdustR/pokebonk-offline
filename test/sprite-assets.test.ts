import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPreloadedSprites} from '../scripts/sprite-assets.ts';

const main='this.sprites.preload([92,249,250].filter(id=>registry.get(id)&&registry.hasAnimated(id)));';
const sprites={92:{anims:{}},249:{anims:{}},250:{fallback:'front/250.png'}};
test('scene preload sprites include animated species beyond the playable generation',()=>{
  assert.deepEqual(inspectPreloadedSprites(main,sprites),['assets/pmd/249.png','assets/pmd/92.png']);
  const source=main.replace('92,249,250','92,249,250,251').replaceAll('id','renamed');
  assert.deepEqual(inspectPreloadedSprites(source,{...sprites,251:{anims:{}}}),['assets/pmd/249.png','assets/pmd/251.png','assets/pmd/92.png']);
});
test('dynamic gameplay preloads stay with their existing species collector',()=>{
  assert.deepEqual(inspectPreloadedSprites('this.sprites.preload(this.director.everyone());',sprites),[]);
});
test('malformed finite sprite preload ids fail before building paths',()=>{
  for(const ids of ['92,249,249','92,-1','92,1.5','92,"../249"','92,unknown']) {
    assert.throws(()=>inspectPreloadedSprites(main.replace('92,249,250',ids),sprites),/sprite preload/);
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectAnimatedSprites} from '../scripts/sprite-assets.ts';

const sprites={92:{anims:{}},249:{anims:{}},250:{fallback:'front/250.png'}};
test('all animated catalog entries are collected without playable limits or scene references',()=>{
  assert.deepEqual(inspectAnimatedSprites(sprites),['assets/pmd/249.png','assets/pmd/92.png']);
  assert.deepEqual(inspectAnimatedSprites({...sprites,1026:{anims:{walk:{}}}}),[
    'assets/pmd/1026.png','assets/pmd/249.png','assets/pmd/92.png',
  ]);
});
test('fallback-only entries do not require nonexistent animated sheets',()=>{
  assert.deepEqual(inspectAnimatedSprites({1:{anims:{}},2:{fallback:'front/2.png'},3:{anims:null}}),['assets/pmd/1.png']);
});
test('empty, unsafe, noncanonical or malformed sprite catalogs reject',()=>{
  for(const data of [null,[],{}, {1:{fallback:'front/1.png'}}, {'../249':{anims:{}}}, {'01':{anims:{}}},
    {'1.5':{anims:{}}},{'-1':{anims:{}}},{'9007199254740992':{anims:{}}},{1:null},{1:{anims:true}}]) {
    assert.throws(()=>inspectAnimatedSprites(data),/sprite catalog/);
  }
});

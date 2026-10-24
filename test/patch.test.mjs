import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ast, edits, one } from '../scripts/source.mjs';
import { inspectGame } from '../scripts/patch-game.mjs';
test('unknown upstream fails closed before generating a package',()=>{
  assert.throws(()=>inspectGame('export {};','export {};'),/Unsupported upstream/);
});
test('source edits reject overlap and invalid JavaScript',()=>{
  assert.throws(()=>edits('let a=1;',[{start:0,end:5,text:''},{start:4,end:7,text:''}]),/Overlapping/);
  assert.throws(()=>edits('let a=1;',[{start:0,end:8,text:'let = ;'}]));
  assert.throws(()=>one([1,2],'ambiguous'),/expected one/);
  assert.equal(ast('const renamed = 2;').body.length,1);
});

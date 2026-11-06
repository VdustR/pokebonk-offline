import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSnapshot} from '../scripts/upstream-snapshot.ts';
import {readResourceContract,assertRequiredResources} from '../scripts/resource-contract.ts';

test('expedition stamp icons are bundled and required independently of the manifest',async()=>{
  const icon='assets/ui/icons/exp-seal.png';
  const {files}=await readSnapshot();
  const bytes=files.get(icon);
  assert.ok(bytes,'The stamp counter and every track milestone need the expedition seal image');
  assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  const contract=await readResourceContract();
  const omitted=new Set(files.keys());omitted.delete(icon);
  assert.throws(()=>assertRequiredResources(omitted,contract),/Missing required resource: assets\/ui\/icons\/exp-seal.png/);
});

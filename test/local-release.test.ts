import {test} from 'node:test';
import assert from 'node:assert/strict';
import {androidVersionCode,assertAndroidUpgrade,assertArtifacts,assertPublishSource,findRelease,parseReceipt,releaseFiles} from '../scripts/local-release-policy.ts';
import {parseProvenance} from '../types/release.ts';
const info=parseProvenance({upstreamVersion:'0.9.24',offlineVersion:'0.0.26',upstreamBuild:'current',builder:'a'.repeat(40),sourceDigest:'b'.repeat(64),variant:'unlock-all'});
const artifacts=releaseFiles(info).map(name=>({name,bytes:10,sha256:'c'.repeat(64)}));
test('release discovery finds an unfinished draft beyond the first page',()=>{
  const draft={id:123,tag_name:info.tag,draft:true,body:'retained provenance',assets:[]};
  const pages:Record<string,unknown>={
    'releases?per_page=100&page=1':Array.from({length:100},(_,index)=>({tag_name:`older-${index}`,draft:false})),
    'releases?per_page=100&page=2':[draft],
  };
  assert.deepEqual(findRelease(info.tag,endpoint=>pages[endpoint]),draft);
  assert.deepEqual(findRelease(info.tag,()=>[{...draft,draft:false}]),{...draft,draft:false});
});
test('release discovery distinguishes an absent tag from API and malformed-response failures',()=>{
  assert.equal(findRelease(info.tag,()=>[{tag_name:'other',draft:true}]),undefined);
  const failure=new Error('GitHub authentication failed');
  assert.throws(()=>findRelease(info.tag,()=>{throw failure;}),error=>error===failure);
  assert.throws(()=>findRelease(info.tag,()=>({message:'Not Found'})));
  assert.throws(()=>findRelease(info.tag,()=>[{draft:true}]));
});
test('publication rejects an uncommitted or different source revision',()=>{
  assertPublishSource(info.builder,info.builder,'');
  assert.throws(()=>assertPublishSource(info.builder,'d'.repeat(40),''));
  assert.throws(()=>assertPublishSource(info.builder,info.builder,' M desktop/main.ts'));
  assert.throws(()=>assertPublishSource(info.builder,info.builder,'?? scripts/untracked.ts'));
});
test('Android source versioning rejects repeats, downgrades, incomplete counts and overflow',()=>{
  assert.equal(androidVersionCode(123),1000123);
  assertAndroidUpgrade(androidVersionCode(124),androidVersionCode(123));
  for(const count of [0,-1,1.1,NaN,Infinity,2099000001])assert.throws(()=>androidVersionCode(count));
  for(const previous of [1000124,1000125,NaN,0])assert.throws(()=>assertAndroidUpgrade(1000124,previous));
});
test('release acceptance rejects missing, duplicate, extra and modified downloads',()=>{
  assertArtifacts(artifacts,[...artifacts].reverse(),info);
  assert.throws(()=>assertArtifacts(artifacts,artifacts.slice(1),info));
  assert.throws(()=>assertArtifacts(artifacts,[...artifacts,{name:'extra.zip',bytes:10,sha256:'c'.repeat(64)}],info));
  const first=artifacts[0];assert.ok(first);
  assert.throws(()=>assertArtifacts(artifacts,[first,...artifacts.slice(0,-1)],info));
  assert.throws(()=>assertArtifacts(artifacts,[{...first,sha256:'d'.repeat(64)},...artifacts.slice(1)],info));
  assert.throws(()=>assertArtifacts(artifacts,[{...first,bytes:11},...artifacts.slice(1)],info));
});
test('unverified receipts and unsafe artifact paths cannot authorize publication',()=>{
  const receipt={info,validated:true,androidVersionCode:1000123,artifacts};
  assert.deepEqual(parseReceipt(receipt),{info,androidVersionCode:1000123,artifacts});
  assert.throws(()=>parseReceipt({...receipt,validated:false}));
  assert.throws(()=>parseReceipt({...receipt,artifacts:[{name:'../secret',bytes:1,sha256:'c'.repeat(64)},...artifacts.slice(1)]}));
  assert.throws(()=>parseReceipt({...receipt,artifacts:[...artifacts,{name:'extra',bytes:1,sha256:'c'.repeat(64)}]}));
});

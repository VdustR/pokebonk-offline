import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createSnapshotManifest,parseSnapshotManifest,readSnapshot,writeSnapshot,promoteSnapshot} from '../scripts/upstream-snapshot.ts';

const files=(build='fixture')=>new Map([['index.html',Buffer.from(`<meta name="pokebonk-build" content="${build}">`)],['assets/1.png',Buffer.from('image bytes')]]);
test('snapshot bytes round-trip and promotion binds the exact validated digest',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-snapshot-'));
  try {
    const source=path.join(root,'source'),destination=path.join(root,'destination');
    const manifest=await writeSnapshot(source,files(),'fixture','0.8.78');
    const loaded=await readSnapshot(source);assert.deepEqual(loaded.files,files());
    await promoteSnapshot(source,destination,manifest.digest);
    assert.deepEqual(await readSnapshot(destination),loaded);
    await assert.rejects(promoteSnapshot(source,destination,'0'.repeat(64)),/Unexpected upstream snapshot digest/);
    await writeFile(path.join(source,'game/assets/1.png'),'corrupt');
    await assert.rejects(promoteSnapshot(source,destination,manifest.digest),/Snapshot integrity mismatch/);
    assert.deepEqual(await readSnapshot(destination),loaded,'Rejected updates preserve the accepted snapshot');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('malformed identities, duplicate paths and traversal reject before creating a keyed inventory',()=>{
  const manifest=createSnapshotManifest(files(),'fixture','0.8.78');
  const rehash=(body:Record<string,unknown>)=>({...body,digest:createHash('sha256').update(JSON.stringify(body)).digest('hex')});
  const {digest:_,...body}=manifest;
  assert.throws(()=>parseSnapshotManifest({...manifest,digest:'0'.repeat(64)}),/digest mismatch/);
  assert.throws(()=>parseSnapshotManifest(rehash({...body,files:[...body.files,body.files[0]]})),/Duplicate snapshot path/);
  for(const name of ['../secret.js','/secret.js','.git/config.js','assets/../secret.js']) {
    assert.throws(()=>parseSnapshotManifest(rehash({...body,files:[{name,bytes:0,sha256:'a'.repeat(64)}]})),/snapshot path/);
  }
  assert.throws(()=>createSnapshotManifest(files(),'bad\nidentity','0.8.78'));
});
test('symlinks and mismatched HTML cannot replace a valid snapshot',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-snapshot-boundary-'));
  try {
    const source=path.join(root,'source'),destination=path.join(root,'destination');
    await writeSnapshot(source,files(),'fixture','0.8.78');await writeSnapshot(destination,files(),'fixture','0.8.78');
    const previous=await readFile(path.join(destination,'snapshot.json'));
    await rm(path.join(source,'game/assets/1.png'));await symlink(path.join(destination,'game/assets/1.png'),path.join(source,'game/assets/1.png'));
    await assert.rejects(readSnapshot(source),/snapshot file boundary/);
    await assert.rejects(writeSnapshot(destination,files('other'),'fixture','0.8.78'),/HTML build mismatch/);
    assert.deepEqual(await readFile(path.join(destination,'snapshot.json')),previous);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Git preserves upstream bytes even when automatic CRLF conversion is enabled',()=>{
  const input=Buffer.from('first\r\nsecond\r\n');
  const raw=execFileSync('git',['hash-object','--stdin'],{input,encoding:'utf8'});
  const attributed=execFileSync('git',['-c','core.autocrlf=true','hash-object','--path','vendor/pokebonk/game/probe.js','--stdin'],{input,encoding:'utf8'});
  assert.equal(attributed,raw);
});

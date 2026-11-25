import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,access,symlink} from 'node:fs/promises';
import {hostname} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {preparationKey,runReleaseStages,withReleaseLock} from '../scripts/release-stages.ts';
import {record,list} from '../types/data.ts';

async function fixture(run:(root:string)=>Promise<void>) {
  await mkdir('cache',{recursive:true});const root=await mkdtemp('cache/stage-test-');
  try{await run(root);}finally{await rm(root,{recursive:true,force:true});}
}
const key=preparationKey({source:'committed-tree',node:'26',sdk:'36'});
test('late failure resumes prior verified outputs and preserves failure timings',()=>fixture(async root=>{
  const counts=[0,0,0],stages=['desktop','android','native'].map((id,index)=>({id,outputs:[path.join(root,id)],run:async()=>{counts[index]=(counts[index]??0)+1;if(id==='native'&&counts[index]===1)throw Error('paused');await writeFile(path.join(root,id),id);}}));
  const options={work:path.join(root,'work'),identity:key,stages,checkInputs:()=>{},report:()=>{}};
  await assert.rejects(runReleaseStages(options),/paused/);assert.deepEqual(counts,[1,1,1]);
  const failed=record(JSON.parse(await readFile(path.join(root,'work/stages.json'),'utf8')));assert.equal(list(failed['completed'],record).length,2);
  await runReleaseStages(options);assert.deepEqual(counts,[1,1,2]);
  const resumed=record(JSON.parse(await readFile(path.join(root,'work/stages.json'),'utf8')));assert.ok(list(resumed['attempts'],record).some(entry=>entry['status']==='failed'));
  await runReleaseStages(options);assert.deepEqual(counts,[1,1,2]);
}));
test('changed or missing products invalidate their stage and every downstream proof',()=>fixture(async root=>{
  const calls:string[]=[],stages=['checks','payload','native'].map(id=>({id,outputs:[path.join(root,id)],run:async()=>{calls.push(id);await writeFile(path.join(root,id),id);}}));
  const options={work:path.join(root,'work'),identity:key,stages,checkInputs:()=>{},report:()=>{}};await runReleaseStages(options);calls.length=0;
  await writeFile(path.join(root,'payload'),'tampered');await runReleaseStages(options);assert.deepEqual(calls,['payload','native']);calls.length=0;
  await rm(path.join(root,'native'));await runReleaseStages(options);assert.deepEqual(calls,['native']);calls.length=0;
  await runReleaseStages({...options,identity:preparationKey({source:'new-tree',node:'26',sdk:'36'})});assert.deepEqual(calls,['checks','payload','native']);
}));
test('input changes and missing outputs cannot create a completed stage',()=>fixture(async root=>{
  let checks=0;
  const options={work:path.join(root,'work'),identity:key,report:()=>{},checkInputs:()=>{if(++checks===2)throw Error('source changed');},stages:[{id:'build',outputs:[path.join(root,'product')],run:()=>writeFile(path.join(root,'product'),'data')}]};
  await assert.rejects(runReleaseStages(options),/source changed/);
  const journal=record(JSON.parse(await readFile(path.join(root,'work/stages.json'),'utf8')));assert.deepEqual(journal['completed'],[]);
  await assert.rejects(runReleaseStages({...options,checkInputs:()=>{},stages:[{id:'missing',outputs:[path.join(root,'absent')],run:()=>{}}]}),/ENOENT/);
}));
test('malformed checkpoints and untrusted product paths fail before executing work',()=>fixture(async root=>{
  const work=path.join(root,'work');await mkdir(work);let called=false;
  const options={work,identity:key,stages:[{id:'build',outputs:[path.join(root,'product')],run:()=>{called=true;}}],checkInputs:()=>{},report:()=>{}};
  await writeFile(path.join(work,'stages.json'),'{');await assert.rejects(runReleaseStages(options),SyntaxError);
  await writeFile(path.join(work,'stages.json'),JSON.stringify({schemaVersion:1,identity:key,completed:[{id:'build',products:[{path:'../secret',bytes:1,sha256:'a'.repeat(64)}]}],attempts:[]}));
  await assert.rejects(runReleaseStages(options),/Unsafe release product path/);assert.equal(called,false);
  await rm(path.join(work,'stages.json'));await assert.rejects(runReleaseStages({...options,stages:[{id:'build',outputs:['/absolute'],run:()=>{called=true;}}]}),/Unsafe/);
}));
test('product hashing rejects symlinks instead of trusting an external target',()=>fixture(async root=>{
  const target=path.join(root,'target'),link=path.join(root,'link');await writeFile(target,'outside');
  await assert.rejects(runReleaseStages({work:path.join(root,'work'),identity:key,checkInputs:()=>{},report:()=>{},stages:[{id:'link',outputs:[link],run:()=>symlink('target',link)}]}),/symlink/i);
}));
test('single writer lock refuses live owners and recovers only an exited local owner',()=>fixture(async root=>{
  let enter:()=>void=()=>{},finish:()=>void=()=>{};
  const entered=new Promise<void>(resolve=>{enter=resolve;}),hold=new Promise<void>(resolve=>{finish=resolve;});
  const first=withReleaseLock(root,async()=>{enter();await hold;});await entered;
  await assert.rejects(withReleaseLock(root,async()=>{throw Error('stole lock');}),/already running/);finish();await first;
  await assert.rejects(access(path.join(root,'prepare.lock')));
  const dead=spawnSync(process.execPath,['-e','']);assert.equal(dead.status,0);assert.ok(dead.pid);
  await mkdir(path.join(root,'prepare.lock'));await writeFile(path.join(root,'prepare.lock',`${dead.pid}-abcdef.json`),JSON.stringify({pid:dead.pid,host:hostname()}));
  assert.equal(await withReleaseLock(root,async()=>42),42);
  await mkdir(path.join(root,'prepare.lock'));await writeFile(path.join(root,'prepare.lock','1-abcdef.json'),JSON.stringify({pid:1,host:'another-host'}));
  await assert.rejects(withReleaseLock(root,async()=>0),/Unknown release lock owner/);
}));
test('preparation identity is order independent and changes with effective inputs',()=>{
  assert.equal(preparationKey({source:'a',tool:'b'}),preparationKey({tool:'b',source:'a'}));
  assert.notEqual(preparationKey({source:'a',tool:'b'}),preparationKey({source:'a',tool:'c'}));
});

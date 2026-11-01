import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {record,text} from '../types/data.ts';

const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-links-repro-'));
try {
  const original=execFileSync('git',['show','eecd77637707abbe759a06c3d226f05d03544aa4:desktop/main.ts'],{encoding:'utf8'});
  const baseline=path.join(temp,'baseline.mjs');
  await writeFile(baseline,stripTypeScriptTypes(original));
  const runs=[];
  for(const [label,entry,expected] of [
    ['original',baseline,1],['fixed',path.resolve('dist/desktop/main.js'),0],['original-again',baseline,1],
  ] as const) {
    const result=spawnSync(process.execPath,['e2e/external-links.ts',entry],{encoding:'utf8',timeout:60000});
    const output=result.stdout+result.stderr;
    assert.equal(result.status,expected,`${label}: ${output}`);
    if(expected===1)assert.match(output,/AssertionError[\s\S]*https:\/\/example.com\/help/);
    runs.push({label,status:result.status,output});
    console.log(`${label}: expected exit ${expected}, observed ${result.status}`);
  }
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/external-links-repro.json',JSON.stringify({observedAt:new Date().toISOString(),baseline:'eecd77637707abbe759a06c3d226f05d03544aa4',electron:text(record(JSON.parse(await readFile('node_modules/electron/package.json','utf8')))['version']),platform:process.platform,arch:process.arch,runs},null,2));
} finally { await rm(temp,{recursive:true,force:true}); }

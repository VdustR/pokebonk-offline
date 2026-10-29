import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {record} from '../types/data.ts';

await mkdir('cache/type-probes',{recursive:true});
const directory=await mkdtemp(path.resolve('cache/type-probes/run-'));
const results: {project:string;phase:string;success:boolean;milliseconds:number;output:string}[]=[];
function check(project:string,phase:string,expected:boolean) {
  const start=performance.now();
  let success=true,output='';
  try {output=execFileSync(process.execPath,['node_modules/typescript/lib/tsc.js','-p',path.join(directory,project+'.json'),'--pretty','false','--extendedDiagnostics'],{encoding:'utf8',stdio:'pipe'});}
  catch(error){success=false;output=String(record(error)['stdout']);}
  results.push({project,phase,success,milliseconds:performance.now()-start,output});
  if(success!==expected)throw new Error(`${project} ${phase}: expected success=${expected}\n${output}`);
  if(!expected&&!/error TS\d+/.test(output))throw new Error('Probe failed without a compiler diagnostic');
}
try {
  for(const project of ['node','desktop','runtime','e2e']) {
    const fixture=path.join(directory,`${project}.ts`);
    const imported=path.join(directory,`${project}-dependency.ts`);
    const global=path.join(directory,`${project}-global.d.ts`);
    const config=path.join(directory,`${project}.json`);
    const valid=`import {value} from './${project}-dependency.ts';\nexport const local:number=value;\nexport const shared:number=probeGlobal;\n`;
    const options={extends:path.resolve(`tsconfig.${project}.json`),include:[fixture,global,path.resolve('types/reset.d.ts')]};
    await writeFile(imported,'export const value:number=1;');
    await writeFile(global,'declare const probeGlobal:number;');
    await writeFile(fixture,valid);
    await writeFile(config,JSON.stringify(options));
    check(project,'cold',true);check(project,'warm',true);
    await writeFile(fixture,valid+'export const bad:number="invalid";');
    check(project,'source-error',false);check(project,'source-error-warm',false);
    await writeFile(fixture,valid);check(project,'source-restored',true);
    // Imported dependency is outside this consumer's include list.
    await writeFile(imported,'export const value:string="changed";');
    check(project,'dependency-error',false);check(project,'dependency-error-warm',false);
    await writeFile(imported,'export const value:number=1;');check(project,'dependency-restored',true);
    await writeFile(global,'declare const probeGlobal:string;');
    check(project,'global-error',false);check(project,'global-error-warm',false);
    await writeFile(global,'declare const probeGlobal:number;');check(project,'global-restored',true);
    await writeFile(config,JSON.stringify({...options,compilerOptions:{types:[],lib:['ES2023']}}));
    await writeFile(fixture,valid+'export const title=document.title;');
    check(project,'config-error',false);check(project,'config-error-warm',false);
    await writeFile(fixture,valid);await writeFile(config,JSON.stringify(options));
    check(project,'restored',true);check(project,'unchanged',true);
  }
  const orphan=path.resolve('type-coverage-probe.ts');
  // Exclusive creation ensures cleanup never removes a pre-existing file.
  await writeFile(orphan,'export const uncovered=1;',{flag:'wx'});
  try {
    let output='';
    try {execFileSync(process.execPath,['scripts/verify-types.ts'],{encoding:'utf8',stdio:'pipe'});}
    catch(error){output=String(record(error)['stderr']);}
    if(!output.includes('Uncovered source or environment: type-coverage-probe.ts'))throw new Error('Coverage gate accepted an orphan source');
  } finally {await rm(orphan);}
  const unlisted=path.resolve('vendor/pokebonk/game/type-coverage-probe.js');
  await writeFile(unlisted,'globalThis.unchecked=true;',{flag:'wx'});
  try {
    let output='';
    try {execFileSync(process.execPath,['scripts/verify-types.ts'],{encoding:'utf8',stdio:'pipe'});}
    catch(error){output=String(record(error)['stderr']);}
    if(!output.includes('Unmigrated authored JavaScript: vendor/pokebonk/game/type-coverage-probe.js'))throw new Error('Coverage gate accepted unlisted vendor JavaScript');
  } finally {await rm(unlisted);}
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/types-cache.json',JSON.stringify({compiler:execFileSync(process.execPath,['node_modules/typescript/lib/tsc.js','--version'],{encoding:'utf8'}).trim(),results},null,2));
  console.log(`Passed ${results.length} cold/repeated/source/dependency/global/config compiler probes (incremental disabled) and orphan/unlisted-vendor rejection.`);
} finally {await rm(directory,{recursive:true,force:true});}

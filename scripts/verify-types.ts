import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {record} from '../types/data.ts';

const root=process.cwd();
const projects=['node','desktop','runtime','e2e'] as const;
const owned=new Map<string,Set<string>>();
const strictFlags=['strict','noUncheckedIndexedAccess','exactOptionalPropertyTypes','noImplicitReturns','noImplicitOverride','noFallthroughCasesInSwitch','noUnusedLocals','noUnusedParameters','noPropertyAccessFromIndexSignature','isolatedModules','erasableSyntaxOnly','verbatimModuleSyntax','noEmit'];
const compiler=(args:string[])=>execFileSync(process.execPath,['node_modules/typescript/lib/tsc.js',...args],{encoding:'utf8'});
for(const project of projects) {
  const config=`tsconfig.${project}.json`;
  const options=record(record(JSON.parse(compiler(['-p',config,'--showConfig'])))['compilerOptions']);
  for(const flag of strictFlags)if(options[flag]!==true)throw new Error(`${config}: ${flag} must be true`);
  for(const flag of ['allowUnusedLabels','allowUnreachableCode','skipLibCheck','incremental'])if(options[flag]!==false)throw new Error(`${config}: ${flag} must be false`);
  const inputs=new Set(compiler(['-p',config,'--listFilesOnly']).trim().split(/\r?\n/).map(file=>path.resolve(file)));
  if(!inputs.has(path.join(root,'types/reset.d.ts')))throw new Error(`${config}: missing app reset`);
  if(project==='node'&&[...inputs].some(file=>file.endsWith('/lib.dom.d.ts')))throw new Error('DOM leaked into Node tools');
  if(project==='runtime'&&[...inputs].some(file=>file.includes('/@types/node/')||file.includes('/electron/')))throw new Error('Node/Electron leaked into browser runtime');
  owned.set(project,inputs);
}
// Git inventories tracked and new files, including hidden directories, while
// honoring generated/vendor exclusions in .gitignore. Deleted files are absent.
const inventory=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
let count=0;
for(const relative of new Set(inventory)) {
  if(!/\.(?:[cm]?[jt]sx?)$/.test(relative))continue;
  try {await readFile(relative);}catch(error){if(record(error)['code']==='ENOENT')continue;throw error;}
  if(/\.(?:[cm]?jsx?)$/.test(relative))throw new Error(`Unmigrated authored JavaScript: ${relative}`);
  const full=path.resolve(relative);
  const environments=relative.startsWith('type-tests/')?[path.basename(relative,'.ts')]:relative.startsWith('types/')?null:
    relative.startsWith('scripts/')||relative.startsWith('test/')?['node']:
    projects.filter(project=>relative.startsWith(project+'/'));
  const owners=environments??projects.filter(project=>owned.get(project)?.has(full));
  if(owners.length===0||owners.some(project=>!owned.get(project)?.has(full)))throw new Error(`Uncovered source or environment: ${relative}`);
  count++;
  const source=await readFile(relative,'utf8');
  if(/@ts-(?:nocheck|ignore)\b|(?:[:<,|&]\s*|as\s+)any\b/.test(source))throw new Error(`Unchecked source escape: ${relative}`);
}
console.log(`Verified ${count} maintained TypeScript/declaration inputs across ${projects.length} environments; generated build/cache/dist/Android assets are excluded by Git.`);

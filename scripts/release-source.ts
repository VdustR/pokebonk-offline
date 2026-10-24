import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {record} from '../types/data.ts';
import {version} from '../types/release.ts';

export function packagedSource(file:string) {
  return /^(desktop|runtime|scripts|types)\//.test(file)||/^android\//.test(file)
    ||/^\.github\/workflows\//.test(file)||['package.json','pnpm-lock.yaml','LICENSE'].includes(file);
}
export function fingerprint(entries:readonly {name:string;bytes:Uint8Array}[]) {
  const hash=createHash('sha256');
  for(const entry of [...entries].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0))hash.update(entry.name+'\0'+entry.bytes.length+'\0').update(entry.bytes);
  return hash.digest('hex');
}
export async function sourceDigest() {
  const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const files=[...new Set(names)].filter(packagedSource);
  return fingerprint(await Promise.all(files.map(async name=>({name,bytes:await readFile(name)}))));
}
export async function offlineVersion() {
  const pending=(await readdir('.changeset')).filter(name=>name.endsWith('.md')&&name!=='README.md');
  if(pending.length)throw new Error('Version pending changesets with pnpm version:release before building a release');
  return version(record(JSON.parse(await readFile('package.json','utf8')))['version']);
}

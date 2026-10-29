import {createHash,randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rename,rm,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {record,text,finite,list,isRecord} from '../types/data.ts';
import {buildId,version} from '../types/release.ts';

export const snapshotDirectory='vendor/pokebonk';
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
const safeName=(value:unknown)=>{
  const name=text(value,'snapshot path');
  if(!/^[\w/-][\w./-]*\.(?:html|js|css|json|png|jpg|svg|webp|ico|webmanifest|woff2?|glb|ogg)$/.test(name)
    ||name.startsWith('/')||name.split('/').some(part=>!part||part.startsWith('.')))throw new Error('Invalid snapshot path');
  return name;
};

export function parseSnapshotManifest(value:unknown) {
  const input=record(value,'upstream snapshot');
  if(input['schemaVersion']!==1||input['origin']!=='https://pokebonk.com')throw new Error('Unsupported upstream snapshot');
  const names=new Set<string>();let total=0;
  const files=list(input['files'],value=>{
    const entry=record(value,'snapshot file'),name=safeName(entry['name']);
    const bytes=finite(entry['bytes'],'snapshot bytes'),sha256=text(entry['sha256'],'snapshot hash');
    if(names.has(name))throw new Error(`Duplicate snapshot path: ${name}`);
    if(!Number.isSafeInteger(bytes)||bytes<0||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid snapshot file');
    names.add(name);total+=bytes;
    return {name,bytes,sha256};
  });
  if(!names.has('index.html')||total>1024*1024*1024)throw new Error('Incomplete or oversized upstream snapshot');
  const missingCandidates=list(input['missingCandidates'],safeName);
  if(new Set(missingCandidates).size!==missingCandidates.length)throw new Error('Duplicate missing snapshot candidate');
  const body={schemaVersion:1,origin:'https://pokebonk.com',upstreamBuild:buildId(input['upstreamBuild']),
    upstreamVersion:version(input['upstreamVersion']),files,missingCandidates};
  const digest=text(input['digest'],'snapshot digest');
  if(digest!==sha(JSON.stringify(body)))throw new Error('Snapshot manifest digest mismatch');
  return {...body,digest};
}

export function createSnapshotManifest(files:ReadonlyMap<string,Buffer>,upstreamBuild:string,upstreamVersion:string,missing:readonly string[]=[]) {
  const entries=[...files].map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  const body={schemaVersion:1,origin:'https://pokebonk.com',upstreamBuild,upstreamVersion,files:entries,missingCandidates:[...new Set(missing)].sort()};
  return parseSnapshotManifest({...body,digest:sha(JSON.stringify(body))});
}

export async function readSnapshotManifest(root=snapshotDirectory) {
  const file=path.join(root,'snapshot.json');
  if(!(await lstat(root)).isDirectory()||!(await lstat(file)).isFile())throw new Error('Invalid snapshot metadata boundary');
  return parseSnapshotManifest(JSON.parse(await readFile(file,'utf8')));
}

export async function readSnapshot(root=snapshotDirectory,expectedDigest?:string) {
  const manifest=await readSnapshotManifest(root);
  if(expectedDigest!==undefined&&manifest.digest!==expectedDigest)throw new Error('Unexpected upstream snapshot digest');
  const gamePath=path.join(root,'game');
  if(!(await lstat(gamePath)).isDirectory())throw new Error('Invalid snapshot game boundary');
  const game=await realpath(gamePath);
  const files=new Map<string,Buffer>();
  for(const entry of manifest.files) {
    const file=path.join(game,entry.name),resolved=await realpath(file);
    if(!resolved.startsWith(game+path.sep)||!(await lstat(file)).isFile())throw new Error(`Invalid snapshot file boundary: ${entry.name}`);
    const bytes=await readFile(file);
    if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw new Error(`Snapshot integrity mismatch: ${entry.name}`);
    files.set(entry.name,bytes);
  }
  const html=files.get('index.html')?.toString();
  if(html?.match(/name="pokebonk-build" content="([\w-]+)"/)?.[1]!==manifest.upstreamBuild)throw new Error('Snapshot HTML build mismatch');
  return {manifest,files};
}

export async function writeSnapshot(destination:string,files:ReadonlyMap<string,Buffer>,build:string,upstreamVersion:string,missing:readonly string[]=[]) {
  const manifest=createSnapshotManifest(files,build,upstreamVersion,missing);
  const parent=path.dirname(path.resolve(destination));await mkdir(parent,{recursive:true});
  const staging=await mkdtemp(path.join(parent,'.upstream-snapshot-'));
  const backup=path.join(parent,'.upstream-previous-'+randomUUID());
  let previous=false;
  try {
    for(const [name,bytes] of files) {
      const file=path.join(staging,'game',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
    }
    await writeFile(path.join(staging,'snapshot.json'),JSON.stringify(manifest,null,2)+'\n');
    await readSnapshot(staging);
    try {await lstat(destination);previous=true;}catch(error){if(!isRecord(error)||error['code']!=='ENOENT')throw error;}
    // Only replace a directory already owned by the snapshot protocol.
    if(previous){await readSnapshotManifest(destination);await rename(destination,backup);}
    try {await rename(staging,destination);}catch(error){if(previous)await rename(backup,destination);throw error;}
    if(previous)await rm(backup,{recursive:true,force:true});
    return manifest;
  } finally {await rm(staging,{recursive:true,force:true});}
}

export async function promoteSnapshot(source:string,destination:string,expectedDigest:string) {
  if(!/^[a-f0-9]{64}$/.test(expectedDigest))throw new Error('Supply a validated snapshot digest');
  const {manifest,files}=await readSnapshot(source,expectedDigest);
  return writeSnapshot(destination,files,manifest.upstreamBuild,manifest.upstreamVersion,manifest.missingCandidates);
}

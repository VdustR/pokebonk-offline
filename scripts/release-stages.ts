import {createHash,randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
import path from 'node:path';
import {mkdir,readFile,writeFile,rename,readdir,lstat,unlink,rmdir} from 'node:fs/promises';
import {errorCode,finite,list,record,text} from '../types/data.ts';

const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export function preparationKey(inputs:Record<string,string>) {
  return digest(JSON.stringify(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b,'en'))));
}
function relative(value:unknown) {
  const name=text(value);
  if(!name||path.isAbsolute(name)||name.split(/[\\/]/).includes('..')||path.normalize(name)!==name)throw new Error('Unsafe release product path');
  return name;
}
function hash(value:unknown) {
  const result=text(value);if(!/^[a-f0-9]{64}$/.test(result))throw new Error('Invalid preparation digest');return result;
}
function product(value:unknown) {
  const raw=record(value),bytes=finite(raw['bytes']);
  if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Invalid release product size');
  return {path:relative(raw['path']),bytes,sha256:hash(raw['sha256'])};
}
async function inspectProduct(name:string) {
  const checksum=createHash('sha256');let bytes=0;
  async function visit(file:string,entry:string) {
    const stat=await lstat(file);checksum.update(entry+'\0');
    if(stat.isSymbolicLink()) {
      throw new Error('Symlink in release product');
    } else if(stat.isDirectory()) {
      checksum.update('directory\0');for(const child of (await readdir(file)).sort())await visit(path.join(file,child),path.posix.join(entry,child));
    } else if(stat.isFile()) {const data=await readFile(file);checksum.update('file\0').update(data);bytes+=data.length;}
    else throw new Error('Unsupported release product type');
  }
  await visit(name,'');return {path:name,bytes,sha256:checksum.digest('hex')};
}
type Product=ReturnType<typeof product>;
type Completed={id:string;products:Product[]};
export interface ReleaseStage {id:string;outputs:readonly string[];run:()=>void|Promise<void>}
interface Attempt {id:string;status:'passed'|'reused'|'failed';started:string;durationMs:number;error?:string}
interface Journal {schemaVersion:1;identity:string;completed:Completed[];attempts:Attempt[]}

export async function runReleaseStages(options:{work:string;identity:string;stages:readonly ReleaseStage[];checkInputs:()=>void|Promise<void>;report?:(message:string)=>void}) {
  const {work,stages,checkInputs}=options,identity=hash(options.identity),report=options.report??console.log;
  if(new Set(stages.map(stage=>stage.id)).size!==stages.length||stages.some(stage=>! /^[a-z][a-z0-9-]*$/.test(stage.id)||new Set(stage.outputs).size!==stage.outputs.length))throw new Error('Invalid release stage plan');
  for(const stage of stages)for(const output of stage.outputs)relative(output);
  await mkdir(work,{recursive:true});const file=path.join(work,'stages.json');
  let journal:Journal={schemaVersion:1,identity,completed:[],attempts:[]};
  let saved:unknown;
  try {saved=JSON.parse(await readFile(file,'utf8'));}catch(error){if(errorCode(error)!=='ENOENT')throw error;}
  if(saved!==undefined) {
    const raw=record(saved,'preparation journal');
    if(raw['schemaVersion']!==1)throw new Error('Unsupported preparation journal');
    const previous=hash(raw['identity']);
    const completed=list(raw['completed'],value=>{const entry=record(value);return {id:text(entry['id']),products:list(entry['products'],product)};});
    if(new Set(completed.map(entry=>entry.id)).size!==completed.length)throw new Error('Duplicate completed stage');
    if(previous===identity) {
      journal.completed=completed;
      journal.attempts=list(raw['attempts'],(value):Attempt=>{
        const entry=record(value),status=text(entry['status']),durationMs=finite(entry['durationMs']);
        if(!['passed','reused','failed'].includes(status)||durationMs<0)throw new Error('Invalid stage attempt');
        const parsedStatus=status==='passed'?'passed':status==='reused'?'reused':'failed';
        return {id:text(entry['id']),status:parsedStatus,started:text(entry['started']),durationMs,...(entry['error']===undefined?{}:{error:text(entry['error'])})};
      }).slice(-1000);
    } else await writeFile(path.join(work,`stages-history-${randomUUID()}.json`),JSON.stringify(raw,null,2)+'\n');
  }
  const persist=async()=>{
    const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(journal,null,2)+'\n');await rename(temp,file);
  };
  await persist();
  for(let index=0;index<stages.length;index++) {
    const stage=stages[index];if(!stage)throw new Error('Missing release stage');
    await checkInputs();const started=new Date().toISOString(),clock=performance.now();
    const existing=journal.completed[index];let reusable=existing?.id===stage.id&&JSON.stringify(existing.products.map(value=>value.path))===JSON.stringify(stage.outputs);
    if(reusable&&existing)for(const expected of existing.products) {
      let actual:Product|undefined;try{actual=await inspectProduct(expected.path);}catch(error){if(errorCode(error)!=='ENOENT')throw error;}
      if(JSON.stringify(actual)!==JSON.stringify(expected)){reusable=false;break;}
    }
    if(reusable) {
      const durationMs=Math.round(performance.now()-clock);journal.attempts.push({id:stage.id,status:'reused',started,durationMs});report(`[${stage.id}] reused (${durationMs} ms)`);await persist();continue;
    }
    // A changed product invalidates every later proof, even if rebuilding happens
    // to reproduce the earlier bytes. Persist invalidation before any work starts.
    journal.completed=journal.completed.slice(0,index);await persist();report(`[${stage.id}] started`);
    try {
      await stage.run();await checkInputs();
      const products:Product[]=[];for(const name of stage.outputs)products.push(await inspectProduct(name));
      journal.completed.push({id:stage.id,products});const durationMs=Math.round(performance.now()-clock);
      journal.attempts.push({id:stage.id,status:'passed',started,durationMs});await persist();report(`[${stage.id}] passed (${durationMs} ms)`);
    } catch(error) {
      const durationMs=Math.round(performance.now()-clock);journal.attempts.push({id:stage.id,status:'failed',started,durationMs,error:String(error)});await persist();report(`[${stage.id}] failed (${durationMs} ms)`);throw error;
    }
  }
  return journal;
}

export async function withReleaseLock<T>(work:string,action:()=>Promise<T>):Promise<T> {
  await mkdir(work,{recursive:true});const lock=path.join(work,'prepare.lock'),owner=`${process.pid}-${randomUUID()}.json`;
  for(;;) {
    try {await mkdir(lock);break;}catch(error){if(errorCode(error)!=='EEXIST')throw error;}
    const entries=await readdir(lock);
    if(entries.length!==1||!/^\d+-[a-f0-9-]+\.json$/.test(entries[0]??''))throw new Error(`Incomplete release lock; inspect ${lock}`);
    const entry=entries[0];if(!entry)throw new Error('Missing release lock owner');
    const raw=record(JSON.parse(await readFile(path.join(lock,entry),'utf8'))),pid=finite(raw['pid']);
    if(text(raw['host'])!==hostname()||!Number.isSafeInteger(pid)||pid<1||!entry.startsWith(`${pid}-`))throw new Error(`Unknown release lock owner: ${lock}`);
    try {process.kill(pid,0);throw new Error(`Release preparation already running (PID ${pid})`);}catch(error){if(errorCode(error)!=='ESRCH')throw error;}
    // Remove only the observed dead owner's unique file. A competing recovery
    // cannot remove a newly acquired owner's file or its nonempty directory.
    try {await unlink(path.join(lock,entry));await rmdir(lock);}catch(error){if(errorCode(error)!=='ENOENT'&&errorCode(error)!=='ENOTEMPTY')throw error;}
  }
  const ownerFile=path.join(lock,owner);await writeFile(ownerFile,JSON.stringify({pid:process.pid,host:hostname()}),{flag:'wx'});
  try {return await action();}finally {await unlink(ownerFile);await rmdir(lock);}
}

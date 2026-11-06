import {execFileSync} from 'node:child_process';
import {finite,list,record,text} from '../types/data.ts';
import {buildId,version} from '../types/release.ts';
import {upstreamChanged} from './upstream-plan.ts';
import type {UpstreamIdentity} from './upstream-plan.ts';
export type VersionIssue={number:number;body:string;state:'open'|'closed';author:string;pullRequest:boolean};
export type IssueStore={get:(number:number)=>VersionIssue;list:()=>VersionIssue[];create:(title:string,body:string)=>VersionIssue;update:(number:number,body:string,state:'open'|'closed')=>VersionIssue};
const start='<!-- pokebonk-upstream-update:start -->',end='<!-- pokebonk-upstream-update:end -->';
function repositoryName(value:unknown) {
  const name=text(value,'GitHub repository');
  if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9_.-]+$/i.test(name)||['.','..'].includes(name.split('/')[1]??''))throw new Error('Invalid GitHub repository');
  return name;
}
function identity(value:UpstreamIdentity) {return {upstreamVersion:version(value.upstreamVersion),upstreamBuild:buildId(value.upstreamBuild)};}
function managedBody(repository:string,current:UpstreamIdentity,remote:UpstreamIdentity,changed:boolean) {
  return `${start}\n## Upstream version status\n\n${changed?'Update available.':'Up to date.'}\n\nAccepted snapshot: **${current.upstreamVersion}** (\`${current.upstreamBuild}\`).\nDetected upstream: **${remote.upstreamVersion}** (\`${remote.upstreamBuild}\`).\n\n[Official game](https://pokebonk.com/) · [Resource review](https://github.com/${repository}/blob/main/docs/resource-completeness.md)\n\n${changed?'Review the upstream resources, capture the verified snapshot, and pass native and platform checks before publication.':'The accepted snapshot matches the official build.'}\nThis check reports versions; it does not acquire, promote, or publish game files.\n${end}`;
}
function replaceManaged(body:string,replacement:string) {
  if(body.split(start).length!==2||body.split(end).length!==2)throw new Error('Malformed upstream update tracker markers');
  const a=body.indexOf(start),b=body.indexOf(end);
  if(b<a)throw new Error('Malformed upstream update tracker marker order');
  return body.slice(0,a)+replacement+body.slice(b+end.length);
}
export function reconcileVersionIssue(repository:string,accepted:UpstreamIdentity,detected:UpstreamIdentity,store:IssueStore,pinnedIssue?:number) {
  const repo=repositoryName(repository),current=identity(accepted),remote=identity(detected);
  const changed=upstreamChanged(current,remote),owner=repo.split('/')[0]?.toLowerCase();
  const owned=(issue:VersionIssue)=>!issue.pullRequest&&(issue.author.toLowerCase()===owner||issue.author==='github-actions[bot]')
    &&(issue.body.includes(start)||issue.body.includes(end));
  if(pinnedIssue!==undefined&&(!Number.isSafeInteger(pinnedIssue)||pinnedIssue<1))throw new Error('Invalid pinned upstream update issue');
  const pinned=pinnedIssue===undefined?undefined:store.get(pinnedIssue);
  if(pinned&&(!owned(pinned)||pinned.number!==pinnedIssue))throw new Error('Pinned upstream update issue is not an owned tracker');
  const candidates=pinned?[pinned]:store.list().filter(owned);
  if(candidates.length>1)throw new Error('Ambiguous upstream update trackers; reconcile existing issues before retrying');
  const existing=candidates[0],body=managedBody(repo,current,remote,changed);
  if(!existing) {
    if(!changed)return {action:'current' as const};
    // Do not retry a creation whose response was lost. The next serialized run
    // enumerates existing issues before deciding whether creation is necessary.
    return {action:'created' as const,issue:store.create('PokéBonk upstream update tracker',body).number};
  }
  const updated=replaceManaged(existing.body,body),state=changed?'open':'closed';
  if(existing.body===updated&&existing.state===state)return {action:'unchanged' as const,issue:existing.number};
  store.update(existing.number,updated,state);
  return {action:changed?'updated' as const:'closed' as const,issue:existing.number};
}

type IssueRequest=(method:'GET'|'POST'|'PATCH',endpoint:string,payload?:Record<string,unknown>)=>unknown;
function githubRequest(method:'GET'|'POST'|'PATCH',endpoint:string,payload?:Record<string,unknown>):unknown {
  const output=execFileSync('gh',['api','--hostname','github.com','--method',method,'-H','X-GitHub-Api-Version: 2022-11-28',endpoint,...payload?['--input','-']:[]],{
    encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000,maxBuffer:8*1024*1024,...payload?{input:JSON.stringify(payload)}:{},
  });
  return JSON.parse(output);
}
function parseIssue(value:unknown):VersionIssue {
  const raw=record(value,'GitHub issue'),number=finite(raw['number'],'issue number'),state=raw['state'];
  if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid GitHub issue number');
  if(state!=='open'&&state!=='closed')throw new Error('Invalid GitHub issue state');
  return {number,state,body:raw['body']===null?'':text(raw['body'],'issue body'),author:text(record(raw['user'])['login'],'issue author'),pullRequest:raw['pull_request']!==undefined};
}
export function githubVersionIssues(repository:string,request:IssueRequest=githubRequest):IssueStore {
  const root=`repos/${repositoryName(repository)}/issues`;
  return {
    get:number=>{
      if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid GitHub issue number');
      return parseIssue(request('GET',`${root}/${number}`));
    },
    list:()=>{
      const issues:VersionIssue[]=[];
      for(let page=1;;page++) {
        const part=list(request('GET',`${root}?state=all&sort=created&direction=asc&per_page=100&page=${page}`),parseIssue,'GitHub issue page');
        issues.push(...part);if(part.length<100)return issues;
      }
    },
    create:(title,body)=>parseIssue(request('POST',root,{title,body})),
    update:(number,body,state)=>parseIssue(request('PATCH',`${root}/${number}`,{body,state,...state==='closed'?{state_reason:'completed'}:{}})),
  };
}

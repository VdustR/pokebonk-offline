import {execFileSync} from 'node:child_process';
import {finite,list,record,text} from '../types/data.ts';
import {buildId,version} from '../types/release.ts';
import {upstreamChanged} from './upstream-plan.ts';
import type {UpstreamIdentity} from './upstream-plan.ts';
export type VersionIssue={number:number;body:string;state:'open'|'closed';author:string;pullRequest:boolean};
export type IssueStore={get:(number:number)=>VersionIssue;list:()=>VersionIssue[];create:(title:string,body:string)=>VersionIssue;update:(number:number,body:string,close:boolean)=>VersionIssue};
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
function managedRange(body:string) {
  if(body.split(start).length!==2||body.split(end).length!==2)throw new Error('Malformed upstream update tracker markers');
  const from=body.indexOf(start),to=body.indexOf(end);
  if(to<from)throw new Error('Malformed upstream update tracker marker order');
  return {from,to:to+end.length};
}
function reportedIdentity(body:string):UpstreamIdentity {
  const match=/^Detected upstream: \*\*([\d.]+)\*\* \(`([\w-]+)`\)\.\r?$/m.exec(body);
  if(!match)throw new Error('Missing detected identity in upstream update tracker');
  return {upstreamVersion:version(match[1]),upstreamBuild:buildId(match[2])};
}
export function reconcileVersionIssue(repository:string,accepted:UpstreamIdentity,detected:UpstreamIdentity,store:IssueStore) {
  const repo=repositoryName(repository),current=identity(accepted),remote=identity(detected);
  const changed=upstreamChanged(current,remote),owner=repo.split('/')[0]?.toLowerCase();
  const owned=(issue:VersionIssue)=>!issue.pullRequest&&(issue.author.toLowerCase()===owner||issue.author==='github-actions[bot]')
    &&(issue.body.includes(start)||issue.body.includes(end));
  const trackers=store.list().filter(owned).sort((a,b)=>b.number-a.number);
  const latest=trackers[0];
  if(trackers.slice(1).some(issue=>issue.state==='open'))throw new Error('Ambiguous upstream update trackers; close older trackers before retrying');
  const body=managedBody(repo,current,remote,changed);
  if(latest) {
    const existing=store.get(latest.number);
    if(!owned(existing)||existing.number!==latest.number)throw new Error('Latest upstream update issue is not an owned tracker');
    const {from,to}=managedRange(existing.body);
    if(existing.state==='open') {
      const updated=existing.body.slice(0,from)+body+existing.body.slice(to);
      if(changed&&existing.body===updated)return {action:'unchanged' as const,issue:existing.number};
      store.update(existing.number,updated,!changed);
      return {action:changed?'updated' as const:'closed' as const,issue:existing.number};
    }
    if(!changed||!upstreamChanged(reportedIdentity(existing.body.slice(from,to)),remote))return {action:'unchanged' as const,issue:existing.number};
  }
  if(!changed)return {action:'current' as const};
  // A later run rediscovers the issue if GitHub accepted the POST but its response was lost.
  return {action:'created' as const,issue:store.create('PokéBonk upstream update tracker',body).number};
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
// The REST collection has returned stale results immediately after issue creation.
const issueQuery=`query($owner:String!,$name:String!,$after:String) {
  repository(owner:$owner,name:$name) {
    issues(first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}) {
      nodes { number body state user:author { __typename login } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export function githubVersionIssues(repository:string,request:IssueRequest=githubRequest):IssueStore {
  const repo=repositoryName(repository),[owner,name]=repo.split('/');
  const root=`repos/${repo}/issues`;
  return {
    get:number=>{
      if(!Number.isSafeInteger(number)||number<1)throw new Error('Invalid GitHub issue number');
      return parseIssue(request('GET',`${root}/${number}`));
    },
    list:()=>{
      const issues:VersionIssue[]=[],cursors=new Set<string>();
      let after:string|null=null;
      for(;;) {
        const response=record(request('POST','graphql',{query:issueQuery,variables:{owner,name,after}}),'GitHub GraphQL response');
        if(response['errors']!==undefined)throw new Error('GitHub issue discovery returned GraphQL errors');
        const data=record(response['data'],'GitHub GraphQL data');
        const connection=record(record(data['repository'],'GitHub repository')['issues'],'GitHub issue connection');
        issues.push(...list(connection['nodes'],value=>{
          const issue=record(value,'GitHub issue'),state=issue['state'];
          const actor=issue['user']===null?{login:''}:record(issue['user'],'GitHub issue author');
          const login=actor['__typename']==='Bot'&&actor['login']==='github-actions'?'github-actions[bot]':actor['login'];
          return parseIssue({...issue,state:state==='OPEN'?'open':state==='CLOSED'?'closed':state,user:{login}});
        },'GitHub issue page'));
        const page=record(connection['pageInfo'],'GitHub issue page info');
        if(page['hasNextPage']===false)return issues;
        if(page['hasNextPage']!==true)throw new Error('Invalid GitHub issue page info');
        after=text(page['endCursor'],'GitHub issue cursor');
        if(!after||cursors.has(after))throw new Error('Invalid GitHub issue pagination');
        cursors.add(after);
      }
    },
    create:(title,body)=>parseIssue(request('POST',root,{title,body})),
    update:(number,body,close)=>parseIssue(request('PATCH',`${root}/${number}`,{body,...close?{state:'closed',state_reason:'completed'}:{}})),
  };
}

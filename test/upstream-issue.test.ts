import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubVersionIssues,reconcileVersionIssue} from '../scripts/upstream-issue.ts';
import type {IssueStore,VersionIssue} from '../scripts/upstream-issue.ts';
const repository='VdustR/pokebonk-offline';
const current={upstreamBuild:'accepted',upstreamVersion:'0.9.11'};
const remote={upstreamBuild:'next',upstreamVersion:'0.9.13'};
const start='<!-- pokebonk-upstream-update:start -->',end='<!-- pokebonk-upstream-update:end -->';
function fixture() {
  const issues:VersionIssue[]=[];const mutations:string[]=[];
  const store:IssueStore={
    get:number=>{const issue=issues.find(i=>i.number===number);if(!issue)throw Error('GitHub HTTP 404');return structuredClone(issue);},
    list:()=>structuredClone(issues),
    create:(_title,body)=>{mutations.push('create');const issue:VersionIssue={number:issues.length+1,body,state:'open',author:'github-actions[bot]',pullRequest:false};issues.push(issue);return structuredClone(issue);},
    update:(number,body,state)=>{mutations.push('update');const issue=issues.find(i=>i.number===number);assert.ok(issue);Object.assign(issue,{body,state});return structuredClone(issue);},
  };return {issues,mutations,store};
}
test('new updates create one tracker and repeated checks do not write again',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);
  assert.equal(f.issues.length,1);const issue=f.issues[0];assert.ok(issue);
  assert.match(issue.body,/0\.9\.11/);assert.match(issue.body,/0\.9\.13/);assert.match(issue.body,/next/);
  reconcileVersionIssue(repository,current,remote,f.store);
  assert.deepEqual(f.mutations,['create']);assert.equal(f.issues.length,1);
});
test('newer builds update the same closed issue and preserve human notes',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);const issue=f.issues[0];assert.ok(issue);
  issue.state='closed';issue.body='Human context before.\n'+issue.body+'\nHuman context after.';
  reconcileVersionIssue(repository,current,{upstreamBuild:'newer',upstreamVersion:'0.9.14'},f.store);
  assert.equal(f.issues.length,1);assert.equal(issue.number,1);assert.equal(issue.state,'open');
  assert.match(issue.body,/0\.9\.14/);assert.match(issue.body,/newer/);
  assert.ok(issue.body.startsWith('Human context before.\n'));assert.ok(issue.body.endsWith('\nHuman context after.'));
});
test('current builds create nothing and close a previously tracked update',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,current,f.store);assert.deepEqual(f.mutations,[]);
  reconcileVersionIssue(repository,current,remote,f.store);
  reconcileVersionIssue(repository,remote,remote,f.store);
  const issue=f.issues[0];assert.ok(issue);assert.equal(issue.state,'closed');assert.match(issue.body,/Up to date/);
  const writes=f.mutations.length;reconcileVersionIssue(repository,remote,remote,f.store);assert.equal(f.mutations.length,writes);
});
test('unrelated issues, pull requests and untrusted marker authors are untouched',()=>{
  const f=fixture();f.issues.push(
    {number:30,body:'Track upstream treasure frame images returning 404',state:'open',author:'VdustR',pullRequest:false},
    {number:31,body:start+'\nexample\n'+end,state:'open',author:'github-actions[bot]',pullRequest:true},
    {number:32,body:start+'\nexample\n'+end,state:'open',author:'untrusted-user',pullRequest:false},
  );const original=structuredClone(f.issues);reconcileVersionIssue(repository,current,remote,f.store);
  assert.deepEqual(f.issues.slice(0,3),original);assert.equal(f.issues.length,4);assert.deepEqual(f.mutations,['create']);
});
test('ambiguous or malformed owned trackers fail without creating more issues',()=>{
  for(const bodies of [[start],[end],[start+'\n'+end+'\n'+start],[start+'\n'+end,start+'\n'+end]]) {
    const f=fixture();for(const body of bodies)f.issues.push({number:f.issues.length+1,body,state:'open',author:'VdustR',pullRequest:false});
    assert.throws(()=>reconcileVersionIssue(repository,current,remote,f.store),/tracker/i);assert.deepEqual(f.mutations,[]);
  }
});
test('identity and lookup errors propagate without fallback issue creation',()=>{
  const f=fixture();assert.throws(()=>reconcileVersionIssue(repository,current,{...current,upstreamVersion:'0.9.14'},f.store),/version under the same build/);
  assert.throws(()=>reconcileVersionIssue(repository,current,remote,{...f.store,list:()=>{throw Error('GitHub HTTP 403');}}),/403/);
  assert.deepEqual(f.mutations,[]);
});
test('a lost creation response does not cause a blind retry or a duplicate on the next run',()=>{
  const f=fixture();assert.throws(()=>reconcileVersionIssue(repository,current,remote,{...f.store,create:(title,body)=>{f.store.create(title,body);throw Error('Connection closed after creation');}}),/Connection closed/);
  reconcileVersionIssue(repository,current,remote,f.store);assert.equal(f.issues.length,1);assert.deepEqual(f.mutations,['create']);
});
test('same-version upstream hotfixes still update the existing tracker',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);
  reconcileVersionIssue(repository,current,{...remote,upstreamBuild:'hotfix'},f.store);
  assert.equal(f.issues.length,1);assert.match(f.issues[0]?.body??'',/hotfix/);assert.deepEqual(f.mutations,['create','update']);
});
test('GitHub enumeration reaches an older tracker beyond the first page and excludes PR matches',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);const tracker=f.issues[0];assert.ok(tracker);
  const raw=(number:number,body:string)=>({number,body,state:'open',user:{login:'github-actions[bot]'}});
  const page1=Array.from({length:100},(_,i)=>raw(i+1,i===0?tracker.body:'Unrelated issue'));
  const calls:string[]=[];
  const store=githubVersionIssues(repository,(method,endpoint)=>{
    calls.push(method+' '+endpoint);assert.equal(method,'GET');
    if(endpoint.endsWith('page=1'))return page1.map((issue,i)=>i===0?{...issue,pull_request:{url:'https://api.github.com/pulls/1'}}:issue);
    if(endpoint.endsWith('page=2'))return [raw(101,tracker.body)];
    throw Error('Unexpected request');
  });
  assert.deepEqual(reconcileVersionIssue(repository,current,remote,store),{action:'unchanged',issue:101});
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.includes('state=all')));
});
test('partial pagination and malformed API responses fail before any mutation',()=>{
  for(const fail of ['second-page','malformed']) {
    const writes:string[]=[];
    const store=githubVersionIssues(repository,(method,endpoint)=>{
      if(method!=='GET'){writes.push(method);throw Error('Unexpected mutation');}
      if(fail==='malformed')return {message:'Access denied'};
      if(endpoint.endsWith('page=1'))return Array.from({length:100},(_,i)=>({number:i+1,body:'',state:'closed',user:{login:'github-actions[bot]'}}));
      throw Error('GitHub HTTP 403');
    });
    assert.throws(()=>reconcileVersionIssue(repository,current,remote,store),fail==='malformed'?/array/:/403/);assert.deepEqual(writes,[]);
  }
});
test('a pinned tracker is reused even while the issue listing is stale',()=>{
  const f=fixture();const first=reconcileVersionIssue(repository,current,remote,f.store);assert.ok(first.issue);
  const stale={...f.store,list:()=>{throw Error('The pinned workflow must not enumerate issues');}};
  assert.deepEqual(reconcileVersionIssue(repository,current,remote,stale,first.issue),{action:'unchanged',issue:first.issue});
  reconcileVersionIssue(repository,current,{...remote,upstreamBuild:'hotfix'},stale,first.issue);
  assert.equal(f.issues.length,1);assert.deepEqual(f.mutations,['create','update']);
});
test('an inaccessible or replaced pinned tracker never falls back to creation',()=>{
  const f=fixture();assert.throws(()=>reconcileVersionIssue(repository,current,remote,f.store,404),/404/);
  f.issues.push({number:30,body:'Human issue',state:'open',author:'VdustR',pullRequest:false});
  assert.throws(()=>reconcileVersionIssue(repository,current,remote,f.store,30),/owned tracker/);
  assert.deepEqual(f.mutations,[]);
});

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
    update:(number,body,close)=>{mutations.push('update');const issue=issues.find(i=>i.number===number);assert.ok(issue);issue.body=body;if(close)issue.state='closed';return structuredClone(issue);},
  };return {issues,mutations,store};
}
test('new updates create one tracker and repeated checks do not write again',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);
  assert.equal(f.issues.length,1);const issue=f.issues[0];assert.ok(issue);
  assert.match(issue.body,/0\.9\.11/);assert.match(issue.body,/0\.9\.13/);assert.match(issue.body,/next/);
  reconcileVersionIssue(repository,current,remote,f.store);
  assert.deepEqual(f.mutations,['create']);assert.equal(f.issues.length,1);
});
test('newer builds update the same open issue and preserve human notes',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);const issue=f.issues[0];assert.ok(issue);
  issue.body='Human context before.\n'+issue.body+'\nHuman context after.';
  reconcileVersionIssue(repository,current,{upstreamBuild:'newer',upstreamVersion:'0.9.14'},f.store);
  assert.equal(f.issues.length,1);assert.equal(issue.number,1);assert.equal(issue.state,'open');
  assert.match(issue.body,/0\.9\.14/);assert.match(issue.body,/newer/);
  assert.ok(issue.body.startsWith('Human context before.\n'));assert.ok(issue.body.endsWith('\nHuman context after.'));
});
test('closing a tracker archives that build and a later build starts a new issue',()=>{
  const f=fixture();
  const first=reconcileVersionIssue(repository,current,remote,f.store);
  const closed=f.issues[0];assert.ok(closed);closed.state='closed';
  const archived=structuredClone(closed);
  assert.deepEqual(reconcileVersionIssue(repository,current,remote,f.store),{action:'unchanged',issue:first.issue});

  const next={...remote,upstreamBuild:'hotfix'};
  const second=reconcileVersionIssue(repository,current,next,f.store);
  assert.deepEqual(second,{action:'created',issue:2});
  assert.deepEqual(f.issues[0],archived);
  assert.deepEqual(reconcileVersionIssue(repository,current,next,f.store),{action:'unchanged',issue:2});
  assert.deepEqual(f.mutations,['create','create']);
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
const page=(nodes:unknown[],after:string|null=null)=>({
  data:{repository:{issues:{nodes,pageInfo:{hasNextPage:after!==null,endCursor:after}}}},
});
test('GitHub discovery reads subsequent pages and refreshes the selected issue before writing',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);const tracker=f.issues[0];assert.ok(tracker);
  const user={login:'github-actions[bot]'};
  const store=githubVersionIssues(repository,(method,endpoint,payload)=>{
    if(endpoint==='graphql'){
      assert.equal(method,'POST');
      return (payload?.['variables'] as {after:string|null}).after===null
        ?page([{number:102,body:'Unrelated issue',state:'OPEN',user}],'page-2')
        :page([{number:101,body:tracker.body,state:'CLOSED',user:{__typename:'Bot',login:'github-actions'}}]);
    }
    if(method==='GET'&&endpoint.endsWith('/101'))return {number:101,body:tracker.body,state:'open',user};
    if(method==='PATCH'&&endpoint.endsWith('/101')){
      assert.deepEqual(Object.keys(payload??{}),['body']);
      return {number:101,body:payload?.['body'],state:'open',user};
    }
    throw Error('Unexpected request');
  });
  assert.deepEqual(reconcileVersionIssue(repository,current,{...remote,upstreamBuild:'hotfix'},store),{action:'updated',issue:101});
});
test('partial pagination and malformed API responses fail before any issue mutation',()=>{
  for(const fail of ['second-page','malformed','graphql-errors']) {
    const store=githubVersionIssues(repository,(method,endpoint,payload)=>{
      assert.equal(method,'POST');assert.equal(endpoint,'graphql');
      if(fail==='malformed')return {message:'Access denied'};
      if(fail==='graphql-errors')return {...page([]),errors:[{message:'Partial response'}]};
      if((payload?.['variables'] as {after:string|null}).after===null)return page([],'page-2');
      throw Error('GitHub HTTP 403');
    });
    assert.throws(()=>reconcileVersionIssue(repository,current,remote,store),fail==='second-page'?/403/:/GitHub/);
  }
});
test('an inaccessible or replaced selected tracker never falls back to creation',()=>{
  const f=fixture();reconcileVersionIssue(repository,current,remote,f.store);
  assert.throws(()=>reconcileVersionIssue(repository,current,remote,{...f.store,get:()=>{throw Error('GitHub HTTP 404');}}),/404/);
  assert.throws(()=>reconcileVersionIssue(repository,current,remote,{...f.store,get:()=>({
    number:1,body:'Human issue',state:'open',author:'VdustR',pullRequest:false,
  })}),/owned tracker/);
  assert.deepEqual(f.mutations,['create']);
});

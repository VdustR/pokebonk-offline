import assert from 'node:assert/strict';
import test from 'node:test';
import {discoverUpstream} from '../scripts/upstream-version.ts';

// Synthetic modules preserve the discovery boundary without copying game assets.
// See docs/upstream-discovery-investigation.md for the live evidence and its limits.
function chain(length:number,matching=true) {
  const sources=new Map([['/index.html','<meta name="pokebonk-build" content="current"><script src="/assets/entry-1.js"></script>']]);
  for(let index=1;index<=length;index++)sources.set(`/assets/entry-${index}.js`,index<length
    ?`import './entry-${index+1}.js';`
    :`const notes=[{build:'${matching?'current':'other'}',version:'0.10.19'}];`);
  return sources;
}
function fixture(sources:Map<string,string>) {
  const requests:string[]=[];
  const request=async(url:string)=>{
    const pathname=new URL(url).pathname;requests.push(pathname);
    const source=sources.get(pathname);
    return new Response(source??'',{status:source===undefined?404:200});
  };
  return {requests,request};
}

test('discovery accepts a matching version in the 48th unique module',async()=>{
  const {requests,request}=fixture(chain(48));
  assert.deepEqual(await discoverUpstream(request),{build:'current',upstreamVersion:'0.10.19'});
  assert.equal(requests.length,49); // HTML plus 48 JavaScript modules.
  assert.equal(requests.at(-1),'/assets/entry-48.js');
});

test('discovery rejects a 49th unique module before requesting it, even with a matching version',async()=>{
  const {requests,request}=fixture(chain(49));
  await assert.rejects(discoverUpstream(request),/Upstream module graph exceeded limit/);
  assert.equal(requests.length,49);
  assert.equal(requests.includes('/assets/entry-49.js'),false);
});

test('duplicate roots and cyclic static/dynamic imports do not consume the unique module budget',async()=>{
  const sources=chain(48);
  sources.set('/index.html','<meta name="pokebonk-build" content="current"><script src="/assets/entry-1.js"></script><link href="/assets/entry-1.js">');
  for(let index=1;index<48;index++)sources.set(`/assets/entry-${index}.js`,`import './entry-${index+1}.js';import('./entry-1.js');import('./entry-${index+1}.js');`);
  const {requests,request}=fixture(sources);
  assert.deepEqual(await discoverUpstream(request),{build:'current',upstreamVersion:'0.10.19'});
  assert.equal(requests.length,49);
  assert.equal(new Set(requests).size,49);
});

test('an exhausted 48-module graph without the HTML build fails without guessing a version',async()=>{
  const {requests,request}=fixture(chain(48,false));
  await assert.rejects(discoverUpstream(request),/No upstream version matches HTML build/);
  assert.equal(requests.length,49);
});

for(const advertised of [true,false])test(`discovery rejects an oversized module ${advertised?'advertised by headers':'measured from the body'}`,async()=>{
  const sources=chain(1),{request}=fixture(sources);
  await assert.rejects(discoverUpstream(async url=>{
    if(new URL(url).pathname==='/index.html')return request(url);
    return advertised
      ?new Response('const notes=[];',{headers:{'content-length':String(4*1024*1024+1)}})
      :new Response(' '.repeat(4*1024*1024+1));
  }),/Upstream module too large/);
});

test('static dependencies remain reachable when lazy branches would exhaust the budget',async()=>{
  const sources=chain(1);
  sources.set('/assets/entry-1.js',`import './app.js';${Array.from({length:46},(_,i)=>`import('./lazy-${i}.js');`).join('')}`);
  sources.set('/assets/app.js',"import './metadata.js';");
  sources.set('/assets/metadata.js',"const notes=[{build:'current',version:'0.10.37'}];");
  for(let index=0;index<46;index++)sources.set(`/assets/lazy-${index}.js`,'export {};');
  const {requests,request}=fixture(sources);
  assert.deepEqual(await discoverUpstream(request),{build:'current',upstreamVersion:'0.10.37'});
  assert.ok(requests.length<=49);
});

test('dynamic fallback shares static duplicate/cycle suppression and the global budget',async()=>{
  const sources=chain(47,false);
  sources.set('/assets/entry-1.js',"import './entry-2.js';import('./entry-2.js');");
  sources.set('/assets/entry-47.js',"import './entry-1.js';import('./entry-1.js');import('./metadata.js');");
  sources.set('/assets/metadata.js',"import './entry-47.js';const notes=[{build:'current',version:'0.10.37'}];");
  const {requests,request}=fixture(sources);
  assert.deepEqual(await discoverUpstream(request),{build:'current',upstreamVersion:'0.10.37'});
  assert.equal(requests.length,49);
  assert.equal(new Set(requests).size,49);
});

test('static and dynamic queues cannot each spend a separate module budget',async()=>{
  const sources=chain(48,false);
  sources.set('/assets/entry-24.js',"import('./entry-25.js');");
  sources.set('/assets/entry-48.js',"import('./metadata.js');");
  sources.set('/assets/metadata.js',"const notes=[{build:'current',version:'0.10.37'}];");
  const {requests,request}=fixture(sources);
  await assert.rejects(discoverUpstream(request),/Upstream module graph exceeded limit/);
  assert.equal(requests.length,49);
  assert.equal(requests.includes('/assets/metadata.js'),false);
});

for(const target of ['https://example.com/assets/module.js','/nested/module.js'])test(`static dependencies reject unsupported URLs before requesting ${target}`,async()=>{
  const sources=chain(1);
  sources.set('/assets/entry-1.js',`import '${target}';import('./metadata.js');`);
  sources.set('/assets/metadata.js',"const notes=[{build:'current',version:'0.10.37'}];");
  const {requests,request}=fixture(sources);
  await assert.rejects(discoverUpstream(request),/Unsupported upstream module URL/);
  assert.equal(requests.length,2);
});

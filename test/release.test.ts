import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ast} from '../scripts/source.ts';
import {discoverUpstream,versionForBuild} from '../scripts/upstream-version.ts';
import {fingerprint,packagedSource} from '../scripts/release-source.ts';
import {parseProvenance,releaseIdentity,releaseMarker,releaseNotes,releaseRequired,version} from '../types/release.ts';
const info=parseProvenance({upstreamVersion:'0.8.34',offlineVersion:'0.0.1',upstreamBuild:'current',builder:'a'.repeat(40),sourceDigest:'b'.repeat(64),variant:'unlock-all'});
const published={draft:false,body:releaseMarker(info)};

test('readable release identity retains exact build while ignoring unrelated commit changes',()=>{
  assert.equal(info.title,'PokéBonk 0.8.34 · Offline 0.0.1');
  assert.equal(info.tag,'upstream-v0.8.34-offline-v0.0.1-build-current');
  assert.equal(releaseRequired(published,{...info,builder:'c'.repeat(40)}),false);
  for(const identity of [releaseIdentity('0.8.35','0.0.1','next'),releaseIdentity('0.8.34','0.0.2','current'),releaseIdentity('0.8.34','0.0.1','hotfix')])assert.notEqual(identity.tag,info.tag);
});
test('missing releases build, matching published releases skip, compatible drafts resume',()=>{
  assert.equal(releaseRequired(undefined,info),true);
  assert.equal(releaseRequired(published,info),false);
  assert.equal(releaseRequired({...published,draft:true},info),true);
  assert.throws(()=>releaseRequired({...published,draft:true},{...info,builder:'c'.repeat(40)}),/original CI run/);
});
test('changed packaged source without a version bump and invalid release state stop publication',()=>{
  assert.throws(()=>releaseRequired(published,{...info,sourceDigest:'c'.repeat(64)}),/version bump/);
  for(const value of [{draft:false,body:''},{draft:'false',body:releaseMarker(info)},{draft:false,body:'<!-- pokebonk-release:broken -->'}])assert.throws(()=>releaseRequired(value,info));
  assert.throws(()=>releaseRequired(published,{...info,tag:'different'}),/identity mismatch/);
  for(const v of ['0.8.34.1','0.8.34-offline.1','0.8.34+sha','01.0.0','0.0.1\ninjected=yes'])assert.throws(()=>version(v));
});
test('source fingerprint excludes docs and tests but tracks packaged tools, native code and dependencies',()=>{
  for(const file of ['README.md','docs/install.md','test/release.test.ts','evidence/file.json'])assert.equal(packagedSource(file),false);
  for(const file of ['runtime/local-backend.ts','scripts/prepare-game.ts','desktop/main.ts','types/metadata.ts','android/app/src/main/AndroidManifest.xml','.github/workflows/build-releases.yml','pnpm-lock.yaml','package.json','LICENSE'])assert.equal(packagedSource(file),true);
  const a={name:'runtime/a.ts',bytes:Buffer.from('a')},b={name:'desktop/b.ts',bytes:Buffer.from('b')};
  assert.equal(fingerprint([a,b]),fingerprint([b,a]));
  assert.notEqual(fingerprint([a,b]),fingerprint([a,{...b,bytes:Buffer.from('changed')}]));
});
test('release notes select current Changesets entry and preserve provenance',()=>{
  const notes=releaseNotes(info,'# App\n\n## 0.0.1\n\n### Patch Changes\n\n- Fix images.\n\n## 0.0.0\n\n- Old.\n');
  assert.match(notes,/Fix images/);assert.doesNotMatch(notes,/Old\./);assert.match(notes,/Unlocked/);assert.match(notes,/pokebonk-release:/);
  assert.throws(()=>releaseNotes(info,'## 0.0.2\n- Future'),/Missing offline version/);
  assert.throws(()=>releaseNotes(info,'## 0.0.1\n\n## 0.0.0\n- Old'),/Empty offline changelog/);
});
test('upstream version comes from the HTML build mapping, not the first version or UI string',async()=>{
  const requests:string[]=[];
  const sources=new Map([['/index.html','<meta name="pokebonk-build" content="current"><script src="/assets/entry.js"></script>'],['/assets/entry.js',"import('./config.js');"],['/assets/config.js',"const shown='0.8.31';const notes=[{version:'0.8.35',build:'future'},{version:'0.8.34',build:'current'}];"]]);
  const request=async(url:string)=>{const pathname=new URL(url).pathname;requests.push(pathname);const source=sources.get(pathname);return new Response(source??'',{status:source===undefined?404:200});};
  assert.deepEqual(await discoverUpstream(request),{build:'current',upstreamVersion:'0.8.34'});
  assert.deepEqual(requests,['/index.html','/assets/entry.js','/assets/config.js']);
  sources.set('/assets/config.js',"const notes=[{version:'0.8.34',build:'other'}];");
  await assert.rejects(discoverUpstream(request),/No upstream version/);
  sources.set('/assets/entry.js',"import('https://example.com/external.js');");
  await assert.rejects(discoverUpstream(request),/Unsupported upstream module URL/);
  assert.equal(requests.includes('/external.js'),false);
  await assert.rejects(discoverUpstream(async()=>new Response('',{status:503})),/Upstream request: 503/);
});
test('ambiguous or malformed upstream mappings reject rather than guessing a release version',()=>{
  assert.throws(()=>versionForBuild(ast("const a=[{build:'x',version:'0.8.31'},{build:'x',version:'0.8.34'}]"),'x'),/Conflicting/);
  assert.throws(()=>versionForBuild(ast("const a=[{build:'x',version:'broken'}]"),'x'),/Release version/);
});

test('pending Changesets stop release planning until versioned',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-release-plan-'));
  try {
    await mkdir(path.join(root,'.changeset'));
    await writeFile(path.join(root,'package.json'),JSON.stringify({version:'0.0.1'}));
    await writeFile(path.join(root,'.changeset/README.md'),'Instructions');
    const moduleUrl=pathToFileURL(path.resolve('scripts/release-source.ts')).href;
    const command=`import {offlineVersion} from ${JSON.stringify(moduleUrl)};console.log(await offlineVersion());`;
    const run=()=>execFileSync(process.execPath,['--input-type=module','-e',command],{cwd:root,encoding:'utf8',stdio:'pipe'});
    assert.equal(run().trim(),'0.0.1');
    await writeFile(path.join(root,'.changeset/pending.md'),'---\n"pokebonk-offline-builder": patch\n---\nFix.');
    assert.throws(run,/Version pending changesets/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('release note CLI rejects a payload that differs from the planned tag or title',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-release-notes-'));
  try {
    const metadata=path.join(root,'info.json'),notes=path.join(root,'notes.md'),provenance=path.join(root,'release-info.json');
    await writeFile(metadata,JSON.stringify(info));
    const run=(tag:string,title=info.title)=>execFileSync(process.execPath,['scripts/release-notes.ts',metadata,notes,provenance],{encoding:'utf8',stdio:'pipe',env:{...process.env,TAG:tag,TITLE:title}});
    run(info.tag);
    assert.throws(()=>run('wrong-tag'),/planned release tag/);
    assert.throws(()=>run(info.tag,'wrong title'),/planned release title/);
  } finally {await rm(root,{recursive:true,force:true});}
});

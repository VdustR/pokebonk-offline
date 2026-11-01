import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planUpstream} from '../scripts/upstream-plan.ts';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readSnapshotManifest} from '../scripts/upstream-snapshot.ts';

const current={upstreamBuild:'accepted',upstreamVersion:'0.8.83'};
const remote={upstreamBuild:'next',upstreamVersion:'0.8.84'};
test('new unreviewed builds stay changed but cannot enter acquisition or publishing',()=>{
  assert.deepEqual(planUpstream(current,remote,'accepted'),{changed:true,eligible:false,status:'review-required'});
  assert.deepEqual(planUpstream(current,remote,'next'),{changed:true,eligible:true,status:'ready'});
  assert.deepEqual(planUpstream(current,current,'accepted'),{changed:false,eligible:false,status:'current'});
  assert.throws(()=>planUpstream(current,{...current,upstreamVersion:'0.8.84'},'accepted'),/version under the same build/);
});

test('identity command reports a review hold and still rejects identity and HTTP failures',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'pokebonk-sync-plan-'));
  try {
    const accepted=await readSnapshotManifest();
    const loader=path.join(root,'upstream.mjs');
    for(const scenario of ['review','current','mismatch','malformed','http']) {
      const build=scenario==='review'?'unreviewed-fixture':accepted.upstreamBuild;
      const version=scenario==='mismatch'?'999.0.0':accepted.upstreamVersion;
      const html=scenario==='malformed'?'invalid':`<meta name="pokebonk-build" content="${build}"><script src="/assets/fixture.js"></script>`;
      await writeFile(loader,`globalThis.fetch=async input=>new Response(String(input).includes('/assets/')?${JSON.stringify(`export const catalog={build:${JSON.stringify(build)},version:${JSON.stringify(version)}}`)}:${JSON.stringify(html)},{status:${scenario==='http'?404:200}});`);
      const output=path.join(root,scenario+'.output');
      const summary=path.join(root,scenario+'.summary');
      const run=()=>execFileSync(process.execPath,['--import',loader,'scripts/check-upstream.ts'],{encoding:'utf8',env:{...process.env,GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary},stdio:'pipe'});
      if(['mismatch','malformed','http'].includes(scenario)) {
        assert.throws(run,scenario==='mismatch'?/version under the same build/:scenario==='http'?/Upstream request: 404/:/upstream build/);
        await assert.rejects(readFile(output));
      } else {
        run();
        assert.match(await readFile(output,'utf8'),/eligible=false/);
        assert.match(await readFile(output,'utf8'),scenario==='review'?/changed=true\neligible=false\nstatus=review-required/:/changed=false\neligible=false\nstatus=current/);
        assert.match(await readFile(summary,'utf8'),scenario==='review'?/publication are held/:/snapshot is current/);
      }
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

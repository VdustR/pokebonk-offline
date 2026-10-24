import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentChanged } from '../scripts/deployment.mjs';
test('Pages update detection compares game and builder identities, preserving the project path',async()=>{
  const check=(metadata,build='game',builder='head')=>deploymentChanged('https://example.test/pokebonk-offline/',build,builder,async url=>{
    assert.equal(url.pathname,'/pokebonk-offline/offline-build.json');
    return Response.json(metadata);
  });
  assert.equal(await check({upstreamBuild:'game',builder:'head'}),false);
  assert.equal(await check({upstreamBuild:'old',builder:'head'}),true);
  assert.equal(await check({upstreamBuild:'game',builder:'old'}),true);
  assert.equal(await deploymentChanged('https://example.test/game/','game','head',async()=>new Response(null,{status:404})),true);
  await assert.rejects(check({}),/Invalid Pages build metadata/);
  await assert.rejects(deploymentChanged('https://example.test/game/','game','head',async()=>new Response(null,{status:503})),/503/);
});

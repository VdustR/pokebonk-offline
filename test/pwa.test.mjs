import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
const source=await readFile('runtime/sw.js','utf8');
test('incomplete or corrupt precache is removed; prior cache is preserved',async()=>{
  const handlers={},stores=new Map([['prior-good-version',new Map()]]);
  const body='expected';
  const manifest={cacheVersion:'__CACHE_VERSION__',files:[{name:'asset.txt',bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}]};
  const cache={put:async()=>{},match:async()=>null};
  const context={URL,Response,Uint8Array,crypto:webcrypto,
    caches:{open:async name=>{stores.set(name,cache);return cache;},delete:async name=>stores.delete(name),keys:async()=>[...stores.keys()]},
    fetch:async url=>String(url).endsWith('asset-manifest.json')?Response.json(manifest):new Response('tampered'),
    self:{location:{href:'https://example.test/game/sw.js'},clients:{matchAll:async()=>[]},addEventListener:(event,handler)=>{handlers[event]=handler;}}};
  new vm.Script(source).runInNewContext(context);
  let pending;handlers.install({waitUntil:promise=>{pending=promise;}});
  await assert.rejects(pending,/integrity check failed/);
  assert.deepEqual([...stores.keys()],['prior-good-version']);
});

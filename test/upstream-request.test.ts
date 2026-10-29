import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {requestUpstream} from '../scripts/upstream-request.ts';

test('transient GET failures retry while permanent responses and programming errors remain visible',async()=>{
  const counts=new Map<string,number>();
  const server=createServer((request,response)=>{
    const route=request.url??'/';const count=(counts.get(route)??0)+1;counts.set(route,count);
    if(route==='/disconnect'&&count===1){request.socket.destroy();return;}
    response.statusCode=route==='/unavailable'?503:route==='/missing'?404:route==='/busy'&&count===1?503:200;
    response.end('payload');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();assert.ok(address&&typeof address==='object');
    const url=`http://127.0.0.1:${address.port}`;
    for(const route of ['/disconnect','/busy']) {
      assert.equal(await (await requestUpstream(url+route)).text(),'payload');
      assert.equal(counts.get(route),2);
    }
    assert.equal((await requestUpstream(url+'/missing')).status,404);assert.equal(counts.get('/missing'),1);
    assert.equal((await requestUpstream(url+'/unavailable')).status,503);assert.equal(counts.get('/unavailable'),3);
    await assert.rejects(()=>requestUpstream('invalid URL'),TypeError);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

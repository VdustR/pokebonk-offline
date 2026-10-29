import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {gzipSync} from 'node:zlib';
import {requestUpstream} from '../scripts/upstream-request.ts';

test('transient GET failures retry while permanent responses and programming errors remain visible',async()=>{
  const counts=new Map<string,number>();
  const server=createServer((request,response)=>{
    const route=request.url??'/';const count=(counts.get(route)??0)+1;counts.set(route,count);
    if(route==='/disconnect'&&count===1){request.socket.destroy();return;}
    if((route==='/body'&&count===1)||route==='/broken-body'){
      response.writeHead(200,{'content-length':'100'});response.flushHeaders();response.write('partial');
      setTimeout(()=>response.destroy(),10);return;
    }
    if(route==='/slow-body'&&count===1){response.writeHead(200);response.flushHeaders();return;}
    if(route==='/gzip'){response.setHeader('content-encoding','gzip');response.end(gzipSync('payload'));return;}
    if(route==='/chunked-large'){response.writeHead(200);response.write('payload');response.end();return;}
    response.statusCode=route==='/unavailable'?503:route==='/missing'?404:route==='/busy'&&count===1?503:200;
    response.end('payload');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();assert.ok(address&&typeof address==='object');
    const url=`http://127.0.0.1:${address.port}`;
    for(const route of ['/disconnect','/busy','/body']) {
      assert.equal(await (await requestUpstream(url+route)).text(),'payload');
      assert.equal(counts.get(route),2);
    }
    assert.equal(await (await requestUpstream(url+'/slow-body',{timeoutMs:200})).text(),'payload');
    assert.equal(counts.get('/slow-body'),2);
    assert.equal(await (await requestUpstream(url+'/gzip')).text(),'payload');
    await assert.rejects(()=>requestUpstream(url+'/large',{maxBytes:4}),/too large/);assert.equal(counts.get('/large'),1);
    await assert.rejects(()=>requestUpstream(url+'/chunked-large',{maxBytes:4}),/too large/);assert.equal(counts.get('/chunked-large'),1);
    assert.equal((await requestUpstream(url+'/missing')).status,404);assert.equal(counts.get('/missing'),1);
    assert.equal((await requestUpstream(url+'/unavailable')).status,503);assert.equal(counts.get('/unavailable'),3);
    await assert.rejects(async()=>{await (await requestUpstream(url+'/broken-body')).text();},TypeError);
    assert.equal(counts.get('/broken-body'),3);
    await assert.rejects(()=>requestUpstream('invalid URL'),TypeError);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

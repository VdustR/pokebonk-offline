const VERSION = '__CACHE_VERSION__';
const BASE = new URL('./', self.location.href);
const PREFIX = `pokebonk:${BASE.href}:`;
const CACHE = PREFIX + VERSION;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');

async function notify(message) {
  for (const client of await self.clients.matchAll({ type:'window', includeUncontrolled:true })) {
    if(client.url.startsWith(BASE.href))client.postMessage({pokebonkOffline:true,...message});
  }
}

self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(new URL('asset-manifest.json',BASE),{cache:'no-store'});
    if(!response.ok)throw new Error('The offline asset list could not be downloaded.');
    const manifest = await response.json();
    if(manifest.cacheVersion!==VERSION)throw new Error('The deployment changed during download.');
    let cursor=0, completed=0, failure;
    await notify({state:'preparing',completed,total:manifest.files.length});
    await Promise.all(Array.from({length:8},async()=>{
      while(cursor<manifest.files.length && !failure) {
        const file=manifest.files[cursor++];
        try {
          const url=new URL(file.name,BASE);
          if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))throw new Error('Invalid offline path.');
          const resource=await fetch(url,{cache:'no-store'});
          if(!resource.ok)throw new Error(`Missing offline resource: ${file.name}`);
          const bytes=await resource.clone().arrayBuffer();
          if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)throw new Error(`Offline integrity check failed: ${file.name}`);
          await cache.put(url,resource);
          completed++;
          if(completed%25===0)await notify({state:'preparing',completed,total:manifest.files.length});
        }catch(error){failure=error;}
      }
    }));
    if(failure)throw failure;
    await cache.put(new URL('asset-manifest.json',BASE),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    await cache.put(new URL('__offline_ready__',BASE),new Response(VERSION));
    await notify({state:'downloaded',completed,total:manifest.files.length});
  } catch(error) {
    await caches.delete(CACHE);
    await notify({state:'error',message:error.message});
    throw error;
  }
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // Default waiting-worker behavior keeps active games on their original build.
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
  await notify({state:'ready'});
})()));

self.addEventListener('message',event=>{
  if(event.data?.type==='status')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const ready=await cache.match(new URL('__offline_ready__',BASE));
    event.source?.postMessage({pokebonkOffline:true,state:ready?'ready':'preparing'});
  })());
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=event.request.mode==='navigate'&&url.pathname===BASE.pathname?new URL('index.html',BASE):url;
    const stored=await cache.match(key,{ignoreSearch:true});
    if(stored)return stored;
    return fetch(event.request);
  })());
});

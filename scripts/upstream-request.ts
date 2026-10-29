import {setTimeout} from 'node:timers/promises';
import {isRecord} from '../types/data.ts';

const transientCodes=new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
function transient(error:unknown):boolean {
  if(!isRecord(error))return false;
  if(error['name']==='TimeoutError')return true;
  if(typeof error['code']==='string'&&transientCodes.has(error['code']))return true;
  return transient(error['cause'])||(Array.isArray(error['errors'])&&error['errors'].length>0&&error['errors'].every(transient));
}

// Read the successful body inside the retry boundary: fetch resolves at headers,
// while a connection can still fail halfway through an upstream asset.
export async function requestUpstream(url:string|URL,{maxBytes=4*1024*1024,timeoutMs=60000}={}) {
  for(let attempt=0;;attempt++) {
    const signal=AbortSignal.timeout(timeoutMs);
    let retryReason:string;
    try {
      const response=await fetch(url,{signal});
      if(attempt<2&&(response.status===408||response.status===429||response.status>=500)) {
        retryReason=`HTTP ${response.status}`;
        await response.body?.cancel();
      } else {
        if(!response.ok||!response.body)return response;
        if(Number(response.headers.get('content-length'))>maxBytes) {
          await response.body.cancel();
          throw new Error('Upstream response too large');
        }
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength>maxBytes)throw new Error('Upstream response too large');
        return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
      }
    } catch(error) {
      // Only this helper owns the signal; a body reader may report AbortError
      // rather than TimeoutError when that same request deadline expires.
      const bodyTimeout=signal.aborted&&isRecord(error)&&error['name']==='AbortError';
      if(attempt===2||!(transient(error)||bodyTimeout))throw error;
      retryReason=error instanceof Error?error.message:String(error);
    }
    console.warn(`Retrying upstream GET (${attempt+2}/3) after ${retryReason}: ${url}`);
    await setTimeout(250*2**attempt);
  }
}

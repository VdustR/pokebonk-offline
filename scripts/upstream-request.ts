import {setTimeout} from 'node:timers/promises';
import {isRecord} from '../types/data.ts';

const transientCodes=new Set(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','ENETUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
function transient(error:unknown):boolean {
  if(!isRecord(error))return false;
  if(error['name']==='TimeoutError')return true;
  if(typeof error['code']==='string'&&transientCodes.has(error['code']))return true;
  return transient(error['cause'])||(Array.isArray(error['errors'])&&error['errors'].length>0&&error['errors'].every(transient));
}

// Only upstream GETs use this retry boundary; validation and permanent errors propagate.
export async function requestUpstream(url:string|URL):Promise<Response> {
  for(let attempt=0;;attempt++) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
      if(attempt===2||!(response.status===408||response.status===429||response.status>=500))return response;
      await response.body?.cancel();
    } catch(error) {
      if(attempt===2||!transient(error))throw error;
    }
    await setTimeout(250*2**attempt);
  }
}

export async function deploymentChanged(siteUrl,build,revision,request=fetch) {
  if(!siteUrl)throw new Error('PAGES_URL is required');
  const url=new URL('offline-build.json',siteUrl.endsWith('/')?siteUrl:siteUrl+'/');
  url.searchParams.set('check',Date.now());
  const response=await request(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(response.status===404)return true;
  if(!response.ok)throw new Error(`Pages metadata lookup failed: ${response.status}`);
  const metadata=await response.json();
  if(typeof metadata.upstreamBuild!=='string'||typeof metadata.builder!=='string')throw new Error('Invalid Pages build metadata');
  return metadata.upstreamBuild!==build||metadata.builder!==revision;
}

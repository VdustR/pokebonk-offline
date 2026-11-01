type Identity={upstreamBuild:string;upstreamVersion:string};

export function planUpstream(current:Identity,remote:Identity,reviewedBuild:string) {
  const changed=remote.upstreamBuild!==current.upstreamBuild;
  if(!changed&&remote.upstreamVersion!==current.upstreamVersion)throw new Error('Upstream changed a version under the same build identity');
  if(!changed)return {changed,eligible:false,status:'current'} as const;
  if(remote.upstreamBuild!==reviewedBuild)return {changed,eligible:false,status:'review-required'} as const;
  return {changed,eligible:true,status:'ready'} as const;
}

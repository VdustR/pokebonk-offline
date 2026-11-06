export type UpstreamIdentity={upstreamBuild:string;upstreamVersion:string};

export function upstreamChanged(current:UpstreamIdentity,remote:UpstreamIdentity) {
  const changed=remote.upstreamBuild!==current.upstreamBuild;
  if(!changed&&remote.upstreamVersion!==current.upstreamVersion)throw new Error('Upstream changed a version under the same build identity');
  return changed;
}
export function planUpstream(current:UpstreamIdentity,remote:UpstreamIdentity,reviewedBuild:string) {
  const changed=upstreamChanged(current,remote);
  if(!changed)return {changed,eligible:false,status:'current'} as const;
  if(remote.upstreamBuild!==reviewedBuild)return {changed,eligible:false,status:'review-required'} as const;
  return {changed,eligible:true,status:'ready'} as const;
}

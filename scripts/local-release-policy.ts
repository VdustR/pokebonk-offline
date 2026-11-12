import {finite,list,record,text} from '../types/data.ts';
import {parseProvenance} from '../types/release.ts';
import type {ReleaseProvenance} from '../types/release.ts';

export const desktopTargets=[['darwin','arm64'],['darwin','x64'],['linux','x64'],['win32','x64']] as const;
export function findRelease(tag:string,request:(endpoint:string)=>unknown) {
  // GitHub's tag endpoint excludes drafts. The authenticated collection includes
  // them, including an interrupted upload that must resume before publication.
  for(let page=1;;page++) {
    const releases=list(request(`releases?per_page=100&page=${page}`),value=>record(value,'GitHub release'));
    const match=releases.find(release=>text(release['tag_name'],'release tag')===tag);
    if(match)return match;
    if(releases.length<100)return undefined;
  }
}
export function releaseFiles(info:ReleaseProvenance) {
  return [...desktopTargets.map(([platform,arch])=>`pokebonk-offline-${info.offlineVersion}-unlocked-${platform}-${arch}-game-${info.upstreamVersion}-${info.upstreamBuild}.${platform==='linux'?'tar.gz':'zip'}`),
    `pokebonk-offline-${info.offlineVersion}-unlocked-android.apk`,'release-info.json','SHA256SUMS.txt'];
}
// The migration floor exceeds the former 100000 + Actions run number.
// Full-history commit counts increase on main, including upstream-only commits.
export function androidVersionCode(commitCount:number) {
  if(!Number.isSafeInteger(commitCount)||commitCount<1||commitCount>2_099_000_000)throw new Error('Invalid full-history commit count');
  return 1_000_000+commitCount;
}
export function assertAndroidUpgrade(next:number,previous:number) {
  if(!Number.isSafeInteger(previous)||previous<1||!Number.isSafeInteger(next)||next<=previous||next>2_100_000_000)throw new Error('Android version code must increase beyond the published APK');
}
export function assertPublishSource(head:string,main:string,status:string) {
  if(!/^[a-f0-9]{40}$/.test(head)||head!==main)throw new Error('Publish the exact current origin/main commit');
  if(status.trim())throw new Error('Commit all source changes before preparing or publishing a release');
}
export function parseArtifact(value:unknown) {
  const raw=record(value,'release artifact');
  const name=text(raw['name']),bytes=finite(raw['bytes']),sha256=text(raw['sha256']);
  if(!/^[\w.-]+$/.test(name)||!Number.isSafeInteger(bytes)||bytes<=0||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid release artifact');
  return {name,bytes,sha256};
}
export type ReleaseArtifact=ReturnType<typeof parseArtifact>;
export function assertArtifacts(expected:readonly ReleaseArtifact[],actual:readonly ReleaseArtifact[],info:ReleaseProvenance) {
  const names=releaseFiles(info).sort();
  for(const entries of [expected,actual])if(JSON.stringify(entries.map(entry=>entry.name).sort())!==JSON.stringify(names))throw new Error('Release must contain exactly four desktop archives, one APK, provenance and checksums');
  for(const artifact of expected) {
    const found=actual.find(entry=>entry.name===artifact.name);
    if(!found||found.bytes!==artifact.bytes||found.sha256!==artifact.sha256)throw new Error(`Release artifact changed: ${artifact.name}`);
  }
}
export function parseReceipt(value:unknown) {
  const raw=record(value,'local release receipt');
  if(raw['validated']!==true)throw new Error('Local acceptance has not passed');
  const info=parseProvenance(raw['info']);
  const code=finite(raw['androidVersionCode']);
  assertAndroidUpgrade(code,1);
  const artifacts=list(raw['artifacts'],parseArtifact);
  assertArtifacts(artifacts,artifacts,info);
  return {info,androidVersionCode:code,artifacts};
}

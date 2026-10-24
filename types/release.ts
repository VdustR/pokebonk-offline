import {record,text} from './data.ts';

export function version(value:unknown) {
  const result=text(value,'release version');
  if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(result))throw new Error('Release version must be stable major.minor.patch');
  return result;
}
export function buildId(value:unknown) {
  const result=text(value,'upstream build');
  if(!/^[\w-]+$/.test(result))throw new Error('Invalid upstream build');
  return result;
}
export function releaseIdentity(upstreamVersion:unknown,offlineVersion:unknown,upstreamBuild:unknown) {
  const game=version(upstreamVersion),offline=version(offlineVersion),build=buildId(upstreamBuild);
  return {tag:`upstream-v${game}-offline-v${offline}-build-${build}`,title:`PokéBonk ${game} · Offline ${offline}`,upstreamVersion:game,offlineVersion:offline,upstreamBuild:build};
}
export function parseProvenance(value:unknown) {
  const raw=record(value,'release provenance');
  const identity=releaseIdentity(raw['upstreamVersion'],raw['offlineVersion'],raw['upstreamBuild']);
  const builder=text(raw['builder']),sourceDigest=text(raw['sourceDigest']);
  if(!/^[a-f0-9]{40}$/.test(builder)||!/^[a-f0-9]{64}$/.test(sourceDigest))throw new Error('Invalid build provenance');
  if(raw['variant']!=='unlock-all')throw new Error('Unsupported release variant');
  return {...identity,builder,sourceDigest,variant:'unlock-all' as const};
}
export type ReleaseProvenance=ReturnType<typeof parseProvenance>;
export function releaseMarker(info:ReleaseProvenance) {return `<!-- pokebonk-release:${JSON.stringify(info)} -->`;}
export function releaseRequired(existing:unknown,expected:ReleaseProvenance) {
  if(existing===undefined)return true;
  const release=record(existing,'GitHub release');
  if(typeof release['draft']!=='boolean')throw new Error('Invalid release draft state');
  const marker=text(release['body'],'release notes').match(/<!-- pokebonk-release:(.*?) -->/);
  if(!marker?.[1])throw new Error('Published identity has no build provenance');
  const info=parseProvenance(JSON.parse(marker[1]));
  if(info.tag!==expected.tag)throw new Error('Published release identity mismatch');
  if(info.sourceDigest!==expected.sourceDigest)throw new Error('Packaged source changed without an offline version bump; add and version a changeset');
  if(release['draft']&&info.builder!==expected.builder)throw new Error('Draft belongs to another commit; resume its original CI run');
  return release['draft'];
}
export function releaseNotes(info:ReleaseProvenance,changelog:string) {
  const heading=`## ${info.offlineVersion}`;
  const start=changelog.split('\n').findIndex(line=>line.trim()===heading);
  if(start<0)throw new Error('Missing offline version in CHANGELOG.md');
  const lines=changelog.split('\n').slice(start+1);
  const next=lines.findIndex(line=>line.startsWith('## '));
  const changes=lines.slice(0,next<0?undefined:next).join('\n').trim();
  if(!changes)throw new Error('Empty offline changelog entry');
  return `${info.title}\n\nUnofficial offline **Unlocked** edition.\n\n- Upstream game: **${info.upstreamVersion}** (build \`${info.upstreamBuild}\`).\n- Offline builder: **${info.offlineVersion}**.\n- Source: [builder commit](https://github.com/VdustR/pokebonk-offline/commit/${info.builder}).\n\n## Offline builder changes\n\n${changes}\n\n## Downloads\n\nChoose the archive for your platform, or the signed Android 8+ APK. SHA256SUMS.txt verifies the downloads; release-info.json records the exact build provenance. Saves stay local. Online accounts, rankings and co-op are unavailable.\n\nmacOS apps have ad-hoc signatures and are not notarized. Android requests no INTERNET permission. See the [installation guide](https://github.com/VdustR/pokebonk-offline#macos-installation-and-first-launch).\n\n${releaseMarker(info)}\n`;
}

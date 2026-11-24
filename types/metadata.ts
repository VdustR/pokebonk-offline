import {record,text,finite,list} from './data.ts';
import {version} from './release.ts';
export function parseMetadata(value: unknown) {
  const v=record(value,'build metadata');
  const treasures=list(v['treasures'],value=>{const wheel=record(value);return {id:text(wheel['id']),starter:finite(wheel['starter']),series:finite(wheel['series']),prizes:list(wheel['prizes'],value=>text(value)),cosmetics:list(wheel['cosmetics'],value=>text(value))};});
  const mythicCosmetics=list(v['mythicCosmetics'],value=>text(value));
  return {treasures,mythicCosmetics,upstreamBuild:text(v['upstreamBuild']),upstreamVersion:version(v['upstreamVersion']),offlineVersion:version(v['offlineVersion']),sourceDigest:text(v['sourceDigest']),variant:text(v['variant']),league:finite(v['league']),lab:finite(v['lab']),items:finite(v['items']),achievements:finite(v['achievements']),medals:finite(v['medals']),medalRank:finite(v['medalRank']),statusIcons:list(v['statusIcons'],v=>text(v)),reactionIcons:list(v['reactionIcons'],v=>text(v)),itemIcons:list(v['itemIcons'],v=>text(v)),builder:text(v['builder'])};
}
export type BuildMetadata=ReturnType<typeof parseMetadata>;
export function parseManifest(value: unknown) {
  const v=record(value,'asset manifest');
  return {files:list(v['files'],entry=>{const f=record(entry);return{name:text(f['name']),bytes:finite(f['bytes']),sha256:text(f['sha256'])};})};
}

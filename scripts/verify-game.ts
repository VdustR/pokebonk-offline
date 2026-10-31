import {inspectReleaseIcons} from './release-icons.ts';
import {treasureAssetPaths} from './treasure-catalog.ts';
import {parseMetadata,parseManifest} from '../types/metadata.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {inspectIconCatalogs} from './catalog-icons.ts';
import {inspectItemIcons} from './item-icons.ts';
import {inspectMutationAssets} from './mutation-assets.ts';
import {inspectAnimatedSprites} from './sprite-assets.ts';
const root=path.resolve(process.argv[2]??'build/game');
const manifest=parseManifest(JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8')));
for(const entry of manifest.files){
 if(path.resolve(root,entry.name)!==path.join(root,entry.name)||entry.name.includes('..'))throw new Error('Invalid manifest path');
 const bytes=await readFile(path.join(root,entry.name));
 if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Integrity mismatch: ${entry.name}`);
}
const meta=parseMetadata(JSON.parse(await readFile(path.join(root,'offline-build.json'),'utf8')));
const modules=await Promise.all(manifest.files.filter(entry=>entry.name.endsWith('.js')).map(async entry=>({name:entry.name,source:await readFile(path.join(root,entry.name),'utf8')})));
const mains=modules.filter(module=>module.source.includes(' as App}'));
const configs=modules.filter(module=>!mains.includes(module)&&module.source.includes('slot-move'));
if(mains.length!==1||configs.length!==1||!mains[0]||!configs[0])throw new Error('Unsupported game modules');
const {statusIcons,reactionIcons}=inspectIconCatalogs(mains[0].source,configs[0].source);
const itemIcons=inspectItemIcons(configs[0].source,JSON.parse(await readFile(path.join(root,'data/items.json'),'utf8')));
const spriteAssets=inspectAnimatedSprites(JSON.parse(await readFile(path.join(root,'data/sprites.json'),'utf8')));
const names=new Set(manifest.files.map(entry=>entry.name));
for(const name of inspectMutationAssets(configs[0].source)) {
 if(!names.has(name))throw new Error(`Missing mutation asset: ${name}`);
 const bytes=await readFile(path.join(root,name));
 const signature=name.endsWith('.png')?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from([255,216,255]);
 if(!bytes.subarray(0,signature.length).equals(signature))throw new Error(`Invalid mutation image: ${name}`);
}
if(JSON.stringify(meta.itemIcons)!==JSON.stringify(itemIcons))throw new Error('Item icon metadata does not match catalogs');
for(const name of [...statusIcons,...reactionIcons,...itemIcons,...spriteAssets,...treasureAssetPaths(configs[0].source),...inspectReleaseIcons(mains[0].source)]) {
 if(!names.has(name))throw new Error(`Missing catalog icon: ${name}`);
 const bytes=await readFile(path.join(root,name));
 if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error(`Invalid catalog PNG: ${name}`);
}
if(process.env['EXPECTED_BUILD']&&meta.upstreamBuild!==process.env['EXPECTED_BUILD'])throw new Error('Upstream changed during collection; rerun with the new identity');
console.log(`Verified ${manifest.files.length} payload hashes for ${meta.upstreamBuild}`);

import {graphCatalogs} from './graph-catalogs.ts';
import {inspectModularIcons,inspectModularAssets,mythicCosmeticIds} from './modular-resources.ts';
import {nodesOf,literal,one} from './source.ts';
import {inspectReleaseIcons} from './release-icons.ts';
import {treasureAssetPaths,inspectTreasureCatalog} from './treasure-catalog.ts';
import {parseMetadata,parseManifest} from '../types/metadata.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {inspectIconCatalogs} from './catalog-icons.ts';
import {inspectItemIcons} from './item-icons.ts';
import {inspectMutationAssets} from './mutation-assets.ts';
import {inspectAnimatedSprites} from './sprite-assets.ts';
import {readResourceContract,assertRequiredResources,validResourceImage,resourceContractDigest} from './resource-contract.ts';
import {gameModules} from './game-modules.ts';
import {record} from '../types/data.ts';
import type {ResourceContract} from './resource-contract.ts';
import {fileURLToPath} from 'node:url';
export async function verifyGame(root:string,resourceContract:ResourceContract,expectedBuild=process.env['EXPECTED_BUILD']) {
const manifest=parseManifest(JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8')));
assertRequiredResources(new Set(manifest.files.map(entry=>entry.name)),resourceContract);
const audit=record(JSON.parse(await readFile(path.join(root,'resource-audit.json'),'utf8')));
if(audit['contractDigest']!==resourceContractDigest(resourceContract))throw new Error('Resource review contract mismatch');
for(const entry of manifest.files){
 if(path.resolve(root,entry.name)!==path.join(root,entry.name)||entry.name.includes('..'))throw new Error('Invalid manifest path');
 const bytes=await readFile(path.join(root,entry.name));
 if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Integrity mismatch: ${entry.name}`);
 if(!validResourceImage(entry.name,bytes))throw new Error(`Invalid resource image: ${entry.name}`);
}
const meta=parseMetadata(JSON.parse(await readFile(path.join(root,'offline-build.json'),'utf8')));
if(meta.upstreamBuild!==resourceContract.upstreamBuild)throw new Error('Resource review build mismatch');
const modules=gameModules(new Map(await Promise.all(manifest.files.filter(entry=>entry.name.endsWith('.js')).map(async entry=>[entry.name,await readFile(path.join(root,entry.name))] as const))));
const graphIcons=modules.graph?inspectModularIcons(modules.graph):undefined;
const {statusIcons,reactionIcons}=graphIcons??inspectIconCatalogs(modules.main.source,modules.config.source,modules.menus.source);
const assetContext=modules.graph?graphCatalogs(modules.graph,modules.config):undefined;
const cosmetics=modules.graph?one(modules.graph.modules.filter(module=>nodesOf(module.tree,'FunctionDeclaration',node=>node.params.length===4&&['shiny','spectral','classic','m1','m2'].every(style=>nodesOf(node,'SwitchCase',node=>literal(node.test)===style).length>0)).length===1),'wardrobe module'):undefined;
const cosmeticContext=modules.graph&&cosmetics?graphCatalogs(modules.graph,cosmetics):undefined;
const itemIcons=inspectItemIcons(modules.config.source,JSON.parse(await readFile(path.join(root,'data/items.json'),'utf8')),assetContext);
const modularAssets=modules.graph&&assetContext?inspectModularAssets(modules.graph,assetContext.values,JSON.parse(await readFile(path.join(root,'data/formsprites.json'),'utf8'))):[];
const treasures=inspectTreasureCatalog(cosmetics?.source??modules.config.source,cosmeticContext).map(wheel=>({id:wheel.id,starter:wheel.starter,series:wheel.series,prizes:wheel.prizes.map(prize=>prize.id),cosmetics:wheel.prizes.flatMap(prize=>prize.cosmetics)}));
if(JSON.stringify(meta.treasures)!==JSON.stringify(treasures)||JSON.stringify(meta.mythicCosmetics)!==JSON.stringify(assetContext?mythicCosmeticIds(assetContext.values):[]))throw new Error('Appearance metadata does not match catalogs');
const spriteAssets=inspectAnimatedSprites(JSON.parse(await readFile(path.join(root,'data/sprites.json'),'utf8')));
const names=new Set(manifest.files.map(entry=>entry.name));
for(const name of inspectMutationAssets(modules.config.source,cosmeticContext)) {
 if(!names.has(name))throw new Error(`Missing mutation asset: ${name}`);
 const bytes=await readFile(path.join(root,name));
 const signature=name.endsWith('.png')?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from([255,216,255]);
 if(!bytes.subarray(0,signature.length).equals(signature))throw new Error(`Invalid mutation image: ${name}`);
}
if(JSON.stringify(meta.itemIcons)!==JSON.stringify(itemIcons))throw new Error('Item icon metadata does not match catalogs');
for(const name of [...statusIcons,...reactionIcons,...(graphIcons?.goalIcons??[]),...modularAssets,...itemIcons,...spriteAssets,...treasureAssetPaths(cosmetics?.source??modules.config.source,cosmeticContext),...(graphIcons?.releaseIcons??inspectReleaseIcons(modules.menus.source))]) {
 if(!names.has(name))throw new Error(`Missing catalog icon: ${name}`);
 const bytes=await readFile(path.join(root,name));
 if(name.endsWith('.png')&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error(`Invalid catalog PNG: ${name}`);
 if(name.endsWith('.jpg')&&!bytes.subarray(0,3).equals(Buffer.from([255,216,255])))throw new Error(`Invalid catalog JPEG: ${name}`);
}
if(expectedBuild&&meta.upstreamBuild!==expectedBuild)throw new Error('Upstream changed during collection; rerun with the new identity');
return `Verified ${manifest.files.length} payload hashes for ${meta.upstreamBuild}`;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await verifyGame(path.resolve(process.argv[2]??'build/game'),await readResourceContract()));

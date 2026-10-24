import {parseMetadata,parseManifest} from '../types/metadata.ts';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]??'build/game');
const manifest=parseManifest(JSON.parse(await readFile(path.join(root,'asset-manifest.json'),'utf8')));
for(const entry of manifest.files){
 if(path.resolve(root,entry.name)!==path.join(root,entry.name)||entry.name.includes('..'))throw new Error('Invalid manifest path');
 const bytes=await readFile(path.join(root,entry.name));
 if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error(`Integrity mismatch: ${entry.name}`);
}
const meta=parseMetadata(JSON.parse(await readFile(path.join(root,'offline-build.json'),'utf8')));
if(process.env['EXPECTED_BUILD']&&meta.upstreamBuild!==process.env['EXPECTED_BUILD'])throw new Error('Upstream changed during collection; rerun with the new identity');
console.log(`Verified ${manifest.files.length} payload hashes for ${meta.upstreamBuild}`);

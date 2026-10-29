import {promoteSnapshot,snapshotDirectory} from './upstream-snapshot.ts';

const source=process.argv[2],destination=process.argv[3]??snapshotDirectory,expected=process.argv[4];
if(!source||!expected||!/^[a-f0-9]{64}$/.test(expected))throw new Error('Supply a candidate directory and validated snapshot digest');
const manifest=await promoteSnapshot(source,destination,expected);
console.log(`Accepted PokéBonk ${manifest.upstreamVersion} (${manifest.upstreamBuild}, ${manifest.digest})`);

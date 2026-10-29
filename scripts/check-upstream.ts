import {appendFile} from 'node:fs/promises';
import {discoverUpstream} from './upstream-version.ts';
import {readSnapshotManifest} from './upstream-snapshot.ts';

const current=await readSnapshotManifest();
const remote=await discoverUpstream();
const changed=remote.build!==current.upstreamBuild;
if(!changed&&remote.upstreamVersion!==current.upstreamVersion)throw new Error('Upstream changed a version under the same build identity');
const output=`changed=${changed}\nbuild=${remote.build}\nupstreamVersion=${remote.upstreamVersion}\n`;
console.log(output);
if(process.env['GITHUB_OUTPUT'])await appendFile(process.env['GITHUB_OUTPUT'],output);

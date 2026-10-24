import {appendFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {discoverUpstream} from './upstream-version.ts';
import {offlineVersion,sourceDigest} from './release-source.ts';
import {parseProvenance,releaseNotes,releaseRequired} from '../types/release.ts';
const {build,upstreamVersion}=await discoverUpstream();
const info=parseProvenance({upstreamVersion,upstreamBuild:build,offlineVersion:await offlineVersion(),
 builder:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDigest:await sourceDigest(),variant:'unlock-all'});
releaseNotes(info,await readFile('CHANGELOG.md','utf8'));
let changed=true;
if(process.env['GITHUB_EVENT_NAME']!=='pull_request') {
 const repository=process.env['GITHUB_REPOSITORY'];
 if(!repository||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw new Error('Missing or invalid GitHub repository');
 const response=await fetch(`https://api.github.com/repos/${repository}/releases/tags/${info.tag}`,{headers:{Authorization:`Bearer ${process.env['GH_TOKEN']}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
 if(response.ok)changed=releaseRequired(await response.json(),info);
 else if(response.status!==404)throw new Error(`Release lookup failed: ${response.status}`);
}
const output=`build=${build}\nupstreamVersion=${upstreamVersion}\nofflineVersion=${info.offlineVersion}\ntag=${info.tag}\ntitle=${info.title}\nchanged=${changed}\n`;
console.log(output);
if(process.env['GITHUB_OUTPUT'])await appendFile(process.env['GITHUB_OUTPUT'],output);

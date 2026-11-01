import {appendFile} from 'node:fs/promises';
import {discoverUpstream} from './upstream-version.ts';
import {readSnapshotManifest} from './upstream-snapshot.ts';
import {readResourceContract} from './resource-contract.ts';
import {planUpstream} from './upstream-plan.ts';

const current=await readSnapshotManifest();
const remote=await discoverUpstream();
const contract=await readResourceContract();
const plan=planUpstream(current,{upstreamBuild:remote.build,upstreamVersion:remote.upstreamVersion},contract.upstreamBuild);
const output=`changed=${plan.changed}\neligible=${plan.eligible}\nstatus=${plan.status}\nbuild=${remote.build}\nupstreamVersion=${remote.upstreamVersion}\n`;
console.log(output);
if(process.env['GITHUB_OUTPUT'])await appendFile(process.env['GITHUB_OUTPUT'],output);
if(plan.status==='review-required')console.log('::notice title=Upstream resource review required::New upstream build detected. Acquisition and publication are held until docs/resource-completeness.md review is complete.');
if(process.env['GITHUB_STEP_SUMMARY'])await appendFile(process.env['GITHUB_STEP_SUMMARY'],`## Upstream snapshot: ${plan.status}\n\nAccepted: ${current.upstreamVersion} (${current.upstreamBuild}).\nDetected: ${remote.upstreamVersion} (${remote.build}).\nReviewed resource build: ${contract.upstreamBuild}.\n\n${plan.status==='review-required'?'Acquisition, validation and publication are held. Follow docs/resource-completeness.md to review the upstream resources; no candidate has been accepted.':plan.status==='current'?'The accepted snapshot is current.':'The reviewed build may proceed to acquisition and all validation gates.'}\n`);

import {appendFile} from 'node:fs/promises';
import {readSnapshotManifest} from './upstream-snapshot.ts';
import {discoverUpstream} from './upstream-version.ts';
import {githubVersionIssues,reconcileVersionIssue} from './upstream-issue.ts';
import {text} from '../types/data.ts';

const repository=text(process.env['GITHUB_REPOSITORY'],'GitHub repository');
const bootstrap=process.argv[2]==='--bootstrap',configured=process.env['UPSTREAM_UPDATE_ISSUE'];
if(process.argv.length>3||(process.argv[2]!==undefined&&!bootstrap))throw new Error('Unsupported reporter argument');
if(configured===undefined&&!bootstrap)throw new Error('Configure UPSTREAM_UPDATE_ISSUE with the canonical tracker number; bootstrap it once before enabling the workflow');
if(configured!==undefined&&!/^[1-9]\d*$/.test(configured))throw new Error('Invalid pinned upstream update issue');
const pinned=configured===undefined?undefined:Number(configured);
const current=await readSnapshotManifest(),upstream=await discoverUpstream();
const detected={upstreamVersion:upstream.upstreamVersion,upstreamBuild:upstream.build};
const result=reconcileVersionIssue(repository,current,detected,githubVersionIssues(repository),pinned);
console.log(JSON.stringify({current:{version:current.upstreamVersion,build:current.upstreamBuild},detected,result}));
if(process.env['GITHUB_OUTPUT'])await appendFile(process.env['GITHUB_OUTPUT'],`action=${result.action}\nissue=${result.issue??''}\n`);
if(process.env['GITHUB_STEP_SUMMARY'])await appendFile(process.env['GITHUB_STEP_SUMMARY'],`## Upstream version: ${result.action}\n\nAccepted: ${current.upstreamVersion} (${current.upstreamBuild}).\nDetected: ${upstream.upstreamVersion} (${upstream.build}).\n\n${result.issue?`[Version tracker](https://github.com/${repository}/issues/${result.issue}).`:'No update issue is needed.'}\n`);

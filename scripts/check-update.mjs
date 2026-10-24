import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const response=await fetch('https://pokebonk.com/index.html?offline-check='+Date.now(),{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Upstream index: ${response.status}`);
const html=await response.text();
const build=html.match(/name="pokebonk-build" content="([\w-]+)"/)?.[1];
if(!build)throw new Error('Missing upstream build');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tag=`game-${build}-builder-${revision.slice(0,12)}`;
let changed=true;
if(process.env.GITHUB_EVENT_NAME!=='pull_request') {
 const existing=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/releases/tags/${tag}`,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
 if(existing.ok)changed=(await existing.json()).draft;
 else if(existing.status!==404)throw new Error(`Release lookup failed: ${existing.status}`);
}
const output=`build=${build}\ntag=${tag}\nchanged=${changed}\n`;
console.log(output);
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,output);

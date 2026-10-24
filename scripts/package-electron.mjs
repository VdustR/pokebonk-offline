import { packager } from '@electron/packager';
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [gameArg = 'build/game', outputArg = 'release', platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!['darwin','win32','linux'].includes(platform) || !['arm64','x64'].includes(arch)) throw new Error('Unsupported target');
const game = path.resolve(gameArg), output = path.resolve(outputArg);
const meta = JSON.parse(await readFile(path.join(game,'offline-build.json'),'utf8'));
const temp = await mkdtemp(path.join(os.tmpdir(),'pokebonk-package-'));
try {
  const appDirectory = path.join(temp,'app');
  await mkdir(appDirectory);
  await cp('desktop/main.mjs',path.join(appDirectory,'main.mjs'));
  await cp('LICENSE',path.join(appDirectory,'LICENSE'));
  await writeFile(path.join(appDirectory,'package.json'),JSON.stringify({name:'pokebonk-offline',productName:'Pokebonk Offline',version:meta.upstreamVersion,type:'module',main:'main.mjs',author:'VdustR'}));
  const [packaged] = await packager({dir:appDirectory,out:temp,name:'Pokebonk Offline',platform,arch,
    electronVersion:require('electron/package.json').version,appBundleId:'dev.vdustr.pokebonk.offline',
    appVersion:meta.upstreamVersion,asar:true,overwrite:true,prune:false});
  const resources = platform === 'darwin' ? path.join(packaged,'Pokebonk Offline.app/Contents/Resources') : path.join(packaged,'resources');
  await cp(game,path.join(resources,'game'),{recursive:true});
  if (platform === 'darwin' && process.platform === 'darwin') execFileSync(process.execPath,['scripts/finalize-macos-electron-app.mjs',path.join(packaged,'Pokebonk Offline.app')],{stdio:'inherit'});
  await mkdir(output,{recursive:true});
  const file=path.join(output,`pokebonk-${platform}-${arch}-${meta.upstreamBuild}.${platform === 'linux' ? 'tar.gz' : 'zip'}`);
  await rm(file,{force:true});
  if(platform === 'linux') execFileSync('tar',['-czf',file,'-C',temp,path.basename(packaged)],{stdio:'inherit'});
  else execFileSync('zip',['-qry','-y',file,path.basename(packaged)],{cwd:temp,stdio:'inherit'});
  console.log(file);
} finally { await rm(temp,{recursive:true,force:true}); }

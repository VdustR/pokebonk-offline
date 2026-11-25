import {preparationKey,runReleaseStages,withReleaseLock} from './release-stages.ts';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,statfs,access,rm} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {errorCode,list,record,text} from '../types/data.ts';
import {parseProvenance,releaseNotes,releaseRequired} from '../types/release.ts';
import {offlineVersion,sourceDigest} from './release-source.ts';
import {readSnapshotManifest} from './upstream-snapshot.ts';
import {androidVersionCode,assertAndroidUpgrade,assertArtifacts,assertPublishSource,desktopTargets,findRelease,inspectReleaseDirectory,signingSidecars,parseArtifact,parseReceipt,releaseFiles} from './local-release-policy.ts';
import type {ReleaseArtifact} from './local-release-policy.ts';

const mode=process.argv[2]??'release';
if(!['release','prepare','publish'].includes(mode)||process.argv.length>3)throw new Error('Usage: pnpm release:local [prepare|publish]');
if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw new Error('The complete local release runs on macOS (including Mac signing)');
const repository='VdustR/pokebonk-offline';
const childEnv={...process.env};
for(const name of ['ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_PASSWORD','ANDROID_KEY_ALIAS'])delete childEnv[name];
const capture=(command:string,args:string[])=>execFileSync(command,args,{env:childEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:16*1024*1024}).trim();
const run=(command:string,args:string[])=>{console.log('+',command,...args);execFileSync(command,args,{env:childEnv,stdio:'inherit',timeout:15*60*1000});};
const node=(...args:string[])=>run(process.execPath,args);
const api=(endpoint:string)=>JSON.parse(capture('gh',['api',`repos/${repository}/${endpoint}`])) as unknown;
const release=(tag:string)=>findRelease(tag,api);
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const head=capture('git',['rev-parse','HEAD']);
assertPublishSource(head,head,capture('git',['status','--porcelain','--untracked-files=normal']));
if(capture('git',['rev-parse','--is-shallow-repository'])!=='false')throw new Error('Fetch full Git history before calculating Android version codes');
const snapshot=await readSnapshotManifest();
const info=parseProvenance({upstreamVersion:snapshot.upstreamVersion,upstreamBuild:snapshot.upstreamBuild,
  offlineVersion:await offlineVersion(),builder:head,sourceDigest:await sourceDigest(),variant:'unlock-all'});
const code=androidVersionCode(Number(capture('git',['rev-list','--count','HEAD'])));
const directory=path.resolve('release',info.tag+'-'+head.slice(0,12));
const work=path.resolve('cache/local-release',info.tag+'-'+head.slice(0,12));
const receiptFile=path.join(work,'receipt.json');
await mkdir(work,{recursive:true});
await withReleaseLock(path.resolve('cache/local-release'),async()=>{
const existing=release(info.tag);
if(existing&&!releaseRequired(existing,info)) {
  const remote=remoteArtifacts(existing);assertArtifacts(remote,remote,info);
  console.log(`Already published: https://github.com/${repository}/releases/tag/${info.tag}`);
  return;
}
const sdk=process.env['ANDROID_HOME']??process.env['ANDROID_SDK_ROOT'];
if(!sdk)throw new Error('Set ANDROID_HOME to the existing Android SDK');
const buildTools=path.join(sdk,'build-tools/36.0.0');
function apkVersion(apk:string) {
  const output=capture(path.join(buildTools,'aapt2'),['dump','badging',apk]);
  const value=Number(output.match(/^package:.*versionCode='(\d+)'/m)?.[1]);
  if(!Number.isSafeInteger(value)||value<1)throw new Error('Unable to read published Android version code');
  return value;
}
// Read the actual public APK, including legacy releases without version-code metadata.
const latest=record(api('releases/latest'),'latest release');
const latestTag=text(latest['tag_name']);
if(!/^[\w.-]+$/.test(latestTag))throw new Error('Unsupported published release tag');
const previousDirectory=path.resolve('cache/local-release/public',latestTag);await mkdir(previousDirectory,{recursive:true});
const previousApk=list(latest['assets'],value=>record(value)).filter(asset=>text(asset['name']).endsWith('.apk'));
assert.equal(previousApk.length,1,'Latest release must have one Android APK');
const previousName=text(previousApk[0]?.['name']);
if(path.basename(previousName)!==previousName)throw new Error('Invalid published APK filename');
for(const name of [previousName,'SHA256SUMS.txt']) {
  const present=await access(path.join(previousDirectory,name)).then(()=>true,()=>false);
  if(!present)run('gh',['release','download',latestTag,'--repo',repository,'--pattern',name,'--dir',previousDirectory]);
}
const previousBytes=await readFile(path.join(previousDirectory,previousName));
const previousChecksums=await readFile(path.join(previousDirectory,'SHA256SUMS.txt'),'utf8');
assert.ok(previousChecksums.split('\n').includes(`${sha(previousBytes)}  ${previousName}`),'Published Android checksum mismatch');
const previousCode=apkVersion(path.join(previousDirectory,previousName));
assertAndroidUpgrade(code,previousCode);

async function artifacts():Promise<ReleaseArtifact[]> {
  assert.deepEqual((await readdir(directory)).sort(),releaseFiles(info).sort(),'Unexpected or incomplete release files');
  const result:ReleaseArtifact[]=[];
  for(const name of releaseFiles(info)){const bytes=await readFile(path.join(directory,name));result.push({name,bytes:bytes.length,sha256:sha(bytes)});}
  return result;
}
// Preparation identity is deliberately commit-bound. Cross-commit proof reuse
// needs a separate provenance design; a squash still gets fresh preparation.
let identity:string|undefined;
if(mode!=='publish') {
  const java=process.env['JAVA_HOME'],keystore=process.env['POKEBONK_ANDROID_KEYSTORE'];
  if(!java||!keystore)throw new Error('Configure the existing JDK and signing keystore before preparation');
  const installed=async(name:string)=>text(record(JSON.parse(await readFile(path.join('node_modules',name,'package.json'),'utf8')))['version']);
  const [electron,packager,typescript,playwright]=await Promise.all([installed('electron'),installed('@electron/packager'),installed('typescript'),installed('playwright-core')]);
  identity=preparationKey({provenance:JSON.stringify(info),androidVersionCode:String(code),
    node:process.version,pnpm:capture('pnpm',['--version']),host:process.platform+'-'+process.arch+'-'+os.release(),
    electron,packager,typescript,playwright,
    javaHome:java,java:capture(path.join(java,'bin/java'),['--version']),sdk,
    aapt:capture(path.join(buildTools,'aapt2'),['version']),signer:capture(path.join(buildTools,'apksigner'),['version']),
    androidPlatform:sha(await readFile(path.join(sdk,'platforms/android-36/android.jar'))),signingKeystore:sha(await readFile(keystore))});
}
let prepared:ReturnType<typeof parseReceipt>|undefined;
let rawReceipt:unknown;
try {rawReceipt=JSON.parse(await readFile(receiptFile,'utf8'));}catch(error){if(errorCode(error)!=='ENOENT')throw error;}
if(rawReceipt!==undefined) {
  const candidate=parseReceipt(rawReceipt);assert.deepEqual(candidate.info,info);assert.equal(candidate.androidVersionCode,code);
  const names=await readdir(directory).catch(error=>{if(errorCode(error)==='ENOENT')return [];throw error;});
  let intact=inspectReleaseDirectory(names,info,mode!=='publish');
  if(intact)for(const expected of candidate.artifacts){const bytes=await readFile(path.join(directory,expected.name));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256){intact=false;break;}}
  if(intact&&(mode==='publish'||record(rawReceipt)['preparationKey']===identity))prepared=candidate;
  else if(mode==='publish')throw new Error('Release artifacts changed; rerun preparation before publishing');
  if(prepared)console.log('Reusing complete acceptance and unchanged artifacts:',receiptFile);
}
if(mode!=='publish'&&!prepared) {
  const keystore=process.env['POKEBONK_ANDROID_KEYSTORE'];
  if(!keystore||!process.env['ANDROID_KEYSTORE_PASSWORD']||!process.env['ANDROID_KEY_PASSWORD'])throw new Error('Configure the existing Android keystore and signing environment before building');
  assert.ok(identity);
  const disk=await statfs('.');if(disk.bavail*disk.bsize<8*1024**3)throw new Error('Local release needs at least 8 GiB of free staging space');
  const existingNames=await readdir(directory).catch(error=>{if(errorCode(error)==='ENOENT')return [];throw error;});
  inspectReleaseDirectory(existingNames,info,true);
  const journalExists=await access(path.join(work,'stages.json')).then(()=>true,error=>{if(errorCode(error)==='ENOENT')return false;throw error;});
  if(existingNames.length&&!journalExists)throw new Error('Preparation has no stage journal; retain the existing output and inspect its owner before retrying');
  await mkdir(directory,{recursive:true});
  const game=path.resolve('build/game'),relative=(name:string)=>path.relative(process.cwd(),name);
  const archiveFor=(platform:string,arch:string)=>{const name=releaseFiles(info).find(name=>name.includes(`-${platform}-${arch}-`));assert.ok(name);return path.join(directory,name);};
  const apk=path.join(directory,`pokebonk-offline-${info.offlineVersion}-unlocked-android.apk`);
  const checkInputs=async()=>{
    assert.equal(capture('git',['rev-parse','HEAD']),head,'Source commit changed during preparation');
    assertPublishSource(head,head,capture('git',['status','--porcelain','--untracked-files=normal']));
    assert.equal(await sourceDigest(),info.sourceDigest,'Source changed during preparation');
  };
  await runReleaseStages({work,identity,checkInputs,stages:[
    {id:'source-checks',outputs:['dist'],run:()=>{run('pnpm',['typecheck']);run('pnpm',['test:types']);run('pnpm',['test']);}},
    {id:'offline-payload',outputs:[relative(game)],run:()=>{node('--import','./test/no-upstream-network.ts','scripts/prepare-game.ts');node('scripts/verify-game.ts');}},
    {id:'native-smoke',outputs:[],run:()=>node('e2e/electron.ts',game,'--smoke')},
    ...desktopTargets.map(([platform,arch])=>({id:`desktop-${platform}-${arch}`,outputs:[relative(archiveFor(platform,arch))],run:()=>node('scripts/package-electron.ts',game,directory,platform,arch)})),
    {id:'android',outputs:[relative(apk),relative(path.join(work,'android-verification.json'))],run:async()=>{
      node('scripts/stage-android.ts',game);
      run('android/gradlew',['--project-dir','android','--no-daemon',`-PpokebonkVersionCode=${code}`,`-PpokebonkVersionName=${info.offlineVersion}`,'assembleRelease','lintRelease']);
      console.log('+ Sign Android APK with the existing pinned certificate');
      execFileSync(process.execPath,['scripts/sign-android.ts','android/app/build/outputs/apk/release/app-release-unsigned.apk',apk,keystore],{stdio:'inherit',env:process.env});
      assert.equal(apkVersion(apk),code);
      const {rename}=await import('node:fs/promises');await rename(apk+'.verification.json',path.join(work,'android-verification.json'));await rm(apk+'.idsig',{force:true});
    }},
    {id:'packaged-native',outputs:[],run:async()=>{
      for(const [platform,arch] of desktopTargets) {
        const root=`Pokebonk Offline-${platform}-${arch}`;
        const metadata=platform==='darwin'?`${root}/Pokebonk Offline.app/Contents/Resources/game/offline-build.json`:`${root}/resources/game/offline-build.json`;
        const value=capture(platform==='linux'?'tar':'unzip',platform==='linux'?['-xOf',archiveFor(platform,arch),metadata]:['-p',archiveFor(platform,arch),metadata]);
        assert.deepEqual(parseProvenance(JSON.parse(value)),info,'Packaged desktop source differs');
      }
      assert.deepEqual(parseProvenance(JSON.parse(capture('unzip',['-p',apk,'assets/www/offline-build.json']))),info,'Packaged Android source differs');
      const extracted=path.join(work,'native');await rm(extracted,{recursive:true,force:true});await mkdir(extracted);
      run('ditto',['-x','-k',archiveFor('darwin',process.arch),extracted]);
      const app=path.join(extracted,`Pokebonk Offline-darwin-${process.arch}/Pokebonk Offline.app`);
      node('scripts/verify-macos-electron-app.ts',app);
      node('e2e/electron.ts',path.join(app,'Contents/Resources/game'),path.join(app,'Contents/MacOS/Pokebonk Offline'));
    }},
    {id:'release-metadata',outputs:[relative(path.join(directory,'release-info.json')),relative(path.join(directory,'SHA256SUMS.txt'))],run:async()=>{
      await writeFile(path.join(work,'notes.md'),releaseNotes(info,await readFile('CHANGELOG.md','utf8')));
      await writeFile(path.join(directory,'release-info.json'),JSON.stringify({...info,androidVersionCode:code,
        validation:{host:`darwin-${process.arch}`,checks:['types','unit','payload','native-smoke','packaged-native-gameplay-and-save-restart','android-signature-and-permissions'],otherTargets:'Packaged and payload-verified; not run on physical target devices.'}},null,2)+'\n');
      const lines=[];for(const name of releaseFiles(info).filter(name=>name!=='SHA256SUMS.txt'))lines.push(`${sha(await readFile(path.join(directory,name)))}  ${name}`);
      await writeFile(path.join(directory,'SHA256SUMS.txt'),lines.join('\n')+'\n');
    }},
  ]});
  for(const sidecar of signingSidecars(info))await rm(path.join(directory,sidecar),{force:true});
  await checkInputs();
  await writeFile(receiptFile,JSON.stringify({info,androidVersionCode:code,preparationKey:identity,validated:true,artifacts:await artifacts()},null,2)+'\n');
  console.log('Local acceptance passed:',receiptFile);
}
if(mode==='prepare')return;
const receipt=prepared??parseReceipt(JSON.parse(await readFile(receiptFile,'utf8')));
assert.deepEqual(receipt.info,info);assert.equal(receipt.androidVersionCode,code);
assertArtifacts(receipt.artifacts,await artifacts(),info);
run('git',['fetch','origin','main']);
assertPublishSource(head,capture('git',['rev-parse','origin/main']),capture('git',['status','--porcelain','--untracked-files=normal']));
assert.equal(await sourceDigest(),info.sourceDigest);
// The latest release may have advanced while local builds were running.
assert.equal(record(api('releases/latest'))['tag_name'],latestTag,'Latest release changed; recheck Android version ordering');
await writeFile(path.join(work,'notes.md'),releaseNotes(info,await readFile('CHANGELOG.md','utf8')));
const files=releaseFiles(info).map(name=>path.join(directory,name));
const current=release(info.tag);
if(current){assert.equal(releaseRequired(current,info),true);run('gh',['release','upload',info.tag,'--repo',repository,'--clobber',...files]);}
else run('gh',['release','create',info.tag,'--repo',repository,'--target',head,'--draft','--title',info.title,'--notes-file',path.join(work,'notes.md'),...files]);
function remoteArtifacts(value:unknown) {
  return list(record(value)['assets'],asset=>{const raw=record(asset);const digest=text(raw['digest']);if(!digest.startsWith('sha256:'))throw new Error('Missing GitHub upload digest');return parseArtifact({name:raw['name'],bytes:raw['size'],sha256:digest.slice(7)});});
}
assertArtifacts(receipt.artifacts,remoteArtifacts(release(info.tag)),info);
run('git',['fetch','origin','main']);
assert.equal(capture('git',['rev-parse','HEAD']),head,'Source commit changed during upload');
assertPublishSource(head,capture('git',['rev-parse','origin/main']),capture('git',['status','--porcelain','--untracked-files=normal']));
assert.equal(await sourceDigest(),info.sourceDigest,'Source changed during upload');
run('gh',['release','edit',info.tag,'--repo',repository,'--draft=false','--latest']);
const published=release(info.tag);assert.equal(published?.['draft'],false);
assertArtifacts(receipt.artifacts,remoteArtifacts(published),info);
assert.equal(record(api('releases/latest'))['tag_name'],info.tag);
await writeFile(path.join(work,'published.json'),JSON.stringify(published,null,2)+'\n');
console.log(`Published and verified: https://github.com/${repository}/releases/tag/${info.tag}`);

});

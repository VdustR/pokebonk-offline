import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,statfs,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {errorCode,list,record,text} from '../types/data.ts';
import {parseProvenance,releaseNotes,releaseRequired} from '../types/release.ts';
import {offlineVersion,sourceDigest} from './release-source.ts';
import {readSnapshotManifest} from './upstream-snapshot.ts';
import {androidVersionCode,assertAndroidUpgrade,assertArtifacts,assertPublishSource,desktopTargets,parseArtifact,parseReceipt,releaseFiles} from './local-release-policy.ts';
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
function release(tag:string) {
  const result=spawnSync('gh',['api',`repos/${repository}/releases/tags/${tag}`],{env:childEnv,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  if(result.error)throw result.error;
  if(result.status===0)return record(JSON.parse(result.stdout),'GitHub release');
  if(result.stderr.includes('(HTTP 404)'))return undefined;
  throw new Error(`Release lookup failed: ${result.stderr}`);
}
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
const existing=release(info.tag);
if(existing&&!releaseRequired(existing,info)) {
  const remote=remoteArtifacts(existing);assertArtifacts(remote,remote,info);
  console.log(`Already published: https://github.com/${repository}/releases/tag/${info.tag}`);
  process.exit(0);
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
let prepared:ReturnType<typeof parseReceipt>|undefined;
try {prepared=parseReceipt(JSON.parse(await readFile(receiptFile,'utf8')));}
catch(error){if(errorCode(error)!=='ENOENT')throw error;}
if(prepared) {
  assert.deepEqual(prepared.info,info);assert.equal(prepared.androidVersionCode,code);
  assertArtifacts(prepared.artifacts,await artifacts(),info);
  console.log('Reusing acceptance for the same clean source commit and unchanged artifacts:',receiptFile);
}
if(mode!=='publish'&&!prepared) {
  const keystore=process.env['POKEBONK_ANDROID_KEYSTORE'];
  if(!keystore||!process.env['ANDROID_KEYSTORE_PASSWORD']||!process.env['ANDROID_KEY_PASSWORD'])throw new Error('Configure the existing Android keystore and signing environment before building');
  if(!process.env['JAVA_HOME'])throw new Error('Set JAVA_HOME to an existing JDK 17 or newer');
  const disk=await statfs('.');
  if(disk.bavail*disk.bsize<8*1024**3)throw new Error('Local release needs at least 8 GiB of free staging space');
  await mkdir(path.dirname(directory),{recursive:true});
  await mkdir(directory,{recursive:false});
  run('pnpm',['typecheck']);run('pnpm',['test:types']);run('pnpm',['test']);
  node('--import','./test/no-upstream-network.ts','scripts/prepare-game.ts');
  node('scripts/verify-game.ts');
  const game=path.resolve('build/game');
  for(const [platform,arch] of desktopTargets)node('scripts/package-electron.ts',game,directory,platform,arch);
  node('scripts/stage-android.ts',game);
  run('android/gradlew',['--project-dir','android','--no-daemon',`-PpokebonkVersionCode=${code}`,`-PpokebonkVersionName=${info.offlineVersion}`,'assembleRelease','lintRelease']);
  const apkName=`pokebonk-offline-${info.offlineVersion}-unlocked-android.apk`;
  const apk=path.join(directory,apkName);
  console.log('+ Sign Android APK with the existing pinned certificate');
  execFileSync(process.execPath,['scripts/sign-android.ts','android/app/build/outputs/apk/release/app-release-unsigned.apk',apk,keystore],{stdio:'inherit',env:process.env});
  assert.equal(apkVersion(apk),code);
  // Verification sidecars remain local; the published contract has seven files.
  const {rename}=await import('node:fs/promises');
  await rename(apk+'.verification.json',path.join(work,'android-verification.json'));
  const idsig=apk+'.idsig';
  const {rm}=await import('node:fs/promises');await rm(idsig,{force:true});
  for(const [platform,arch] of desktopTargets) {
    const archive=releaseFiles(info).find(name=>name.includes(`-${platform}-${arch}-`));assert.ok(archive);
    const root=`Pokebonk Offline-${platform}-${arch}`;
    const metadata=platform==='darwin'?`${root}/Pokebonk Offline.app/Contents/Resources/game/offline-build.json`:`${root}/resources/game/offline-build.json`;
    const value=capture(platform==='linux'?'tar':'unzip',platform==='linux'?['-xOf',path.join(directory,archive),metadata]:['-p',path.join(directory,archive),metadata]);
    assert.deepEqual(parseProvenance(JSON.parse(value)),info,'Packaged desktop source differs');
  }
  assert.deepEqual(parseProvenance(JSON.parse(capture('unzip',['-p',apk,'assets/www/offline-build.json']))),info,'Packaged Android source differs');
  const nativeArchive=releaseFiles(info).find(name=>name.includes(`-darwin-${process.arch}-`));assert.ok(nativeArchive);
  const extracted=path.join(work,'native');await mkdir(extracted,{recursive:true});
  run('ditto',['-x','-k',path.join(directory,nativeArchive),extracted]);
  const app=path.join(extracted,`Pokebonk Offline-darwin-${process.arch}/Pokebonk Offline.app`);
  node('scripts/verify-macos-electron-app.ts',app);
  node('e2e/electron.ts',path.join(app,'Contents/Resources/game'),path.join(app,'Contents/MacOS/Pokebonk Offline'));
  assertPublishSource(head,head,capture('git',['status','--porcelain','--untracked-files=normal']));
  assert.equal(await sourceDigest(),info.sourceDigest,'Source changed during validation');
  await writeFile(path.join(work,'notes.md'),releaseNotes(info,await readFile('CHANGELOG.md','utf8')));
  await writeFile(path.join(directory,'release-info.json'),JSON.stringify({...info,androidVersionCode:code,
    validation:{host:`darwin-${process.arch}`,checks:['types','unit','payload','packaged-native-gameplay-and-save-restart','android-signature-and-permissions'],otherTargets:'Packaged and payload-verified; not run on physical target devices.'}},null,2)+'\n');
  const checksumNames=releaseFiles(info).filter(name=>name!=='SHA256SUMS.txt');
  const checksumLines=[];for(const name of checksumNames)checksumLines.push(`${sha(await readFile(path.join(directory,name)))}  ${name}`);
  await writeFile(path.join(directory,'SHA256SUMS.txt'),checksumLines.join('\n')+'\n');
  await writeFile(receiptFile,JSON.stringify({info,androidVersionCode:code,validated:true,artifacts:await artifacts()},null,2)+'\n');
  console.log('Local acceptance passed:',receiptFile);
}
if(mode==='prepare')process.exit(0);
const receipt=prepared??parseReceipt(JSON.parse(await readFile(receiptFile,'utf8')));
assert.deepEqual(receipt.info,info);assert.equal(receipt.androidVersionCode,code);
assertArtifacts(receipt.artifacts,await artifacts(),info);
run('git',['fetch','origin','main']);
assertPublishSource(head,capture('git',['rev-parse','origin/main']),capture('git',['status','--porcelain','--untracked-files=normal']));
assert.equal(await sourceDigest(),info.sourceDigest);
// The latest release may have advanced while local builds were running.
assert.equal(record(api('releases/latest'))['tag_name'],latestTag,'Latest release changed; recheck Android version ordering');
const files=releaseFiles(info).map(name=>path.join(directory,name));
const current=release(info.tag);
if(current){assert.equal(releaseRequired(current,info),true);run('gh',['release','upload',info.tag,'--repo',repository,'--clobber',...files]);}
else run('gh',['release','create',info.tag,'--repo',repository,'--target',head,'--draft','--title',info.title,'--notes-file',path.join(work,'notes.md'),...files]);
function remoteArtifacts(value:unknown) {
  return list(record(value)['assets'],asset=>{const raw=record(asset);const digest=text(raw['digest']);if(!digest.startsWith('sha256:'))throw new Error('Missing GitHub upload digest');return parseArtifact({name:raw['name'],bytes:raw['size'],sha256:digest.slice(7)});});
}
assertArtifacts(receipt.artifacts,remoteArtifacts(release(info.tag)),info);
run('gh',['release','edit',info.tag,'--repo',repository,'--draft=false','--latest']);
const published=release(info.tag);assert.equal(published?.['draft'],false);
assertArtifacts(receipt.artifacts,remoteArtifacts(published),info);
assert.equal(record(api('releases/latest'))['tag_name'],info.tag);
await writeFile(path.join(work,'published.json'),JSON.stringify(published,null,2)+'\n');
console.log(`Published and verified: https://github.com/${repository}/releases/tag/${info.tag}`);

import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const [input,output,keystore]=process.argv.slice(2);
if(!input||!output||!keystore)throw new Error('Usage: node scripts/sign-android.ts <unsigned.apk> <signed.apk> <keystore>');
for(const name of ['ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_PASSWORD'])if(!process.env[name])throw new Error(`Missing ${name}`);
const sdk=process.env['ANDROID_HOME']||process.env['ANDROID_SDK_ROOT'];
if(!sdk)throw new Error('Android SDK root is required');
const tools=path.join(sdk,'build-tools/36.0.0');
const temp=await mkdtemp(path.join(os.tmpdir(),'pokebonk-sign-'));
try {
 const aligned=path.join(temp,'aligned.apk');
 execFileSync(path.join(tools,'zipalign'),['-P','16','-f','4',input,aligned],{stdio:'pipe'});
 await mkdir(path.dirname(output),{recursive:true});
 // The dedicated keystore has one private key. Passwords are read from env,
 // never expanded into process arguments or logs.
 execFileSync(path.join(tools,'apksigner'),['sign','--ks',keystore,'--ks-pass','env:ANDROID_KEYSTORE_PASSWORD','--key-pass','env:ANDROID_KEY_PASSWORD','--out',output,aligned],{stdio:'pipe'});
 const verification=execFileSync(path.join(tools,'apksigner'),['verify','--verbose','--print-certs',output],{encoding:'utf8'});
 const certificate=verification.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]?.toLowerCase();
 if(!certificate)throw new Error('APK signer certificate is missing');
 const expected=await readFile('android/signing-certificate.sha256','utf8');
 if(expected.trim()!==certificate)throw new Error('APK signer changed; refusing an incompatible update');
 const permissions=execFileSync(path.join(tools,'aapt2'),['dump','permissions',output],{encoding:'utf8'});
 if(permissions.includes('android.permission.INTERNET'))throw new Error('Offline APK unexpectedly has network permission');
 await writeFile(output+'.verification.json',JSON.stringify({certificateSha256:certificate,noInternetPermission:true},null,2));
 console.log('APK aligned, signed and verified; no network permission.');
} finally {await rm(temp,{recursive:true,force:true});}

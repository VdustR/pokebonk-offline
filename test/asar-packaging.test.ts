import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,realpath,writeFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {record,list,text} from '../types/data.ts';

const owner=createRequire(await realpath('node_modules/@electron/packager/package.json'));
const asarPath=owner.resolve('@electron/asar');
const asar=record(await import(asarPath));
const dependency=createRequire(asarPath);
const matcher=record(await import(dependency.resolve('minimatch')));
function method(module:Record<string,unknown>,name:string) {
  const fn=module[name];if(typeof fn!=='function')throw new Error(`Missing packaging API: ${name}`);return fn;
}
test('the matcher resolved by Electron packaging honors the preprocessing expansion limit',()=>{
  const Constructor=method(matcher,'Minimatch');
  const parsed=record(Reflect.construct(Constructor,[Array(8).fill('**/../a/b').join('/'),{optimizationLevel:2,braceExpandMax:16}]));
  assert.ok(list(parsed['set'],row=>row).length<=16,'Glob preprocessing must honor the configured resource limit');
  const ordinary=record(Reflect.construct(Constructor,['**/../a/b/**/../c/d',{optimizationLevel:2}]));
  assert.equal(method(ordinary,'match').call(ordinary,'x/a/b/y/c/d'),true);
  assert.equal(method(ordinary,'match').call(ordinary,'x/a/b/y/c/z'),false);
});
test('ASAR retains files and bytes through wildcard selection and unpacking',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'pokebonk-asar-'));
  const names=['.hidden','ignore/file.txt','main.mjs','nested/asset.png','nested/code.js','package.json','space dir/a[1].js'];
  try {
    const src=path.join(root,'src');
    for(const name of names){await mkdir(path.dirname(path.join(src,name)),{recursive:true});await writeFile(path.join(src,name),name);}
    // Creating symlinks on Windows requires privileges absent on hosted runners.
    const link=process.platform!=='win32';if(link)await symlink('nested/code.js',path.join(src,'link.js'));
    const cases=[
      {options:{},expected:names},
      {options:{unpack:'*.png'},expected:names},
      {options:{unpackDir:'nested'},expected:names},
      {options:{globOptions:{ignore:['**/ignore/**']}},expected:names.filter(name=>!name.startsWith('ignore/'))},
      {options:{pattern:'/**/*.{js,mjs,json}'},expected:['main.mjs','nested/code.js','package.json','space dir/a[1].js']},
      {options:{pattern:'/**/nest*/**/*.js'},expected:['nested/code.js']},
      {options:{pattern:'/**/nested/**/co*.js'},expected:['nested/code.js']},
    ];
    for(const[index,entry]of cases.entries()){
      const archive=path.join(root,`${index}.asar`);
      await method(asar,'createPackageWithOptions')(src,archive,entry.options);
      const packed=list(method(asar,'listPackage')(archive),text).map(name=>name.replaceAll('\\','/').replace(/^\//,''));
      const files=packed.filter(name=>{const info=record(method(asar,'statFile')(archive,name,false));return !info['files']&&!info['link'];});
      assert.deepEqual(files.sort(),[...entry.expected].sort(),JSON.stringify(entry.options));
      for(const name of files){const bytes:unknown=method(asar,'extractFile')(archive,name);assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.toString(),name);}
      if(link&&packed.includes('link.js'))assert.equal(record(method(asar,'statFile')(archive,'link.js',false))['link'],'nested/code.js');
    }
  }finally{await rm(root,{recursive:true,force:true});}
});

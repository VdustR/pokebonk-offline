import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectIconCatalogs} from '../scripts/catalog-icons.ts';

const config=`const reactions=['gg','love'];const marker='slot-move';export {reactions as reactionExport};`
 +`const upgrades=[{key:'vitamin',stat:'maxHp',per:1,icon:'enigma-berry'}];const held=[{key:'poke-ball',mods:[]}];const shop=[{key:'poke-ball',price:1}];`
 +`const mutations=[{id:'glass',icon:'mut-glass',tier:0,rules:[],prize:{frame:'Frame',banner:'Banner'}}];`;
const main="import {reactionExport as reactionList} from './config.js';"
 +"function icon(id){return `ui/icons/${id}.png`;}"
 +"const statuses=[{id:'poison'}];for(const status of statuses)icon('st-'+status.id);"
 +"reactionList.map(reaction=>icon('r-'+reaction));class Application{}export{Application as App}";

test('dynamic reaction icons follow catalog additions and renamed import/export bindings',()=>{
  for(const rename of [false,true]) {
    const change=(source:string)=>rename?source.replaceAll('reaction','renamed'):source;
    const result=inspectIconCatalogs(change(main),change(config.replace("'gg','love'","'gg','love','new-token'")));
    assert.deepEqual(result.reactionIcons,['assets/ui/icons/r-gg.png','assets/ui/icons/r-love.png','assets/ui/icons/r-new-token.png']);
    assert.deepEqual(result.statusIcons,['assets/ui/icons/st-poison.png']);
  }
});
test('invalid, duplicate, empty or unresolvable reaction catalogs stop collection',()=>{
  for(const source of [config.replace("'love'","'../secret'"),config.replace("'love'","'gg'"),config.replace("['gg','love']","[]"),config.replace("'love'","42"),config.replace('reactionExport','missingExport')]) {
    assert.throws(()=>inspectIconCatalogs(main,source),/reaction/);
  }
  assert.throws(()=>inspectIconCatalogs(main.replace('reactionList.map','unknown.map'),config),/reaction/);
  assert.throws(()=>inspectIconCatalogs(main.replace("icon('r-'+reaction)","icon(`r-${reaction}`)"),config),/reaction/);
});
test('new concatenated icon families require explicit coverage',()=>{
  assert.throws(()=>inspectIconCatalogs(main+";icon('new-'+unknown);",config),/Unsupported dynamic icon prefix/);
});

test('payload verification rejects a catalog omission despite a consistent manifest',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'pokebonk-icon-catalog-'));
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const metadata={upstreamBuild:'fixture',upstreamVersion:'1.0.0',offlineVersion:'0.0.1',sourceDigest:'a'.repeat(64),variant:'unlock-all',league:1,lab:1,items:1,achievements:1,medals:1,medalRank:1,statusIcons:['assets/ui/icons/st-poison.png'],reactionIcons:['assets/ui/icons/r-gg.png','assets/ui/icons/r-love.png'],itemIcons:['assets/items/enigma-berry.png','assets/items/poke-ball.png'],builder:'fixture'};
  try {
    const write=async(omit:boolean,invalid:boolean,target='assets/ui/icons/r-love.png')=>{
      const entries=new Map<string,Buffer>([['main.js',Buffer.from(main)],['config.js',Buffer.from(config)],['offline-build.json',Buffer.from(JSON.stringify(metadata))],
        ['assets/ui/icons/st-poison.png',png],['assets/ui/icons/r-gg.png',png],['data/items.json',Buffer.from('{}')],['assets/items/poke-ball.png',png],
        ['assets/ui/icons/mut-glass.png',png],['assets/ui/frames/mut-glass.png',png],['assets/ui/banners/mut-glass.jpg',Buffer.from([255,216,255])],
        ['assets/ui/icons/r-love.png',png],['assets/items/enigma-berry.png',png]]);
      const image=entries.get(target);assert.ok(image);
      entries.delete(target);
      if(!omit)entries.set(target,invalid?Buffer.from('not an image'):image);
      for(const[name,bytes]of entries){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),bytes);}
      await writeFile(path.join(root,'asset-manifest.json'),JSON.stringify({files:[...entries].map(([name,bytes])=>({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))}));
    };
    const verify=(expectedBuild='fixture')=>execFileSync(process.execPath,['scripts/verify-game.ts',root],{encoding:'utf8',stdio:'pipe',env:{...process.env,EXPECTED_BUILD:expectedBuild}});
    await write(false,false);assert.match(verify(),/Verified 12 payload hashes/);
    assert.throws(()=>verify('another-build'),/Upstream changed during collection/);
    await write(true,false);assert.throws(verify,/Missing catalog icon: assets\/ui\/icons\/r-love.png/);
    await write(false,true);assert.throws(verify,/Invalid catalog PNG: assets\/ui\/icons\/r-love.png/);
    await write(true,false,'assets/items/enigma-berry.png');assert.throws(verify,/Missing catalog icon: assets\/items\/enigma-berry.png/);
    await write(false,true,'assets/items/enigma-berry.png');assert.throws(verify,/Invalid catalog PNG: assets\/items\/enigma-berry.png/);
    await write(true,false,'assets/ui/banners/mut-glass.jpg');assert.throws(verify,/Missing mutation asset: assets\/ui\/banners\/mut-glass.jpg/);
    await write(false,true,'assets/ui/banners/mut-glass.jpg');assert.throws(verify,/Invalid mutation image: assets\/ui\/banners\/mut-glass.jpg/);
  } finally {await rm(root,{recursive:true,force:true});}
});

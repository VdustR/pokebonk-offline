import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectStyleFrameCatalog,patchOptionalLookFrames} from '../scripts/optional-look-frames.ts';
import {record} from '../types/data.ts';
const fixture='function frame(){let choice=resolve();if(!choice)return null;let image=createImage();image.src=url(`ui/frames/${choice.frame??`look-`+choice.style}.png`);image.onerror=()=>{image.onerror=null;image.remove()};return image;}';
function render(source:string,choice:unknown):unknown{return vm.runInNewContext(source+';frame();',{resolve:()=>choice,createImage:()=>({remove(){}}),url:(path:string)=>path});}
test('only declared PNG frame styles produce derived paths while explicit overrides survive',()=>{
  const other='function equipped(frame){return url(`ui/frames/${frame}.png`)}';
  assert.ok(patchOptionalLookFrames(fixture+other,['holo']).includes(other));
  for(const style of ['ember','verdant','tidal','astral']) {
    assert.ok(render(fixture,{style}));
    assert.equal(render(patchOptionalLookFrames(fixture,['holo']),{style}),null);
    assert.equal(record(render(patchOptionalLookFrames(fixture,['holo']),{style,frame:'explicit'}))['src'],'ui/frames/explicit.png');
  }
  assert.equal(record(render(patchOptionalLookFrames(fixture,['holo']),{style:'holo'}))['src'],'ui/frames/look-holo.png');
  assert.equal(render(patchOptionalLookFrames(fixture,['holo']),null),null);
  assert.equal(record(render(patchOptionalLookFrames(fixture,['ember']),{style:'ember'}))['src'],'ui/frames/look-ember.png');
});
test('frame capabilities follow the upstream picker catalog and its actual module owner',()=>{
  const config="const renamed=['holo','metal'];export{renamed as shared};";
  const menu="import{shared as styles}from './config.js';function picker(){for(const style of styles){const id='look-'+style;button(id)}}";
  const modules={config:'assets/config.js',menus:'assets/menu.js'};
  assert.deepEqual(Array.from(inspectStyleFrameCatalog(config,menu,modules)),['holo','metal']);
  assert.throws(()=>inspectStyleFrameCatalog(config,menu.replace('./config.js','./unrelated.js'),modules),/module/);
  assert.throws(()=>inspectStyleFrameCatalog(config.replace("'holo','metal'","'holo','holo'"),menu,modules),/Invalid style frame catalog/);
  assert.throws(()=>inspectStyleFrameCatalog(config,menu.replace("'look-'","'unrelated-'"),modules),/catalog loop/);
});
test('missing or ambiguous optional frame ownership rejects',()=>{
  assert.throws(()=>patchOptionalLookFrames('function unrelated(){}',['holo']),/optional look frame/);
  assert.throws(()=>patchOptionalLookFrames(fixture+fixture.replace('function frame','function duplicate'),['holo']),/optional look frame/);
});

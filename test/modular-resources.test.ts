import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleGraph} from '../scripts/module-graph.ts';
import {inspectModularAssets,inspectModularFrames,inspectModularIcons,mythicCosmeticIds} from '../scripts/modular-resources.ts';
const graph=(entries:[string,string][])=>moduleGraph(new Map(entries.map(([name,source])=>[name,Buffer.from(source)])));

test('multiple frame consumers must resolve the same declared style catalog',()=>{
  const source="import{styles as names}from './data.js';function one(){for(const style of names)show('look-'+style)}function two(){for(const style of names)show('look-'+style)}";
  const g=graph([['menu.js',source],['data.js',"const styles=['new-style','holo'];export{styles};"]]);
  assert.deepEqual(inspectModularFrames(g,g.get('menu.js')),['new-style','holo']);
  const wrong=graph([['menu.js',source.replace('of names)show', 'of other)show')],['data.js',"const styles=['holo'];export{styles};"]]);
  assert.throws(()=>inspectModularFrames(wrong,wrong.get('menu.js')),/catalog binding/);
});

const iconSource='function icon(id){return url(`ui/icons/${id}.png`)}export{icon};';
const statusSource="import{icon as image}from './icons.js';const states=[{id:'burn'},{id:'new-state'}];function render(){for(const state of states)image('st-'+state.id)}";
const menuSource="import{icon as image}from './icons.js';const reactions=['gg','new-reaction'];function render(){return reactions.map(kind=>image('r-'+kind))}const goals=()=>({caught:{},newGoal:{}});function goal(kind){const info=goals()[kind];return image('goal-'+kind)}const categories=[{id:'new',icon:'news'},{id:'better',icon:'check'},{id:'fix',icon:'repair'}];";
test('dynamic icon families follow their actual catalogs and reject unknown prefixes',()=>{
  const entries:[string,string][]=[['icons.js',iconSource],['main.js',statusSource],['menu.js',menuSource]];
  const result=inspectModularIcons(graph(entries));
  assert.ok(result.statusIcons.includes('assets/ui/icons/st-new-state.png'));
  assert.ok(result.reactionIcons.includes('assets/ui/icons/r-new-reaction.png'));
  assert.ok(result.goalIcons.includes('assets/ui/icons/goal-newGoal.png'));
  assert.throws(()=>inspectModularIcons(graph([...entries,['unknown.js',"import{icon}from './icons.js';icon('unreviewed-'+kind)"]])),/Unsupported dynamic icon prefix/);
});

test('new finite resource families include every declared form, reward and appearance',()=>{
  const g=graph([['data.js',"function tile(region,names){return names.map(name=>url(`env/${region}/tiles/${name}.png`))}class Terrain{init(region){if(this.lake||this.summit)tile(region,this.lake?['grass','mud']:['snow','ice']);this.buildPanorama('island');this.landmark([], 'new-pier', 1, 2)}landmark(out,model,x,z){out.push({kind:{model},x,z})}}const ring=(m)=>[{m,x:0,z:0}];ring('lamp');const scenery=[{m:'statue',x:0,z:1}];const mapIcon=id=>`ui/icons/map-${id}.png`;mapIcon('power');function loadModel(name){return url(`models/${name}.glb`)}class Models{add(kind){const models={chest:['chest',1],freechest:['freechest',1],altar:['altar',2],portal:['new-model',3]};return loadModel(models[kind][0])}}const tracks={menu:{loop:1},ingame1:{loop:2},boss:{loop:3},extra:{loop:4}};const badges=[{key:'stone',leader:'A',ace:1}];const refuge=[{key:'garden',levels:['one','two'],desc:'x'}];const factions=[{key:'ranger',role:'R',color:'green',desc:'x'}];const rewards=[{kind:'coins'},{kind:'new-reward'}];function pass(){return rewards.map(reward=>url(`ui/exp/pass-${reward.kind}.png`))}class Map{buildPanorama(){for(const [layer]of [['far',1],['near',2]])load(`env/furia/${layer}.png`)}}"]]);
  const assets={biomes:[{id:'forest',size:1},{id:'lake-region',size:1,shape:'lake'},{id:'summit-region',size:1,shape:'summit'}],season:{season:4,maxDex:251,biomes:['forest','new-region']},mythics:[{key:'new-look',species:[4,6],mats:[]}]};
  const forms={sheets:{30001:{},30099:{}},portraits:['mega-a','new-form']};
  const paths=inspectModularAssets(g,assets,forms);
  assert.deepEqual(mythicCosmeticIds(assets),['mlook:new-look']);
  for(const name of ['env/lake-region/tiles/mud.png','env/summit-region/tiles/ice.png','env/island/pano_near.png','models/new-pier.glb','models/lamp.glb','models/statue.glb','ui/icons/map-power.png','models/new-model.glb','music/extra.ogg','pmd-forms/30099.png','portraits-forms/new-form.png','mythic/new-look/p6.png','models/mythic_new-look.glb','ui/maps/new-region.webp','ui/exp/pass-new-reward.png','ui/exp/refuge/garden-2.png','ui/exp/faction-ranger.png','ui/badges/stone.png','env/furia/near.png'])assert.ok(paths.includes('assets/'+name),name);
  assert.throws(()=>inspectModularAssets(g,assets,{...forms,portraits:['../escape']}),/Unsafe resource/);
});

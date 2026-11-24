import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleGraph} from '../scripts/module-graph.ts';
const files=(entries:[string,string][])=>new Map(entries.map(([name,source])=>[name,Buffer.from(source)]));

test('catalog evaluation follows lexical imports without executing unrelated initialization',()=>{
  const graph=moduleGraph(files([
    ['assets/data.js','const token="berry";const rows=[{id:token,n:2}];const unrelated=fetch("https://invalid.test");export{rows as catalog};'],
    ['assets/menu.js','import{catalog as rows}from "./data.js";const ignored=0;function label(rows){return rows;}const catalog=rows.map(row=>({...row,label:label(row.id)}));export{catalog};'],
  ]));
  assert.deepEqual(graph.values('assets/menu.js',['catalog']),{catalog:[{id:'berry',n:2,label:'berry'}]});
  assert.equal(graph.resolve('assets/menu.js','rows').module.name,'assets/data.js');
});

test('catalog evaluation rejects missing imports, ambiguous exports and browser effects',()=>{
  for(const source of ['import{x}from "./absent.js";const rows=[x];','const rows=[document.body];']) {
    const graph=moduleGraph(files([['assets/menu.js',source]]));
    assert.throws(()=>graph.values('assets/menu.js',['rows']));
  }
  const graph=moduleGraph(files([['assets/a.js','export{x}from "./b.js";'],['assets/b.js','export{x}from "./a.js";']]));
  assert.throws(()=>graph.resolve('assets/a.js','x'),/cyclic|binding/i);
});

test('renamed and shadowed bindings retain the same catalog values',()=>{
  for(const name of ['rows','renamed']) {
    const graph=moduleGraph(files([['catalog.js',`const ${name}=[{id:'a'}];const unrelated=unknown();const result=${name}.map(unrelated=>unrelated.id);`]]));
    assert.deepEqual(graph.values('catalog.js',['result']),{result:['a']});
  }
});

test('catalog assembly retains ordered top-level mutations and their dependencies',()=>{
  const graph=moduleGraph(files([['catalog.js',`const rows=[{id:2}];const additions=[{id:1},{id:3}];rows.push(...additions);rows.sort((a,b)=>a.id-b.id);for(let i=rows.length-1;i>=0;i--)if(rows[i].id>2)rows.splice(i,1);{for(const row of rows)row.ready=true;}const unrelated=fetch('https://invalid.test');`]]));
  assert.deepEqual(graph.values('catalog.js',['rows']),{rows:[{id:1,ready:true},{id:2,ready:true}]});
});

test('multiple top-level declarations cannot silently choose a catalog version',()=>{
  const g=moduleGraph(files([['catalog.js',"var rows=[{id:'first'}];var rows=[{id:'second'}];"]]));
  assert.throws(()=>g.values('catalog.js',['rows']),/definition/);
  assert.throws(()=>g.resolve('catalog.js','rows'),/definition/);
});

test('catalog assembly includes mutations through imported aliases',()=>{
  const g=moduleGraph(files([
    ['data.js',"const rows=[{id:'base',goal:0}];export{rows};"],
    ['looks.js',"import{rows as quests}from './data.js';const extra=[{id:'look',goal:2}];quests.push(...extra);"],
    ['profile.js',"import{rows as goals}from './data.js';for(const goal of goals)if(goal.id==='base')goal.goal=4;"],
  ]));
  assert.deepEqual(g.values('data.js',['rows']),{rows:[{id:'base',goal:4},{id:'look',goal:2}]});
});

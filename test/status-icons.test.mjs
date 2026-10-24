import {test}from'node:test';import assert from'node:assert/strict';
import {ast}from'../scripts/source.mjs';import {statusIconPaths}from'../scripts/status-icons.mjs';
const fixture=`const statuses=[{id:'poison',on:()=>1},{id:'sleep',on:()=>1}];class Bar{update(){for(const effect of statuses){if(effect.on())this.el.append(icon('st-'+effect.id,22));}}}`;
test('dynamic status icons follow the rendered catalog across renamed bindings',()=>{
 for(const source of [fixture,fixture.replaceAll('statuses','a').replaceAll('effect','b')])assert.deepEqual(statusIconPaths(ast(source),'icon'),['assets/ui/icons/st-poison.png','assets/ui/icons/st-sleep.png']);
});
test('incompatible or unsafe status icon catalogs stop collection',()=>{
 for(const source of [fixture.replace("id:'sleep'","id:'../secret'"),fixture.replace("id:'sleep'","id:'poison'"),fixture.replace("id:'sleep'","key:'sleep'"),fixture.replace('of statuses','of unknown')])assert.throws(()=>statusIconPaths(ast(source),'icon'));
});

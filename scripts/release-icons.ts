import {ast,literal,maybeName,nodesOf,one,requireNode} from './source.ts';

// Release notes render icons from category records, not literal icon() calls.
export function inspectReleaseIcons(main:string) {
  const arrays=nodesOf(ast(main),'ArrayExpression');
  const entries=one(arrays.filter(array=>['new','better','fix'].every(id=>array.elements.some(entry=>entry?.type==='ObjectExpression'
    &&entry.properties.some(property=>property.type==='Property'&&maybeName(property.key)==='id'&&literal(property.value)===id)))),'release category catalog').elements;
  const ids=new Set<string>();
  return [...new Set(entries.map(entry=>{
    if(entry?.type!=='ObjectExpression')throw new Error('Invalid release category');
    const field=(key:string)=>literal(requireNode(one(entry.properties.filter(property=>property.type==='Property'&&maybeName(property.key)===key),`release category ${key}`),'Property').value);
    const id=field('id'),icon=field('icon');
    if(typeof id!=='string'||ids.has(id))throw new Error('Invalid or duplicate release category id');
    ids.add(id);
    if(typeof icon!=='string'||!/^\w[\w-]*$/.test(icon))throw new Error('Invalid release category icon');
    return `assets/ui/icons/${icon}.png`;
  }))];
}

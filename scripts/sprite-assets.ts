import {ast,nodesOf,maybeName,literal} from './source.ts';
import {record,isRecord} from '../types/data.ts';

export function inspectPreloadedSprites(main:string,spriteData:unknown) {
  const sprites=record(spriteData,'sprite catalog');
  const assets=new Set<string>();
  for(const call of nodesOf(ast(main),'CallExpression',node=>node.callee.type==='MemberExpression'
    &&maybeName(node.callee.property)==='preload'&&node.callee.object.type==='MemberExpression'
    &&maybeName(node.callee.object.property)==='sprites')) {
    const argument=call.arguments[0];
    const array=argument?.type==='CallExpression'&&argument.callee.type==='MemberExpression'
      &&maybeName(argument.callee.property)==='filter'?argument.callee.object:argument;
    // Dynamic gameplay lists are covered by the playable-species collector.
    // Scene lists are finite, independent of the season's playable dex limit.
    if(array?.type!=='ArrayExpression'||array.elements.some(node=>node?.type==='SpreadElement'))continue;
    const ids=new Set<number>();
    for(const element of array.elements) {
      const id=literal(element);
      if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0||ids.has(id))throw new Error('Invalid or duplicate sprite preload id');
      ids.add(id);
      const sprite=sprites[id];
      if(isRecord(sprite)&&sprite['anims'])assets.add(`assets/pmd/${id}.png`);
    }
  }
  return [...assets].sort();
}

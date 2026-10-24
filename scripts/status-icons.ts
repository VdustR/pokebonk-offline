import type {AnyNode}from'acorn';
import {literal,nodesOf,maybeName}from'./source.ts';
export function statusIconPaths(tree:AnyNode,iconFunction:string) {
  const calls=nodesOf(tree,'CallExpression',n=>maybeName(n.callee)===iconFunction&&n.arguments[0]?.type==='BinaryExpression'&&n.arguments[0].operator==='+'&&literal(n.arguments[0].left)==='st-');
  if(calls.length!==1)throw new Error('Unsupported status icon renderer');
  const call=calls[0];const expression=call?.arguments[0];
  if(!call||expression?.type!=='BinaryExpression')throw new Error('Unsupported status icon renderer');
  const member=expression.right;
  if(member.type!=='MemberExpression'||maybeName(member.property)!=='id'||member.object.type!=='Identifier')throw new Error('Unsupported status icon identifier');
  const memberName=member.object.name;
  const loops=nodesOf(tree,'ForOfStatement',n=>n.start<call.start&&n.end>call.end&&n.left.type==='VariableDeclaration'&&maybeName(n.left.declarations[0]?.id)===memberName);
  const loop=loops[0];if(loops.length!==1||loop?.right.type!=='Identifier')throw new Error('Unsupported status icon loop');
  const catalogName=loop.right.name;
  const catalog=nodesOf(tree,'VariableDeclarator',n=>maybeName(n.id)===catalogName);
  const init=catalog[0]?.init;
  if(catalog.length!==1||init?.type!=='ArrayExpression'||!init.elements.length)throw new Error('Unsupported status icon catalog');
  const ids=init.elements.map(entry=>{
    if(entry?.type!=='ObjectExpression')throw new Error('Invalid status icon entry');
    const property=entry.properties.find(p=>p.type==='Property'&&maybeName(p.key)==='id');
    const id=literal(property?.type==='Property'?property.value:undefined);
    if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))throw new Error('Invalid status icon id');
    return id;
  });
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate status icon id');
  return ids.map(id=>`assets/ui/icons/st-${id}.png`);
}

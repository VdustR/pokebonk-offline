import {literal,nodes} from './source.mjs';

// Resolve the status-icon loop from syntax, without executing upstream code or
// relying on minified binding names. Missing mandatory icons must stop a build.
export function statusIconPaths(tree,iconFunction) {
  const calls=nodes(tree,n=>n.type==='CallExpression'&&n.callee.name===iconFunction
    &&n.arguments[0]?.type==='BinaryExpression'&&n.arguments[0].operator==='+'
    &&literal(n.arguments[0].left)==='st-');
  if(calls.length!==1)throw new Error('Unsupported status icon renderer');
  const call=calls[0],member=call.arguments[0].right;
  if(member.type!=='MemberExpression'||member.property.name!=='id'||member.object.type!=='Identifier')throw new Error('Unsupported status icon identifier');
  const loops=nodes(tree,n=>n.type==='ForOfStatement'&&n.start<call.start&&n.end>call.end
    &&n.left.type==='VariableDeclaration'&&n.left.declarations[0]?.id.name===member.object.name);
  if(loops.length!==1||loops[0].right.type!=='Identifier')throw new Error('Unsupported status icon loop');
  const catalog=nodes(tree,n=>n.type==='VariableDeclarator'&&n.id.name===loops[0].right.name);
  if(catalog.length!==1||catalog[0].init?.type!=='ArrayExpression'||!catalog[0].init.elements.length)throw new Error('Unsupported status icon catalog');
  const ids=catalog[0].init.elements.map(entry=>{
    if(entry?.type!=='ObjectExpression')throw new Error('Invalid status icon entry');
    const id=literal(entry.properties.find(p=>p.key?.name==='id')?.value);
    if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))throw new Error('Invalid status icon id');
    return id;
  });
  if(new Set(ids).size!==ids.length)throw new Error('Duplicate status icon id');
  return ids.map(id=>`assets/ui/icons/st-${id}.png`);
}

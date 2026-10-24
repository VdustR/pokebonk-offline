import type {AnyNode} from 'acorn';
import {ast,configContext,literal,maybeName,nameOf,nodesOf,one} from './source.ts';
import {statusIconPaths} from './status-icons.ts';

export function reactionIconPaths(tree:AnyNode,configTree:AnyNode,values:Record<string,unknown>,iconFunction:string) {
  const calls=nodesOf(tree,'CallExpression',n=>maybeName(n.callee)===iconFunction
    &&n.arguments[0]?.type==='BinaryExpression'&&n.arguments[0].operator==='+'
    &&literal(n.arguments[0].left)==='r-');
  if(!calls.length||calls.some(n=>n.arguments[0]?.type!=='BinaryExpression'||n.arguments[0].right.type!=='Identifier'))throw new Error('Unsupported reaction icon renderer');
  // Follow a renderer's map callback to the imported catalog. Other reaction
  // renderers consume counts from saved state; those counts are not a catalog.
  const maps=nodesOf(tree,'CallExpression',n=>{
    const callback=n.arguments[0];
    return n.callee.type==='MemberExpression'&&maybeName(n.callee.property)==='map'
      &&n.callee.object.type==='Identifier'&&callback?.type==='ArrowFunctionExpression'
      &&callback.params.length===1&&callback.params[0]?.type==='Identifier'
      &&calls.some(call=>call.start>=callback.body.start&&call.end<=callback.body.end
        &&call.arguments[0]?.type==='BinaryExpression'
        &&maybeName(call.arguments[0].right)===maybeName(callback.params[0]));
  });
  const names=maps.map(n=>n.callee.type==='MemberExpression'?nameOf(n.callee.object):'');
  const catalogName=one([...new Set(names)],'reaction catalog binding');
  const imported=one(nodesOf(tree,'ImportSpecifier',n=>n.local.name===catalogName),'reaction catalog import');
  const exported=one(nodesOf(configTree,'ExportSpecifier',n=>maybeName(n.exported)===maybeName(imported.imported)),'reaction catalog export');
  const ids=values[nameOf(exported.local)];
  if(!Array.isArray(ids)||!ids.length)throw new Error('Unsupported reaction icon catalog');
  const tokens=ids.map(id=>{
    if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))throw new Error('Invalid reaction icon id');
    return id;
  });
  if(new Set(tokens).size!==tokens.length)throw new Error('Duplicate reaction icon id');
  return tokens.map(id=>`assets/ui/icons/r-${id}.png`);
}

export function inspectIconCatalogs(main:string,config:string) {
  const tree=ast(main);
  const context=configContext(config);
  const iconFunction=nameOf(one(nodesOf(tree,'FunctionDeclaration',n=>n.params.length>0
    &&main.slice(n.start,n.end).includes('ui/icons/${')),'icon function').id);
  // Newly introduced concatenated icon families require a catalog resolver,
  // rather than turning an unresolved prefix into an optional filename guess.
  for(const call of nodesOf(tree,'CallExpression',n=>maybeName(n.callee)===iconFunction)) {
    const arg=call.arguments[0];
    if(arg?.type==='BinaryExpression'&&arg.operator==='+'
      &&!['st-','r-'].includes(String(literal(arg.left))))throw new Error('Unsupported dynamic icon prefix');
  }
  return {iconFunction,statusIcons:statusIconPaths(tree,iconFunction),
    reactionIcons:reactionIconPaths(tree,context.tree,context.values,iconFunction)};
}

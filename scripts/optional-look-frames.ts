import path from 'node:path';
import {ast,configContext,edits,literal,maybeName,nameOf,nodesOf,one} from './source.ts';

export function inspectStyleFrameCatalog(config:string,menus:string,modules:{config:string;menus:string}) {
  const tree=ast(menus),context=configContext(config);
  const loop=one(nodesOf(tree,'ForOfStatement',node=>{
    if(node.right.type!=='Identifier'||node.left.type!=='VariableDeclaration'||node.left.declarations.length!==1)return false;
    const binding=maybeName(node.left.declarations[0]?.id);
    return binding!==undefined&&nodesOf(node.body,'BinaryExpression',n=>n.operator==='+'&&literal(n.left)==='look-'&&maybeName(n.right)===binding).length===1;
  }),'style frame catalog loop');
  const imported=one(nodesOf(tree,'ImportSpecifier',n=>n.local.name===maybeName(loop.right)),'style frame catalog import');
  const owner=one(nodesOf(tree,'ImportDeclaration',n=>n.specifiers.includes(imported)),'style frame catalog owner');
  const source=literal(owner.source);
  if(typeof source!=='string'||!source.startsWith('./')||path.posix.join(path.posix.dirname(modules.menus),source)!==modules.config)throw new Error('Unsupported style frame catalog module');
  const exported=one(nodesOf(context.tree,'ExportSpecifier',n=>maybeName(n.exported)===maybeName(imported.imported)),'style frame catalog export');
  const values=context.values[nameOf(exported.local)];
  if(!Array.isArray(values)||!values.length||!values.every((v):v is string=>typeof v==='string'&&/^[\w-]+$/.test(v))||new Set(values).size!==values.length)throw new Error('Invalid style frame catalog');
  return values;
}

export function patchOptionalLookFrames(source:string,styles:readonly string[]):string {
  const tree=ast(source);
  const renderer=one(nodesOf(tree,'FunctionDeclaration',fn=>nodesOf(fn,'TemplateLiteral',node=>node.quasis.some(part=>part.value.raw==='ui/frames/')).length>0&&nodesOf(fn,'LogicalExpression',node=>node.operator==='??'&&node.left.type==='MemberExpression'&&maybeName(node.left.property)==='frame'&&node.right.type==='BinaryExpression'&&node.right.operator==='+'&&literal(node.right.left)==='look-').length===1),'optional look frame renderer');
  const guard=one(nodesOf(renderer,'IfStatement',node=>node.test.type==='UnaryExpression'&&node.test.operator==='!'&&node.test.argument.type==='Identifier'&&node.consequent.type==='ReturnStatement'&&literal(node.consequent.argument)===null),'optional look frame guard');
  if(guard.test.type!=='UnaryExpression')throw new Error('Unsupported optional look frame guard');
  const binding=nameOf(guard.test.argument);
  one(nodesOf(renderer,'CallExpression',node=>node.callee.type==='MemberExpression'&&maybeName(node.callee.property)==='remove'),'optional look frame fallback');
  // A procedural look style does not imply a matching PNG frame. Only request
  // styles declared by the upstream frame picker; explicit overrides stay intact.
  return edits(source,[{start:guard.end,end:guard.end,text:`if(${binding}.frame==null&&!${JSON.stringify(styles)}.includes(${binding}.style))return null;`}]);
}

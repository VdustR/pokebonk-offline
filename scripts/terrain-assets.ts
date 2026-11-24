import type {AnyNode} from 'acorn';
import type {ModuleGraph} from './module-graph.ts';
import {nodesOf,nodes,one,literal,maybeName,nameOf} from './source.ts';
import {objectArray,text} from '../types/data.ts';

export function inspectTerrainAssets(graph:ModuleGraph,values:Record<string,unknown>) {
  const required=new Set<string>(),panoramas=new Set<string>();
  const safe=(value:unknown)=>{const token=text(value);if(!/^[\w-]+$/.test(token))throw new Error('Unsafe terrain asset');return token;};
  const biomes=one(Object.values(values).filter(objectArray).filter(entries=>entries.some(entry=>entry['id']==='forest'&&entry['size'])),'terrain biome catalog');
  const tileLoader=one(graph.modules.flatMap(module=>nodesOf(module.tree,'FunctionDeclaration',node=>nodesOf(node,'TemplateLiteral',node=>node.quasis.some(part=>part.value.raw==='/tiles/')).length===1).map(node=>({module,node,binding:nameOf(node.id)}))),'tile loader');
  const addTiles=(region:unknown,array:AnyNode)=>{
    const id=safe(region);if(array.type!=='ArrayExpression'||!array.elements.length)throw new Error('Unsupported terrain tile catalog');
    for(const element of array.elements)required.add(`assets/env/${id}/tiles/${safe(literal(element))}.png`);
    panoramas.add(id);
  };
  for(const call of nodesOf(tileLoader.module.tree,'CallExpression',node=>maybeName(node.callee)===tileLoader.binding)) {
    const region=literal(call.arguments[0]),tiles=call.arguments[1];if(!tiles)throw new Error('Missing terrain tiles');
    if(typeof region==='string'){addTiles(region,tiles);continue;}
    const branches=new Map<string,AnyNode>();let branch=tiles;
    while(branch.type==='ConditionalExpression') {
      if(branch.test.type!=='MemberExpression'||branch.test.object.type!=='ThisExpression')throw new Error('Unsupported terrain shape predicate');
      branches.set(nameOf(branch.test.property),branch.consequent);branch=branch.alternate;
    }
    const guard=one(nodesOf(tileLoader.module.tree,'IfStatement',node=>node.start<call.start&&node.end>call.end&&nodesOf(node.test,'MemberExpression',node=>node.object.type==='ThisExpression'&&branches.has(nameOf(node.property))).length>0),'terrain tile shape guard');
    const shapes=[...new Set(nodesOf(guard.test,'MemberExpression',node=>node.object.type==='ThisExpression').map(node=>nameOf(node.property)))];
    for(const shape of shapes)for(const biome of biomes.filter(biome=>biome['shape']===shape))addTiles(biome['id'],branches.get(shape)??branch);
  }
  for(const module of graph.modules) {
    // Terrain landmarks forward a model parameter into positioned render kinds.
    // Collect the complete literal call domain, including later biome scenes.
    for(const method of nodesOf(module.tree,'MethodDefinition')) {
      const modelProperties=nodesOf(method.value.body,'Property',property=>maybeName(property.key)==='model');
      const indices=method.value.params.flatMap((parameter,index)=>parameter.type==='Identifier'&&modelProperties.some(property=>maybeName(property.value)===parameter.name)?[index]:[]);
      if(!indices.length)continue;
      for(const call of nodesOf(module.tree,'CallExpression',node=>node.callee.type==='MemberExpression'&&node.callee.object.type==='ThisExpression'&&maybeName(node.callee.property)===maybeName(method.key)))for(const index of indices){
        const value=literal(call.arguments[index]);if(typeof value!=='string')throw new Error('Unsupported dynamic terrain landmark');
        required.add(`assets/models/${safe(value)}.glb`);
      }
    }
    for(const call of nodesOf(module.tree,'CallExpression',node=>node.callee.type==='MemberExpression'&&maybeName(node.callee.property)==='buildPanorama')) {
      for(const value of nodes(call.arguments[0],node=>typeof literal(node)==='string').map(node=>literal(node)))if(typeof value==='string')panoramas.add(safe(value));
    }
    for(const object of nodesOf(module.tree,'ObjectExpression',node=>['m','x','z'].every(key=>node.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key)))) {
      const model=object.properties.find(property=>property.type==='Property'&&maybeName(property.key)==='m');
      const value=model?.type==='Property'?literal(model.value):undefined;if(typeof value==='string')required.add(`assets/models/${safe(value)}.glb`);
    }
    const functions=[...nodesOf(module.tree,'FunctionDeclaration').map(node=>({binding:nameOf(node.id),fn:node})),...nodesOf(module.tree,'VariableDeclarator',node=>node.init?.type==='ArrowFunctionExpression'||node.init?.type==='FunctionExpression').map(node=>({binding:nameOf(node.id),fn:node.init}))];
    const generators=functions.filter(({fn})=>fn&&(fn.type==='FunctionDeclaration'||fn.type==='FunctionExpression'||fn.type==='ArrowFunctionExpression')&&fn.params[0]?.type==='Identifier'&&nodesOf(fn.body,'ObjectExpression',object=>['m','x','z'].every(key=>object.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key))&&object.properties.some(property=>property.type==='Property'&&maybeName(property.key)==='m'&&maybeName(property.value)===maybeName(fn.params[0]))).length>0).map(value=>value.binding);
    for(const call of nodesOf(module.tree,'CallExpression',node=>generators.includes(maybeName(node.callee)??''))){const value=literal(call.arguments[0]);if(typeof value==='string')required.add(`assets/models/${safe(value)}.glb`);}
    const mapIcons=nodesOf(module.tree,'VariableDeclarator',node=>node.init?.type==='ArrowFunctionExpression'&&node.init.body.type==='TemplateLiteral'&&node.init.body.quasis[0]?.value.raw==='ui/icons/map-').map(node=>nameOf(node.id));
    for(const call of nodesOf(module.tree,'CallExpression',node=>mapIcons.includes(maybeName(node.callee)??''))){const value=literal(call.arguments[0]);if(typeof value==='string')required.add(`assets/ui/icons/map-${safe(value)}.png`);}
  }
  for(const region of panoramas)for(const layer of ['pano_far','pano_near'])required.add(`assets/env/${region}/${layer}.png`);
  return [...required].sort();
}

import {inspectTerrainAssets} from './terrain-assets.ts';
import type {ModuleGraph,GameModule} from './module-graph.ts';
import {nodesOf,one,nameOf,maybeName,literal} from './source.ts';
import {text,list} from '../types/data.ts';
import {inspectReleaseIcons} from './release-icons.ts';

export function inspectModularFrames(graph:ModuleGraph,menus:GameModule) {
  const loops=nodesOf(menus.tree,'ForOfStatement',node=>{
    if(node.right.type!=='Identifier'||node.left.type!=='VariableDeclaration'||node.left.declarations.length!==1)return false;
    const binding=maybeName(node.left.declarations[0]?.id);
    return binding!==undefined&&nodesOf(node.body,'BinaryExpression',node=>node.operator==='+'&&literal(node.left)==='look-'&&maybeName(node.right)===binding).length===1;
  });
  const catalog=one([...new Set(loops.map(loop=>nameOf(loop.right)))],'style frame catalog binding');
  const binding=graph.resolve(menus.name,catalog);
  const styles=list(graph.values(binding.module.name,[binding.binding])[binding.binding],value=>text(value));
  if(!styles.length||styles.some(style=>!/^\w[\w-]*$/.test(style))||new Set(styles).size!==styles.length)throw new Error('Invalid style frame catalog');
  return styles;
}

export function inspectModularIcons(graph:ModuleGraph) {
  const factory=one(graph.modules.flatMap(module=>nodesOf(module.tree,'FunctionDeclaration',node=>module.source.slice(node.start,node.end).includes('ui/icons/${')).map(node=>({module,binding:nameOf(node.id),node}))),'icon function');
  const aliases=new Map<string,string[]>();
  for(const module of graph.modules) {
    const names=module.scope.variables.filter(variable=>variable.defs[0]?.type==='ImportBinding'||module===factory.module&&variable.name===factory.binding).filter(variable=>{
      try{const binding=graph.resolve(module.name,variable.name);return binding.module.name===factory.module.name&&binding.binding===factory.binding;}catch{return false;}
    }).map(variable=>variable.name);
    if(names.length)aliases.set(module.name,names);
  }
  const dynamic=graph.modules.flatMap(module=>nodesOf(module.tree,'CallExpression',node=>aliases.get(module.name)?.includes(maybeName(node.callee)??'')===true&&node.arguments[0]?.type==='BinaryExpression'&&node.arguments[0].operator==='+').map(node=>({module,node,arg:node.arguments[0]})));
  for(const call of dynamic)if(call.arg?.type==='BinaryExpression'&&!['st-','r-','goal-'].includes(String(literal(call.arg.left))))throw new Error(`Unsupported dynamic icon prefix: ${call.module.name}: ${call.module.source.slice(call.node.start,call.node.end)}`);
  const goalPaths:string[]=[];
  for(const call of dynamic.filter(call=>call.arg?.type==='BinaryExpression'&&literal(call.arg.left)==='goal-')) {
    const renderer=one(nodesOf(call.module.tree,'FunctionDeclaration',node=>node.start<call.node.start&&node.end>call.node.end),'goal icon renderer');
    const catalog=one(nodesOf(renderer,'MemberExpression',node=>node.computed&&node.object.type==='CallExpression'&&node.object.callee.type==='Identifier'&&maybeName(node.property)===maybeName(call.arg?.type==='BinaryExpression'?call.arg.right:undefined)),'goal catalog reference');
    if(catalog.object.type!=='CallExpression')throw new Error('Unsupported goal catalog');
    const binding=graph.resolve(call.module.name,nameOf(catalog.object.callee));
    const declaration=binding.node;
    if(declaration.type!=='VariableDeclarator'||declaration.init?.type!=='ArrowFunctionExpression'||declaration.init.body.type!=='ObjectExpression')throw new Error('Unsupported goal catalog declaration');
    const ids=declaration.init.body.properties.map(property=>{if(property.type!=='Property'||property.computed)throw new Error('Invalid goal catalog');return nameOf(property.key);});
    if(!ids.length||ids.some(id=>!/^\w[\w-]*$/.test(id))||new Set(ids).size!==ids.length)throw new Error('Invalid goal catalog');
    goalPaths.push(...ids.map(id=>`assets/ui/icons/goal-${id}.png`));
  }
  const status=one(dynamic.filter(call=>call.arg?.type==='BinaryExpression'&&literal(call.arg.left)==='st-'),'status renderer');
  if(status.arg?.type!=='BinaryExpression'||status.arg.right.type!=='MemberExpression'||maybeName(status.arg.right.property)!=='id')throw new Error('Unsupported status icon identifier');
  const item=nameOf(status.arg.right.object);
  const loop=one(nodesOf(status.module.tree,'ForOfStatement',node=>node.start<status.node.start&&node.end>=status.node.end&&node.left.type==='VariableDeclaration'&&maybeName(node.left.declarations[0]?.id)===item),'status loop');
  const binding=graph.resolve(status.module.name,nameOf(loop.right));
  const statuses=list(graph.values(binding.module.name,[binding.binding])[binding.binding],value=>{
    if(typeof value!=='object'||value===null||!('id' in value))throw new Error('Invalid status catalog');return text(value.id);
  });
  const reactionMaps=graph.modules.flatMap(module=>nodesOf(module.tree,'CallExpression',node=>{
    const callback=node.arguments[0];
    return node.callee.type==='MemberExpression'&&maybeName(node.callee.property)==='map'&&node.callee.object.type==='Identifier'&&callback?.type==='ArrowFunctionExpression'&&dynamic.some(call=>call.module===module&&call.arg?.type==='BinaryExpression'&&literal(call.arg.left)==='r-'&&call.node.start>=callback.start&&call.node.end<=callback.end&&maybeName(call.arg.right)===maybeName(callback.params[0]));
  }).map(node=>({module,binding:nameOf(node.callee.type==='MemberExpression'?node.callee.object:undefined)})));
  const reactionBindings=reactionMaps.map(reaction=>graph.resolve(reaction.module.name,reaction.binding));
  const reactionKeys=[...new Set(reactionBindings.map(binding=>binding.module.name+':'+binding.binding))];
  const reactionKey=one(reactionKeys,'reaction catalog binding');
  const reactionBinding=one(reactionBindings.filter(binding=>binding.module.name+':'+binding.binding===reactionKey).slice(0,1),'reaction catalog owner');
  const reactions=list(graph.values(reactionBinding.module.name,[reactionBinding.binding])[reactionBinding.binding],value=>text(value));
  for(const ids of [statuses,reactions])if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!/^\w[\w-]*$/.test(id)))throw new Error('Invalid icon catalog');
  const releaseModules=graph.modules.filter(module=>nodesOf(module.tree,'ArrayExpression',node=>['new','better','fix'].every(id=>node.elements.some(entry=>entry?.type==='ObjectExpression'&&entry.properties.some(property=>property.type==='Property'&&maybeName(property.key)==='id'&&literal(property.value)===id)))).length>0);
  const release=inspectReleaseIcons(one(releaseModules,'release category module').source);
  return {aliases,goalIcons:[...new Set(goalPaths)],statusIcons:statuses.map(id=>`assets/ui/icons/st-${id}.png`),reactionIcons:reactions.map(id=>`assets/ui/icons/r-${id}.png`),releaseIcons:release};
}

export function mythicCosmeticIds(values:Record<string,unknown>) {
  const catalog=one(Object.values(values).filter((value):value is Record<string,unknown>[]=>Array.isArray(value)&&value.length>0&&value.every(entry=>typeof entry==='object'&&entry!==null&&'key' in entry&&'species' in entry&&'mats' in entry)),'mythic appearance catalog');
  const keys=catalog.map(entry=>{const key=text(entry['key']);if(!/^[\w-]+$/.test(key))throw new Error('Unsafe mythic appearance');return key;});
  if(new Set(keys).size!==keys.length)throw new Error('Duplicate mythic appearance');
  return keys.map(key=>`mlook:${key}`);
}

export function inspectModularAssets(graph:ModuleGraph,assets:Record<string,unknown>,forms:unknown) {
  const required=new Set<string>();
  const safe=(value:unknown)=>{const token=text(value);if(!/^[\w-]+$/.test(token))throw new Error('Unsafe resource catalog token');return token;};
  const values=Object.values(assets);
  const season=one(values.filter(value=>typeof value==='object'&&value!==null&&'season' in value&&'maxDex' in value&&'biomes' in value),'map region domain');
  if(typeof season!=='object'||season===null||!('biomes' in season))throw new Error('Invalid map domain');
  for(const id of list(season.biomes,safe))required.add(`assets/ui/maps/${id}.webp`);
  const mythics=one(values.filter((value):value is Record<string,unknown>[]=>Array.isArray(value)&&value.length>0&&value.every(entry=>typeof entry==='object'&&entry!==null&&'key' in entry&&'species' in entry&&'mats' in entry)),'mythic appearance catalog');
  for(const entry of mythics) {
    const key=safe(entry['key']);required.add(`assets/models/mythic_${key}.glb`);required.add(`assets/mythic/${key}/rig.json`);
    for(const species of list(entry['species'],value=>{if(!Number.isSafeInteger(value)||Number(value)<1)throw new Error('Invalid mythic species');return Number(value);})){required.add(`assets/mythic/${key}/${species}.png`);required.add(`assets/mythic/${key}/p${species}.png`);}
  }
  if(typeof forms!=='object'||forms===null||!('sheets' in forms)||!('portraits' in forms)||typeof forms.sheets!=='object'||forms.sheets===null)throw new Error('Invalid form sprite catalog');
  const sheets=Object.keys(forms.sheets);if(!sheets.length||sheets.some(id=>!/^\d+$/.test(id)))throw new Error('Invalid form sprite sheets');
  for(const id of sheets)required.add(`assets/pmd-forms/${id}.png`);
  for(const key of list(forms.portraits,safe))required.add(`assets/portraits-forms/${key}.png`);
  const badge=one(graph.modules.flatMap(module=>nodesOf(module.tree,'VariableDeclarator',node=>node.init?.type==='ArrayExpression'&&node.init.elements.length>0&&node.init.elements.every(entry=>entry?.type==='ObjectExpression'&&['key','leader','ace'].every(key=>entry.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key)))).map(node=>({module,binding:nameOf(node.id)}))),'badge catalog');
  for(const entry of list(graph.values(badge.module.name,[badge.binding])[badge.binding],value=>{if(typeof value!=='object'||value===null||!('key' in value))throw new Error('Invalid badge');return safe(value.key);}))required.add(`assets/ui/badges/${entry}.png`);
  const pass=one(graph.modules.flatMap(module=>nodesOf(module.tree,'CallExpression',node=>node.callee.type==='MemberExpression'&&maybeName(node.callee.property)==='map'&&node.callee.object.type==='Identifier'&&module.scope.set.get(node.callee.object.name)?.references.some(reference=>reference.identifier.range?.[0]===(node.callee.type==='MemberExpression'?node.callee.object.start:-1))===true&&node.arguments[0]?.type==='ArrowFunctionExpression'&&nodesOf(node.arguments[0],'TemplateLiteral',node=>node.quasis.some(part=>part.value.raw==='ui/exp/pass-')).length>0).map(node=>({module,binding:nameOf(node.callee.type==='MemberExpression'?node.callee.object:undefined)}))),'expedition pass catalog');
  const passBinding=graph.resolve(pass.module.name,pass.binding);
  for(const kind of list(graph.values(passBinding.module.name,[passBinding.binding])[passBinding.binding],value=>{if(typeof value!=='object'||value===null||!('kind' in value))throw new Error('Invalid pass reward');return safe(value.kind);}))required.add(`assets/ui/exp/pass-${kind}.png`);
  const refuges=one(graph.modules.flatMap(module=>nodesOf(module.tree,'VariableDeclarator',node=>node.init?.type==='ArrayExpression'&&node.init.elements.length>0&&node.init.elements.every(entry=>entry?.type==='ObjectExpression'&&['key','levels','desc'].every(key=>entry.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key)))).map(node=>({module,binding:nameOf(node.id)}))),'refuge catalog');
  for(const entry of list(graph.values(refuges.module.name,[refuges.binding])[refuges.binding],value=>{if(typeof value!=='object'||value===null||!('key' in value)||!('levels' in value))throw new Error('Invalid refuge');return {key:safe(value.key),levels:list(value.levels,value=>text(value))};}))for(let level=1;level<=entry.levels.length;level++)required.add(`assets/ui/exp/refuge/${entry.key}-${level}.png`);
  const factions=one(graph.modules.flatMap(module=>nodesOf(module.tree,'VariableDeclarator',node=>node.init?.type==='ArrayExpression'&&node.init.elements.length>0&&node.init.elements.every(entry=>entry?.type==='ObjectExpression'&&['key','role','color','desc'].every(key=>entry.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key)))).map(node=>({module,binding:nameOf(node.id)}))),'expedition faction catalog');
  for(const key of list(graph.values(factions.module.name,[factions.binding])[factions.binding],value=>{if(typeof value!=='object'||value===null||!('key' in value))throw new Error('Invalid faction');return safe(value.key);}))required.add(`assets/ui/exp/faction-${key}.png`);
  const panorama=one(graph.modules.flatMap(module=>nodesOf(module.tree,'MethodDefinition',node=>maybeName(node.key)==='buildPanorama'&&nodesOf(node,'TemplateLiteral',node=>node.quasis.some(part=>part.value.raw==='env/furia/')).length===1).map(node=>({module,node}))),'Furia panorama producer');
  const layers=one(nodesOf(panorama.node,'ForOfStatement',node=>node.right.type==='ArrayExpression'),'panorama layers');
  if(layers.right.type!=='ArrayExpression'||!layers.right.elements.length)throw new Error('Invalid panorama catalog');
  for(const layer of layers.right.elements){if(layer?.type!=='ArrayExpression')throw new Error('Invalid panorama layer');required.add(`assets/env/furia/${safe(literal(layer.elements[0]))}.png`);}
  const modelLoaders=graph.modules.flatMap(module=>nodesOf(module.tree,'FunctionDeclaration',node=>nodesOf(node,'TemplateLiteral',node=>node.quasis[0]?.value.raw==='models/'&&node.quasis.at(-1)?.value.raw==='.glb').length>0).map(node=>({module,binding:nameOf(node.id)})));
  const callsModelLoader=(module:GameModule,object:{start:number;end:number})=>{
    const owner=[...nodesOf(module.tree,'MethodDefinition'),...nodesOf(module.tree,'FunctionDeclaration')].filter(node=>node.start<object.start&&node.end>object.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    return owner!==undefined&&nodesOf(owner,'CallExpression',node=>node.callee.type==='Identifier').some(call=>{
      try {const binding=graph.resolve(module.name,nameOf(call.callee));return modelLoaders.some(loader=>loader.module===binding.module&&loader.binding===binding.binding);}catch{return false;}
    });
  };
  const modelMap=one(graph.modules.flatMap(module=>nodesOf(module.tree,'ObjectExpression',node=>['chest','freechest','altar','portal'].every(key=>node.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key))&&node.properties.every(property=>property.type==='Property'&&property.value.type==='ArrayExpression'&&typeof literal(property.value.elements[0])==='string')&&callsModelLoader(module,node)).map(node=>({module,node}))),'interactable model catalog');
  for(const property of modelMap.node.properties){if(property.type!=='Property'||property.value.type!=='ArrayExpression'||typeof literal(property.value.elements[1])!=='number')throw new Error('Invalid interactable model');required.add(`assets/models/${safe(literal(property.value.elements[0]))}.glb`);}
  const music=one(graph.modules.flatMap(module=>nodesOf(module.tree,'ObjectExpression',node=>['menu','ingame1','boss'].every(key=>node.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key))&&node.properties.every(property=>property.type==='Property'&&property.value.type==='ObjectExpression'&&property.value.properties.some(field=>field.type==='Property'&&maybeName(field.key)==='loop'&&typeof literal(field.value)==='number'))).map(node=>({module,node}))),'music loop catalog');
  for(const property of music.node.properties){if(property.type!=='Property')throw new Error('Invalid music catalog');required.add(`assets/music/${safe(maybeName(property.key))}.ogg`);}
  for(const name of inspectTerrainAssets(graph,assets))required.add(name);
  return [...required].sort();
}

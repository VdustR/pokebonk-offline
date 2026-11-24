import {mythicCosmeticIds} from './modular-resources.ts';
import type {AnyNode} from 'acorn';
import {graphCatalogs} from './graph-catalogs.ts';
import type {ModuleGraph,GameModule} from './module-graph.ts';
import {literal,maybeName,nameOf,nodesOf,nodes,one,requireNode,edits} from './source.ts';
import {finite,isRecord,objectArray,record,text,stringMap} from '../types/data.ts';
import {inspectTreasureCatalog} from './treasure-catalog.ts';

export function inspectModularGame(graph:ModuleGraph,main:GameModule,menus:GameModule,config:GameModule) {
  const contexts=new Map<string,ReturnType<typeof graphCatalogs>>();
  const context=(module:GameModule)=>{
    let value=contexts.get(module.name);if(!value){value=graphCatalogs(graph,module);contexts.set(module.name,value);}return value;
  };
  const cosmetics=one(graph.modules.filter(module=>nodesOf(module.tree,'FunctionDeclaration',node=>node.params.length===4&&['shiny','spectral','classic','m1','m2'].every(style=>nodesOf(node,'SwitchCase',node=>literal(node.test)===style).length>0)).length===1),'wardrobe module');
  const assetContext=context(config),cosmeticContext=context(cosmetics);
  const arrays=Object.entries(assetContext.values).filter((entry):entry is [string,Record<string,unknown>[]]=>objectArray(entry[1]));
  const array=(predicate:(entries:Record<string,unknown>[])=>boolean,label:string)=>one(arrays.filter(([,entries])=>predicate(entries)),label);
  const [rosterName,rosterRaw]=array(entries=>entries.some(entry=>entry['start']===true)&&entries.every(entry=>entry['kit']&&entry['passive']),'League roster');
  const [labName,labRaw]=array(entries=>entries.some(entry=>entry['id']==='slot-move')&&entries.every(entry=>entry['max']&&entry['cost']),'Lab catalog');
  const [itemsName,itemsRaw]=array(entries=>entries.some(entry=>entry['key']==='soda-pop')&&entries.every(entry=>entry['price']),'shop catalog');
  const [biomesName,biomesRaw]=array(entries=>entries.some(entry=>entry['id']==='forest'&&entry['size']),'biome catalog');
  const object=(predicate:(entry:Record<string,unknown>)=>boolean,label:string)=>one(Object.values(assetContext.values).filter(isRecord).filter(predicate),label);
  const seasonRaw=object(entry=>Boolean(entry['maxDex']&&entry['season']),'generation limit');
  const versions=stringMap(object(entry=>Boolean(entry['data/pokemon.json']&&entry['models']&&entry['pmd']),'asset versions'));
  const locate=(type:'FunctionDeclaration'|'VariableDeclarator',predicate:(node:AnyNode,module:GameModule)=>boolean,label:string)=>one(graph.modules.flatMap(module=>nodesOf(module.tree,type,node=>predicate(node,module)).map(node=>({module,binding:nameOf(node.id),node}))),label);
  const profile=locate('FunctionDeclaration',node=>nodesOf(node,'ReturnStatement',node=>node.argument?.type==='ObjectExpression'&&['stardust','lab','league','lastSpecies','settings'].every(key=>node.argument?.type==='ObjectExpression'&&node.argument.properties.some(property=>property.type==='Property'&&maybeName(property.key)===key))).length>0,'profile factory');
  const registry=locate('VariableDeclarator',node=>{
    if(node.type!=='VariableDeclarator'||node.init?.type!=='NewExpression'||node.init.callee.type!=='ClassExpression')return false;
    const initialized=(key:string,predicate:(value:AnyNode|null|undefined)=>boolean)=>node.init?.type==='NewExpression'&&node.init.callee.type==='ClassExpression'&&node.init.callee.body.body.some(member=>member.type==='PropertyDefinition'&&!member.static&&maybeName(member.key)===key&&predicate(member.value)||member.type==='MethodDefinition'&&member.kind==='constructor'&&nodesOf(member,'CallExpression',call=>call.arguments[0]?.type==='ThisExpression'&&literal(call.arguments[1])===key&&predicate(call.arguments[2])).length>0);
    return initialized('pokemon',value=>value?.type==='ArrayExpression'&&!value.elements.length)&&initialized('movesByKey',value=>value?.type==='NewExpression'&&maybeName(value.callee)==='Map'&&!value.arguments.length);
  },'Pokédex registry');
  const backend=one(nodesOf(main.tree,'FunctionDeclaration',node=>main.source.slice(node.start,node.end).includes('https://api.pokebonk.com')),'backend factory');
  const method=(name:string)=>one(nodesOf(menus.tree,'MethodDefinition',node=>maybeName(node.key)===name),`menu ${name}`);
  const functionFor=(node:AnyNode,label:string)=>graph.resolve(menus.name,nameOf(one(nodesOf(node,'CallExpression',node=>node.callee.type==='Identifier'),label).callee));
  const claimable=method('claimable');
  const questName=nameOf(requireNode(one(nodesOf(claimable,'CallExpression',node=>node.callee.type==='MemberExpression'&&maybeName(node.callee.property)==='filter'),'achievement catalog').callee,'MemberExpression').object);
  const questBinding=graph.resolve(menus.name,questName),rawQuests=graph.values(questBinding.module.name,[questBinding.binding])[questBinding.binding];
  if(!objectArray(rawQuests))throw new Error('Unsupported achievement catalog');
  const quests=rawQuests.map(quest=>{
    const id=text(quest['id']),counter=text(quest['counter']),goal=finite(quest['goal']),reward=finite(quest['reward']);
    if(goal<=0)throw new Error('Invalid achievement goal');
    const look=quest['look']===undefined?undefined:record(quest['look']);
    return {id,counter,goal,reward,...(quest['title']?{title:text(quest['title'])}:{}),...(look?{look:{member:finite(look['member']),n:finite(look['n'])}}:{})};
  });
  if(new Set(quests.map(quest=>quest.id)).size!==quests.length)throw new Error('Duplicate achievement');
  const questProgress=functionFor(method('questProgress'),'achievement progress calculation');
  const refreshCall=one(nodesOf(method('tasksReady'),'CallExpression',node=>node.callee.type==='Identifier'&&node.arguments.length===2&&node.arguments[0]?.type==='MemberExpression'&&maybeName(node.arguments[0].property)==='profile'),'task refresh');
  const refresh=graph.resolve(menus.name,nameOf(refreshCall.callee)),task=functionFor(method('task'),'task lookup');
  const seasonMethod=one(nodesOf(main.tree,'MethodDefinition',node=>maybeName(node.key)==='season'&&main.source.slice(node.start,node.end).includes('this.info')),'season method');
  const season=graph.resolve(main.name,nameOf(one(nodesOf(seasonMethod,'CallExpression',node=>node.callee.type==='Identifier'),'season calculation').callee));
  const scoreProperty=one(nodesOf(main.tree,'Property',node=>maybeName(node.key)==='score'),'run score property');
  const scoreCall=one(nodesOf(scoreProperty.value,'CallExpression',node=>node.callee.type==='Identifier'),'run score calculation');
  const score=graph.resolve(main.name,nameOf(scoreCall.callee));
  const looks=one(nodesOf(cosmetics.tree,'FunctionDeclaration',node=>node.params.length===4&&['shiny','spectral','classic','m1','m2'].every(style=>nodesOf(node,'SwitchCase',node=>literal(node.test)===style).length>0)),'wardrobe eligibility');
  const binding=(name:string)=>graph.resolve(config.name,name);
  const bindings={roster:binding(rosterName),lab:binding(labName),items:binding(itemsName),biomes:binding(biomesName),profile,registry,season,score,quests:questBinding,refresh,task};
  const [,medalRanks]=array(entries=>entries.some(entry=>entry['id']==='champion')&&entries.every(entry=>entry['id']&&entry['name']&&entry['icon']),'medal ranks');
  const events=(Object.values(cosmeticContext.values).filter(objectArray).find(entries=>entries.some(entry=>entry['id']==='halloween26'&&entry['start']&&entry['end']))??[]).map(entry=>({...entry,start:text(entry['start']),end:text(entry['end'])}));
  return {tree:menus.tree,appTree:main.tree,configTree:config.tree,graph,main,menus,config,cosmetics,assetContext,cosmeticContext,contexts,bindings,backend,looks,questProgress,refresh,task,events,quests,medalRanks,
    roster:rosterRaw.map(entry=>({id:finite(entry['id'])})),lab:labRaw.map(entry=>({id:text(entry['id']),max:finite(entry['max'])})),items:itemsRaw.map(entry=>({key:text(entry['key'])})),
    biomes:biomesRaw.map(entry=>({id:text(entry['id']),...(entry['size']===undefined?{}:{size:finite(entry['size'])})})),season:{season:finite(seasonRaw['season']),maxDex:finite(seasonRaw['maxDex'])},versions,
    values:Object.fromEntries([...contexts].flatMap(([name,context])=>Object.entries(context.values).map(([key,value])=>[name+':'+key,value])))};
}
export type ModularGame=ReturnType<typeof inspectModularGame>;

export function patchModularGame(info:ModularGame,template:string) {
  const modifications=new Map<string,{start:number;end:number;text:string}[]>(),suffix=new Map<string,string[]>();
  const add=(module:GameModule,edit:{start:number;end:number;text:string})=>{const entries=modifications.get(module.name)??[];entries.push(edit);modifications.set(module.name,entries);};
  const imports:string[]=[];let shim=template;
  for(const [role,binding] of Object.entries(info.bindings)) {
    const exported=nodesOf(binding.module.tree,'ExportSpecifier',node=>maybeName(node.local)===binding.binding);
    if(exported.length>1)throw new Error('Ambiguous backend binding export');
    const name=exported[0]?nameOf(exported[0].exported):`__pokebonk_${role}`;
    if(!exported.length){if(nodesOf(binding.module.tree,'Identifier',node=>node.name===name).length)throw new Error('Backend export collision');const entries=suffix.get(binding.module.name)??[];entries.push(`export {${binding.binding} as ${name}};`);suffix.set(binding.module.name,entries);}
    const local=`__local_${role}`;imports.push(`import {${name} as ${local}} from ${JSON.stringify('./'+binding.module.name.split('/').at(-1))};`);
    shim=shim.replaceAll(`__${role.toUpperCase()}__`,local);
  }
  const lists=Object.values(info.values).filter(objectArray);
  const cosmetics=[...new Set([...mythicCosmeticIds(info.assetContext.values),...lists.flatMap(list=>list.flatMap(entry=>[entry['id'],...(objectArray(entry['prizes'])?entry['prizes'].map(prize=>prize['id']):[])])).filter((id):id is string=>typeof id==='string'&&/^(tr|frame|bg|title|sym|deco|skin|slook):/.test(id))])];
  const preparations=one(lists.filter(entries=>entries.every(entry=>entry['id']&&entry['desc'])&&entries.some(entry=>entry['id']==='rare-candy')),'preparation catalog').map(entry=>text(entry['id']));
  shim=shim.replaceAll('__EVENTS__',JSON.stringify(info.events)).replaceAll('__MEDALS__',String(info.medalRanks.length)).replaceAll('__COSMETICS__',JSON.stringify(cosmetics)).replaceAll('__PREPARATIONS__',JSON.stringify(preparations)).replaceAll('__TREASURES__',JSON.stringify(inspectTreasureCatalog(info.cosmetics.source,info.cosmeticContext)));
  if(/__[A-Z]+__/.test(shim))throw new Error('Unresolved modular backend symbol');
  const boot=one(nodesOf(info.main.tree,'AwaitExpression',node=>node.argument.type==='CallExpression'&&node.argument.callee.type==='MemberExpression'&&maybeName(node.argument.callee.property)==='boot'),'application boot');
  const instance=requireNode(requireNode(boot.argument,'CallExpression').callee,'MemberExpression').object;
  if(instance.type!=='Identifier')throw new Error('Unsupported modular application instance');
  const declaration=info.graph.resolve(info.main.name,instance.name);
  if(declaration.node.type!=='VariableDeclarator'||declaration.node.init?.type!=='NewExpression')throw new Error('Unsupported application instance declaration');
  add(info.main,{start:boot.start,end:boot.end,text:`await (window.__pokebonkLocalApp=${instance.name}).boot()`});
  add(info.main,{start:info.backend.start,end:info.backend.end,text:`function ${nameOf(info.backend.id)}(){return createLocalSandboxBackend()}`});
  const progress=requireNode(info.questProgress.node,'FunctionDeclaration'),refresh=requireNode(info.refresh.node,'FunctionDeclaration');
  const profile=nameOf(progress.params[0]),quest=nameOf(progress.params[1]),taskProfile=nameOf(refresh.params[0]);
  add(info.questProgress.module,{start:progress.body.start+1,end:progress.body.start+1,text:`if(${profile}.localSandbox&&${profile}.quests[${quest}.id])return ${quest}.goal;`});
  // Use the task binding in the refresh owner's own scope, not the backend import.
  const taskName=one(info.refresh.module.scope.variables.filter(variable=>variable.defs[0]?.type==='ImportBinding'||variable.name===info.task.binding).filter(variable=>{
    try{const resolved=info.graph.resolve(info.refresh.module.name,variable.name);return resolved.module.name===info.task.module.name&&resolved.binding===info.task.binding;}catch{return false;}
  }),'refresh task binding').name;
  add(info.refresh.module,{start:refresh.body.end-1,end:refresh.body.end-1,text:`if(${taskProfile}.localSandbox)for(const period of ['daily','weekly']){${taskProfile}[period].prog=${taskProfile}[period].ids.map(id=>${taskName}(id).goal);${taskProfile}[period].claimed=[1,1,1,1];}`});
  add(info.cosmetics,{start:info.looks.body.start+1,end:info.looks.body.start+1,text:`if(${nameOf(info.looks.params[0])}.localSandbox&&${nameOf(info.looks.params[0])}.league.includes(${nameOf(info.looks.params[1])}))return true;`});
  const urls=nodesOf(info.config.tree,'VariableDeclarator',node=>node.init?.type==='ArrowFunctionExpression'&&node.init.body.type==='TemplateLiteral'&&/assets\/|data\//.test(info.config.source.slice(node.init.body.start,node.init.body.end)));
  if(urls.length!==2)throw new Error('Unsupported asset URL factories');
  for(const node of urls){const body=requireNode(node.init,'ArrowFunctionExpression').body;add(info.config,{start:body.start,end:body.end,text:`new URL(${info.config.source.slice(body.start,body.end)},document.baseURI).href`});}
  const output=new Map<string,string>();
  for(const module of info.graph.modules)if(modifications.has(module.name)||suffix.has(module.name))output.set(module.name,edits(module.source,modifications.get(module.name)??[])+'\n'+(suffix.get(module.name)??[]).join('\n'));
  if(nodes(info.main.tree,node=>maybeName(node)==='createLocalSandboxBackend').length)throw new Error('Backend import collision');
  output.set(info.main.name,`import {createLocalSandboxBackend} from './offline-backend.js';\n`+text(output.get(info.main.name)));
  output.set('assets/offline-backend.js',imports.join('\n')+'\n'+shim+'\nexport {createLocalSandboxBackend};');
  return output;
}

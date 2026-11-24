import path from 'node:path';
import vm from 'node:vm';
import {parse} from 'acorn';
import type {AnyNode} from 'acorn';
import {analyze} from 'eslint-scope';
import {literal,maybeName,nodesOf,one} from './source.ts';
import {record,text,finite} from '../types/data.ts';

export function moduleGraph(files:ReadonlyMap<string,Uint8Array>) {
  const position=(node:unknown)=>{const value=record(node);return {start:finite(value['start']),end:finite(value['end'])};};
  const modules=[...files].filter(([name])=>name.endsWith('.js')).map(([name,bytes])=>{
    const source=Buffer.from(bytes).toString();
    const tree=parse(source,{ecmaVersion:'latest',sourceType:'module',ranges:true});
    // Acorn and eslint-scope describe the same ESTree program with different
    // declaration types. Acorn supplies ranges for every scope reference.
    const manager=analyze(tree as Parameters<typeof analyze>[0],{ecmaVersion:2024,sourceType:'module'});
    const scope=one(manager.scopes.filter(scope=>scope.type==='module'),'module lexical scope');
    const imports=tree.body.filter(node=>node.type==='ImportDeclaration').flatMap(owner=>owner.specifiers.filter(node=>node.type==='ImportSpecifier').map(node=>({owner,node})));
    const exports=tree.body.filter(node=>node.type==='ExportNamedDeclaration').flatMap(node=>node.specifiers);
    const declarations=nodesOf(tree,'VariableDeclarator').map(node=>[node.start,node] as const);
    const definitions=new Map<number,AnyNode>([...declarations,...nodesOf(tree,'FunctionDeclaration').map(node=>[node.start,node] as const)]);
    const effects=tree.body.filter(statement=>!['ImportDeclaration','ExportNamedDeclaration','VariableDeclaration','FunctionDeclaration','ClassDeclaration'].includes(statement.type)&&(nodesOf(statement,'AssignmentExpression').length+nodesOf(statement,'UpdateExpression').length+nodesOf(statement,'CallExpression',node=>node.callee.type==='MemberExpression'&&['push','sort','splice','set','add','delete'].includes(maybeName(node.callee.property)??'')).length)>0);
    return {name,source,tree,scope,imports,exports,definitions,effects};
  });
  const get=(name:string)=>one(modules.filter(module=>module.name===name),`module ${name}`);
  const target=(owner:string,specifier:unknown)=>{
    const value=text(specifier,'module specifier');
    if(!value.startsWith('./')&&!value.startsWith('../'))throw new Error('Unsupported upstream module specifier');
    const name=path.posix.normalize(path.posix.join(path.posix.dirname(owner),value));
    if(name.startsWith('../')||name.startsWith('/'))throw new Error('Unsafe upstream module specifier');
    return get(name);
  };
  type Module=ReturnType<typeof get>;
  function resolve(name:string,binding:string,seen=new Set<string>()):{module:Module;binding:string;node:AnyNode} {
    const key=name+':'+binding;
    if(seen.has(key))throw new Error('Cyclic upstream binding');
    seen.add(key);
    const module=get(name),variable=module.scope.set.get(binding);
    const definition=variable?one(variable.defs,'binding definition'):undefined;
    if(!variable||!definition)throw new Error(`Missing upstream binding: ${key}`);
    if(definition.type==='ImportBinding') {
      const imported=one(module.imports.filter(entry=>entry.node.local.name===binding),'import binding').node;
      const owner=one(module.imports.filter(entry=>entry.node===imported),'import owner').owner;
      const dependency=target(name,literal(owner.source));
      const exported=one(dependency.exports.filter(node=>maybeName(node.exported)===maybeName(imported.imported)),'binding export');
      return resolve(dependency.name,text(maybeName(exported.local)),seen);
    }
    const node=module.definitions.get(position(definition.node).start);if(!node)throw new Error('Missing binding declaration');
    return {module,binding,node};
  }
  const mutationCache=new Map<string,AnyNode[]>();
  const mutations=(module:Module,variable:Module['scope']['variables'][number])=>{
    const key=module.name+':'+variable.name;let result=mutationCache.get(key);
    if(!result){result=module.effects.filter(statement=>variable.references.some(reference=>position(reference.identifier).start>=statement.start&&position(reference.identifier).end<=statement.end));mutationCache.set(key,result);}return result;
  };
  let importedMutations:Map<string,{module:Module;binding:string}[]>|undefined;
  function mutators(module:Module,binding:string) {
    if(!importedMutations) {
      importedMutations=new Map();
      for(const importer of modules)for(const alias of importer.scope.variables.filter(variable=>variable.defs[0]?.type==='ImportBinding')) {
        if(!mutations(importer,alias).length)continue;
        let owner;try{owner=resolve(importer.name,alias.name);}catch{continue;}
        const key=owner.module.name+':'+owner.binding,entries=importedMutations.get(key)??[];
        entries.push({module:importer,binding:alias.name});importedMutations.set(key,entries);
      }
    }
    return importedMutations.get(module.name+':'+binding)??[];
  }
  function values(name:string,roots:readonly string[]) {
    const selected=new Map<string,Set<string>>(),dependencies=new Map<string,Set<string>>();
    const statements=new Map<string,Set<AnyNode>>();

    function collect(module:Module,binding:string) {
      let names=selected.get(module.name);if(!names){names=new Set();selected.set(module.name,names);}
      if(names.has(binding))return;names.add(binding);
      const variable=module.scope.set.get(binding),definition=variable?one(variable.defs,'binding definition'):undefined;
      if(!variable||!definition)throw new Error(`Missing catalog binding: ${module.name}:${binding}`);
      for(const statement of mutations(module,variable)) {
        let selectedStatements=statements.get(module.name);if(!selectedStatements){selectedStatements=new Set();statements.set(module.name,selectedStatements);}
        if(selectedStatements.has(statement))continue;selectedStatements.add(statement);
        for(const other of module.scope.variables)if(other.references.some(reference=>position(reference.identifier).start>=statement.start&&position(reference.identifier).end<=statement.end))collect(module,other.name);
      }
      if(definition.type==='ImportBinding') {
        const imported=one(module.imports.filter(entry=>entry.node.local.name===binding),'catalog import').node;
        const owner=one(module.imports.filter(entry=>entry.node===imported),'catalog import owner').owner;
        const dependency=target(module.name,literal(owner.source));
        // Translation is presentation-only during catalog inspection. Nothing
        // else imported from a browser module is replaced with a generic stub.
        if(/^i18n-[\w-]+\.js$/.test(path.posix.basename(dependency.name))&&maybeName(imported.imported)==='u')return;
        const exported=one(dependency.exports.filter(node=>maybeName(node.exported)===maybeName(imported.imported)),'catalog export');
        let deps=dependencies.get(module.name);if(!deps){deps=new Set();dependencies.set(module.name,deps);}deps.add(dependency.name);
        collect(dependency,text(maybeName(exported.local)));
        return;
      }
      for(const alias of mutators(module,binding))collect(alias.module,alias.binding);
      if(!['Variable','FunctionName'].includes(definition.type))throw new Error('Unsupported catalog declaration');
      const node=definition.node;
      for(const other of module.scope.variables)if(other.references.some(reference=>position(reference.identifier).start>=position(node).start&&position(reference.identifier).end<=position(node).end))collect(module,other.name);
    }
    const root=get(name);for(const binding of roots)collect(root,binding);
    const emitted=new Set<string>(),visiting=new Set<string>(),code:string[]=[];
    const ids=new Map([...selected.keys()].map((key,index)=>[key,`module${index}`]));
    function emit(moduleName:string) {
      if(emitted.has(moduleName))return;
      if(visiting.has(moduleName))throw new Error('Cyclic catalog modules');
      visiting.add(moduleName);for(const dependency of dependencies.get(moduleName)??[])emit(dependency);
      const module=get(moduleName),names=selected.get(moduleName);if(!names)throw new Error('Missing selected module');
      const declarations:{start:number;source:string}[]=[];
      for(const variable of module.scope.variables.filter(variable=>names.has(variable.name))) {
        const definition=one(variable.defs,'catalog definition');if(!definition)throw new Error('Missing catalog definition');
        if(definition.type==='ImportBinding') {
          const imported=one(module.imports.filter(entry=>entry.node.local.name===variable.name),'selected import').node;
          const owner=one(module.imports.filter(entry=>entry.node===imported),'selected import owner').owner;
          const dependency=target(moduleName,literal(owner.source));
          const exported=maybeName(imported.imported);
          if(/^i18n-[\w-]+\.js$/.test(path.posix.basename(dependency.name))&&exported==='u')declarations.push({start:-1,source:`const ${variable.name}=value=>value;`});
          else {
            const binding=one(dependency.exports.filter(node=>maybeName(node.exported)===exported),'selected export');
            declarations.push({start:-1,source:`const ${variable.name}=${ids.get(dependency.name)}[${JSON.stringify(maybeName(binding.local))}];`});
          }
        } else declarations.push({start:position(definition.node).start,source:(definition.type==='FunctionName'?'':'var ')+module.source.slice(position(definition.node).start,position(definition.node).end)+';'});
      }
      for(const statement of statements.get(moduleName)??[])declarations.push({start:statement.start,source:module.source.slice(statement.start,statement.end)});
      code.push(`const ${ids.get(moduleName)}=(()=>{${declarations.sort((a,b)=>a.start-b.start).map(d=>d.source).join('\n')}return {${[...names].join(',')}}})();`);
      visiting.delete(moduleName);emitted.add(moduleName);
    }
    for(const moduleName of selected.keys())emit(moduleName);
    const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
    const result:unknown=new vm.Script(code.join('\n')+`;JSON.stringify({${roots.map(binding=>`${JSON.stringify(binding)}:${ids.get(name)}[${JSON.stringify(binding)}]`).join(',')}},(key,value)=>typeof value==='function'?'__function__':value)`).runInContext(context,{timeout:3000});
    return record(JSON.parse(text(result)),'catalog values');
  }
  return {modules,get,target,resolve,values};
}
export type ModuleGraph=ReturnType<typeof moduleGraph>;
export type GameModule=ModuleGraph['modules'][number];

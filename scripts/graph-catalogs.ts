import type {GameModule,ModuleGraph} from './module-graph.ts';

export function graphCatalogs(graph:ModuleGraph,module:GameModule) {
  const values:Record<string,unknown>={},rejected:Record<string,string>={};
  for(const variable of module.scope.variables) {
    if(variable.defs[0]?.type!=='Variable')continue;
    const resolved=graph.resolve(module.name,variable.name);
    const declaration=resolved.node.type==='VariableDeclarator'?resolved.node:undefined;
    if(!declaration?.init||!['ArrayExpression','ObjectExpression','CallExpression'].includes(declaration.init.type))continue;
    try {Object.assign(values,graph.values(module.name,[variable.name]));}
    catch(error){rejected[variable.name]=String(error);}
  }
  // Consumers require a unique catalog matching their schema. A rejected or
  // absent required catalog therefore prevents acquisition and preparation.
  return {tree:module.tree,values,rejected};
}

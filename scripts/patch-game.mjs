import { ast, nodes, one, literal, edits, configContext } from './source.mjs';

export function inspectGame(main, config) {
  const tree = ast(main);
  const { tree: configTree, values } = configContext(config);
  const findValue = (predicate, label) => one(Object.entries(values).filter(([, value]) => predicate(value)), label);
  const array = test => value => Array.isArray(value) && value.length > 0 && test(value);
  const [rosterName, roster] = findValue(array(v => v.some(x => x.start === true) && v.every(x => x.kit && x.passive)), 'League roster');
  const [labName, lab] = findValue(array(v => v.some(x => x.id === 'slot-move') && v.every(x => x.max && x.cost)), 'Lab catalog');
  const [itemsName, items] = findValue(array(v => v.some(x => x.key === 'soda-pop') && v.every(x => x.price)), 'shop catalog');
  const [biomesName, biomes] = findValue(array(v => v.some(x => x.id === 'forest' && x.size)), 'biome catalog');
  const [, season] = findValue(v => v && v.maxDex && v.season, 'generation limit');
  const [, versions] = findValue(v => v && v['data/pokemon.json'] && v.models && v.pmd, 'asset versions');
  const events = Object.values(values).find(array(v => v.some(x => x.id === 'halloween26' && x.start && x.end))) ?? [];
  const alias = localName => {
    const exported = one(nodes(configTree, n => n.type === 'ExportSpecifier' && n.local.name === localName), `export ${localName}`).exported.name;
    return one(nodes(tree, n => n.type === 'ImportSpecifier' && n.imported.name === exported), `import ${localName}`).local.name;
  };
  const functions = nodes(tree, n => n.type === 'FunctionDeclaration');
  const profile = one(functions.filter(n => {
    const returns = nodes(n.body, x => x.type === 'ReturnStatement' && x.argument?.type === 'ObjectExpression');
    return returns.some(r => ['stardust', 'lab', 'league', 'lastSpecies', 'settings'].every(key => r.argument.properties.some(p => p.key?.name === key)));
  }), 'profile factory').id.name;
  const registry = one(nodes(tree, n => n.type === 'VariableDeclarator' && n.init?.type === 'NewExpression'
    && n.init.callee.type === 'ClassExpression' && main.slice(n.start, n.end).includes('pokemon=[]')
    && main.slice(n.start, n.end).includes('movesByKey')), 'Pokédex registry').id.name;
  const backend = one(functions.filter(n => main.slice(n.start, n.end).includes('https://api.pokebonk.com')), 'backend factory');
  const seasonMethod = one(nodes(tree, n => n.type === 'MethodDefinition' && n.key.name === 'season'
    && main.slice(n.start, n.end).includes('this.info')), 'season method');
  const seasonCall = one(nodes(seasonMethod, n => n.type === 'CallExpression' && n.callee.type === 'Identifier'), 'season calculation').callee.name;
  const scoreDeclaration = one(nodes(configTree, n => n.type === 'VariableDeclarator' && n.init?.type === 'ArrowFunctionExpression'
    && config.slice(n.start,n.end).includes('.kills') && config.slice(n.start,n.end).includes('.time')
    && config.slice(n.start,n.end).includes('.victory')), 'run score');
  const score = alias(scoreDeclaration.id.name);
  const looks = one(nodes(configTree, n => n.type === 'FunctionDeclaration' && n.params.length === 4
    && ['shiny', 'spectral', 'classic', 'm1', 'm2'].every(s => nodes(n, x => x.type === 'SwitchCase' && literal(x.test) === s).length)), 'wardrobe eligibility');
  const aliases = { roster: alias(rosterName), lab: alias(labName), items: alias(itemsName), biomes: alias(biomesName), profile, registry, season: seasonCall, score };
  return { tree, configTree, values, aliases, backend, looks, roster, lab, items, biomes, season, versions, events };
}

export function patchGame(main, config, template) {
  const info = inspectGame(main, config);
  let shim = template;
  for (const [name, value] of Object.entries(info.aliases)) shim = shim.replaceAll(`__${name.toUpperCase()}__`, value);
  shim = shim.replaceAll('__EVENTS__', JSON.stringify(info.events));
  const cosmetics = [...new Set(Object.values(info.values).filter(Array.isArray).flatMap(list => list.map(entry=>entry?.id)).filter(id=>typeof id==='string'&&/^(tr|frame|title|sym|deco|skin):/.test(id)))];
  const preparations = one(Object.values(info.values).filter(value=>Array.isArray(value)&&value.length>0&&value.every(item=>item?.id&&item.desc)&&value.some(item=>item.id==='rare-candy')), 'preparation catalog').map(item=>item.id);
  shim = shim.replaceAll('__COSMETICS__',JSON.stringify(cosmetics)).replaceAll('__PREPARATIONS__',JSON.stringify(preparations));
  if (/__[A-Z]+__/.test(shim)) throw new Error('Unresolved backend template symbol');
  const boot = one(nodes(info.tree, n => n.type === 'AwaitExpression' && n.argument.type === 'CallExpression'
    && n.argument.callee.type === 'MemberExpression' && n.argument.callee.property.name === 'boot'
    && n.argument.callee.object.type === 'NewExpression'), 'application boot');
  const instance = main.slice(boot.argument.callee.object.start, boot.argument.callee.object.end);
  const patchedMain = edits(main, [
    { start: info.backend.start, end: info.backend.end, text: shim + `\nfunction ${info.backend.id.name}(){return createLocalSandboxBackend()}` },
    { start: boot.start, end: boot.end, text: `await (window.__pokebonkLocalApp=${instance}).boot()` },
  ]);
  const [profile, member] = info.looks.params.map(p => p.name);
  const urls = nodes(info.configTree, n => n.type === 'VariableDeclarator' && n.init?.type === 'ArrowFunctionExpression'
    && n.init.body.type === 'TemplateLiteral' && /assets\/|data\//.test(config.slice(n.init.body.start,n.init.body.end)));
  if(urls.length !== 2)throw new Error('Unsupported asset URL factories');
  const patchedConfig = edits(config, [{ start: info.looks.body.start + 1, end: info.looks.body.start + 1,
    text: `if(${profile}.localSandbox&&${profile}.league.includes(${member}))return true;` },
    ...urls.map(n=>({start:n.init.body.start,end:n.init.body.end,text:`new URL(${config.slice(n.init.body.start,n.init.body.end)},document.baseURI).href`}))]);
  return { main: patchedMain, config: patchedConfig, info };
}

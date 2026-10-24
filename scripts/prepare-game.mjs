import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ast, nodes, literal } from './source.mjs';
import { patchGame, inspectGame } from './patch-game.mjs';
import { statusIconPaths } from './status-icons.mjs';

const origin = 'https://pokebonk.com';
const output = path.resolve(process.argv[2] ?? 'build/game');
const cache = path.resolve('cache/upstream');
const files = new Map();
const missing = [];
const sha = data => createHash('sha256').update(data).digest('hex');
await mkdir(cache, { recursive: true });

async function download(resource, optional = false) {
  const url = new URL(resource, origin);
  if (url.origin !== origin || url.pathname.includes('..') || !/^\/[\w./-]+$/.test(url.pathname)) throw new Error(`Invalid static URL: ${url}`);
  const key = url.pathname.slice(1);
  if (files.has(key)) return files.get(key);
  const cached = path.join(cache, sha(url.href));
  if (optional) {
    try { await readFile(cached + '.missing'); missing.push(key); return null; } catch {}
  }
  let bytes;
  try { bytes = await readFile(cached); } catch {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (response.status === 404 && optional) { await writeFile(cached + '.missing', '404'); missing.push(key); return null; }
      if (!response.ok) {
        if (attempt < 2) continue;
        throw new Error(`Static download ${response.status}: ${url}`);
      }
      const size = Number(response.headers.get('content-length') ?? 0);
      if (size > 32 * 1024 * 1024) throw new Error(`Asset too large: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 32 * 1024 * 1024) throw new Error(`Asset too large: ${url}`);
      await writeFile(cached, bytes);
      break;
    }
  }
  if (/\.(png|jpg|glb|ogg|woff2?)$/.test(key) && bytes.subarray(0, 100).toString().includes('<!doctype html')) {
    if (optional) { missing.push(key); return null; }
    throw new Error(`HTML returned for binary asset: ${key}`);
  }
  files.set(key, bytes);
  if (files.size % 100 === 0) console.log(`Collected ${files.size} files (${key})`);
  return bytes;
}

const html = (await download('/index.html?offline-check=' + Date.now())).toString();
const buildId = html.match(/name="pokebonk-build" content="([\w-]+)"/)?.[1];
if (!buildId) throw new Error('Unsupported upstream index: no build identifier');
console.log(`Collecting upstream ${buildId}`);
// Follow Vite's module graph, CSS URLs, and HTML assets, including lazy language modules.
const pending = new Set();
function discover(text, parent) {
  const pattern = /["'`(]((?:\.?\.?\/|\/assets\/|\/icons\/)[A-Za-z0-9_./-]+\.(?:js|css|png|svg|webp|woff2?|ico|webmanifest))(?:["'`)\s?])/g;
  for (const match of text.matchAll(pattern)) {
    const url = new URL(match[1], new URL(parent, origin));
    if (url.origin === origin) pending.add(url.pathname);
  }
}
discover(html, '/index.html');
discover((await download('/legal.html')).toString(),'/legal.html');
for (;;) {
  const batch = [...pending].filter(key => !files.has(key.slice(1))).slice(0,8);
  if (!batch.length) break;
  const downloaded = await Promise.all(batch.map(async key=>({key,data:await download(key)})));
  for(const {key,data} of downloaded)if (/\.(js|css|webmanifest)$/.test(key)) discover(data.toString(), key);
}
const mainKey = [...files.keys()].find(key => key.endsWith('.js') && files.get(key).toString().includes(' as App}'));
if (!mainKey) throw new Error('No application module found');
const main = files.get(mainKey).toString();
const configKey = [...files.keys()].find(key => key.endsWith('.js') && files.get(key).toString().includes('slot-move') && key !== mainKey);
if (!configKey) throw new Error('No configuration module found');
const config = files.get(configKey).toString();
const info = inspectGame(main, config);
const version = Object.values(info.values).find(v => Array.isArray(v) && v[0]?.build === buildId)?.[0]?.version;
if (!version) throw new Error('Game/config build mismatch');
const resourceVersion = key => {
  const relative = key.replace(/^assets\//, '');
  const parts = relative.split('/');
  const group = relative.startsWith('data/') ? relative : parts.slice(0, Math.min(2, parts.length - 1)).join('/');
  return info.versions[group] ?? buildId;
};
const assets = new Map();
const add = (key, optional = false) => {
  if (!/^[\w./-]+\.(png|jpg|json|glb|ogg|svg|webp)$/.test(key) || key.includes('..')) throw new Error(`Invalid catalog path: ${key}`);
  assets.set(key, assets.has(key) ? assets.get(key) && optional : optional);
};
for (const key of Object.keys(info.versions).filter(key => key.startsWith('data/'))) add(key);
for (const key of ['pokemon','moves','learnsets','abilities','types','items','sprites']) add(`data/${key}.json`);
async function collect() {
  const queue = [...assets].filter(([key]) => !files.has(key));
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < queue.length) {
      const [key, optional] = queue[cursor++];
      await download(`/${key}?v=${resourceVersion(key)}`, optional);
    }
  }));
}
await collect();
const pokemon = JSON.parse(files.get('data/pokemon.json'));
const sprites = JSON.parse(files.get('data/sprites.json'));
const itemData = JSON.parse(files.get('data/items.json'));
const species = pokemon.filter(mon => mon.id <= info.season.maxDex || mon.id === 201).map(mon => mon.id);
for (const id of species) {
  for (const category of ['pmd','portraits','icons','cries']) add(`assets/${category}/${id}.${category === 'cries' ? 'ogg' : 'png'}`);
  for (const category of ['pmd-shiny','portraits-shiny','front']) add(`assets/${category}/${id}.png`, true);
  if (sprites[id]?.fallback) add('assets/' + sprites[id].fallback);
}
const usedItems = new Set(info.items.map(item => item.key));
for (const value of Object.values(info.values)) if (Array.isArray(value)) for (const item of value) {
  if (item?.key && (item.mods || item.stat)) usedItems.add(item.key);
}
for (const [key,item] of Object.entries(itemData)) if (item.icon) add('assets/' + item.icon, !usedItems.has(key));
for (const region of Object.keys(info.versions).filter(key => key.startsWith('env/'))) {
  for (const name of region === 'env/common' ? ['atlas.json','atlas.png'] : ['atlas.json','atlas.png','ground.png','cliff.png','path.png']) add(`assets/${region}/${name}`);
}
const allTrees = [ast(main), ast(config)];
const strings = allTrees.flatMap(tree => nodes(tree, n => typeof literal(n) === 'string').map(literal));
for (const value of strings) {
  if (/^(?:tower|halloween|desert|glacier|coast|ruins?|storm|frost|sanct)_[a-z_]+$/.test(value)) add(`assets/models/${value}.glb`, true);
  if (/^(?:env|ui|items|models|music|portraits|pmd)\/[\w./-]+\.(png|jpg|glb|ogg|json)$/.test(value)) add('assets/' + value);
  if (/^(tr|frame|sym|deco):[\w-]+$/.test(value)) {
    const [kind, id] = value.split(':');
    const dir = { tr:'ui/avatars', frame:'ui/frames', sym:'ui/clan/sym', deco:'ui/clan/deco' }[kind];
    add(`assets/${dir}/${id}.png`, true);
  }
}
// Catalog-driven cosmetics and every literal icon/model call. Missing candidates are
// recorded; gameplay-required atlas, sprite, item and data files are mandatory above.
for (const value of Object.values(info.values)) if (Array.isArray(value)) for (const entry of value) {
  if (entry?.id && entry?.how && !entry.kind && typeof entry.id === 'string') {
    for (const dir of ['ui/avatars','ui/frames','ui/clan/sym','ui/clan/deco']) add(`assets/${dir}/${entry.id}.png`, true);
  }
  if (entry?.style) add(`assets/ui/frames/look-${entry.style}.png`, true);
}
const iconFunction = nodes(info.tree, n => n.type === 'FunctionDeclaration' && n.params.length > 0
  && main.slice(n.start,n.end).includes('ui/icons/${'))[0]?.id.name;
const statusIcons=statusIconPaths(info.tree,iconFunction);
for(const key of statusIcons)add(key);
for (const tree of allTrees) {
  for (const call of nodes(tree, n => n.type === 'CallExpression')) {
    const method = call.callee.property?.name ?? call.callee.name;
    const words = nodes(call.arguments[0], n => typeof literal(n) === 'string').map(literal).filter(s => /^[\w-]+$/.test(s));
    if (method === iconFunction) words.forEach(s => add(`assets/ui/icons/${s}.png`, true));
    if (['model','place','bu','xu'].includes(method)) words.forEach(s => add(`assets/models/${s}.glb`, true));
  }
  for (const property of nodes(tree, n => n.type === 'Property' && ['model','shrine','portal','gate'].includes(n.key.name))) {
    const value = literal(property.value);
    if (typeof value === 'string' && /^[\w-]+$/.test(value)) add(`assets/models/${value}.glb`, true);
  }
}
// Calls through indirect maps store model names as [name, size].
for (const node of nodes(info.tree, n => n.type === 'ArrayExpression' && n.elements.length === 2)) {
  const value = literal(node.elements[0]);
  if (typeof value === 'string' && /^[\w-]+$/.test(value) && typeof literal(node.elements[1]) === 'number') add(`assets/models/${value}.glb`, true);
}
for (const name of ['battle1','battle2','battle3','battle4','boss','menu','halloween-menu','halloween-battle','halloween-boss']) add(`assets/music/${name}.ogg`, true);
for (const declaration of nodes(info.tree, n => n.type === 'VariableDeclarator' && n.init?.type === 'ObjectExpression')) {
  if (declaration.init.properties.some(p => p.key?.name === 'menu') && declaration.init.properties.some(p => p.key?.name === 'ingame1')) {
    for (const property of declaration.init.properties) add(`assets/music/${property.key.name ?? literal(property.key)}.ogg`);
  }
}
for (const type of new Set(pokemon.flatMap(mon=>mon.types))) {
  if (!/^[a-z]+$/.test(type)) throw new Error('Unknown Pokémon type');
  add(`assets/ui/types/${type}.png`);
  add(`assets/items/tm-${type}.png`, true);
}
for (const rank of ['bronze','silver','gold','champion','master','legend','elite','top10','top25','top50','top100']) add(`assets/ui/ranks/${rank}.png`, true);
for (const name of ['ball','freeball','cursedball','unown','boss','portal','shrine','challenge','cursed','cage','rock','shroom','tower','comet','candle','escalera']) add(`assets/ui/icons/map-${name}.png`, true);
console.log(`Downloading ${assets.size} catalog assets`);
await collect();
const bytes = [...files.values()].reduce((sum, value) => sum + value.length, 0);
if (bytes > 1024 * 1024 * 1024) throw new Error('Payload exceeds 1 GiB budget');
const patched = patchGame(main, config, await readFile('runtime/local-backend.js','utf8'));
files.set(mainKey, Buffer.from(patched.main));
files.set(configKey, Buffer.from(patched.config));
const csp = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:; frame-src 'none'; object-src 'none'";
// Native packages serve all assets directly; there is no PWA or service worker.
const nativeHtml=html.replace(/<link[^>]+rel=["']manifest["'][^>]*>/g,'').replace('</head>', `<meta http-equiv="Content-Security-Policy" content="${csp}"><script>if(!localStorage.getItem('pokebonk.lang'))localStorage.setItem('pokebonk.lang','zht');</script></head>`);
files.delete('manifest.webmanifest');
files.set('index.html',Buffer.from(nativeHtml));
for(const [key,data] of files)if(key.endsWith('.html'))files.set(key,Buffer.from(data.toString().replace(/((?:src|href)=["'])\/(?!\/)/g,'$1./').replace(/href=(["'])\.\/legal\1/g,'href=$1./legal.html$1')));
files.set('version.json', Buffer.from(JSON.stringify({build:buildId,version})));
files.set('offline-build.json', Buffer.from(JSON.stringify({upstreamBuild:buildId,upstreamVersion:version,variant:'unlock-all',league:info.roster.length,lab:info.lab.length,items:info.items.length,achievements:info.quests.length,medals:info.biomes.filter(b=>Number.isFinite(b.size)).length*3,medalRank:info.medalRanks.length,statusIcons,builder:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()},null,2)));
await rm(output,{recursive:true,force:true});
for (const [key,data] of files) { const target=path.join(output,key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data); }
const entries=[...files].map(([name,data])=>({name,bytes:data.length,sha256:sha(data)})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
const cacheVersion=sha(JSON.stringify(entries));
await writeFile(path.join(output,'asset-manifest.json'),JSON.stringify({build:buildId,cacheVersion,files:entries,missingCandidates:[...new Set(missing)].sort()},null,2));
console.log(`Prepared ${files.size} files, ${(bytes/1024/1024).toFixed(1)} MiB at ${output}`);

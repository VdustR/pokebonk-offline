import { parse } from 'acorn';
import vm from 'node:vm';

export const ast = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
export function nodes(tree, predicate) {
  const result = [];
  walk(tree, node => { if (predicate(node)) result.push(node); });
  return result;
}
export function one(values, label) {
  if (values.length !== 1) throw new Error(`Unsupported upstream: ${label}: expected one match, got ${values.length}`);
  return values[0];
}
export const literal = node => node?.type === 'Literal' ? node.value
  : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0].value.cooked : undefined;
export function edits(source, replacements) {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let boundary = source.length;
  for (const edit of ordered) {
    if (edit.end > boundary) throw new Error('Overlapping source patches');
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    boundary = edit.start;
  }
  ast(source);
  return source;
}
export function configContext(source) {
  const tree = ast(source);
  const imports = tree.body.filter(node => node.type === 'ImportDeclaration');
  const exports = tree.body.filter(node => node.type === 'ExportNamedDeclaration');
  const bindings = Object.fromEntries(imports.flatMap(node => node.specifiers.map(s => [s.local.name,
    s.imported?.name === 't' ? [{ id: 'es' }] : (text => text)])));
  const names = nodes(tree, node => node.type === 'VariableDeclarator' && node.id.type === 'Identifier').map(node => node.id.name);
  const clean = edits(source, [...imports, ...exports].map(node => ({ ...node, text: '' })));
  const context = vm.createContext({ ...bindings });
  const values = new vm.Script(clean + '\n;({' + [...new Set(names)].join(',') + '})').runInContext(context, { timeout: 3000 });
  return { tree, values };
}

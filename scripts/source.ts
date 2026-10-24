import { parse } from 'acorn';
import type {AnyNode} from 'acorn';
import vm from 'node:vm';
import {isRecord, record, text} from '../types/data.ts';

export const ast = (source: string) => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
export function walk(node: unknown, visit: (node: AnyNode) => void): void {
  if (!isRecord(node)) return;
  const candidate: object = node;
  // The input is Acorn's own syntax tree. The walker only crosses its nested
  // fields; locations and other metadata are not syntax nodes.
  if (typeof node['type'] === 'string' && typeof node['start'] === 'number' && typeof node['end'] === 'number') visit(candidate as AnyNode);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (isRecord(value)) walk(value, visit);
  }
}
export function nodes(tree: unknown, predicate: (node: AnyNode) => boolean): AnyNode[] {
  const result: AnyNode[] = [];
  walk(tree, node => { if (predicate(node)) result.push(node); });
  return result;
}
export function nodesOf<T extends AnyNode['type']>(tree: unknown, type: T, predicate: (node: Extract<AnyNode,{type:T}>) => boolean = () => true): Extract<AnyNode,{type:T}>[] {
  const result: Extract<AnyNode,{type:T}>[] = [];
  walk(tree, node => {
    if (node.type === type) {
      // Generic discriminants are not narrowed to Extract by the compiler.
      const match = node as Extract<AnyNode,{type:T}>;
      if (predicate(match)) result.push(match);
    }
  });
  return result;
}
export function requireNode<T extends AnyNode['type']>(node: AnyNode | null | undefined,type:T): Extract<AnyNode,{type:T}> {
  if (!node || node.type !== type) throw new Error(`Unsupported upstream: expected ${type}`);
  return node as Extract<AnyNode,{type:T}>;
}
export function one<T>(values: readonly T[], label: string): T {
  if (values.length !== 1 || values[0] === undefined) throw new Error(`Unsupported upstream: ${label}: expected one match, got ${values.length}`);
  return values[0];
}
export function maybeName(node: AnyNode | null | undefined): string | undefined {
  if (node?.type === 'Identifier' || node?.type === 'PrivateIdentifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  return undefined;
}
export function nameOf(node: AnyNode | null | undefined): string { return text(maybeName(node), 'upstream identifier'); }
export const literal = (node: AnyNode | null | undefined) => node?.type === 'Literal' ? node.value
  : node?.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0]?.value.cooked : undefined;
export interface SourceEdit { start: number; end: number; text: string }
export function edits(source: string, replacements: readonly SourceEdit[]): string {
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
export function configContext(source: string) {
  const tree = ast(source);
  const imports = nodesOf(tree,'ImportDeclaration');
  const exports = nodesOf(tree,'ExportNamedDeclaration');
  const bindings = imports.flatMap(node => node.specifiers.map(s =>
    `const ${s.local.name}=${s.type === 'ImportSpecifier' && maybeName(s.imported) === 't' ? '[{id:"es"}]' : '(text=>text)'};`)).join('\n');
  const names = nodesOf(tree,'VariableDeclarator', node => node.id.type === 'Identifier').map(node => nameOf(node.id));
  const clean = edits(source, [...imports, ...exports].map(node => ({ ...node, text: '' })));
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
  const serialized: unknown = new vm.Script(bindings + clean + '\n;JSON.stringify({' + [...new Set(names)].join(',')
    + '},(key,value)=>typeof value==="function"?"__function__":value)').runInContext(context, { timeout: 3000 });
  const values = record(JSON.parse(text(serialized)), 'upstream configuration');
  return { tree, values };
}

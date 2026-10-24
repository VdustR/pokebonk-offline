import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ast,nodes} from '../scripts/source.ts';

test('injected backend emits standalone JavaScript without module syntax',async()=>{
  const source=await readFile('dist/runtime/local-backend.js','utf8');
  const moduleSyntax=nodes(ast(source),node=>node.type.startsWith('Import')||node.type.startsWith('Export'));
  assert.deepEqual(moduleSyntax,[]);
  assert.match(source,/function createLocalSandboxBackend\(/);
});

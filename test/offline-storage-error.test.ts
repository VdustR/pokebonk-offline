import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchOfflineStorageError} from '../scripts/offline-storage-error.ts';
const fixture="class App{offline(){return [translate('No hay conexión con el servidor'),translate('Tu progreso se guarda en el servidor. Comprueba tu conexión e inténtalo de nuevo.')];}}";
function render(source:string,kind:string,lang:string){return String(vm.runInNewContext(source+`;const app=new App();app.backend={kind};app.offline().join('|')`,{kind,translate:(text:string)=>text,localStorage:{getItem:()=>lang}}));}
test('local startup failures explain retained device data while HTTP failures stay unchanged',()=>{
  const patched=patchOfflineStorageError(fixture);
  assert.match(render(patched,'local','zht'),/無法載入本機遊戲資料.*原始資料已保留/);
  assert.doesNotMatch(render(patched,'local','en'),/server|connection/);
  assert.match(render(patched,'local','__proto__'),/Unable to load/);
  assert.deepEqual(render(patched,'http','zht'),render(fixture,'http','zht'));
});
test('missing or ambiguous startup failure screens and messages fail closed',()=>{
  assert.throws(()=>patchOfflineStorageError('class App{}'),/startup failure screen/);
  assert.throws(()=>patchOfflineStorageError(fixture+fixture.replace('App','Other')),/startup failure screen/);
  assert.throws(()=>patchOfflineStorageError(fixture.replace('No hay conexión con el servidor','different message')),/startup failure message/);
});

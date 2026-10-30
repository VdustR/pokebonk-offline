import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {patchNativeOriginGate} from '../scripts/native-origin.ts';

const entry=String.raw`const seed=String('native');const allowed=host=>/(^|\.)pokebonk\.com\.?$/.test(host)||/^(localhost|127(\.\d+){3})$/.test(host)||host.endsWith('.localhost')||host.endsWith('.local');
if(!allowed(location.hostname))blocked();else loadGame();`;
function boots(source:string,url:string) {
  let loaded=false;
  vm.runInNewContext(source,{location:new URL(url),blocked(){},loadGame(){loaded=true;}});
  return loaded;
}
test('native asset origins boot while unrelated mirrors remain blocked',()=>{
  for(const source of [entry,entry.replaceAll("'",'`')]) {
    const patched=patchNativeOriginGate(source);
    for(const url of ['pokebonk://game/index.html','https://appassets.androidplatform.net/index.html','https://pokebonk.com/','http://localhost/','http://dev.localhost/'])assert.equal(boots(patched,url),true,url);
    for(const url of ['https://example.com/','https://game/','pokebonk://game.evil/','pokebonk://game:123/','pokebonk://game@evil/','https://appassets.androidplatform.net.evil/','http://appassets.androidplatform.net/'])assert.equal(boots(patched,url),false,url);
  }
});
test('entries without an origin gate stay byte-identical and unknown gates fail closed',()=>{
  const previous='loadGame();';
  assert.equal(patchNativeOriginGate(previous),previous);
  assert.throws(()=>patchNativeOriginGate('if(!allowed(location.hostname))blocked();'),/native origin predicate/);
  assert.throws(()=>patchNativeOriginGate(entry.replace("host.endsWith('.local')","false")),/Unsupported native origin predicate/);
  assert.throws(()=>vm.runInNewContext(patchNativeOriginGate(entry),{location:new URL('pokebonk://game/'),loadGame(){throw new Error('Broken game boot');}}),/Broken game boot/);
});

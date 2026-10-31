import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readSnapshotManifest} from '../scripts/upstream-snapshot.ts';
import {inspectReleaseIcons} from '../scripts/release-icons.ts';

const categories="const renamed=[{id:'new',icon:'news'},{id:'better',icon:'level'},{id:'fix',icon:'check'}];";
test('release category icons include indirect icons and catalog additions',()=>{
  assert.deepEqual(inspectReleaseIcons(categories.replace("{id:'fix'","{id:'extra',icon:'new-icon'},{id:'fix'")),[
    'assets/ui/icons/news.png','assets/ui/icons/level.png','assets/ui/icons/new-icon.png','assets/ui/icons/check.png',
  ]);
  for(const invalid of [categories.replace("icon:'level'","icon:'../secret'"),categories.replace("icon:'level'","icon:42"),categories.replace("id:'fix'","id:'better'"),categories+categories])assert.throws(()=>inspectReleaseIcons(invalid));
});
test('pinned release notes have every category icon in the snapshot',async()=>{
  const manifest=await readSnapshotManifest();
  const modules=await Promise.all(manifest.files.filter(file=>file.name.endsWith('.js')).map(file=>readFile('vendor/pokebonk/game/'+file.name,'utf8')));
  const main=modules.find(source=>source.includes(' as App}'));
  assert.ok(main);
  const icons=inspectReleaseIcons(main);
  for(const icon of icons)await readFile('vendor/pokebonk/game/'+icon);
});

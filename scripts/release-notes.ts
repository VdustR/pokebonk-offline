import {readFile,writeFile} from 'node:fs/promises';
import {parseProvenance,releaseNotes} from '../types/release.ts';
const [metadata,notes,provenance]=process.argv.slice(2);
if(!metadata||!notes||!provenance)throw new Error('Usage: release-notes.ts <offline-build.json> <notes.md> <release-info.json>');
const info=parseProvenance(JSON.parse(await readFile(metadata,'utf8')));
if(process.env['TAG']&&process.env['TAG']!==info.tag)throw new Error('Payload identity differs from planned release tag');
if(process.env['TITLE']&&process.env['TITLE']!==info.title)throw new Error('Payload identity differs from planned release title');
await writeFile(notes,releaseNotes(info,await readFile('CHANGELOG.md','utf8')));
await writeFile(provenance,JSON.stringify(info,null,2)+'\n');

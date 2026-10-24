import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
export async function createElectronIcons(game: string,base: string) {
  const large=await readFile(path.join(game,'icons/icon-512.png'));
  const small=await readFile(path.join(game,'icons/icon-192.png'));
  const chunk=Buffer.alloc(8);chunk.write('ic09');chunk.writeUInt32BE(large.length+8,4);
  const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(16+large.length,4);
  await writeFile(base+'.icns',Buffer.concat([header,chunk,large]));
  const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=192;ico[7]=192;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(small.length,14);ico.writeUInt32LE(22,18);
  await writeFile(base+'.ico',Buffer.concat([ico,small]));
}

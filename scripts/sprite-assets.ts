import {record,isRecord} from '../types/data.ts';

export function inspectAnimatedSprites(spriteData:unknown) {
  const sprites=record(spriteData,'sprite catalog');
  const assets:string[]=[];
  for(const [key,value] of Object.entries(sprites)) {
    if(!/^[1-9]\d*$/.test(key)||!Number.isSafeInteger(Number(key)))throw new Error('Invalid sprite catalog id');
    const sprite=record(value,'sprite catalog entry');
    // The renderer's hasAnimated predicate uses this catalog field, independent
    // of the playable generation, selected scene, event, or current date.
    if(!sprite['anims'])continue;
    if(!isRecord(sprite['anims']))throw new Error('Invalid sprite catalog animations');
    assets.push(`assets/pmd/${key}.png`);
  }
  if(!assets.length)throw new Error('Empty animated sprite catalog');
  return assets.sort();
}

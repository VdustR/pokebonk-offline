import {configContext,one} from './source.ts';
import {finite,list,objectArray,record,text} from '../types/data.ts';

export function inspectTreasureCatalog(config:string) {
  const arrays=Object.values(configContext(config).values).filter(objectArray);
  const catalog=one(arrays.filter(entries=>entries.some(entry=>entry['starter']!==undefined&&entry['prizes']!==undefined)),'treasure catalog');
  const ids=new Set<string>();
  return catalog.map(entry=>{
    const id=text(entry['id'],'treasure id'),starter=finite(entry['starter'],'treasure starter');
    if(!/^[a-z][a-z0-9-]*$/.test(id)||ids.has(id)||!Number.isSafeInteger(starter)||starter<=0)throw new Error('Invalid or duplicate treasure wheel');
    ids.add(id);
    const prizeIds=new Set<string>();
    const prizes=list(entry['prizes'],value=>{
      const prize=record(value,'treasure prize'),prizeId=text(prize['id'],'treasure prize id');
      if(!/^\w[\w-]*$/.test(prizeId)||prizeIds.has(prizeId))throw new Error('Invalid or duplicate treasure prize');
      prizeIds.add(prizeId);
      const cosmetics=list(prize['cosmetics'],value=>{
        const cosmetic=text(value,'treasure cosmetic');
        if(!/^(?:tlook:\d+:\d+|(?:frame|title):[\w-]+)$/.test(cosmetic))throw new Error('Invalid treasure cosmetic');
        return cosmetic;
      });
      return {id:prizeId,cosmetics};
    });
    if(!prizes.length)throw new Error('Empty treasure wheel');
    return {id,starter,prizes};
  });
}

export const treasureAssetPaths=(config:string)=>inspectTreasureCatalog(config).map(wheel=>`assets/ui/treasures/bg-${wheel.id}.png`);

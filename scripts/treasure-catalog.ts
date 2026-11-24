import type {graphCatalogs} from './graph-catalogs.ts';
import {configContext,one} from './source.ts';
import {finite,list,objectArray,record,text} from '../types/data.ts';

export function inspectTreasureCatalog(config:string,context?:ReturnType<typeof graphCatalogs>) {
  const arrays=Object.values((context??configContext(config)).values).filter(objectArray);
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
        if(!/^(?:tlook:\d+:\d+|(?:frame|title|bg):[\w-]+)$/.test(cosmetic))throw new Error('Invalid treasure cosmetic');
        return cosmetic;
      });
      return {id:prizeId,cosmetics};
    });
    if(!prizes.length)throw new Error('Empty treasure wheel');
    const series=entry['series']===undefined?1:finite(entry['series']);
    if(!Number.isSafeInteger(series)||series<1)throw new Error('Invalid treasure series');
    return {id,starter,series,prizes};
  });
}

export const treasureAssetPaths=(config:string,context?:ReturnType<typeof graphCatalogs>)=>[...new Set(inspectTreasureCatalog(config,context).flatMap(wheel=>[
  `assets/ui/treasures/bg-${wheel.id}.png`,
  ...wheel.prizes.flatMap(prize=>prize.cosmetics.flatMap(cosmetic=>cosmetic.startsWith('frame:')?[`assets/ui/frames/${cosmetic.slice(6)}.png`]:cosmetic.startsWith('bg:')?[`assets/ui/banners/${cosmetic.slice(3)}.jpg`,...cosmetic.startsWith('bg:tr-')?[`assets/ui/banners/${cosmetic.slice(3)}-glow.png`]:[]]:[])),
]))];

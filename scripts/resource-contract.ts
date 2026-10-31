import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {record,text,list} from '../types/data.ts';

const hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const inputName=(name:string)=>name!=='manifest.webmanifest'&&/\.(?:html|js|css|json|webmanifest|svg)$/.test(name);
function resourceName(value:unknown) {
  const name=text(value,'resource contract path');
  if(!/^[\w/-][\w./-]*$/.test(name)||name.startsWith('/')||name.split('/').some(part=>!part||part.startsWith('.')))throw new Error('Invalid resource contract path');
  return name;
}
export function parseResourceContract(value:unknown) {
  const body=record(value,'resource contract');
  if(body['schemaVersion']!==1)throw new Error('Unsupported resource contract');
  const required=list(body['required'],resourceName);
  const inputs=list(body['inputs'],value=>{
    const entry=record(value,'resource contract input'),name=resourceName(entry['name']),sha256=text(entry['sha256'],'resource input hash');
    if(!inputName(name)||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid resource contract input');
    return {name,sha256};
  });
  if(!required.length||new Set(required).size!==required.length||!inputs.length||new Set(inputs.map(input=>input.name)).size!==inputs.length)throw new Error('Empty or duplicate resource contract entries');
  if(inputs.some(input=>!required.includes(input.name)))throw new Error('Resource input must be required');
  return {schemaVersion:1,upstreamBuild:text(body['upstreamBuild'],'reviewed upstream build'),inputs,required};
}
export type ResourceContract=ReturnType<typeof parseResourceContract>;
export async function readResourceContract() {
  return parseResourceContract(JSON.parse(await readFile(new URL('./resource-contract.json',import.meta.url),'utf8')));
}
export function resourceContractDigest(contract:ResourceContract) {return hash(JSON.stringify(contract));}
// This is a conservative reviewed-baseline gate, not a JavaScript URL solver.
// Any executable/catalog/style change requires a new dependency review. There is
// deliberately no automatic contract generation in sync or snapshot promotion.
export function assertReviewedInputs(files:ReadonlyMap<string,Uint8Array>,build:string,contract:ResourceContract) {
  if(build!==contract.upstreamBuild)throw new Error('Unreviewed upstream resource inputs: build changed; see docs/resource-completeness.md');
  const actual=[...files.keys()].filter(inputName).sort(),expected=contract.inputs.map(input=>input.name).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Unreviewed upstream resource inputs: input inventory changed');
  for(const input of contract.inputs) {
    const bytes=files.get(input.name);
    if(!bytes||hash(bytes)!==input.sha256)throw new Error(`Unreviewed upstream resource inputs: ${input.name}`);
  }
}
export function assertRequiredResources(names:ReadonlySet<string>,contract:ResourceContract) {
  for(const name of contract.required)if(!names.has(name))throw new Error(`Missing required resource: ${name}`);
}
export function validResourceImage(name:string,bytes:Uint8Array) {
  const data=Buffer.from(bytes);
  if(name.endsWith('.png'))return data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(name.endsWith('.webp'))return data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';
  return true;
}

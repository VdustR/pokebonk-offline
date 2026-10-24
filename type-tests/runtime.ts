// These assignments must stay invalid under the effective application config.
const parsed: unknown = JSON.parse('{"value":1}');
// @ts-expect-error ts-reset keeps JSON untrusted until validation
const unchecked: {value:number} = JSON.parse('{}');
const values: number[] = [];
// @ts-expect-error noUncheckedIndexedAccess includes undefined
const first: number = values[0];
// @ts-expect-error exactOptionalPropertyTypes distinguishes omission
const optional: {value?:number} = {value:undefined};
export {parsed,unchecked,first,optional};
// @ts-expect-error browser runtime cannot access Node globals
process.cwd();
document.title;

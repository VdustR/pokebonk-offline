type LocalBackendContract = import('./backend.d.ts').SandboxBackend;
type LocalProfile = import('./profile.d.ts').Profile;
type LocalReadyProfile = import('./profile.d.ts').ReadyProfile;
type LocalPeriodTasks = import('./profile.d.ts').PeriodTasks;
type LocalRunConfig = import('./profile.d.ts').RunConfig;
type LocalRunTicket = import('./profile.d.ts').RunTicket;
type LocalRunResult = import('./profile.d.ts').RunResult;
type LocalProfileAction = import('./profile.d.ts').ProfileAction;
declare function __PROFILE__(name: string): unknown;
declare function __SEASON__(now: number): unknown;
declare const __EVENTS__: (Record<string, unknown> & {start:string;end:string})[];
declare const __ROSTER__: {id:number}[];
declare const __REGISTRY__: {
  pokemon: {id:number}[];
  get(id:number): {family?:number};
  root(id:number): {id:number};
};
declare const __LAB__: {id:string;max:number}[];
declare const __ITEMS__: {key:string}[];
declare const __BIOMES__: {id:string;size?:number}[];
declare const __MEDALS__: number;
declare function __REFRESH__(profile: LocalProfile,now:number): void;
declare function __TASK__(id:string): {goal:number};
declare const __QUESTS__: {id:string;title?:string;look?:{member:number;n:number}}[];
declare function __SCORE__(result:LocalRunResult): number;
declare const __PREPARATIONS__: string[];
declare const __COSMETICS__: string[];

declare const __TREASURES__: {id:string;starter:number;prizes:{id:string;cosmetics:string[]}[]}[];

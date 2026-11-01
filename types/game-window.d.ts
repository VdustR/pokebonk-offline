interface GameRun {
  time: number;
  state: string;
  camYaw: number;
  resume(): void;
  checkpoint(): void;
  startSpecies: number;
  biome: {id:string};
  mode: string;
  player: {pos:{x:number;z:number}};
  boss: {spawn(species:number,x:number,z:number,flag:boolean):void;bossIndex:number};
  enemies: {poison:number[];sleep:number[];para:number[];poisonStacks:number[]};
  endHow: string;
  finish(victory:boolean,quit:boolean):Promise<void>;
}
interface Window {
  // The patch exports this instance solely for native smoke verification.
  __pokebonkLocalApp: {
    meta: {profile:import('./profile.d.ts').ReadyProfile;tasksReady():number};
    backend:import('./backend.d.ts').SandboxBackend;
    run:GameRun | null;
    toMenu():void;
    startRun(config:import('./profile.d.ts').RunConfig):Promise<boolean>;
  };
}

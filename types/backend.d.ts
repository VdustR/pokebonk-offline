import type {ReadyProfile, RunConfig, RunResult, RunTicket} from './profile.d.ts';
export interface SandboxBackend {
  loadProfile(): Promise<ReadyProfile>;
  savePrefs(account: unknown, profile: unknown): Promise<void>;
  chooseStarter(account: unknown, species: number): Promise<ReadyProfile>;
  startRun(account: unknown, config: RunConfig): Promise<RunTicket>;
  finishRun(account: unknown, ticket: RunTicket, result: RunResult): Promise<{
    profile:ReadyProfile;record:Record<string,unknown>;ranked:boolean;stardust:number;local:boolean;
  }>;
}

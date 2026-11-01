import type {ReadyProfile, RunConfig, RunResult, RunTicket} from './profile.d.ts';
export interface SandboxBackend {
  loadProfile(): Promise<ReadyProfile>;
  savePrefs(account: unknown, profile: unknown): Promise<void>;
  chooseStarter(account: unknown, species: number): Promise<ReadyProfile>;
  startRun(account: unknown, config: RunConfig): Promise<RunTicket>;
  keepLive(account: unknown,ticket: RunTicket,result: RunResult): void;
  suspendRun(account: unknown,ticket: RunTicket,hash: string): Promise<void>;
  resumeRun(account: unknown,ticket: RunTicket,hash: string): Promise<void>;
  recoverRun(account: unknown,ticket: RunTicket,hash: string): Promise<void>;
  autoWaiting(account: unknown): Promise<boolean>;
  retryNow(account?: unknown): Promise<{left:number;saved:number}>;
  finishRun(account: unknown, ticket: RunTicket, result: RunResult): Promise<{
    profile:ReadyProfile;record:Record<string,unknown>;ranked:boolean;stardust:number;local:boolean;
  }>;
}

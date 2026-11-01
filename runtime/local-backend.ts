// Storage is untrusted even though all writes stay on this device. Preserve
// unknown upstream fields while validating every field this adapter consumes.
function localObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid local profile object');
  return value as Record<string, unknown>;
}
function localString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid local profile string');
  return value;
}
function localNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid local profile number');
  return value;
}
function localList<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Invalid local profile array');
  return value.map(parse);
}

function localTicket(value:unknown):LocalRunTicket {
  const ticket=localObject(value),id=localString(ticket['id']),seed=localNumber(ticket['seed']);
  if(!id.startsWith('local-')||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Invalid local run ticket');
  return {id,seed,ranked:false,boosts:localList(ticket['boosts'],entry=>entry)};
}
function localResult(value:unknown):LocalRunResult {
  const result=localObject(value);
  if(result['victory']!==undefined&&typeof result['victory']!=='boolean')throw new Error('Invalid local run victory');
  if(result['progress']===undefined)return {...result};
  const progress=localObject(result['progress']);
  const counters=Object.fromEntries(Object.entries(localObject(progress['counters']??{})).map(([key,value])=>{
    const count=localNumber(value);if(count<0)throw new Error('Invalid local run counter');return [key,count];
  }));
  const ids=(key:string)=>localList(progress[key]??[],localNumber);
  return {...result,progress:{...progress,counters,seen:ids('seen'),forms:ids('forms'),league:ids('league'),shinies:ids('shinies'),classics:ids('classics')}};
}

// Injected into the pinned game module; all state and results stay local.
class LocalSandboxBackend implements LocalBackendContract {
  kind = 'local';
  clockSkew = 0;
  current: LocalReadyProfile | null = null;
  get profile(): LocalReadyProfile {
    if (!this.current) throw new Error("Load the local profile before changing it.");
    return this.current;
  }
  account = { id: 'local-sandbox', name: 'Local Sandbox', guest: false };

  season() { return __SEASON__(Date.now()); }
  events() { return __EVENTS__.filter(event => Date.parse(event.start) <= Date.now() && Date.parse(event.end) > Date.now()).map(event => ({ ...event, live: true, start: Date.parse(event.start), end: Date.parse(event.end) })); }
  async status() {
    return { maintenance: { on: false }, registration: { inviteOnly: false }, season: this.season(), events: this.events() };
  }
  async restore() { document.title = 'PokéBonk Offline — Unlock All'; return this.account; }
  async guest() { return this.account; }
  guestSave() { return true; }
  async logout() { throw new Error('Local sandbox: no online account is connected.'); }

  unlock(profile: LocalProfile): LocalReadyProfile {
    profile.localSandbox = true;
    for(const wheel of __TREASURES__) {
      const previous=profile.treasures[wheel.id];
      profile.treasures[wheel.id]={...previous,won:[...new Set([...(previous?.won??[]),...wheel.prizes.map(prize=>prize.id)])]};
    }
    profile.starter = profile.starter || 4;
    profile.league = __ROSTER__.map(member => member.id);
    // The character screen uses bits 0, 1 and 2 for Normal, Hard and Nightmare.
    for(const member of __ROSTER__)profile.wins[member.id]=(profile.wins[member.id]??0)|0b111;
    profile.unlocked = [...new Set(__ROSTER__.map(member => (__REGISTRY__.get(member.id).family || __REGISTRY__.root(member.id).id)))];
    profile.seen = __REGISTRY__.pokemon.map(mon => mon.id);
    profile.forms = [...profile.seen];
    profile.shinies = [...profile.seen];
    profile.classics = [...profile.seen];
    profile.research = Object.fromEntries(profile.unlocked.map(id => [id, 1000000]));
    profile.lab = Object.fromEntries(__LAB__.map(upgrade => [upgrade.id, upgrade.max]));
    profile.itemsOwned = __ITEMS__.map(item => item.key);
    profile.biomes = Object.fromEntries(__BIOMES__.map(biome => [biome.id, 3]));
    profile.medals = { ...profile.medals, ...Object.fromEntries(__BIOMES__.filter(biome=>Number.isFinite(biome.size)).flatMap(biome=>[0,1,2].map(tier=>[`${biome.id}-${tier}`,__MEDALS__]))) };
    __REFRESH__(profile,Date.now());
    if (!profile.daily || !profile.weekly) throw new Error('Invalid refreshed task periods');
    const ready = Object.assign(profile, {daily: profile.daily, weekly: profile.weekly});
    for(const period of ['daily','weekly'] as const) {
      ready[period].prog = ready[period].ids.map(id=>__TASK__(id).goal);
      ready[period].claimed = [1,1,1,1];
    }
    profile.quests = { ...profile.quests, ...Object.fromEntries(__QUESTS__.map(quest => [quest.id, 1])) };
    const achievementCosmetics = __QUESTS__.flatMap(quest => [
      ...(quest.title ? ['title:q:' + quest.id] : []),
      ...(quest.look ? [`look:${quest.look.member}:${quest.look.n}`] : []),
    ]);
    profile.stardust = 1000000000;
    profile.totalStardust = Math.max(profile.totalStardust || 0, profile.stardust);
    profile.bag = { ...profile.bag, ...Object.fromEntries(__PREPARATIONS__.map(id=>[id,999])) };
    profile.cosmetics = [...new Set([...profile.cosmetics, ...__COSMETICS__, ...achievementCosmetics, ...__TREASURES__.flatMap(wheel=>wheel.prizes.flatMap(prize=>prize.cosmetics)), 'skin:spectral'])];
    return ready;
  }
  async persist(profile: unknown = this.profile) {
    const next = this.unlock(this.normalize(structuredClone(profile)));
    localStorage.setItem('pokebonk.local.profile.v1', JSON.stringify(next));
    this.current = next;
    return structuredClone(next);
  }
  normalize(value: unknown): LocalProfile {
    const defaults = localObject(__PROFILE__('Local Sandbox'));
    const saved = value === null ? {} : localObject(value);
    const merged = {...defaults, ...saved};
    const numbers = (key: string) => localList(merged[key] ?? [], localNumber);
    const strings = (key: string) => localList(merged[key] ?? [], localString);
    const counts = (key: string) => Object.fromEntries(Object.entries(localObject(merged[key] ?? {})).map(([k,v]) => [k,localNumber(v)]));
    const wins=counts('wins');
    if(Object.values(wins).some(mask=>!Number.isInteger(mask)||mask<0||mask>0x7fffffff))throw new Error('Invalid local profile victory mask');
    const profile: LocalProfile = {
      ...merged,
      settings: {...localObject(defaults['settings'] ?? {}), ...localObject(saved['settings'] ?? {})},
      league:numbers('league'),unlocked:numbers('unlocked'),seen:numbers('seen'),forms:numbers('forms'),shinies:numbers('shinies'),classics:numbers('classics'),
      research:counts('research'),lab:counts('lab'),biomes:counts('biomes'),bag:counts('bag'),medals:counts('medals'),quests:counts('quests'),counters:counts('counters'),wins,
      treasures:Object.fromEntries(Object.entries(localObject(merged['treasures']??{})).map(([id,value])=>{
        const wheel=localObject(value);
        return [id,{...wheel,won:localList(wheel['won']??[],localString)}];
      })),
      cosmetics:strings('cosmetics'),itemsOff:strings('itemsOff'),itemsOwned:strings('itemsOwned'),
      runs:localList(merged['runs'] ?? [], entry => {const run=localObject(entry);return {...run,id:localString(run['id'])};}),
      stardust:localNumber(merged['stardust'] ?? 0),totalStardust:localNumber(merged['totalStardust'] ?? 0),
    };
    for (const key of ['starter','lastSpecies'] as const) if (merged[key] !== undefined) profile[key] = localNumber(merged[key]);
    for (const key of ['daily','weekly'] as const) if (merged[key] !== undefined) {
      const period=localObject(merged[key]);
      profile[key]={...period,ids:localList(period['ids'],localString),prog:localList(period['prog'] ?? [],localNumber),claimed:localList(period['claimed'] ?? [],localNumber)};
    }
    return profile;
  }
  async loadProfile() {
    const raw = localStorage.getItem('pokebonk.local.profile.v1');
    this.current = this.unlock(this.normalize(raw ? JSON.parse(raw) : null));
    await this.persist();
    // Reconcile a completed settlement whose process stopped before cleanup.
    // Never offer an already-awarded manual save again on the next startup.
    const settled=new Set([...this.settledIds(),...this.profile.runs.map(run=>run.id)]);
    for(const key of this.runKeys()) {
      const raw=localStorage.getItem(key);
      if(raw!==null) {
        const id=localString(localObject(localObject(JSON.parse(raw))['ticket'])['id']);
        if(settled.has(id))this.clearRun(id);
      }
    }
    return structuredClone(this.current);
  }
  async savePrefs(_account: unknown, profile: unknown) {
    if(!this.activeTicket) { await this.persist(profile);return; }
    // Match the upstream prefs endpoint: in-run progress belongs to settlement,
    // even when Meta passes its complete, already-mutated in-memory profile.
    const input=localObject(profile),next={...this.profile};
    for(const key of ['settings','lastSpecies','lastBiome','avatar','frame','title','banner','skins','team'])if(key in input)next[key]=input[key];
    await this.persist(next);
  }
  async chooseStarter(_account: unknown, species: number) {
    this.profile.lastSpecies = species;
    return this.persist();
  }
  async startRun(_account: unknown, config: LocalRunConfig): Promise<LocalRunTicket> {
    const ticket = { id: 'local-' + crypto.randomUUID(), seed: new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0,true), ranked: false, boosts: config.boosts || [] };
    this.activeTicket=ticket.id;
    return ticket;
  }
  // Cloud/stash callbacks are optional upstream capabilities. The game's local
  // plans and presets remain authoritative; never claim to upload their data.
  stashGet = undefined;
  stashPut = undefined;
  savedOnServer = undefined;
  downloadSave = undefined;
  async uploadSave() { return false; }
  activeTicket: string | null = null;
  checkpoint() {}
  async savedBlob(kind: 'runsave'|'runauto', ticket?: LocalRunTicket, hash?: string) {
    const raw=localStorage.getItem(`pb.${kind}.${this.account.id}`);
    if(raw===null)return null;
    const blob=localObject(JSON.parse(raw));
    const savedTicket=localTicket(blob['ticket']);
    const id=savedTicket.id;
    const save=localString(blob['save']),storedHash=localString(blob['hash']);
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(save)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!id.startsWith('local-')||storedHash!==digest||(ticket&&id!==ticket.id)||(hash&&hash!==digest))throw new Error('Invalid local run save identity or hash');
    const body=localObject(JSON.parse(save));
    if(body['v']!==1)throw new Error('Unsupported local run save version');
    localObject(body['cfg']);localObject(body['summary']);const result=localResult(body['result']);
    if(this.settledIds().includes(id))return null;
    return {id,hash:digest,result};
  }
  settledIds() { return localList(this.profile['localSettledRuns']??[],localString); }
  async suspendRun(_account: unknown,ticket: LocalRunTicket,hash: string) {
    const saved=await this.savedBlob('runsave',ticket,hash);
    if(!saved)throw new Error('Missing local run save');
    this.keepLive(null,ticket,saved.result);
    this.activeTicket=null;
  }
  async resumeRun(_account: unknown,ticket: LocalRunTicket,hash: string) {
    if(!await this.savedBlob('runsave',ticket,hash))throw new Error('Missing local run save');
    this.activeTicket=ticket.id;
  }
  async recoverRun(_account: unknown,ticket: LocalRunTicket,hash: string) {
    if(!await this.savedBlob('runauto',ticket,hash))throw new Error('Missing local autosave');
    this.activeTicket=ticket.id;
  }
  async autoWaiting() {
    const saved=await this.savedBlob('runauto');
    if(!saved||saved.id===this.activeTicket)return false;
    const raw=localStorage.getItem('pokebonk.local.pending.v1');
    if(!raw)return false;
    const pending=localObject(JSON.parse(raw));
    return localObject(pending['ticket'])['id']===saved.id;
  }
  keepLive(_account: unknown, ticket: LocalRunTicket, result: LocalRunResult) {
    localStorage.setItem('pokebonk.local.pending.v1', JSON.stringify({ ticket:localTicket(ticket), result:localResult(result) }));
  }
  hasPending() { return localStorage.getItem('pokebonk.local.pending.v1')!==null; }
  async retryNow() {
    const raw=localStorage.getItem('pokebonk.local.pending.v1');
    if(!raw)return {left:0,saved:0};
    const pending=localObject(JSON.parse(raw)),ticket=localTicket(pending['ticket']);
    const id=ticket.id;
    if(id===this.activeTicket||await this.savedBlob('runsave')||await this.savedBlob('runauto'))return {left:1,saved:0};
    const already=this.settledIds().includes(id);
    await this.finishRun(null,ticket,localResult(pending['result']));
    return {left:0,saved:already?0:1};
  }
  async finishRun(_account: unknown, ticket: LocalRunTicket, result: LocalRunResult) {
    ticket=localTicket(ticket);result=localResult(result);
    // The settlement ID and updated progress share one atomic localStorage
    // write. A crash during subsequent cleanup can only retry the same ID.
    const profile = structuredClone(this.profile);
    const settled=this.settledIds();
    const previous=profile.runs.find(record=>record.id===ticket.id);
    if(settled.includes(ticket.id)||previous) {
      this.clearRun(ticket.id);
      this.activeTicket=null;
      return {profile:structuredClone(profile),record:previous??{id:ticket.id},ranked:false,stardust:0,local:true};
    }
    const progress = result.progress || {};
    for (const [key, value] of Object.entries(progress.counters || {})) profile.counters[key] = (profile.counters[key] || 0) + value;
    profile.counters['runs'] = (profile.counters['runs'] || 0) + 1;
    for (const key of ['seen', 'forms', 'league', 'shinies', 'classics'] as const) profile[key] = [...new Set([...(profile[key] || []), ...(progress[key] || [])])];
    const record = { ...result, id: ticket.id, date: Date.now(), seed: ticket.seed, ranked: false, score: __SCORE__(result) };
    delete record.progress;
    profile.runs = [record, ...profile.runs].slice(0, 30);
    if (result.victory) {
      profile.counters['wins'] = (profile.counters['wins'] || 0) + 1;
    }
    profile['localSettledRuns']=[...settled,ticket.id];
    const persisted=await this.persist(profile);
    this.clearRun(ticket.id);
    this.activeTicket=null;
    return { profile: persisted, record, ranked: false, stardust: 0, local: true };
  }
  runKeys() {return ['pokebonk.local.pending.v1',`pb.runauto.${this.account.id}`,`pb.runsave.${this.account.id}`];}
  clearRun(id:string) {
    for(const key of this.runKeys()) {
      const raw=localStorage.getItem(key);
      if(raw!==null&&localObject(localObject(JSON.parse(raw))['ticket'])['id']===id)localStorage.removeItem(key);
    }
  }
  async actions(_account: unknown, actions: LocalProfileAction[]) {
    for (const action of actions) {
      if (action.k === 'archive') {
        const disabled = new Set(this.profile.itemsOff);
        action.off ? disabled.add(action.key) : disabled.delete(action.key);
        this.profile.itemsOff = [...disabled];
      }
      if (action.k === 'quest') this.profile.quests[action.id] = 1;
    }
    return this.persist();
  }
  async buyLab() { return this.persist(); }
  async buyItem() { return this.persist(); }
  async archiveItem(account: unknown, key: string, off: boolean) { return this.actions(account, [{ k: 'archive', key, off }]); }
  async claimQuest(account: unknown, id: string) { return this.actions(account, [{ k: 'quest', id }]); }
  async records() { return { records: [], best: {}, times: {}, kills: {} }; }
  async endlessRecords() { return { records: [], best: {} }; }
  async board() { return { entries: [], me: null, players: 0, cutoff: null, info: this.season() }; }
  async monBoards() { return []; }
  async seasonAwards() { return []; }
  async news() { return []; }
  async mail() { return []; }
  async readMail() {}
  async clanStatus() { return { clan: null, mail: 0, requests: 0, pending: [] }; }
  async friends() { return { friends: [], incoming: [], outgoing: [] }; }
  async coopInvites() { return []; }
  async eventView() { return { entries: [], quests: [], track: [], me: null }; }
}

function createLocalSandboxBackend() {
  const backend = new LocalSandboxBackend();
  return new Proxy(backend, {
    get(target, key, receiver): unknown {
      if (key in target || typeof key !== 'string' || key === 'then') return Reflect.get(target, key, receiver);
      if (key.startsWith('on')) return undefined;
      return async () => { throw new Error('This online feature is unavailable in the local sandbox.'); };
    },
  });
}

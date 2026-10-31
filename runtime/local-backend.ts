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
    profile.cosmetics = [...new Set([...profile.cosmetics, ...__COSMETICS__, ...achievementCosmetics, 'skin:spectral'])];
    return ready;
  }
  async persist(profile: unknown = this.profile) {
    this.current = this.unlock(this.normalize(structuredClone(profile)));
    localStorage.setItem('pokebonk.local.profile.v1', JSON.stringify(this.current));
    return structuredClone(this.current);
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
    return structuredClone(this.current);
  }
  async savePrefs(_account: unknown, profile: unknown) { await this.persist(profile); }
  async chooseStarter(_account: unknown, species: number) {
    this.profile.lastSpecies = species;
    return this.persist();
  }
  async startRun(_account: unknown, config: LocalRunConfig): Promise<LocalRunTicket> {
    return { id: 'local-' + crypto.randomUUID(), seed: new DataView(crypto.getRandomValues(new Uint8Array(4)).buffer).getUint32(0,true), ranked: false, boosts: config.boosts || [] };
  }
  checkpoint() {}
  keepLive(_account: unknown, ticket: LocalRunTicket, result: LocalRunResult) {
    localStorage.setItem('pokebonk.local.pending.v1', JSON.stringify({ ticket, result }));
  }
  hasPending() { return false; }
  async retryNow() { return { left: 0, saved: 0 }; }
  async finishRun(_account: unknown, ticket: LocalRunTicket, result: LocalRunResult) {
    const profile = this.profile;
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
    localStorage.removeItem('pokebonk.local.pending.v1');
    return { profile: await this.persist(), record, ranked: false, stardust: 0, local: true };
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

// Injected into the pinned game module; all state and results stay local.
class LocalSandboxBackend {
  kind = 'local';
  clockSkew = 0;
  current = null;
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

  unlock(profile) {
    profile.localSandbox = true;
    profile.starter = profile.starter || 4;
    profile.league = __ROSTER__.map(member => member.id);
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
    for(const period of ['daily','weekly']) {
      profile[period].prog = profile[period].ids.map(id=>__TASK__(id).goal);
      profile[period].claimed = [1,1,1,1];
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
    return profile;
  }
  async persist(profile = this.current) {
    this.current = this.unlock(this.normalize(structuredClone(profile)));
    localStorage.setItem('pokebonk.local.profile.v1', JSON.stringify(this.current));
    return structuredClone(this.current);
  }
  normalize(profile) {
    const defaults = __PROFILE__('Local Sandbox');
    return { ...defaults, ...profile, settings: { ...defaults.settings, ...profile?.settings } };
  }
  async loadProfile() {
    const raw = localStorage.getItem('pokebonk.local.profile.v1');
    this.current = this.unlock(this.normalize(raw ? JSON.parse(raw) : null));
    await this.persist();
    return structuredClone(this.current);
  }
  async savePrefs(account, profile) { await this.persist(profile); }
  async chooseStarter(account, species) {
    this.current.lastSpecies = species;
    return this.persist();
  }
  async startRun(account, config) {
    return { id: 'local-' + crypto.randomUUID(), seed: crypto.getRandomValues(new Uint32Array(1))[0], ranked: false, boosts: config.boosts || [] };
  }
  checkpoint() {}
  keepLive(account, ticket, result) {
    localStorage.setItem('pokebonk.local.pending.v1', JSON.stringify({ ticket, result }));
  }
  hasPending() { return false; }
  async retryNow() { return { left: 0, saved: 0 }; }
  async finishRun(account, ticket, result) {
    const profile = this.current;
    const progress = result.progress || {};
    for (const [key, value] of Object.entries(progress.counters || {})) profile.counters[key] = (profile.counters[key] || 0) + value;
    profile.counters.runs = (profile.counters.runs || 0) + 1;
    for (const key of ['seen', 'forms', 'league', 'shinies', 'classics']) profile[key] = [...new Set([...(profile[key] || []), ...(progress[key] || [])])];
    const record = { ...result, id: ticket.id, date: Date.now(), seed: ticket.seed, ranked: false, score: __SCORE__(result) };
    delete record.progress;
    profile.runs = [record, ...profile.runs].slice(0, 30);
    if (result.victory) {
      profile.counters.wins = (profile.counters.wins || 0) + 1;
    }
    localStorage.removeItem('pokebonk.local.pending.v1');
    return { profile: await this.persist(), record, ranked: false, stardust: 0, local: true };
  }
  async actions(account, actions) {
    for (const action of actions) {
      if (action.k === 'archive') {
        const disabled = new Set(this.current.itemsOff);
        action.off ? disabled.add(action.key) : disabled.delete(action.key);
        this.current.itemsOff = [...disabled];
      }
      if (action.k === 'quest') this.current.quests[action.id] = 1;
    }
    return this.persist();
  }
  async buyLab() { return this.persist(); }
  async buyItem() { return this.persist(); }
  async archiveItem(account, key, off) { return this.actions(account, [{ k: 'archive', key, off }]); }
  async claimQuest(account, id) { return this.actions(account, [{ k: 'quest', id }]); }
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
    get(target, key, receiver) {
      if (key in target || typeof key !== 'string' || key === 'then') return Reflect.get(target, key, receiver);
      if (key.startsWith('on')) return undefined;
      return async () => { throw new Error('This online feature is unavailable in the local sandbox.'); };
    },
  });
}

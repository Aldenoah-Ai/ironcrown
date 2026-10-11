/* ==========================================================================
   State: the saved game (S), transient UI state, settings, persistence,
   optional Python backend sync.
   ========================================================================== */
'use strict';

const params = new URLSearchParams(location.search);
const SLOT = (params.get('slot') || 'main').replace(/[^\w-]/g, '');
const SAVE_KEY = 'ironcrown-save-' + SLOT;
const PID_KEY = 'ironcrown-player-id';
const SETTINGS_KEY = 'ironcrown-settings';

const WG = new HexGrid(WW, WH, W_HEX);     // the one map

let S = null;
const UI = {
  view: 'kingdom', tab: 'info', selected: null, placing: null, worldSel: -1, selEntity: null,
  hover: -1, fx: [], panelDirty: true, lastPanelHtml: '', pointerDown: false, logUnread: false,
  attackDraft: null, allianceDraft: null, divisionDraft: null, boxToken: 0, alerts: [], claimRadius: 1,
};

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---- Settings (per browser, not part of the save) ---- */
const DEFAULT_SETTINGS = {
  panMode: 'both',        // 'drag' | 'keys' | 'both'
  invertDrag: false,
  edgeScroll: false,
  zoomSpeed: 1,
  showGrid: true,
  prodNumbers: true,
  particles: true,
  battleMode: 'watch',    // 'watch' = fought live on the map, 'auto' = resolved instantly
  focusBattles: true,     // camera jumps to battles as they start
  graphics: 'low',        // 'high' (textured) | 'medium' (classic) | 'low' (low-poly)
  resolution: 'balanced', // 'sharp' | 'balanced' | 'performance' (canvas pixel density)
  minimap: true,
  autoQuality: true,      // back off automatically when frames get slow
  showFps: false,
};
// Bumped when a default changes for everyone. Older stored settings were saved
// whole, defaults included, so a new default would otherwise never reach them.
const SETTINGS_REV = 2;
let SETTINGS = { ...DEFAULT_SETTINGS };
try {
  const stored = JSON.parse(storage.get(SETTINGS_KEY) || '{}') || {};
  if ((stored.rev || 1) < 2) { delete stored.graphics; delete stored.panMode; }   // v3.5: low-poly + drag-and-keys by default
  Object.assign(SETTINGS, stored);
} catch { /* defaults */ }
SETTINGS.rev = SETTINGS_REV;
function saveSettings() { storage.set(SETTINGS_KEY, JSON.stringify(SETTINGS)); }

/* ---- New game ---- */
function newGame(name) {
  S = {
    version: SAVE_VERSION, gameVersion: GAME_VERSION, seed: Math.floor(Math.random() * 1e9), name: name || 'Ironcrown',
    time: 0, savedAt: Date.now(), started: false,
    res: { gold: 1000, iron: 350, diamonds: 25, lumber: 850, food: 600 },
    buildings: [], nextId: 1, cleared: [],
    army: { archer: 8, swordsman: 6, pikeman: 0, horseman: 0, catapult: 0, scout: 4, seaman: 0 },
    harbor: { sloop: 0, cog: 0, galley: 0, frigate: 0, galleon: 0, manowar: 0 },
    divisions: [], fleets: [], scouts: [], research: {},
    generals: [{ uid: 'g1', id: 'aldric', stars: 1 }, { uid: 'g2', id: 'bran', stars: 1 }], castellan: null, nextGen: 3,
    items: { warhorn: 1, salve: 0, hammer: 1, scroll: 0, map: 0, winds: 0, shield: 0 },
    boosts: { warhorn: false, salve: false }, shield: 0, winds: 0,
    world: null, kingdoms: [], aiArmies: [], aiFleets: [], missions: [], intel: {},
    alliances: [], allianceId: null,
    log: [], stats: { battlesWon: 0, battlesLost: 0, navalWon: 0, navalLost: 0, raidsRepelled: 0, raidsLost: 0, boxesOpened: 0, scouted: 0, ruinsExplored: 0, wrecksSalvaged: 0, researched: 0 },
    aiTimer: AI_TICK, raidTimer: 1200, pirateTimer: 420,
  };
  generateWorld();
  addBuilding('hall', S.world.capital, 1);
  const spots = kingdomStartSpots();
  addBuilding('goldmine', spots[0], 1);
  addBuilding('lumbermill', spots[1], 1);
  addBuilding('farm', spots[2], 1);
  createAlliances();
  S.kingdoms.forEach(initAiForces);
  // Starting division so the world map is alive from minute one.
  createDivision('1st Legion', { archer: 4, swordsman: 4 }, 'g1');
  log('Your reign begins. Build up your kingdom, then explore the world map.', 'info');
}

/* ---- Save encoding ----
   The world is three arrays of ~165,000 numbers. Written out plainly that is
   well over a megabyte of JSON, which browser storage will refuse. Terrain
   becomes one digit per hex and the two sparse arrays are run-length encoded,
   which brings a whole world down to a few tens of kilobytes. */
function packRuns(arr) {
  const out = [];
  let v = arr[0], n = 0;
  for (let i = 0; i < arr.length; i++) { if (arr[i] === v) n++; else { out.push(v + 'x' + n); v = arr[i]; n = 1; } }
  out.push(v + 'x' + n);
  return out.join(' ');
}
function unpackRuns(str, len) {
  const out = new Array(len);
  let k = 0;
  for (const part of String(str).split(' ')) {
    const cut = part.lastIndexOf('x'), v = +part.slice(0, cut), n = +part.slice(cut + 1);
    for (let i = 0; i < n && k < len; i++) out[k++] = v;
  }
  return out;
}
function packState(st) {
  if (!st.world || st.world.packed) return st;
  const w = st.world;
  return { ...st, world: { ...w, packed: 1, terrain: w.terrain.join(''), owner: packRuns(w.owner), seen: packRuns(w.seen), seenSet: undefined } };
}
function unpackState(st) {
  const w = st && st.world;
  if (!w || !w.packed) return st;
  const n = WG.N;
  const terrain = new Array(n);
  for (let i = 0; i < n; i++) terrain[i] = +w.terrain[i];
  st.world = { ...w, packed: 0, terrain, owner: unpackRuns(w.owner, n), seen: unpackRuns(w.seen, n) };
  return st;
}
const serialize = (st) => JSON.stringify(packState(st));

/* ---- Save codes and files (export / import) ----
   A save is ~260 KB of JSON; as plain base64 that was a 350 KB code — about a
   hundred pages pasted into a document. Gzipped first it is ~40 KB. Codes are
   "IC2:" + base64(gzip(json)); older plain-base64 codes and raw JSON still import. */
const SAVE_CODE_PREFIX = 'IC2:';
function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const canGzip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function encodeSave(st) {
  const json = serialize(st);
  if (!canGzip()) return btoa(unescape(encodeURIComponent(json)));
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return SAVE_CODE_PREFIX + bytesToB64(new Uint8Array(buf));
}
async function decodeSave(text) {
  text = String(text || '').trim();
  let json;
  if (text.startsWith('{')) json = text;                                     // a raw JSON save file
  else {
    const code = text.replace(/\s+/g, '');                                   // pasted codes may have been wrapped onto many lines
    if (code.startsWith(SAVE_CODE_PREFIX)) {
      if (!canGzip()) throw new Error('This browser is too old to open compressed saves');
      json = await new Response(new Blob([b64ToBytes(code.slice(SAVE_CODE_PREFIX.length))]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    } else json = decodeURIComponent(escape(atob(code)));                    // a v3.5-or-earlier code
  }
  const d = unpackState(JSON.parse(json));
  if (!d || !d.world || !d.version) throw new Error('That is not an Ironcrown save');
  if (d.version !== SAVE_VERSION) throw new Error(`That save is from an older Ironcrown (save format ${d.version}) and cannot be loaded here`);
  return d;
}

function save() {
  if (!S) return false;
  S.savedAt = Date.now() - CATCHUP.left * 1000;   // time not yet simulated stays owed
  S.gameVersion = GAME_VERSION;
  const ok = storage.set(SAVE_KEY, serialize(S));
  API.push();
  return ok;
}
function load() {
  const raw = storage.get(SAVE_KEY);
  if (!raw) return false;
  try {
    const data = unpackState(JSON.parse(raw));
    if (data && data.version === 2) { carryOverV2(data); return true; }
    if (!data || data.version !== SAVE_VERSION) {
      if (data && data.version) UI.oldSave = data.version;
      return false;
    }
    adoptState(data);
    return true;
  } catch (e) {
    // A save we cannot read is worth saying out loud rather than silently
    // starting a new realm over the top of it.
    console.error('save could not be read:', e);
    UI.badSave = true;
    return false;
  }
}

// Make a loaded save the running game: derive the world caches, bring old fields
// up to date. If that fails, the game that was running stays as it was.
function adoptState(data) {
  const prev = S;
  try { S = data; deriveWorld(); migrate(); }
  catch (e) { S = prev; if (prev) deriveWorld(); throw e; }
}
// Bring older v2 saves up to date (v2.0 → v2.1).
function migrate() {
  S.scouts = S.scouts || [];
  S.harbor.manowar = S.harbor.manowar || 0;
  for (const f of S.fleets) f.ships.manowar = f.ships.manowar || 0;
  // generals became instances (you may own several copies of one general)
  if (S.generals.length && !S.generals[0].uid) {
    S.generals.forEach((g) => { g.uid = 'g_' + g.id; });
    if (S.castellan) S.castellan = 'g_' + S.castellan;
    S.divisions.forEach((d) => { if (d.general) d.general = 'g_' + d.general; });
    S.fleets.forEach((f) => { if (f.general) f.general = 'g_' + f.general; });
    S.nextGen = 1;
  }
  S.army.seaman = S.army.seaman || 0;
  S.missions = [];
  for (const d of S.divisions) { d.formation = d.formation || 'line'; d.stance = d.stance || 'advance'; d.target = d.target || 'nearest'; if (d.status === 'fighting') d.status = 'idle'; }
  for (const f of S.fleets) { f.formation = f.formation || 'line'; f.stance = f.stance || 'advance'; f.target = f.target || 'nearest'; if (f.status === 'fighting') f.status = 'idle'; }
  for (const a of S.aiArmies) if (a.kind === 'raid' && a.targetHex == null) a.targetHex = S.world.capital;
  for (const k of S.kingdoms) { k.wars = k.wars || {}; if (k.guardsInit == null) initAiForces(k); }
}

// v2 → v3: the map was rebuilt from small hexes. Keep everything portable and
// rebuild the kingdom around a new capital on the new map.
function carryOverV2(old) {
  const name = old.name;
  newGame(name);
  const keep = ['res', 'research', 'items', 'stats', 'log', 'time', 'started', 'boosts', 'shield', 'nextGen'];
  for (const k of keep) if (old[k] !== undefined) S[k] = old[k];
  S.generals = (old.generals || []).map((g) => ({ uid: g.uid || 'g_' + g.id, id: g.id, stars: g.stars || 1 }));
  if (!S.generals.length) S.generals = [{ uid: 'g1', id: 'aldric', stars: 1 }];
  S.castellan = old.castellan && S.generals.some((g) => g.uid === old.castellan) ? old.castellan : null;
  S.army = { ...emptyArmy(), ...old.army };
  S.harbor = { ...emptyFleet(), ...old.harbor };
  for (const sp of old.scouts || []) S.army.scout += sp.n;
  // buildings: same types & levels, re-placed around the new capital
  const hall = (old.buildings || []).find((b) => b.type === 'hall');
  S.buildings = [];
  addBuilding('hall', S.world.capital, hall ? hall.level : 1);
  claimRing(true);          // the realm you start with
  for (const b of (old.buildings || []).filter((x) => x.type !== 'hall').sort((a, c) => (BUILDINGS[a.type].coastal ? -1 : 0) - (BUILDINGS[c.type].coastal ? -1 : 0))) {
    const spot = WG.within(S.world.capital, landRadius() + 6).filter((i) => !placementError(b.type, i) || (placementError(b.type, i) || '').startsWith('Clear'))
      .filter((i) => S.world.owner[i] === -2 && !buildingAt(i) && (!BUILDINGS[b.type].coastal || isCoastal(i))).sort((x, y) => WG.dist(x, S.world.capital) - WG.dist(y, S.world.capital))[0];
    if (spot == null) continue;
    if (obstacleAt(spot)) S.cleared.push(spot);
    const nb = addBuilding(b.type, spot, Math.max(1, b.level));
    if (b.queue) nb.queue = []; if (b.research) nb.research = b.research;
  }
  S.divisions = [];
  for (const d of old.divisions || []) {
    const g = S.generals.find((x) => x.uid === d.general) ? d.general : null;
    S.divisions.push({ ...d, at: S.world.capital, path: [], prog: 0, order: null, status: 'idle', general: g, units: { ...emptyArmy(), ...d.units } });
  }
  S.divisions = S.divisions.filter((d) => armyHousing(d.units) > 0);
  S.fleets = (old.fleets || []).map((f) => ({ ...f, at: S.world.harbor, path: [], prog: 0, order: null, status: 'idle', ships: { ...emptyFleet(), ...f.ships } }));
  UI.movedToV3 = true;
  log('Your kingdom has been moved to the new world map (v3). Buildings, troops, ships, generals and research came with you.', 'info');
}

/* Offline progress: simulate time the tab was closed or hidden (capped, no raids).
   Eight hours of a big realm is thousands of simulation steps — seconds of work.
   Done in one go it froze the page before the first frame was ever drawn, which
   looked like a black world under a working menu. Instead it is queued here and
   worked off a slice per frame (runCatchUp) while the map is already on screen. */
const CATCHUP = { left: 0, away: 0, before: null };
function catchUp() {
  queueCatchUp((Date.now() - S.savedAt) / 1000);
}
function queueCatchUp(sec, min = 5) {
  if (!S || !(sec >= min)) return;
  if (!CATCHUP.left) { CATCHUP.away = 0; CATCHUP.before = { ...S.res }; }
  const add = Math.min(sec, OFFLINE_CAP - CATCHUP.left);
  if (add <= 0) return;
  CATCHUP.left += add; CATCHUP.away += add;
}
// Works off queued offline time for at most budgetMs; true while any remains.
function runCatchUp(budgetMs) {
  if (!CATCHUP.left) return false;
  const t0 = performance.now(), away = CATCHUP.away;
  const chunk = away > 3600 ? 10 : away > 600 ? 5 : 2;   // coarser steps for long absences keep loading fast
  do { const d = Math.min(chunk, CATCHUP.left); step(d, true); CATCHUP.left -= d; }
  while (CATCHUP.left > 1e-6 && performance.now() - t0 < budgetMs);
  if (CATCHUP.left > 1e-6) return true;
  CATCHUP.left = 0;
  const gains = RES.map((k) => [k, S.res[k] - CATCHUP.before[k]]).filter(([, v]) => Math.abs(v) >= 1);
  if (gains.length && away >= 60) {
    log(`While you were away (${fmtTime(away)}) your kingdom produced ` + gains.map(([k, v]) => `${RES_META[k].icon}${fmt(v)}`).join(' '), 'good');
    toast(`Welcome back! ${fmtTime(away)} of progress collected.`, 'good');
  }
  UI.panelDirty = true;
  return false;
}
function finishCatchUp() { while (runCatchUp(1e9)); }
// True while the game is simulating time you were not here for.
const catchingUp = () => CATCHUP.left > 0;
/* Away from the screen with the game still open — another window on top, gone
   for a coffee. No new raids or pirates are sent while nobody is watching. */
const IDLE_AFTER = 180e3;
function playerIdle() {
  if (typeof document !== 'undefined' && document.hidden) return true;
  return Date.now() - (UI.lastInput || Date.now()) > IDLE_AFTER;
}

/* ---- Optional Python backend (server/server.py). Absent on GitHub Pages. ---- */
const API = {
  online: false, lastPush: 0, pid: null,
  async init() {
    this.pid = storage.get(PID_KEY) || uid() + uid();
    storage.set(PID_KEY, this.pid);
    // Static hosting has no backend: asking anyway costs a 404 and, on a slow
    // connection, holds up the first frame of the map until it answers.
    if (location.protocol === 'file:' || /\.github\.io$/.test(location.hostname)) return;
    try {
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ac && setTimeout(() => ac.abort(), 2500);
      const r = await fetch('api/health', { cache: 'no-store', signal: ac ? ac.signal : undefined });
      const j = r.ok ? await r.json() : null;
      clearTimeout(timer);
      this.online = !!(j && j.ok);
    } catch { this.online = false; }
  },
  async pull() {
    if (!this.online) return null;
    try { const r = await fetch(`api/save/${this.pid}-${SLOT}`, { cache: 'no-store' }); return r.ok ? (await r.json()).state : null; } catch { return null; }
  },
  push(force) {
    if (!this.online || !S) return;
    const now = Date.now();
    if (!force && now - this.lastPush < 15000) return;
    this.lastPush = now;
    const body = JSON.stringify({ meta: { name: S.name, power: Math.round(totalPower()), hall: hallLevel() }, state: packState(S) });
    fetch(`api/save/${this.pid}-${SLOT}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => { el('sync').classList.toggle('online', r.ok); el('sync-label').textContent = r.ok ? 'synced' : 'local'; })
      .catch(() => {});
  },
  async leaderboard() {
    if (!this.online) return null;
    try { const r = await fetch('api/leaderboard', { cache: 'no-store' }); return r.ok ? (await r.json()).players : null; } catch { return null; }
  },
};

function log(text, kind = 'info') {
  if (!S) return;
  S.log.unshift({ t: S.time, text, kind });
  if (S.log.length > 120) S.log.length = 120;
  if (UI.tab !== 'log') UI.logUnread = true;
  UI.panelDirty = true;
}

/* ---- Calendar ---- */
function calendar(t = S.time) {
  const day = Math.floor(t / DAY_LENGTH);
  return { day: (day % 10) + 1, season: SEASONS[Math.floor(day / 10) % 4], seasonIdx: Math.floor(day / 10) % 4, year: Math.floor(day / 40) + 1 };
}

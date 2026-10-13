/* ==========================================================================
   World: hex terrain generation, features, territory, claiming, scouting.
   owner[] codes: -1 neutral, -2 player, 0..n AI kingdom index.
   ========================================================================== */
'use strict';

let WDEPTH = new Int16Array(WG.N);   // water: hexes to nearest land
let OCEAN = new Uint8Array(WG.N);    // water connected to the map edge

const isWater = (i) => S.world.terrain[i] === T.WATER;
const isPassable = (i) => i >= 0 && isFinite(TERRAIN[S.world.terrain[i]].cost);

function deriveWorld() {
  WDEPTH = WG.distanceField((i) => S.world.terrain[i] !== T.WATER, 8);
  OCEAN = new Uint8Array(WG.N);
  const q = [];
  for (let i = 0; i < WG.N; i++) {
    const c = WG.col(i), r = WG.row(i);
    if (isWater(i) && (c === 0 || r === 0 || c === WW - 1 || r === WH - 1)) { OCEAN[i] = 1; q.push(i); }
  }
  for (let h = 0; h < q.length; h++) for (const n of WG.neighbors(q[h])) if (!OCEAN[n] && isWater(n)) { OCEAN[n] = 1; q.push(n); }
  S.world.seenSet = null;
  recountSeen();
  worldVersion++;
}
// `seenCount` drives the fog cache and the "everything is explored" fast path.
// It is only nudged by reveal(), so it has to be re-derived whenever a world
// arrives from somewhere else — a save, the server, an import.
function recountSeen() {
  const seen = S.world.seen;
  let n = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i]) n++;
  seenCount = n;
  unseenBox = null; unseenBoxAt = -1e9;
  fogDirty = true;
}
/* The rectangle that still holds fog. Looking at the middle of a realm you
   scouted long ago should not cost a screen-sized blit of nothing. */
let unseenBox = null, unseenBoxAt = -1e9;
function unseenBounds() {
  // Recomputed at most every second and a half. Exploring only ever shrinks the
  // box, so a stale one is a superset and never hides fog that should be drawn.
  if (unseenBox !== null && performance.now() - unseenBoxAt < 1500) return unseenBox;
  unseenBoxAt = performance.now();
  const seen = S.world.seen;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i]) continue;
    const x = WG.cx[i], y = WG.cy[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = W_HEX * 3;
  unseenBox = x1 < x0 ? false : { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  return unseenBox;
}
let worldVersion = 0;

function generateWorld() {
  const seed = S.seed, rng = mulberry32(seed ^ 0x5eed);
  const N = WG.N, elev = new Float32Array(N), moist = new Float32Array(N), ridge = new Float32Array(N);
  const SX = NW / WW, SY = NH / WH;   // noise units per hex — constant, so continents keep their scale as the map grows
  const nIsles = Math.round(4 * MAP_SCALE * MAP_SCALE);
  const islands = Array.from({ length: nIsles }, (_, k) => ({ c: NW * (0.62 + rng() * 0.34), r: (NH * (k + 0.5)) / nIsles + rng() * 3, s: 1.6 + rng() * 1.4 }));
  for (let i = 0; i < N; i++) {
    const c = WG.col(i) * SX, r = WG.row(i) * SY, nx = c / NW, ny = r / NH;
    const dx = (nx - 0.42) / 0.5, dy = (ny - 0.5) / 0.5;
    let e = fbm(c * 0.1, r * 0.12, seed, 5) * 0.8 + fbm(c * 0.035, r * 0.045, seed + 99, 3) * 0.55 - Math.sqrt(dx * dx + dy * dy) * 0.62;
    for (const is of islands) e += 0.55 * Math.exp(-((dist(c, r, is.c, is.r) / is.s) ** 2));
    const edge = Math.min(c, r, NW - 1 - c, NH - 1 - r);
    if (edge < 2) e -= (2 - edge) * 0.25;
    elev[i] = e;
    moist[i] = fbm(c * 0.09 + 40, r * 0.1 - 13, seed + 5, 4);
    ridge[i] = 1 - Math.abs(2 * fbm(c * 0.11 - 7, r * 0.13 + 3, seed + 31, 3) - 1);
  }
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const sea = sorted[Math.floor(N * 0.47)], top = sorted[N - 1];
  const terrain = new Array(N);
  for (let i = 0; i < N; i++) {
    const h = (elev[i] - sea) / (top - sea), m = moist[i], rw = WG.row(i);
    let t;
    if (h < 0) t = T.WATER;
    else if ((h > 0.55 && ridge[i] > 0.74) || h > 0.86) t = T.MOUNTAIN;
    else if (h > 0.42 && ridge[i] > 0.6) t = T.HILLS;
    else if (h < 0.1 && m > 0.6) t = T.SWAMP;
    else if (m < 0.38 && rw * SY > NH * 0.5) t = T.DESERT;
    else if (m > 0.55) t = T.FOREST;
    else if (m > 0.47) t = T.MEADOW;
    else t = T.PLAINS;
    terrain[i] = t;
  }
  S.world = { terrain, owner: new Array(N).fill(-1), seen: new Array(N).fill(0), feat: {}, capital: -1, harbor: -1 };
  deriveWorld();

  // --- Player capital: coastal, roomy, western half ---
  let best = -1, bestScore = -1e9;
  for (let i = 0; i < N; i++) {
    const c = WG.col(i), r = WG.row(i);
    if (!isPassable(i) || c < WW * 0.12 || c > WW * 0.5 || r < WH * 0.16 || r > WH * 0.82) continue;
    const ocean = WG.neighbors(i).filter((n) => OCEAN[n]);
    if (!ocean.length || hash2(i, 3, seed) > 0.35) continue;   // sample a subset of the coast
    const room = WG.within(i, 7).filter(isPassable).length;
    const score = room + hash2(i, 1, seed) * 8 - Math.abs(r - WH / 2) * 0.35;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best < 0) best = WG.idx(Math.floor(WW * 0.24), Math.floor(WH / 2));
  const cap = best;
  S.world.capital = cap;
  S.world.terrain[cap] = T.PLAINS;
  // a buildable heartland: no mountains/swamp right next to the capital
  for (const n of WG.within(cap, 3)) if (terrain[n] === T.MOUNTAIN || (terrain[n] === T.SWAMP && WG.dist(n, cap) < 2)) terrain[n] = T.MEADOW;
  S.world.harbor = WG.neighbors(cap).filter((n) => OCEAN[n]).sort((a, b) => WDEPTH[b] - WDEPTH[a])[0];
  deriveWorld();

  // Mainland = land reachable on foot from the capital.
  const main = new Uint8Array(N), q = [cap];
  main[cap] = 1;
  for (let h = 0; h < q.length; h++) for (const n of WG.neighbors(q[h])) if (!main[n] && isPassable(n)) { main[n] = 1; q.push(n); }

  // --- AI kingdoms ---
  const caps = [], want = Math.min(AI_KINGDOM_COUNT, KINGDOM_NAMES.length);
  const M = MAP_SCALE;
  for (let pass = 0; pass < 3 && caps.length < want; pass++) {
    const minP = [30 * M, 22 * M, 14 * M][pass], minK = [26, 20, 13][pass];
    for (let tries = 0; tries < 40000 && caps.length < want; tries++) {
      const i = Math.floor(rng() * N);
      if (!main[i] || terrain[i] === T.SWAMP || WG.dist(i, cap) < minP || caps.some((k) => WG.dist(k, i) < minK)) continue;
      const c = WG.col(i), r = WG.row(i);
      if (c < 6 || r < 6 || c > WW - 7 || r > WH - 7) continue;
      caps.push(i);
    }
  }
  const pers = Object.keys(PERSONALITIES);
  S.kingdoms = caps.map((ci, k) => {
    const hall = 1 + (k % 3);
    terrain[ci] = terrain[ci] === T.DESERT ? T.DESERT : T.PLAINS;
    for (const n of WG.within(ci, 2)) if (terrain[n] === T.MOUNTAIN) terrain[n] = T.PLAINS;
    const coastal = WG.neighbors(ci).some((n) => OCEAN[n]);
    const kd = { id: k, name: KINGDOM_NAMES[k], ruler: RULERS[k], color: KINGDOM_COLORS[k], capital: ci, hall,
      power: Math.round(140 + hall * 120 + rng() * 90), defense: Math.round(40 * hall + rng() * 40), navy: coastal ? Math.round(80 + rng() * 100 * hall) : 0,
      res: { gold: 800 * hall, iron: 300 * hall, lumber: 700 * hall, food: 600 * hall, diamonds: 10 * hall },
      personality: pers[k % pers.length], relation: Math.round(rng() * 50 - 22), allianceId: null, defeats: 0,
      coastal, treaty: 0, tradePact: false, atWar: false };
    claimAround(ci, k, 3 + hall);
    return kd;
  });
  claimAround(cap, -2, 4);

  // --- Features ---
  const feat = S.world.feat, free = (i) => !feat[i] && S.world.owner[i] === -1;
  const farFromCapitals = (i, d) => WG.dist(i, cap) >= d && caps.every((c) => WG.dist(c, i) >= d);
  const land = [], water = [];
  for (let i = 0; i < N; i++) (isWater(i) ? water : land).push(i);
  const place = (list, n, test, make) => {
    let placed = 0;
    for (let tries = 0; tries < 400 * n + 4000 && placed < n; tries++) {
      const i = list[Math.floor(rng() * list.length)];
      if (free(i) && test(i)) { feat[i] = make(i); placed++; }
    }
  };
  const tierOf = (i) => clamp(Math.ceil(WG.dist(i, cap) / (27 * M)), 1, 3);
  const many = (n) => Math.round(n * M * M);
  place(land, Math.round(land.length * 0.004), (i) => [T.HILLS, T.DESERT, T.PLAINS].includes(terrain[i]), () => ({ type: 'goldvein' }));
  place(land, many(20), (i) => isPassable(i) && (terrain[i] === T.HILLS || WG.neighbors(i).some((n) => terrain[n] === T.MOUNTAIN)) && farFromCapitals(i, 8),
    () => ({ type: 'cave', mineral: weighted({ iron: 5, gold: 3, gems: 2 }), explored: false }));
  // Island gem caves & pirate coves
  const islandLand = land.filter((i) => !main[i] && isPassable(i));
  place(islandLand, many(3), () => true, () => ({ type: 'cave', mineral: 'gems', explored: false }));
  place(islandLand, many(2), (i) => WG.neighbors(i).some((n) => OCEAN[n]), () => ({ type: 'cove', power: Math.round(380 + rng() * 260), destroyed: false }));
  place(land, many(14), (i) => isPassable(i) && farFromCapitals(i, 9), (i) => { const t = tierOf(i); return { type: 'ruins', tier: t, guard: Math.round(50 * t ** 1.7 + rng() * 40), looted: false }; });
  place(land, many(5), (i) => isPassable(i) && farFromCapitals(i, 12) && main[i], (i) => { const t = tierOf(i); return { type: 'fort', tier: t, guard: Math.round(160 + 140 * t + rng() * 60), captured: false }; });
  place(water, many(14), (i) => OCEAN[i] && WDEPTH[i] >= 2 && WG.dist(i, cap) >= 9, (i) => ({ type: 'wreck', tier: tierOf(i), salvaged: false }));
  reveal(cap, 10);
  deriveWorld();
}

function claimAround(i, who, r = 1) {
  const { owner } = S.world;
  owner[i] = who;
  for (const n of WG.within(i, r)) if (isPassable(n) && owner[n] === -1) owner[n] = who;
}
function reveal(i, r) {
  let n = 0;
  for (const j of WG.within(i, r)) if (!S.world.seen[j]) { S.world.seen[j] = 1; n++; }
  if (n) { UI.panelDirty = true; fogDirty = true; seenCount += n; }
  return n;
}
let fogDirty = true, seenCount = 0;
const isSeen = (i) => i >= 0 && S.world.seen[i] === 1;
const visionBonus = () => R('cartography');

/* ---- Ownership caches ----
   On a 165,000-hex map a full scan is far too expensive to do per frame, and
   `rates()`, the claim panel and the kingdom list all want tile counts. Both
   counters are recomputed once per change instead: `landVersion` ticks only
   when YOUR land changes, `worldVersion` when anyone's does. */
let landVersion = 0, featVersion = 0;
function ownedChanged() { worldVersion++; landVersion++; }
function featChanged() { featVersion++; }
let tileCount = null, tileCountVer = -1, tileCountLand = -1, tileCountAt = -1e9;
function tileCounts() {
  // Your own count is always exact. Thirty kingdoms nibbling at their borders
  // bump worldVersion dozens of times per AI turn, and a second of staleness on
  // *their* tallies is far cheaper than re-sweeping the map that often.
  if (tileCount && tileCountLand === landVersion && (tileCountVer === worldVersion || performance.now() - tileCountAt < 1000)) return tileCount;
  tileCountVer = worldVersion; tileCountLand = landVersion; tileCountAt = performance.now();
  const owner = S.world.owner, m = new Map();
  for (let i = 0; i < owner.length; i++) { const o = owner[i]; if (o !== -1) m.set(o, (m.get(o) || 0) + 1); }
  tileCount = m;
  return m;
}
const playerTiles = () => tileCounts().get(-2) || 0;
const kingdomTiles = (id) => tileCounts().get(id) || 0;
// The list of hexes you own, so callers can walk your realm instead of the world.
let ownedList = null, ownedListVer = -1;
// The hexes that carry a feature — a few hundred, instead of sweeping the map.
let featList = null, featListKey = '';
function featureHexes() {
  const key = S.seed + ':' + Object.keys(S.world.feat).length;
  if (featList && featListKey === key) return featList;
  featListKey = key;
  return (featList = Object.keys(S.world.feat).map(Number));
}
function playerLand() {
  if (ownedListVer === landVersion && ownedList) return ownedList;
  ownedListVer = landVersion;
  const owner = S.world.owner, out = [];
  for (let i = 0; i < owner.length; i++) if (owner[i] === -2) out.push(i);
  return (ownedList = out);
}

// Distance from every hex to your nearest owned hex, rebuilt only when YOUR land changes.
let terrDist = null, terrDistVer = -1;
function territoryField() {
  if (terrDistVer !== landVersion || !terrDist) { terrDist = WG.distanceField((j) => S.world.owner[j] === -2, 40); terrDistVer = landVersion; }
  return terrDist;
}
function distToTerritory(i) { return territoryField()[i]; }

/* Your realm can be several separate blocks of land. Number them, so a division
   on guard duty knows which stretch of border it answers for. */
let landComp = null, landCompVer = -1, landCompCount = 0;
function territoryComponents() {
  if (landCompVer === landVersion && landComp) return landComp;
  landCompVer = landVersion;
  const owner = S.world.owner, comp = new Int32Array(owner.length).fill(-1);
  let n = 0;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== -2 || comp[i] >= 0) continue;
    const q = [i];
    comp[i] = n;
    for (let h = 0; h < q.length; h++) for (const j of WG.neighbors(q[h])) if (owner[j] === -2 && comp[j] < 0) { comp[j] = n; q.push(j); }
    n++;
  }
  landCompCount = n;
  landComp = comp;
  return comp;
}
// Which block of your realm a hex belongs to, or the nearest one within `r` hexes.
function componentNear(hex, r = 3) {
  const comp = territoryComponents();
  if (comp[hex] >= 0) return comp[hex];
  for (const j of WG.within(hex, r)) if (comp[j] >= 0) return comp[j];
  return -1;
}

/* ---- Expansion: settling neutral land ----
   Most of the world is unclaimed. Settlers will walk a few hexes past your
   border into land nobody has scouted yet, and a claim takes a whole region
   (radius grows with the Main Hall) so an empire can actually spread. */
const featBlocks = (j) => { const f = S.world.feat[j]; return !!f && ['fort', 'ruins', 'cove'].includes(f.type) && !(f.captured || f.looted || f.destroyed); };
const settleReach = () => 3 + 2 * R('cartography');
const canSettle = (i) => isSeen(i) || distToTerritory(i) <= settleReach();
const settleable = (j) => j >= 0 && S.world.owner[j] === -1 && isPassable(j) && !featBlocks(j) && canSettle(j);
const settleRadius = () => clamp(1 + Math.floor(hallLevel() / 2), 1, 6);
// Claiming takes the clicked hex plus every neutral hex connected to it within `r` rings.
function claimCluster(i, r = 1) {
  r = clamp(Math.round(r) || 1, 1, settleRadius());
  if (!settleable(i)) return [];
  const out = [i], done = new Set([i]);
  for (let h = 0; h < out.length; h++) for (const n of WG.neighbors(out[h])) {
    if (done.has(n)) continue;
    done.add(n);
    if (WG.dist(n, i) <= r && settleable(n)) out.push(n);
  }
  return out;
}
// Price of settling a single hex (used when you build on unclaimed land).
// Upkeep of a sprawling realm: gentle and sub-linear, so the far side of the map stays reachable.
const empireMult = () => 1 + Math.max(0, playerTiles() - 60) / 1200;
function hexClaimCost(i) {
  const far = Math.max(0, distToTerritory(i) - 1);
  const m = (1 + 0.06 * far) * empireMult() * (1 - 0.15 * R('administration'));
  return { gold: Math.round(28 * m), food: Math.round(14 * m) };
}
function claimCost(i, r = 1) {
  const far = i != null ? Math.max(0, distToTerritory(i) - 1) : 0;
  const hexes = i != null ? Math.max(1, claimCluster(i, r).length) : 7;
  const m = (1 + 0.06 * far) * empireMult() * hexes * (1 - 0.15 * R('administration'));
  return { gold: Math.round((28 * m) / 5) * 5, food: Math.round((14 * m) / 5) * 5 };
}
function claimError(i, r = 1) {
  const { terrain, owner } = S.world;
  if (terrain[i] === T.WATER) return 'You cannot claim the open sea';
  if (terrain[i] === T.MOUNTAIN) return 'Mountains cannot be settled';
  if (owner[i] === -2) return 'Already yours';
  if (owner[i] >= 0) return `Owned by ${S.kingdoms[owner[i]].name} — send a division to conquer it`;
  const f = S.world.feat[i];
  if (f && f.type === 'fort' && !f.captured) return 'Capture the fort with a division';
  if (f && f.type === 'ruins' && !f.looted) return 'Explore the ruins with a division first';
  if (f && f.type === 'cove' && !f.destroyed) return 'Destroy the pirate cove first';
  if (!canSettle(i)) return `Too far beyond your borders — scout it, march a division there, or settle closer first (reach ${settleReach()} hexes)`;
  if (!canAfford(claimCost(i, r))) return 'Not enough resources';
  return null;
}
// Settle a region. Anything the settlers take is revealed — they walked it.
function claimTile(i, r = 1, free) {
  const err = claimError(i, r);
  if (err) { toast(err, 'bad'); return false; }
  const cl = claimCluster(i, r);
  if (!cl.length) { toast('Nothing to settle here', 'bad'); return false; }
  if (!free) pay(claimCost(i, r));
  for (const j of cl) { S.world.owner[j] = -2; if (!S.world.seen[j]) { S.world.seen[j] = 1; seenCount++; } }
  fogDirty = true;
  reveal(i, 2);
  log(`Claimed ${cl.length} hexes of ${TERRAIN[S.world.terrain[i]].name} at ${hexName(i)}.`, 'good');
  toast(`🏳️ ${cl.length} hexes claimed!`, 'good');
  ownedChanged();
  for (const j of cl) markChunks(j);
  UI.panelDirty = true;
  return true;
}

/* ---- Scouting: scout parties are units you move on the map ----
   Every hex they pass through (and a radius around it) is revealed. */
const scoutRadius = () => { const lodge = S.buildings.find((b) => b.type === 'scoutlodge' && b.level > 0); return 5 + (lodge ? lodge.level : 0) + 2 * visionBonus(); };
const scoutCost = (i) => { const t = S.world.terrain[i]; return t === T.WATER ? (transportCapacity() > 0 ? 1.2 : Infinity) : t === T.MOUNTAIN ? 3 : TERRAIN[t].cost; };
function dispatchScouts(n, dest) {
  n = Math.min(n, S.army.scout);
  if (n < 1) { toast('No scouts at home — train some at the Scout Lodge', 'bad'); return null; }
  S.army.scout -= n;
  const p = { id: 's' + uid(), kind: 'scout', name: `Scouts ×${n}`, n, at: S.world.capital, path: [], prog: 0, order: null, status: 'idle' };
  S.scouts.push(p);
  if (dest != null && dest >= 0) giveOrder(p, 'move', dest);
  UI.panelDirty = true;
  return p;
}
function scoutEnter(p) {
  reveal(p.at, scoutRadius());
  const f = S.world.feat[p.at];
  if (f && f.type === 'cave' && !f.explored) { f.explored = true; featChanged(); log(`Scouts found ${MINERALS[f.mineral].name} in a cave!`, 'good'); toast(`🕳️ Scouts found ${MINERALS[f.mineral].name}`, 'good'); }
  for (const k of S.kingdoms) if (!k.fallen && WG.dist(k.capital, p.at) <= scoutRadius() + 2) { if (!S.intel[k.id] || S.time - S.intel[k.id].t > 60) log(`Scouts gathered intel on ${k.name}.`, 'info'); gatherIntel(k); }
  const o = S.world.owner[p.at];
  if (o >= 0 && Math.random() < 0.015 * (hostileToPlayer(S.kingdoms[o]) ? 2 : 1) * (1 - 0.25 * R('espionage'))) {
    p.n--; p.name = `Scouts ×${p.n}`;
    log(`A scout was captured by ${S.kingdoms[o].name}.`, 'bad');
    if (p.n <= 0) { S.scouts = S.scouts.filter((x) => x !== p); if (UI.selEntity && UI.selEntity.id === p.id) UI.selEntity = null; toast('🔭 Your scout party was captured', 'bad'); }
  }
  S.stats.scouted++;
}
function scoutArrive(p) {
  p.status = 'idle';
  if (p.at === S.world.capital && p.order && p.order.type === 'return') {
    S.army.scout += p.n; S.scouts = S.scouts.filter((x) => x !== p);
    if (UI.selEntity && UI.selEntity.id === p.id) UI.selEntity = null;
    toast('🔭 Scouts returned home');
  }
}
function gatherIntel(k) {
  S.intel[k.id] = { t: S.time, power: Math.round(k.power), defense: Math.round(k.defense), navy: Math.round(k.navy), hall: k.hall, res: { ...k.res }, tiles: kingdomTiles(k.id) };
}
// Hand one border hex from `fromId` to `toId`. Only the loser's own neighbourhood
// is scanned — a full sweep of 165,000 hexes for a single tile would be absurd.
function transferBorderTile(fromId, toId) {
  const { owner } = S.world;
  const home = fromId === -2 ? S.world.capital : S.kingdoms[fromId] && S.kingdoms[fromId].capital;
  const near = home >= 0 ? WG.within(home, 60) : null;
  const scan = (list) => {
    for (const i of list) {
      if (owner[i] !== fromId || i === home) continue;
      if (WG.neighbors(i).some((n) => owner[n] === toId)) { owner[i] = toId; ownedChanged(); return i; }
    }
    return -1;
  };
  const hit = near ? scan(near) : -1;
  if (hit >= 0) return hit;
  return scan({ *[Symbol.iterator]() { for (let i = 0; i < owner.length; i++) yield i; } });
}

/* ---- Docks & defense on the one grid ---- */
// Fleets can dock (and disband) next to any Port or Shipyard you own.
function dockAt(water) {
  for (const n of WG.neighbors(water)) { const b = buildingAt(n); if (b && (b.type === 'port' || b.type === 'shipyard') && b.level > 0) return n; }
  return -1;
}
const stationedAt = (i) => S.divisions.filter((d) => WG.dist(d.at, i) <= 2 && !d.path.length && d.status !== 'fighting');
const DEF_TYPES = ['tower', 'cannon', 'spire', 'fortress'];
const defensesNear = (i, r = 3) => S.buildings.filter((b) => DEF_TYPES.includes(b.type) && b.level > 0 && WG.dist(b.hex, i) <= r);
function hexDefense(i) {
  return defensesNear(i).reduce((s2, b) => s2 + BUILDINGS[b.type].def * Math.pow(b.level, 1.25), 0)
    + stationedAt(i).reduce((s2, x) => s2 + armyPower(x.units, x.general), 0)
    + (WG.dist(i, S.world.capital) <= 3 ? armyPower(S.army, S.castellan) : 0);
}
const isDefended = (i) => hexDefense(i) > 0;

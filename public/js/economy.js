/* ==========================================================================
   Kingdom economy on the one hex map: your land is the hexes you own, and
   you can build on any of them. The Main Hall has no maximum level.
   ========================================================================== */
'use strict';

const capHex = () => S.world.capital;
const hallLevel = () => (S.buildings.find((b) => b.type === 'hall') || { level: 1 }).level;
const R = (id) => (S.research && S.research[id]) || 0;
const countOf = (type) => S.buildings.filter((b) => b.type === type).length;
function limitOf(type, hl = hallLevel()) {
  const arr = BUILDINGS[type].limit, base = arr[Math.min(hl, arr.length) - 1] || 0;
  return base + (hl > arr.length ? Math.floor((hl - arr.length) * (LIMIT_GROW[type] || 0)) : 0);
}
const builderCount = () => 2 + Math.floor((hallLevel() - 1) / 2) + R('engineering');
const buildersBusy = () => S.buildings.filter((b) => b.build > 0).length;
const landRadius = () => 3 + hallLevel();
const buildableTerrain = (i) => i >= 0 && S.world.terrain[i] !== T.WATER && S.world.terrain[i] !== T.MOUNTAIN;
const isPlaza = (i) => i !== capHex() && WG.dist(i, capHex()) === 1;
const inLand = (i) => buildableTerrain(i) && S.world.owner[i] === -2;
const isCoastal = (i) => buildableTerrain(i) && WG.neighbors(i).some((n) => S.world.terrain[n] === T.WATER);
let KCLEARED = new Set(), KCLEARED_SRC = null;
// Keyed on the array itself as well as its length: loading or importing a save
// swaps `S.cleared` for a different array that may happen to be the same size.
const cleared = (i) => {
  if (KCLEARED_SRC !== S.cleared || KCLEARED.size !== S.cleared.length) { KCLEARED = new Set(S.cleared); KCLEARED_SRC = S.cleared; }
  return KCLEARED.has(i);
};

// Forests have trees and hills have rocks to clear — except for the building that uses them.
function obstacleAt(i) {
  if (!buildableTerrain(i) || WG.dist(i, capHex()) < 2 || cleared(i)) return null;
  const t = S.world.terrain[i], h = hash2(i, 77, S.seed);
  if (t === T.FOREST) return 'tree';
  if (t === T.HILLS && h < 0.6) return 'rock';
  if (h < 0.05) return h < 0.03 ? 'tree' : 'rock';
  return null;
}
const obstacleOk = (type, o) => (o === 'tree' && type === 'lumbermill') || (o === 'rock' && ['goldmine', 'ironmine', 'diamondmine'].includes(type));
function clearObstacle(i) {
  const o = obstacleAt(i);
  if (!o) return false;
  if (!inLand(i)) { toast('You must own this hex first', 'bad'); return false; }
  if (!pay({ gold: 25 })) { toast('Clearing costs 💰25', 'bad'); return false; }
  S.cleared.push(i);
  markChunks(i);
  const loot = o === 'tree' ? { lumber: 60 } : Math.random() < 0.15 ? { iron: 40, diamonds: 2 } : { iron: 40 };
  gain(loot);
  floatText(WG.cx[i], WG.cy[i], Object.entries(loot).map(([k, v]) => `+${v}${RES_META[k].icon}`).join(' '), '#fff');
  spawnDust(i);
  UI.panelDirty = true;
  return true;
}
/* The Main Hall no longer hands you land — territory is earned by claiming it.
   Upgrading still lights up the country around your seat, so you can see what
   there is to settle. `grant` is only used to lay out the starting realm. */
function claimRing(grant) {
  let n = 0;
  if (grant) for (const i of WG.within(capHex(), landRadius())) if (S.world.owner[i] === -1 && buildableTerrain(i)) { S.world.owner[i] = -2; n++; }
  reveal(capHex(), landRadius() + 4);
  if (n) ownedChanged();
  return n;
}
function kingdomStartSpots() {
  const ring = WG.within(capHex(), 3).filter((i) => WG.dist(i, capHex()) >= 2 && inLand(i));
  ring.sort((a, b) => (obstacleAt(a) ? 1 : 0) - (obstacleAt(b) ? 1 : 0) || hash2(a, 5, S.seed) - hash2(b, 5, S.seed));
  const out = ring.slice(0, 3);
  out.forEach((i) => { if (obstacleAt(i)) S.cleared.push(i); });
  return out;
}

function storageMult() {
  const wh = S.buildings.filter((b) => b.type === 'warehouse').reduce((s, b) => s + BUILDINGS.warehouse.storage * b.level, 0);
  return 1 + 0.2 * R('banking') + wh;
}
function capOf(k) {
  const hl = hallLevel();
  const base = k === 'diamonds' ? 150 + 120 * (hl - 1) : 3000 * Math.pow(2, hl - 1);
  return Math.round(base * storageMult());
}

function costFor(type, targetLevel) {
  const d = BUILDINGS[type];
  const exp = type === 'hall' ? targetLevel - 2 : targetLevel - 1;
  const c = {};
  for (const [k, v] of Object.entries(d.base)) c[k] = Math.round((v * Math.pow(d.mult, exp)) / 5) * 5;
  return c;
}
const buildTime = (type, lvl) => Math.max(1, Math.round(BUILDINGS[type].time * Math.pow(lvl, 1.5) * (1 - 0.12 * R('architecture'))));
const canAfford = (cost) => Object.entries(cost).every(([k, v]) => S.res[k] >= v);
function pay(cost) {
  if (!canAfford(cost)) return false;
  for (const [k, v] of Object.entries(cost)) S.res[k] -= v;
  return true;
}
function gain(res, allowOverCap = false) {
  for (const [k, v] of Object.entries(res)) {
    if (!v) continue;
    const cap = capOf(k);
    S.res[k] = allowOverCap ? S.res[k] + v : Math.max(S.res[k], Math.min(cap, S.res[k] + v));
    S.res[k] = Math.max(0, S.res[k]);
  }
  if (typeof bumpRes === 'function') bumpRes(Object.keys(res));
}
const scaleCost = (c, m) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * m)]));

function buildingAt(i) {
  if (i === capHex() || isPlaza(i)) return S.buildings.find((b) => b.type === 'hall');
  return S.buildings.find((b) => b.hex === i);
}
function placementError(type, i) {
  if (i < 0) return 'Outside the map';
  if (S.world.terrain[i] === T.WATER) return 'You cannot build on water';
  if (S.world.terrain[i] === T.MOUNTAIN) return 'Mountains are too steep to build on';
  if (S.world.owner[i] >= 0) return `This land belongs to ${S.kingdoms[S.world.owner[i]].name}`;
  if (S.world.owner[i] === -1 && !canSettle(i)) return 'Too far beyond your borders — scout it or settle closer first';
  if (i === capHex() || isPlaza(i)) return 'The plaza around the Main Hall must stay clear';
  if (buildingAt(i)) return 'Hex occupied';
  const o = obstacleAt(i);
  if (o && !obstacleOk(type, o)) return `Clear the ${o === 'tree' ? 'trees' : 'rocks'} first (click the hex)`;
  if (BUILDINGS[type].coastal && !isCoastal(i)) return 'Must be built on the coast, next to water';
  return null;
}
function buildLockReason(type) {
  const d = BUILDINGS[type], hl = hallLevel();
  if (d.hall && hl < d.hall) return `Requires Main Hall ${d.hall}`;
  if (buildersBusy() >= builderCount()) return 'All builders are busy';
  return null;
}
function addBuilding(type, hex, level = 0) {
  const b = { id: S.nextId++, type, hex, level, build: 0, buildTotal: 0 };
  if (BUILDINGS[type].trains || BUILDINGS[type].builds) { b.queue = []; b.trainLeft = 0; }
  if (BUILDINGS[type].research) b.research = null;
  S.buildings.push(b);
  return b;
}
function placeBuilding(type, i) {
  const lock = buildLockReason(type);
  if (lock) { toast(lock, 'bad'); return null; }
  const err = placementError(type, i);
  if (err) { toast(err, 'bad'); return null; }
  // building on unclaimed land claims that hex too
  const cost = { ...costFor(type, 1) };
  const settle = S.world.owner[i] === -1;
  if (settle) for (const [k, v] of Object.entries(hexClaimCost(i))) cost[k] = (cost[k] || 0) + v;
  if (!pay(cost)) { toast('Not enough resources', 'bad'); return null; }
  if (settle) { S.world.owner[i] = -2; reveal(i, 3); ownedChanged(); }
  const b = addBuilding(type, i, 0);
  markChunks(i);
  b.build = b.buildTotal = buildTime(type, 1);
  spawnDust(i);
  UI.panelDirty = true;
  return b;
}
function upgradeError(b) {
  const d = BUILDINGS[b.type];
  if (b.build > 0) return 'Already under construction';
  if (b.type !== 'hall' && b.level >= hallLevel()) return 'Upgrade the Main Hall first (level cap = hall level)';
  if (d.hall && hallLevel() < d.hall) return `Requires Main Hall ${d.hall}`;
  if (buildersBusy() >= builderCount()) return 'All builders are busy';
  if (b.research) return 'Wait for the current research to finish';
  if (!canAfford(costFor(b.type, b.level + 1))) return 'Not enough resources';
  return null;
}
function upgradeBuilding(b) {
  const err = upgradeError(b);
  if (err) { toast(err, 'bad'); return false; }
  pay(costFor(b.type, b.level + 1));
  b.build = b.buildTotal = buildTime(b.type, b.level + 1);
  spawnDust(b.hex);
  UI.panelDirty = true;
  return true;
}
function demolish(b) {
  if (!b || b.type === 'hall') return;
  const refund = {};
  for (const [k, v] of Object.entries(costFor(b.type, Math.max(1, b.level)))) refund[k] = Math.floor(v * 0.4);
  gain(refund);
  S.buildings = S.buildings.filter((x) => x !== b);
  markChunks(b.hex);
  UI.selected = null;
  UI.panelDirty = true;
  toast(`${BUILDINGS[b.type].name} demolished (40% refunded)`);
}
function completeBuilding(b) {
  b.build = 0;
  b.level++;
  const d = BUILDINGS[b.type];
  log(`${d.name} ${b.level === 1 ? 'constructed' : 'upgraded to level ' + b.level}.`, 'good');
  if (b.type !== 'wall') toast(`${d.icon} ${d.name} ${b.level === 1 ? 'is ready' : '→ level ' + b.level}`, 'good');
  if (b.type === 'hall') { claimRing(); toast(`Main Hall ${b.level}! More buildings unlock and your settlers reach further — claim the land yourself.`, 'good'); celebrate(); }
  spawnSparkles(b.hex);
  UI.panelDirty = true;
}

/* ---- Bonuses ---- */
function allianceBonus() {
  const a = S.alliances.find((x) => x.id === S.allianceId);
  if (!a) return { prod: 0, atk: 0, def: 0, train: 0 };
  return { prod: 0.03 * a.level + 0.01 * a.members.length, atk: 0.02 * a.level, def: 0.04 * a.level, train: 0.05 * a.level };
}
function prodMult(res) {
  let m = (1 + 0.08 * R('tools')) * (1 + allianceBonus().prod);
  if (res === 'food') m *= (1 + 0.15 * R('crops')) * calendar().season.food;
  if (res === 'gold') m *= 1 + 0.05 * S.kingdoms.filter((k) => k.tradePact).length;
  return m;
}
function productionOf(b) {
  const d = BUILDINGS[b.type];
  if (b.level < 1) return null;
  const lv = b.level * (1 + 0.25 * (b.level - 1));
  if (d.produces) return [d.produces, d.rate * lv * terrainBoost(b) * (['goldmine', 'ironmine', 'diamondmine'].includes(b.type) ? 1 + 0.15 * R('mining') : 1)];
  if (b.type === 'port') return ['gold', d.rate * lv * (1 + 0.25 * R('trade')) * (S.pirateBlockade > 0 ? 0.5 : 1)];
  if (b.type === 'hall') return ['gold', 0.5 * b.level];
  return null;
}
function terrainBoost(b) {
  const tb = TERRAIN_BOOST[b.type];
  if (!tb || b.hex == null || b.hex < 0) return 1;
  const f = S.world.feat[b.hex];
  if (f && f.type === 'goldvein' && tb.goldvein) return tb.goldvein;
  if (f && f.type === 'cave' && f.mineral === 'gems' && tb.gems) return tb.gems;
  return tb[S.world.terrain[b.hex]] || 1;
}
let terrBonus = null, terrBonusVer = -1, terrBonusFeat = 0;
// Scanning 165,000 hexes per frame is not an option, so this is rebuilt only
// when your borders move (or a cave is explored, which changes its yield).
function territoryBonus() {
  if (terrBonus && terrBonusVer === landVersion && terrBonusFeat === featVersion) return terrBonus;
  terrBonusVer = landVersion; terrBonusFeat = featVersion;
  return (terrBonus = computeTerritoryBonus());
}
function computeTerritoryBonus() {
  const r = Object.fromEntries(RES.map((k) => [k, 0]));
  if (!S.world) return r;
  const { terrain, feat } = S.world;
  for (const i of playerLand()) {
    const b = TERRAIN[terrain[i]].bonus;
    if (b) for (const [k, v] of Object.entries(b)) r[k] += v * HEX_BONUS;
    const f = feat[i];
    if (f && f.type === 'goldvein') r.gold += 0.4;
    if (f && f.type === 'cave' && f.explored) for (const [k, v] of Object.entries(MINERALS[f.mineral].bonus)) r[k] += v * 0.7;
  }
  return r;
}
function upkeep() {
  let food = armyHousing(S.army);
  for (const d of S.divisions) food += armyHousing(d.units);
  let gold = 0;
  const ships = allShips();
  for (const t of SHIP_TYPES) gold += SHIPS[t].upkeep * ships[t];
  return { food: food * 0.015, gold };
}
function rates() {
  const r = Object.fromEntries(RES.map((k) => [k, 0]));
  for (const b of S.buildings) { const p = productionOf(b); if (p) r[p[0]] += p[1]; }
  const tb = territoryBonus();
  for (const k of RES) r[k] = (r[k] + tb[k]) * prodMult(k);
  const u = upkeep();
  r.food -= u.food; r.gold -= u.gold;
  return r;
}
function defenseRating() {
  let d = 0;
  for (const b of S.buildings) if (BUILDINGS[b.type].def && b.level > 0) d += BUILDINGS[b.type].def * Math.pow(b.level, 1.25);
  return d * (1 + 0.1 * R('masonry')) * (1 + 0.12 * R('fortification')) * (1 + allianceBonus().def);
}
// No hard territory limit any more — land just gets pricier to claim as you grow.
const territoryLimit = () => Infinity;

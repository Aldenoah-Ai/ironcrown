/* ==========================================================================
   Military: unit & ship stats, training, shipbuilding, divisions, fleets,
   generals, items and mystery boxes.
   ========================================================================== */
'use strict';

const INFANTRY = ['archer', 'swordsman', 'pikeman'];
const emptyArmy = () => ({ archer: 0, swordsman: 0, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 });
const emptyFleet = () => ({ sloop: 0, cog: 0, galley: 0, frigate: 0, galleon: 0, manowar: 0 });
const armyHousing = (units) => Object.entries(units || {}).reduce((s, [k, n]) => s + (UNITS[k] ? UNITS[k].housing * n : 0), 0);
const scoutsAfield = () => (S.scouts || []).reduce((s, p) => s + p.n, 0);
const queuedHousing = () => S.buildings.reduce((s, b) => s + (b.queue && BUILDINGS[b.type].trains ? b.queue.reduce((q, u) => q + UNITS[u].housing, 0) : 0), 0);
const totalHousing = () => armyHousing(S.army) + S.divisions.reduce((s, d) => s + armyHousing(d.units), 0) + queuedHousing() + scoutsAfield();
const armyCap = () => 10 + 15 * hallLevel() + S.buildings.filter((b) => BUILDINGS[b.type].trains).reduce((s, b) => s + 3 * b.level, 0);
const queueLimit = (b) => 20 + 10 * b.level;   // no army cap — only the queue length and upkeep limit you
const trainerOf = (u) => S.buildings.filter((b) => b.type === UNITS[u].from && b.level > 0).sort((a, b) => b.level - a.level)[0];
const shipyardLevel = () => Math.max(0, ...S.buildings.filter((b) => b.type === 'shipyard').map((b) => b.level));
function allShips() {
  const s = emptyFleet();
  for (const m of berths()) for (const t of SHIP_TYPES) s[t] += m.ships[t] || 0;
  for (const f of S.fleets) for (const t of SHIP_TYPES) s[t] += f.ships[t] || 0;
  return s;
}
/* ---- Berths: where ships lie at anchor ----
   A ship is launched beside the shipyard that built it, and a fleet formed from
   it sets sail from there — not from the capital. Every shipyard and port with
   water beside it is a berth; the home harbour by the capital is another. */
function berthHex(b) {
  const water = WG.neighbors(b.hex).filter(isWater);
  return water.length ? water.sort((x, y) => WG.neighbors(y).filter(isWater).length - WG.neighbors(x).filter(isWater).length || x - y)[0] : -1;
}
function berths() {
  const out = [{ id: 'home', name: 'Home harbour', icon: '🏰', hex: S.world.harbor, ships: S.harbor }];
  for (const b of S.buildings) {
    if ((b.type !== 'shipyard' && b.type !== 'port') || (b.level < 1 && !b.ships)) continue;
    const hex = berthHex(b);
    if (hex < 0) continue;
    if (!b.ships) b.ships = emptyFleet(); else for (const t of SHIP_TYPES) b.ships[t] = b.ships[t] || 0;   // same object every time: battles hold on to it
    out.push({ id: String(b.id), name: `${BUILDINGS[b.type].name} at ${hexName(b.hex)}`, icon: BUILDINGS[b.type].icon, hex, ships: b.ships, b });
  }
  return out;
}
const berthById = (id) => berths().find((m) => m.id === String(id));
const shipsAtBerths = () => berths().reduce((s, m) => s + shipCount(m.ships), 0);
// The berth a fleet lying at `hex` can moor at, if any.
function berthAt(hex) {
  const all = berths();
  return all.find((m) => m.hex === hex) || all.find((m) => m.b && WG.dist(m.b.hex, hex) <= 1) || null;
}
// A shipyard or port that is demolished or burnt sends its ships to the home harbour.
function strandShips(b) {
  if (!b || !b.ships || !shipCount(b.ships)) return;
  for (const t of SHIP_TYPES) S.harbor[t] += b.ships[t] || 0;
  log(`⚓ The ships at the ${BUILDINGS[b.type].name} at ${hexName(b.hex)} sailed for the home harbour.`, 'info');
  b.ships = emptyFleet();
}
const shipCount = (ships) => SHIP_TYPES.reduce((s, t) => s + (ships[t] || 0), 0);
const queuedShips = () => S.buildings.reduce((s, b) => s + (b.type === 'shipyard' ? b.queue.length : 0), 0);
const navalCap = () => 4 + 5 * S.buildings.filter((b) => b.type === 'shipyard').reduce((s, b) => s + b.level, 0);
const transportCapacity = () => { const s = allShips(); return SHIP_TYPES.reduce((c, t) => c + SHIPS[t].cap * s[t], 0); };
const divisionLimit = () => 2 + Math.floor(hallLevel() / 2);
const fleetLimit = () => 1 + countOf('shipyard') + Math.floor(hallLevel() / 3);

/* ---- Generals ----
   You own general *instances* ({uid, id, stars}); several copies of the same
   general are allowed. Each instance can hold exactly one post: a division, a
   fleet, or Castellan of the capital. Every division must have a general. */
const genInst = (uid) => S.generals.find((g) => g.uid === uid);
const generalData = (uidOrId) => { const i = genInst(uidOrId); return GENERALS.find((g) => g.id === (i ? i.id : uidOrId)); };
const ownedGeneral = genInst;
function generalStats(uid) {
  const g = generalData(uid), o = genInst(uid) || { stars: 1 };
  const m = 1 + 0.1 * (o.stars - 1);
  return { atk: Math.min(100, Math.round(g.atk * m)), hp: Math.min(100, Math.round(g.hp * m)), spd: Math.min(100, Math.round(g.spd * m)) };
}
function generalMult(uid, kind) {
  if (!uid || !genInst(uid)) return { atk: 1, hp: 1, spd: 1 };
  const gs = generalStats(uid), g = generalData(uid);
  const spec = g.spec && (g.spec === kind || (g.spec === 'fleet' && SHIPS[kind])) ? 0.15 : 0;
  return { atk: 1 + gs.atk / 200 + spec, hp: 1 + gs.hp / 200 + spec, spd: 1 + gs.spd / 400 };
}
function generalPost(uid) {
  if (S.castellan === uid) return { kind: 'castellan', label: '🏰 Castellan (home defense)' };
  const d = S.divisions.find((x) => x.general === uid);
  if (d) return { kind: 'division', id: d.id, label: `⚔️ ${d.name}` };
  const f = S.fleets.find((x) => x.general === uid);
  if (f) return { kind: 'fleet', id: f.id, label: `⚓ ${f.name}` };
  return { kind: 'none', label: 'Idle' };
}
const idleGenerals = () => S.generals.filter((g) => generalPost(g.uid).kind === 'none');
const copiesOf = (id) => S.generals.filter((g) => g.id === id);
function unassignGeneral(uid, force) {
  const post = generalPost(uid);
  if (post.kind === 'division' && !force) { toast('Every division needs a general — assign a replacement from the division card', 'bad'); return false; }
  if (S.castellan === uid) S.castellan = null;
  S.divisions.forEach((d) => { if (d.general === uid) d.general = null; });
  S.fleets.forEach((f) => { if (f.general === uid) f.general = null; });
  return true;
}
// Put general `uid` on a post. A general leading a division can only leave it by
// being swapped with another general (the division is never left leaderless).
function assignGeneral(uid, kind, targetId) {
  if (!genInst(uid)) return false;
  const cur = generalPost(uid);
  if (cur.kind === kind && (cur.id === targetId || kind === 'castellan')) return true;
  if (kind === 'none') return unassignGeneral(uid) && (UI.panelDirty = true);
  if (cur.kind === 'division') {
    if (kind !== 'division') { toast(`${generalData(uid).name} commands ${S.divisions.find((d) => d.id === cur.id).name}; swap in another general there first`, 'bad'); return false; }
    // swap generals between two divisions
    const a = S.divisions.find((d) => d.id === cur.id), b = S.divisions.find((d) => d.id === targetId);
    if (!b) return false;
    [a.general, b.general] = [b.general, uid];
    UI.panelDirty = true;
    return true;
  }
  unassignGeneral(uid, true);
  if (kind === 'castellan') S.castellan = uid;
  else if (kind === 'division') { const d = S.divisions.find((x) => x.id === targetId); if (d) d.general = uid; }
  else if (kind === 'fleet') { const f = S.fleets.find((x) => x.id === targetId); if (f) f.general = uid; }
  UI.panelDirty = true;
  return true;
}
function grantGeneral(id) {
  const had = copiesOf(id).length;
  const inst = { uid: 'g' + (S.nextGen = (S.nextGen || 1) + 1) + uid().slice(0, 3), id, stars: 1 };
  S.generals.push(inst);
  return { dup: had > 0, copies: had + 1, uid: inst.uid };
}
// Merge an idle spare copy into this general for +1★ (max 5).
function promoteGeneral(uid) {
  const g = genInst(uid);
  if (!g || g.stars >= 5) return false;
  const spare = S.generals.filter((x) => x.id === g.id && x.uid !== uid && generalPost(x.uid).kind === 'none').sort((a, b) => a.stars - b.stars)[0];
  if (!spare) { toast('Needs an idle spare copy of this general', 'bad'); return false; }
  S.generals = S.generals.filter((x) => x !== spare);
  g.stars = Math.min(5, g.stars + spare.stars);
  toast(`⭐ ${generalData(uid).name} promoted to ${g.stars}★`, 'good');
  UI.panelDirty = true;
  return true;
}
const HIRE_COST = { gold: 900 };
function hireGeneral() {
  if (!pay(HIRE_COST)) { toast('Hiring a general costs 💰900', 'bad'); return null; }
  const g = pick(GENERALS.filter((x) => x.rarity === (Math.random() < 0.15 ? 'rare' : 'common')));
  grantGeneral(g.id);
  log(`Hired ${g.name} at the tavern.`, 'good');
  toast(`🍺 ${g.icon} ${g.name} joins your court`, 'good');
  UI.panelDirty = true;
  return g;
}

/* ---- Stats ---- */
function unitStats(u, gid, boosts = {}) {
  const U = UNITS[u], t = trainerOf(u), lvl = t ? t.level : 1;
  const lm = 1 + 0.12 * (lvl - 1), gm = generalMult(gid, u), ab = allianceBonus();
  let atk = U.atk * lm * gm.atk * (1 + ab.atk) * (1 + 0.1 * R('weapons'));
  let hp = U.hp * lm * gm.hp;
  let speed = U.speed * gm.spd, range = U.range;
  if (INFANTRY.includes(u)) hp *= 1 + 0.1 * R('armor');
  if (u === 'archer') { atk *= 1 + 0.15 * R('longbows'); range *= 1 + 0.1 * R('longbows'); }
  if (u === 'horseman') { speed *= 1 + 0.15 * R('horses'); hp *= (1 + 0.08 * R('horses')) * (1 + 0.12 * R('barding')); atk *= 1 + 0.12 * R('barding'); }
  if (u === 'catapult') atk *= 1 + 0.15 * Math.max(0, R('siege') - 1);
  if (boosts.warhorn) atk *= 1.3;
  if (boosts.salve) hp *= 1.3;
  return { atk, hp, speed, range, level: lvl };
}
function shipStats(t, gid, boosts = {}) {
  const Sh = SHIPS[t], lvl = Math.max(1, shipyardLevel()), lm = 1 + 0.1 * (lvl - 1), gm = generalMult(gid, t);
  let atk = Sh.atk * lm * gm.atk * (1 + 0.12 * R('cannons')), hp = Sh.hp * lm * gm.hp * (1 + 0.12 * R('hulls'));
  const speed = Sh.speed * gm.spd * (1 + 0.12 * R('navigation')) * (1 + 0.1 * R('sails')) * (S.winds > 0 ? 1.5 : 1);
  if (boosts.warhorn) atk *= 1.3;
  if (boosts.salve) hp *= 1.3;
  return { atk, hp, speed, range: Sh.range, level: lvl };
}
const unitPower = (st) => st.atk + st.hp / 5;
const armyPower = (units, gid) => COMBAT_UNITS.reduce((s, u) => s + (units[u] ? unitPower(unitStats(u, gid)) * units[u] : 0), 0);
const fleetPower = (ships, gid) => SHIP_TYPES.reduce((s, t) => s + (ships[t] ? unitPower(shipStats(t, gid)) * ships[t] : 0), 0);
function totalPower() {
  return armyPower(S.army, S.castellan) + S.divisions.reduce((s, d) => s + armyPower(d.units, d.general), 0)
    + berths().reduce((s, m) => s + fleetPower(m.ships, null), 0) + S.fleets.reduce((s, f) => s + fleetPower(f.ships, f.general), 0) + defenseRating();
}
function divisionSpeed(d) {
  const types = COMBAT_UNITS.filter((u) => d.units[u] > 0).concat(d.units.scout > 0 ? ['scout'] : []);
  if (!types.length) return 1;
  return Math.min(...types.map((u) => unitStats(u, d.general).speed)) * (1 + 0.12 * R('logistics')) * calendar().season.march;
}
function fleetSpeed(f) {
  const types = SHIP_TYPES.filter((t) => f.ships[t] > 0);
  if (!types.length) return 1;
  return Math.min(...types.map((t) => shipStats(t, f.general).speed));
}

/* ---- Training ---- */
function trainError(u) {
  const U = UNITS[u], b = trainerOf(u);
  if (!b) return `Build a ${BUILDINGS[U.from].name} first`;
  if (U.research && !R(U.research)) return `Research ${RESEARCH[U.research].name} first`;
  return null;
}
function trainUnits(u, n) {
  const err = trainError(u);
  if (err) { toast(err, 'bad'); return 0; }
  const U = UNITS[u], b = trainerOf(u);
  let made = 0;
  for (let i = 0; i < n; i++) {
    if (b.queue.length >= queueLimit(b)) { if (!made) toast('Training queue is full', 'bad'); break; }
    if (!pay(U.cost)) { if (!made) toast('Not enough resources', 'bad'); break; }
    if (!b.queue.length) b.trainLeft = trainTime(u);
    b.queue.push(u);
    made++;
  }
  UI.panelDirty = true;
  return made;
}
const trainTime = (u) => UNITS[u].time * (1 - 0.15 * R('drill'));
const shipCost = (t) => scaleCost(SHIPS[t].cost, 1 - 0.1 * R('shipwright'));
const shipTime = (t) => SHIPS[t].time * (1 - 0.15 * R('shipwright'));
function cancelQueue(b) {
  const x = b.queue.pop();
  if (!x) return;
  gain(UNITS[x] ? UNITS[x].cost : shipCost(x));
  if (SHIPS[x]) S.army.seaman += SHIPS[x].crew;
  if (!b.queue.length) b.trainLeft = 0;
  UI.panelDirty = true;
}
function shipError(t) {
  if (!countOf('shipyard') || shipyardLevel() < 1) return 'Build a Shipyard on the coast first';
  if (shipyardLevel() < SHIPS[t].lvl) return `Requires a level ${SHIPS[t].lvl} Shipyard`;
  if (S.army.seaman < SHIPS[t].crew) return `Needs a crew of ${SHIPS[t].crew} Seamen (you have ${S.army.seaman}) — train them at the Port`;
  return null;
}
// `yardId` picks the shipyard; without one the least busy yard that can build it does.
function buildShips(t, n, yardId) {
  const err = shipError(t);
  if (err) { toast(err, 'bad'); return 0; }
  let yards = S.buildings.filter((b) => b.type === 'shipyard' && b.level >= SHIPS[t].lvl);
  if (yardId != null && yardId !== '') {
    const y = yards.filter((b) => b.id === +yardId);
    if (!y.length) { toast(`That shipyard cannot build a ${SHIPS[t].name} — it needs level ${SHIPS[t].lvl}`, 'bad'); return 0; }
    yards = y;
  }
  let made = 0;
  for (let i = 0; i < n; i++) {
    const b = yards.sort((a, c) => a.queue.length - c.queue.length)[0];
    if (b.queue.length >= 8 + 4 * b.level) { if (!made) toast('Shipyard queue is full', 'bad'); break; }
    if (S.army.seaman < SHIPS[t].crew) { if (!made) toast(`Needs ${SHIPS[t].crew} Seamen`, 'bad'); break; }
    if (!pay(shipCost(t))) { if (!made) toast('Not enough resources', 'bad'); break; }
    S.army.seaman -= SHIPS[t].crew;
    if (!b.queue.length) b.trainLeft = shipTime(t);
    b.queue.push(t);
    made++;
  }
  UI.panelDirty = true;
  return made;
}
function stepQueue(b, dt) {
  if (!b.queue || !b.queue.length || b.level < 1) return;
  const ship = BUILDINGS[b.type].builds;
  b.trainLeft -= dt * (ship ? 1 : 1 + allianceBonus().train);
  while (b.trainLeft <= 0 && b.queue.length) {
    const x = b.queue.shift();
    if (ship) {
      const m = berthById(b.id);
      (m ? m.ships : S.harbor)[x]++;
      log(`${SHIPS[x].name} launched from the shipyard at ${hexName(b.hex)}.`, 'good');
    }
    else S.army[x]++;
    UI.panelDirty = true;
    if (b.queue.length) b.trainLeft += ship ? shipTime(b.queue[0]) : trainTime(b.queue[0]); else b.trainLeft = 0;
  }
}

/* ---- Divisions & fleets ---- */
function createDivision(name, units, gid) {
  if (S.divisions.length >= divisionLimit()) { toast(`Division limit (${divisionLimit()}) — upgrade the Main Hall`, 'bad'); return null; }
  if (!gid || !genInst(gid) || generalPost(gid).kind !== 'none') { toast('Every division needs its own idle general — hire one at the Tavern (Shop tab) or free one up', 'bad'); return null; }
  const take = {};
  for (const u of Object.keys(UNITS)) if (u !== 'seaman') take[u] = Math.min(units[u] || 0, S.army[u] || 0);
  if (armyHousing(take) <= 0) { toast('A division needs at least one soldier', 'bad'); return null; }
  for (const u of Object.keys(take)) S.army[u] -= take[u];
  const d = { id: 'd' + uid(), name: (name || '').trim().slice(0, 24) || `Division ${S.divisions.length + 1}`,
    color: DIVISION_COLORS[S.divisions.length % DIVISION_COLORS.length], units: { ...emptyArmy(), ...take },
    general: null, at: S.world.capital, path: [], prog: 0, order: null, status: 'idle', formation: 'line', stance: 'advance', target: 'nearest', guard: false, guardAt: null };
  S.divisions.push(d);
  unassignGeneral(gid, true);
  d.general = gid;
  log(`${d.name} was mustered (${armyHousing(take)} troops).`, 'good');
  UI.panelDirty = true;
  return d;
}
const atHome = (d) => d.at === S.world.capital && !d.path.length;
function disbandDivision(d) {
  if (!d) return;
  if (!atHome(d)) { toast('Divisions can only disband at the capital', 'bad'); return; }
  for (const u of Object.keys(d.units)) S.army[u] += d.units[u];
  d.general = null;
  S.divisions = S.divisions.filter((x) => x !== d);
  if (UI.selEntity && UI.selEntity.id === d.id) UI.selEntity = null;
  log(`${d.name} disbanded into the garrison.`, 'info');
  UI.panelDirty = true;
}
function reinforceDivision(d, units) {
  if (!d) return;
  if (!atHome(d)) { toast('Reinforce divisions at the capital', 'bad'); return; }
  for (const u of Object.keys(units)) { const n = Math.min(units[u], S.army[u]); S.army[u] -= n; d.units[u] += n; }
  UI.panelDirty = true;
}
/* ---- Changing a division's size ---- */
// At the capital: set exact troop numbers (the difference moves to/from the garrison).
function setDivisionTroops(d, target) {
  if (!d) return false;
  if (!atHome(d)) { toast('Troops can be added or removed at the capital — or split/merge divisions in the field', 'bad'); return false; }
  const next = {};
  for (const u of Object.keys(UNITS)) { if (u === 'seaman') continue; next[u] = clamp(Math.floor(target[u] ?? d.units[u] ?? 0), 0, (d.units[u] || 0) + (S.army[u] || 0)); }
  if (armyHousing(next) <= 0) { toast('A division needs at least one soldier — disband it instead', 'bad'); return false; }
  for (const u of Object.keys(next)) { S.army[u] += (d.units[u] || 0) - next[u]; d.units[u] = next[u]; }
  UI.panelDirty = true;
  return true;
}
// Anywhere: split part of a division off into a new one (needs an idle general).
function splitDivision(d, units, name, gid) {
  if (!d) return null;
  if (d.status === 'fighting') return null;
  if (S.divisions.length >= divisionLimit()) { toast(`Division limit (${divisionLimit()})`, 'bad'); return null; }
  if (!gid || generalPost(gid).kind !== 'none') { toast('The new division needs its own idle general', 'bad'); return null; }
  const take = {};
  for (const u of Object.keys(d.units)) take[u] = clamp(Math.floor(units[u] || 0), 0, d.units[u]);
  const rest = {}; for (const u of Object.keys(d.units)) rest[u] = d.units[u] - take[u];
  if (armyHousing(take) <= 0 || armyHousing(rest) <= 0) { toast('Both divisions need at least one soldier', 'bad'); return null; }
  d.units = { ...emptyArmy(), ...rest };
  const nd = { id: 'd' + uid(), name: (name || '').trim().slice(0, 24) || d.name + ' II', color: DIVISION_COLORS[S.divisions.length % DIVISION_COLORS.length],
    units: { ...emptyArmy(), ...take }, general: gid, at: d.at, path: [], prog: 0, order: null, status: 'idle', formation: d.formation, stance: d.stance, target: d.target };
  S.divisions.push(nd);
  log(`${nd.name} split off from ${d.name}.`, 'info');
  UI.panelDirty = true;
  return nd;
}
// Two divisions on the same hex become one; the absorbed one's general is freed.
function mergeDivisions(into, from) {
  if (!into || !from) return false;
  if (into === from || into.at !== from.at || into.path.length || from.path.length) { toast('Both divisions must be standing on the same hex', 'bad'); return false; }
  for (const u of Object.keys(from.units)) into.units[u] = (into.units[u] || 0) + from.units[u];
  from.general = null;
  S.divisions = S.divisions.filter((x) => x !== from);
  if (UI.selEntity && UI.selEntity.id === from.id) UI.selEntity = { kind: 'division', id: into.id };
  log(`${from.name} merged into ${into.name}.`, 'info');
  UI.panelDirty = true;
  return true;
}

// The fleet puts to sea from the berth its ships lie at (default: the one with the most ships).
function createFleet(name, ships, gid, berthId) {
  if (S.fleets.length >= fleetLimit()) { toast(`Fleet limit (${fleetLimit()}) — build more shipyards`, 'bad'); return null; }
  const m = berthId != null ? berthById(berthId) : berths().sort((a, b) => shipCount(b.ships) - shipCount(a.ships))[0];
  if (!m) { toast('That harbour is gone', 'bad'); return null; }
  const take = {};
  for (const t of SHIP_TYPES) take[t] = clamp(Math.floor(ships[t] || 0), 0, m.ships[t] || 0);
  if (shipCount(take) <= 0) { toast(`A fleet needs at least one ship — none are moored at the ${m.name}`, 'bad'); return null; }
  for (const t of SHIP_TYPES) m.ships[t] -= take[t];
  const f = { id: 'f' + uid(), name: (name || '').trim().slice(0, 24) || `Fleet ${S.fleets.length + 1}`, ships: { ...emptyFleet(), ...take },
    general: null, at: m.hex, path: [], prog: 0, order: null, status: 'idle', formation: 'line', stance: 'advance', target: 'nearest' };
  S.fleets.push(f);
  if (gid) assignGeneral(gid, 'fleet', f.id);
  log(`${f.name} set sail with ${shipCount(take)} ships.`, 'good');
  UI.panelDirty = true;
  return f;
}
const fleetHome = (f) => !f.path.length && (f.at === S.world.harbor || dockAt(f.at) >= 0);
// Ships of a disbanded fleet moor where it lies: the home harbour, or the shipyard or port beside it.
function disbandFleet(f) {
  if (!f) return;
  if (!fleetHome(f)) { toast('Fleets can only disband in a harbour — home, or beside one of your shipyards or ports', 'bad'); return; }
  const m = berthAt(f.at) || berths()[0];
  for (const t of SHIP_TYPES) m.ships[t] += f.ships[t];
  log(`${f.name} moored at the ${m.name}.`, 'info');
  S.fleets = S.fleets.filter((x) => x !== f);
  if (UI.selEntity && UI.selEntity.id === f.id) UI.selEntity = null;
  UI.panelDirty = true;
}

/* ---- Items ---- */
function useItem(k) {
  if (!S.items[k]) return;
  if (k === 'warhorn' || k === 'salve') {
    if (S.boosts[k]) { toast('Already active for your next battle'); return; }
    S.boosts[k] = true; toast(`${ITEMS[k].icon} ${ITEMS[k].name} will empower your next battle`, 'good');
  } else if (k === 'hammer') {
    const pending = S.buildings.filter((b) => b.build > 0);
    if (!pending.length) { toast('Nothing is under construction', 'bad'); return; }
    pending.forEach(completeBuilding);
  } else if (k === 'scroll') {
    const unis = S.buildings.filter((b) => b.research);
    if (!unis.length) { toast('No research in progress', 'bad'); return; }
    unis.forEach(completeResearch);
  } else if (k === 'map') {
    const target = S.kingdoms.find((kk) => !S.world.seen[kk.capital]) || S.kingdoms[0];
    reveal(target.capital, 5);
    toast(`The map reveals the lands of ${target.name}`, 'good');
  } else if (k === 'winds') {
    S.winds = 300; toast('🌬️ Favourable winds fill your sails for 5 minutes', 'good');
  } else if (k === 'shield') {
    S.shield += 900; toast('Peace Shield raised for 15 minutes', 'good');
  }
  S.items[k]--;
  UI.panelDirty = true;
}

/* ---- Mystery boxes ---- */
function rollBox(box) {
  const kind = weighted(box.kinds);
  if (kind === 'general') {
    const rarity = weighted(box.rarity);
    const g = pick(GENERALS.filter((x) => x.rarity === rarity));
    return { kind, rarity, general: g, ...grantGeneral(g.id) };  // duplicates become extra copies
  }
  const tier = box.resScale >= 10 ? 'epic' : box.resScale >= 4 ? 'rare' : 'common';
  if (kind === 'item') {
    const k = pick(Object.keys(ITEMS)), qty = box.resScale >= 4 ? randi(1, 2) : 1;
    S.items[k] += qty;
    return { kind, item: k, qty, rarity: tier };
  }
  const bundle = {};
  for (let i = 0, n = randi(2, 3); i < n; i++) { const k = pick(['gold', 'lumber', 'iron', 'food']); bundle[k] = (bundle[k] || 0) + Math.round(rand(250, 600) * box.resScale / 10) * 10; }
  if (box.resScale >= 4 || Math.random() < 0.2) bundle.diamonds = Math.round(rand(3, 8) * Math.sqrt(box.resScale));
  gain(bundle, true);
  return { kind: 'res', bundle, rarity: tier };
}
function openBox(id) {
  const box = BOXES.find((b) => b.id === id);
  if (!pay(box.cost)) { toast('Not enough ' + Object.keys(box.cost).map((k) => RES_META[k].name).join('/'), 'bad'); return null; }
  const reward = rollBox(box);
  S.stats.boxesOpened++;
  log(`Opened a ${box.name}: ${rewardText(reward)}.`, reward.kind === 'general' && reward.rarity !== 'common' ? 'good' : 'info');
  showBoxOpening(box, reward);
  UI.panelDirty = true;
  return reward;
}
function rewardText(r) {
  if (r.kind === 'general') return `${RARITY[r.rarity].name} general ${r.general.name}` + (r.dup ? ` (you now own ${r.copies} copies)` : '');
  if (r.kind === 'item') return `${r.qty}× ${ITEMS[r.item].name}`;
  return Object.entries(r.bundle).map(([k, v]) => `${RES_META[k].icon}${fmt(v)}`).join(' ');
}

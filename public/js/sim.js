/* ==========================================================================
   World simulation: movement & orders for divisions/fleets, AI kingdoms and
   their armies/fleets, pirates, raids, diplomacy, and the master step().
   ========================================================================== */
'use strict';

const HEX_TIME_LAND = 1.5, HEX_TIME_SEA = 1.1;   // seconds per (small) hex at speed 1

/* ---------- path costs ---------- */
const canEmbark = (d) => transportCapacity() >= armyHousing(d.units);
function divisionCost(d) {
  const embark = canEmbark(d);
  return (i) => { const t = S.world.terrain[i]; if (t === T.WATER) return embark ? 1.3 : Infinity; return TERRAIN[t].cost; };
}
const fleetCost = (i) => (S.world.terrain[i] === T.WATER ? 1 : Infinity);
const aiLandCost = (i) => { const t = S.world.terrain[i]; return t === T.WATER ? Infinity : TERRAIN[t].cost; };
const isFleet = (e) => !!e.ships;
const isScout = (e) => e.kind === 'scout';

function nearestWaterTo(hex, from) {
  const c = WG.neighbors(hex).filter((n) => isWater(n));
  if (isWater(hex)) return hex;
  return c.sort((a, b) => WG.dist(a, from) - WG.dist(b, from))[0] ?? -1;
}
function planPath(ent, goal) {
  if (isScout(ent)) return findPath(WG, ent.at, goal, scoutCost);
  if (isFleet(ent)) { const g = nearestWaterTo(goal, ent.at); return g < 0 ? null : findPath(WG, ent.at, g, fleetCost); }
  return findPath(WG, ent.at, goal, divisionCost(ent));
}
function giveOrder(ent, type, hex, extra = {}, quiet) {
  const path = planPath(ent, hex);
  if (path === null) {
    if (!quiet) toast(isScout(ent) ? 'Scouts cannot reach that spot' : isFleet(ent) ? 'No sea route there' : (isWater(hex) ? 'Divisions need transport ships (Cogs) to cross water' : 'No route there — mountains or sea block the way'), 'bad');
    return false;
  }
  ent.path = path; ent.prog = 0; ent.order = { type, hex, ...extra }; ent.status = path.length ? 'moving' : 'idle'; ent.waitAttack = null;
  if (!path.length) arrive(ent);
  UI.panelDirty = true;
  return true;
}
const scoutSpeed = () => UNITS.scout.speed * (1 + 0.12 * R('logistics')) * calendar().season.march;
function etaOf(ent) {
  if (!ent.path.length) return 0;
  const speed = isScout(ent) ? scoutSpeed() : isFleet(ent) ? fleetSpeed(ent) : divisionSpeed(ent);
  const cost = isScout(ent) ? scoutCost : isFleet(ent) ? fleetCost : divisionCost(ent);
  const per = isFleet(ent) ? HEX_TIME_SEA : HEX_TIME_LAND;
  return ent.path.reduce((s, i, k) => s + per * cost(i) * (k === 0 ? 1 - ent.prog : 1), 0) / speed;
}

// Advance one entity along its path. Returns true when it just arrived.
function advance(ent, dt, speed, cost, per, onEnter) {
  if (!ent.path || !ent.path.length || ent.status === 'fighting') return false;
  let budget = dt * speed;
  while (budget > 0 && ent.path.length) {
    const c = cost(ent.path[0]);
    if (!isFinite(c)) { ent.path = []; ent.prog = 0; return true; }
    const need = (1 - ent.prog) * per * c;
    if (budget >= need) { budget -= need; ent.at = ent.path.shift(); ent.prog = 0; if (onEnter) onEnter(ent); }
    else { ent.prog += budget / (per * c); budget = 0; }
  }
  return !ent.path.length;
}

/* ---------- enemy forces ---------- */
function enemyUnitStats(u, hall) {
  const m = (1 + 0.12 * (hall - 1)) * (1 + 0.08 * hall);
  return { atk: UNITS[u].atk * m, hp: UNITS[u].hp * m, speed: UNITS[u].speed, range: UNITS[u].range };
}
function enemyShipStats(t, hall) {
  const m = 1 + 0.12 * (hall - 1);
  return { atk: SHIPS[t].atk * m, hp: SHIPS[t].hp * m, speed: SHIPS[t].speed, range: SHIPS[t].range };
}
function armyFromPower(power, hall, personality) {
  const shares = { aggressive: { archer: 0.25, swordsman: 0.3, pikeman: 0.15, horseman: 0.3 }, builder: { archer: 0.45, swordsman: 0.3, pikeman: 0.2, horseman: 0.05 } }[personality]
    || { archer: 0.3, swordsman: 0.3, pikeman: 0.15, horseman: 0.25 };
  if (hall >= 3) { shares.catapult = 0.08; }
  const units = emptyArmy();
  for (const [u, s] of Object.entries(shares)) units[u] = Math.max(0, Math.round((power * s) / unitPower(enemyUnitStats(u, hall))));
  if (!armyHousing(units)) units.swordsman = 2;
  return units;
}
function fleetFromPower(power, hall) {
  const shares = hall >= 4 ? { sloop: 0.15, galley: 0.35, frigate: 0.4, galleon: 0.1 } : hall >= 2 ? { sloop: 0.3, galley: 0.5, frigate: 0.2 } : { sloop: 0.5, galley: 0.5 };
  const ships = emptyFleet();
  for (const [t, s] of Object.entries(shares)) ships[t] = Math.max(0, Math.round((power * s) / unitPower(enemyShipStats(t, hall))));
  if (!shipCount(ships)) ships.sloop = 1;
  return ships;
}
const enemyArmyPower = (units, hall) => COMBAT_UNITS.reduce((s, u) => s + unitPower(enemyUnitStats(u, hall)) * (units[u] || 0), 0);
const enemyFleetPower = (ships, hall) => SHIP_TYPES.reduce((s, t) => s + unitPower(enemyShipStats(t, hall)) * (ships[t] || 0), 0);

/* ---------- battle helpers ---------- */
// One battle group per division / fleet (plus garrison, allies…).
// `hex` is where the force actually stands on the map: a battle forms up there,
// it does not march anybody to a tidy spot first.
const groupOf = (ent, naval) => ({
  key: ent.id, name: ent.name, units: { ...(naval ? ent.ships : ent.units) }, ref: ent, hex: ent.at,
  formation: ent.formation || 'line', stance: ent.stance || 'advance', target: ent.target || 'nearest',
  stats: naval ? (t) => shipStats(t, ent.general, S.boosts) : (u) => unitStats(u, ent.general, S.boosts),
});
const plainGroup = (key, name, units, gid, formation = 'line', stance = 'advance', hex = null) => ({ key, name, units: { ...units }, formation, stance, target: 'nearest', hex, stats: (u) => unitStats(u, gid, S.boosts) });
function consumeBoosts() { S.boosts = { warhorn: false, salve: false }; }
function applyCasualties(units, survivors, keys) {
  const lost = {};
  for (const k of keys) {
    const before = units[k] || 0, after = Math.min(before, survivors[k] || 0);
    let l = before - after;
    const saved = Math.floor(l * 0.1 * R('medicine') * (UNITS[k] ? 1 : 0));
    l -= saved;
    units[k] = before - l;
    if (l > 0) lost[k] = l;
  }
  return lost;
}
const plural = (name) => (/man$/.test(name) ? name.replace(/man$/, 'men') : /o' War$/.test(name) ? name.replace("Man o' War", "Men o' War") : name + 's');
const lostText = (lost, table) => Object.entries(lost).map(([k, n]) => `${n} ${n > 1 ? plural(table[k].name) : table[k].name}`).join(', ') || 'none';
function removeDivisionIfEmpty(d) {
  if (armyHousing(d.units) > 0) return false;
  if (d.general) unassignGeneral(d.general, true);
  S.divisions = S.divisions.filter((x) => x !== d);
  if (UI.selEntity && UI.selEntity.id === d.id) UI.selEntity = null;
  log(`${d.name} was wiped out.`, 'bad');
  return true;
}
function removeFleetIfEmpty(f) {
  if (shipCount(f.ships) > 0) return false;
  if (f.general) unassignGeneral(f.general, true);
  S.fleets = S.fleets.filter((x) => x !== f);
  if (UI.selEntity && UI.selEntity.id === f.id) UI.selEntity = null;
  log(`${f.name} was sunk.`, 'bad');
  return true;
}
function lootTier(tier, mult = 1) {
  const loot = { gold: Math.round(rand(200, 400) * tier ** 1.5 * mult), lumber: Math.round(rand(100, 300) * tier * mult), iron: Math.round(rand(80, 220) * tier * mult) };
  if (Math.random() < 0.3 * tier) loot.diamonds = Math.round(rand(3, 8) * tier);
  return loot;
}
function bonusDrop(tier) {
  const r = Math.random();
  if (r < 0.06 * tier) { const g = pick(GENERALS.filter((x) => x.rarity === (tier >= 3 ? 'epic' : 'rare'))); grantGeneral(g.id); return `General ${g.name} joined you!`; }
  if (r < 0.3) { const k = pick(Object.keys(ITEMS)); S.items[k]++; return `Found a ${ITEMS[k].name}.`; }
  return '';
}

/* ======================= coalitions & battles ======================= *
 * Teams: 'P' = you (+ kingdoms in your alliance), 'A:<id>' = an AI alliance,
 * 'K:<id>' = an unaligned kingdom, 'X' = pirates, 'B' = bandits/deserters.
 * Every battle gathers ALL forces within one hex of the fight whose team is
 * hostile to someone present — so neighbouring divisions fight together, an
 * enemy army fights beside its capital's garrison, allies join you, and
 * third parties turn it into a 3-way battle.                              */
const teamOfKingdom = (k) => (S.allianceId && k.allianceId === S.allianceId ? 'P' : k.allianceId ? 'A:' + k.allianceId : 'K:' + k.id);
// Forces that share your banner but belong to an allied kingdom — they fight themselves.
const ALLY_KINDS = ['kgarrison', 'army', 'ktowers', 'aifleet', 'knavy'];
function teamKingdoms(T) {
  if (T === 'P') return S.kingdoms.filter((k) => S.allianceId && k.allianceId === S.allianceId);
  if (T.startsWith('A:')) return S.kingdoms.filter((k) => k.allianceId === T.slice(2) && teamOfKingdom(k) === T);
  if (T.startsWith('K:')) return [S.kingdoms[+T.slice(2)]];
  return [];
}
const kingdomsAtWar = (a, b) => (a.wars && a.wars[b.id] > S.time) || (b.wars && b.wars[a.id] > S.time);
/* With a hundred-odd armies on the map this is asked thousands of times a tick,
   and each answer used to rebuild two lists of kingdoms. Memoised for the
   duration of one encounter sweep. */
let hostileMemo = new Map();
const clearHostileMemo = () => hostileMemo.clear();
function teamsHostile(A, B, ctx) {
  if (ctx) return teamsHostileRaw(A, B, ctx);
  const key = A + '\u0000' + B;
  let v = hostileMemo.get(key);
  if (v === undefined) { v = teamsHostileRaw(A, B); hostileMemo.set(key, v); }
  return v;
}
function teamsHostileRaw(A, B, ctx) {
  if (A === B) return false;
  if (['X', 'B'].includes(A) || ['X', 'B'].includes(B)) return true;
  if (ctx && ((ctx[0] === A && ctx[1] === B) || (ctx[0] === B && ctx[1] === A))) return true;
  if (A === 'P') return teamKingdoms(B).some(hostileToPlayer);
  if (B === 'P') return teamKingdoms(A).some(hostileToPlayer);
  const ka = teamKingdoms(A), kb = teamKingdoms(B);
  return ka.some((x) => kb.some((y) => kingdomsAtWar(x, y)));
}
function teamInfo(T) {
  if (T === 'P') return { name: S.name + (S.allianceId ? ' & allies' : ''), color: '#f2c14e', player: true };
  if (T === 'X') return { name: 'Pirates', color: '#222', pirate: true };
  if (T === 'B') return { name: 'Bandits', color: '#6b5a44' };
  if (T.startsWith('A:')) { const a = allianceOf(T.slice(2)), ks = teamKingdoms(T); return { name: ks.length === 1 ? ks[0].name : a.name, color: ks.length === 1 ? ks[0].color : a.color }; }
  const k = S.kingdoms[+T.slice(2)];
  return { name: k.name, color: k.color };
}

/* ---- forces present near a hex ---- */
const aiGroup = (a, name) => ({ key: a.id, name, units: { ...(a.units || a.ships) }, ref: a, hex: a.at, stats: a.ships ? (t) => enemyShipStats(t, a.hall) : (u) => enemyUnitStats(u, a.hall) });
function landForcesNear(hex, r = 2) {
  const out = [];
  for (const d of S.divisions) if (d.status !== 'fighting' && WG.dist(d.at, hex) <= r && armyHousing(d.units) > 0) out.push({ team: 'P', kind: 'division', ref: d, group: groupOf(d) });
  const cap = S.world.capital;
  if (WG.dist(cap, hex) <= r + 1) {
    if (COMBAT_UNITS.some((u) => S.army[u] > 0)) out.push({ team: 'P', kind: 'garrison', group: plainGroup('garrison', 'Garrison', S.army, S.castellan, 'line', 'hold', cap) });
    const help = S.allianceId ? S.kingdoms.filter((x) => x.allianceId === S.allianceId).reduce((s2, x) => s2 + x.power * 0.12, 0) : 0;
    if (help > 0) out.push({ team: 'P', kind: 'allies', group: plainGroup('allies', 'Allied reinforcements', armyFromPower(help, 2, 'balanced'), null, 'line', 'advance', cap) });
  }
  const tw = playerTowers(hex);
  if (tw.length) out.push({ team: 'P', kind: 'towers', towers: tw });
  for (const a of S.aiArmies) {
    if (a.status === 'fighting' || WG.dist(a.at, hex) > r || !armyHousing(a.units)) continue;
    const k = S.kingdoms[a.kid];
    out.push({ team: teamOfKingdom(k), kind: 'army', ref: a, group: aiGroup(a, `${k.name} ${a.kind === 'guard' ? 'guard' : a.kind === 'raid' ? 'raiders' : 'army'}`) });
  }
  for (const k of S.kingdoms) {
    if (k.fallen || WG.dist(k.capital, hex) > r + 2 || k.garrisonBusy) continue;
    out.push({ team: teamOfKingdom(k), kind: 'kgarrison', k, group: { key: 'kg' + k.id, name: `${k.name} garrison`, hex: k.capital, units: armyFromPower(k.power, k.hall, k.personality), stats: (u) => enemyUnitStats(u, k.hall) } });
    const kt = aiCity(k).buildings.filter((b) => DEF_TYPES.includes(b.type) && WG.dist(b.hex, hex) <= 3).map((b) => ({ type: b.type, level: b.level, hex: b.hex }));
    if (kt.length) out.push({ team: teamOfKingdom(k), kind: 'ktowers', k, towers: kt });
  }
  return out;
}
function navalForcesNear(hex, r = 2) {
  const out = [];
  for (const f of S.fleets) if (f.status !== 'fighting' && WG.dist(f.at, hex) <= r && shipCount(f.ships) > 0) out.push({ team: 'P', kind: 'fleet', ref: f, group: groupOf(f, true) });
  // ships lying at anchor defend their own harbour — at home or at any shipyard or port
  for (const m of berths()) if (WG.dist(m.hex, hex) <= r + 1 && shipCount(m.ships) > 0) out.push({ team: 'P', kind: 'harbor', berth: m, group: { key: 'harbor:' + m.id, name: m.id === 'home' ? 'Harbour guard' : `${m.name} guard`, hex: m.hex, units: { ...m.ships }, formation: 'line', stance: 'hold', target: 'nearest', stats: (t) => shipStats(t, null, S.boosts) } });
  for (const e of S.aiFleets) {
    if (e.status === 'fighting' || WG.dist(e.at, hex) > r || !shipCount(e.ships)) continue;
    const pirate = e.owner === 'pirate';
    out.push({ team: pirate ? 'X' : teamOfKingdom(S.kingdoms[e.owner]), kind: 'aifleet', ref: e, group: aiGroup(e, pirate ? 'Pirate fleet' : `${S.kingdoms[e.owner].name} navy`) });
  }
  return out;
}
// Assemble a battle at `hex` between `core` teams [attacker, defender] plus everyone nearby who is hostile to someone present.
const COOLDOWN = 30;   // seconds a force rests after a battle before it can be pulled into another
const onCooldown = (e) => e && e.cooldown > S.time;
const battleNear = (hex) => Battles.list.some((b) => !b.done && WG.dist(b.cfg.hex, hex) <= 4);
function gatherBattle(hex, core, opts) {
  if (hex == null || hex < 0 || hex >= WG.N || battleNear(hex)) return null;                     // one battlefield per area at a time
  const naval = opts.kind === 'naval';
  // While the game catches up on time you were away, nobody else's battle drags
  // your forces in: a war between two kingdoms next to your army used to.
  const keepOut = catchingUp() && !core.includes('P');
  const pool = (naval ? navalForcesNear(hex) : landForcesNear(hex)).filter((f) => !onCooldown(f.ref) && !(keepOut && f.team === 'P')).concat(opts.extra || []);
  const inTeams = new Set(core);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of pool) if (!inTeams.has(f.team) && [...inTeams].some((T) => teamsHostile(f.team, T, core))) { inTeams.add(f.team); grew = true; }
  }
  const forces = pool.filter((f) => inTeams.has(f.team));
  const teams = [...inTeams].map((T) => {
    const mine = forces.filter((f) => f.team === T);
    // Allied kingdoms fight on your side but run themselves — you never get handed their armies.
    const groups = mine.filter((f) => f.group).map((f) => (ALLY_KINDS.includes(f.kind) ? { ...f.group, ally: true } : f.group));
    return { id: T, ...teamInfo(T), groups, towers: mine.flatMap((f) => f.towers || []) };
  });
  const hasFighters = (T) => { const t = teams.find((x) => x.id === T); return t && (t.groups.some((g) => Object.values(g.units).some((v) => v > 0)) || t.towers.length); };
  if (!core.every(hasFighters)) return null;
  forces.forEach((f) => { if (f.k && f.kind === 'kgarrison') f.k.garrisonBusy = true; });
  // You only take the field when forces of your own are in it — not when allies squabble on the far side of the world.
  const playerIn = forces.some((f) => f.team === 'P' && !ALLY_KINDS.includes(f.kind));
  const cfg = { kind: opts.kind, hex, title: opts.title, holder: opts.holder, teams, hostile: (a, b) => teamsHostile(a, b, core),
    onEnd: (r) => {
      consumeBoosts();
      const lost = settleForces(forces, r);
      // everyone who fought rests; beaten AI armies fall back home
      for (const f of forces) {
        if (f.ref) f.ref.cooldown = S.time + COOLDOWN;
        const T = r.teams[f.team];
        if (f.kind === 'army' && T && !T.won && S.aiArmies.includes(f.ref)) {
          const k = S.kingdoms[f.ref.kid];
          if (f.ref.kind !== 'guard') f.ref.kind = 'home';
          f.ref.path = findPath(WG, f.ref.at, k.capital, aiLandCost) || []; f.ref.status = f.ref.path.length ? 'moving' : 'idle';
        }
      }
      if (r.teams.P && playerIn) {   // every battle your own forces take part in counts, however it started
        const key = opts.kind === 'naval' ? 'naval' : 'battles';
        S.stats[key + (r.win ? 'Won' : 'Lost')]++;
      }
      if (opts.onEnd) opts.onEnd(r, lost, teams);
    } };
  return Battles.start(cfg, playerIn && !opts.offline && SETTINGS.battleMode === 'watch' && S.started && Battles.list.filter((b) => !b.done).length < 3);
}
// Apply each force's survivors back to the world after a battle.
function settleForces(forces, r) {
  const lostAll = {};
  const surv = (T, key) => ((r.teams[T] || { groups: [] }).groups.find((g) => g.key === key) || { survivors: {} }).survivors;
  for (const f of forces) {
    if (f.kind === 'division') { const l = applyCasualties(f.ref.units, surv('P', f.ref.id), COMBAT_UNITS); for (const [k, v] of Object.entries(l)) lostAll[k] = (lostAll[k] || 0) + v; removeDivisionIfEmpty(f.ref); }
    else if (f.kind === 'fleet') { const l = applyCasualties(f.ref.ships, surv('P', f.ref.id), SHIP_TYPES); for (const [k, v] of Object.entries(l)) lostAll[k] = (lostAll[k] || 0) + v; removeFleetIfEmpty(f.ref); }
    else if (f.kind === 'garrison') { const l = applyCasualties(S.army, surv('P', 'garrison'), COMBAT_UNITS); for (const [k, v] of Object.entries(l)) lostAll[k] = (lostAll[k] || 0) + v; }
    else if (f.kind === 'harbor') { const l = applyCasualties((berthById(f.berth.id) || f.berth).ships, surv('P', 'harbor:' + f.berth.id), SHIP_TYPES); for (const [k, v] of Object.entries(l)) lostAll[k] = (lostAll[k] || 0) + v; }
    else if (f.kind === 'army') {
      const left = surv(f.team, f.ref.id); f.ref.units = { ...emptyArmy(), ...left };
      f.ref.status = f.ref.path.length ? 'moving' : 'idle';
      if (!armyHousing(f.ref.units)) S.aiArmies = S.aiArmies.filter((x) => x !== f.ref);
    } else if (f.kind === 'aifleet') {
      const left = surv(f.team, f.ref.id); f.ref.ships = { ...emptyFleet(), ...left };
      f.ref.status = f.ref.path.length ? 'moving' : 'idle';
      if (!shipCount(f.ref.ships)) S.aiFleets = S.aiFleets.filter((x) => x !== f.ref);
    } else if (f.kind === 'kgarrison') {
      f.k.garrisonBusy = false;
      f.k.power = Math.max(50, enemyArmyPower(surv(f.team, 'kg' + f.k.id), f.k.hall) + f.k.power * 0.15);
    } else if (f.kind === 'ktowers') {
      const T = r.teams[f.team];
      if (T && T.towersStart) f.k.defense = Math.max(20, f.k.defense * (0.4 + 0.6 * T.towersLeft / T.towersStart));
    }
  }
  return lostAll;
}
function bandits(hex, power, tier, towers) {
  const walls = Array.from({ length: towers || 0 }, (_, i) => ({ type: i % 2 && tier >= 3 ? 'cannon' : 'tower', level: tier, hex: WG.neighbors(hex)[i * 2 % 6] ?? hex }));
  return { team: 'B', kind: 'bandits', group: { key: 'bandits', name: 'Bandits', hex, units: armyFromPower(power, tier, 'balanced'), stats: (u) => enemyUnitStats(u, tier) }, towers: walls };
}

/* ---------- player order arrivals ---------- */
function arrive(ent) {
  const o = ent.order || { type: 'move' };
  if (isScout(ent)) return scoutArrive(ent);
  ent.status = 'idle';
  const f = S.world.feat[o.hex], owner = S.world.owner[o.hex];
  if (isFleet(ent)) return arriveFleet(ent, o, f);
  const d = ent;
  if (o.type === 'defend') { /* hold this ground — the detection ring does the rest */ }
  else if (o.type === 'claim') { if (claimTile(o.hex, 2)) reveal(d.at, 3); }
  else if (o.type === 'explore' && f && f.type === 'ruins' && !f.looted) {
    gatherBattle(o.hex, ['P', 'B'], { kind: 'land', title: `🏛️ ${d.name} explores the ruins`, extra: [bandits(o.hex, f.guard, f.tier)],
      onEnd: (r, lost) => {
        if (r.win) {
          f.looted = true; featChanged(); S.stats.ruinsExplored++;
          const loot = lootTier(f.tier); gain(loot, true);
          report(`🏛️ ${d.name} cleared the ruins: ${costText(loot)}. ${bonusDrop(f.tier)}`, 'good', lost);
        } else report('🏛️ Your troops were driven off by the bandits guarding the ruins.', 'bad', lost);
      } });
  } else if (o.type === 'explore' && f && f.type === 'cave') {
    const was = f.explored; f.explored = true; featChanged();
    const loot = { [Object.keys(MINERALS[f.mineral].bonus)[0]]: f.mineral === 'gems' ? 12 : 150 };
    if (!was) { gain(loot, true); log(`${d.name} explored a cave: ${MINERALS[f.mineral].name}! Claim the hex and build a Mine.`, 'good'); toast(`🕳️ Cave holds ${MINERALS[f.mineral].name} (+${costText(loot)})`, 'good'); }
  } else if (o.type === 'capture' && f && f.type === 'fort' && !f.captured) {
    gatherBattle(o.hex, ['P', 'B'], { kind: 'land', title: `🏯 ${d.name} storms the abandoned fort`, extra: [bandits(o.hex, f.guard * 0.7, f.tier + 1, 2)],
      onEnd: (r, lost) => {
        if (r.win) {
          f.captured = true; featChanged(); S.world.owner[o.hex] = -2; ownedChanged(); reveal(o.hex, 3);
          report(`🏯 ${d.name} captured the fort! It is now your land.`, 'good', lost);
        } else report("🏯 The fort's defenders held.", 'bad', lost);
      } });
  } else if (o.type === 'attack' && owner >= 0) {
    const k = S.kingdoms[owner];
    if (teamOfKingdom(k) === 'P') { toast(`${k.name} is your ally`, 'bad'); return; }
    provoke(k);
    if (!invade(d, k, o.hex)) holdAttack(d, o.hex);
  } else if (o.type === 'attack-army') {
    const a = S.aiArmies.find((x) => x.id === o.target);
    if (a && WG.dist(a.at, d.at) <= 2) { provoke(S.kingdoms[a.kid]); fieldBattle(d.at, 'P', teamOfKingdom(S.kingdoms[a.kid]), `⚔️ ${d.name} attacks the ${S.kingdoms[a.kid].name} army`); }
  } else if (o.type === 'return' || d.at === S.world.capital) {
    if (d.at === S.world.capital) toast(`${d.name} is home`);
  } else toast(`${d.name} arrived`);
  UI.panelDirty = true;
}
// Attacking someone you are not at war with sours relations enough to make them hostile.
function provoke(k) { if (!hostileToPlayer(k)) { k.relation = Math.min(k.relation, -40); k.treaty = 0; k.tradePact = false; log(`Your attack has made ${k.name} hostile.`, 'bad'); } }
function costText(c) { return Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${RES_META[k].icon}${fmt(v)}`).join(' '); }
function report(msg, kind, lost) {
  const txt = msg + (lost && Object.keys(lost).length ? ` Losses: ${lostText(lost, { ...UNITS, ...SHIPS })}.` : '');
  log(txt, kind); toast(txt, kind);
}
function fieldBattle(hex, A, B, title, offline) {
  return gatherBattle(hex, [A, B], { kind: 'land', title, offline,
    onEnd: (r, lost) => {
      const p = r.teams.P;
      if (!p) return;
      if (r.win) { gain({ gold: 120 }); report(`${title}: victory!`, 'good', lost); }
      else { report(`${title}: defeat.`, 'bad', lost); }
    } });
}
function assaultCapital(d, k) {
  if (!S.intel[k.id]) gatherIntel(k);
  const T = teamOfKingdom(k);
  return gatherBattle(k.capital, ['P', T], { kind: 'land', title: `⚔️ Assault on ${k.name}`, holder: T,
    onEnd: (r, lost) => {
      k.relation -= r.win ? 30 : 15;
      S.kingdoms.forEach((o) => { if (o !== k && o.allianceId && o.allianceId === k.allianceId) o.relation -= 10; });
      if (r.win) {
        const loot = {};
        for (const res of RES) { const v = Math.floor(k.res[res] * 0.3 + (res === 'diamonds' ? 3 : 150) * k.hall); loot[res] = v; k.res[res] = Math.max(0, k.res[res] - v); }
        gain(loot); k.defeats++;
        let tiles = 0;
        for (let n = 0; n < 8; n++) if (playerTiles() < territoryLimit() && transferBorderTile(k.id, -2) >= 0) tiles++;
        if (checkSiege(k)) return;   // the city is cut off and surrenders — the fall is the report
        gatherIntel(k);
        report(`⚔️ Victory over ${k.name}! Loot ${costText(loot)}${tiles ? `, ${tiles} hex${tiles > 1 ? 'es' : ''} seized` : ''}.`, 'good', lost);
      } else { report(`⚔️ The assault on ${k.name} failed.`, 'bad', lost); }
      if (S.divisions.includes(d) && WG.dist(d.at, k.capital) <= 2) giveOrder(d, 'move', neighborsFree(d.at, k.capital));
    } });
}
/* ---------- invasions ----------
   An invasion that could not start used to vanish without a word: a division that
   had just fought a guard army on the way in was still catching its breath when it
   arrived, or another battle was raging nearby, and the order was simply dropped.
   Now the division holds its ground and attacks the moment it can. */
function invade(d, k, hex) {
  if (k.fallen || S.world.owner[hex] !== k.id) return true;
  if (hex === k.capital) return !!assaultCapital(d, k);
  return !!skirmish(d, k, hex);
}
function holdAttack(d, hex) {
  if (d.waitAttack === hex) return;
  d.waitAttack = hex;
  const why = onCooldown(d) ? `regrouping after its last fight (${Math.ceil(d.cooldown - S.time)}s)` : 'waiting for the battle nearby to end';
  log(`⏳ ${d.name} is ${why} and will attack ${hexName(hex)} as soon as it can.`, 'info');
  UI.panelDirty = true;
}
function retryAttacks() {
  for (const d of [...S.divisions]) {
    const hex = d.waitAttack;
    if (hex == null) continue;
    if (d.path.length || !d.order || d.order.type !== 'attack' || d.order.hex !== hex) { d.waitAttack = null; continue; }
    if (d.status === 'fighting' || onCooldown(d) || battleNear(hex)) continue;
    const o = S.world.owner[hex], k = o >= 0 ? S.kingdoms[o] : null;
    if (!k || k.fallen || teamOfKingdom(k) === 'P') { d.waitAttack = null; UI.panelDirty = true; continue; }
    if (invade(d, k, hex)) { d.waitAttack = null; UI.panelDirty = true; }
  }
}
// Take an enemy hex and its neighbours (never the capital itself), then see whether the capital is cut off.
function seizeAround(k, hex) {
  const taken = [hex].concat(WG.neighbors(hex)).filter((j) => S.world.owner[j] === k.id && j !== k.capital);
  for (const j of taken) { S.world.owner[j] = -2; markChunks(j); }
  if (taken.length) ownedChanged();
  checkSiege(k);
  return taken.length;
}
/* ---------- a kingdom falls ----------
   Hold every hex of open ground around a kingdom's capital and the city is cut
   off: it surrenders, and its whole realm becomes yours. */
const liveKingdoms = () => S.kingdoms.filter((k) => !k.fallen);
function capitalRing(k) { return WG.neighbors(k.capital).filter((n) => isPassable(n)); }
function checkSiege(k) {
  if (!k || k.fallen) return false;
  const ring = capitalRing(k);
  if (!ring.length || !ring.every((n) => S.world.owner[n] === -2)) return false;
  kingdomFalls(k);
  return true;
}
function kingdomFalls(k) {
  k.fallen = true; k.fellAt = S.time;
  k.atWar = false; k.treaty = 0; k.tradePact = false; k.relation = 0; k.wars = {};
  const loot = {};
  for (const res of RES) { const v = Math.floor(Math.max(0, k.res[res] || 0) * 0.6); if (v) loot[res] = v; k.res[res] = 0; }
  gain(loot, true);
  let land = 0;
  const { owner } = S.world;
  for (let i = 0; i < owner.length; i++) if (owner[i] === k.id) { owner[i] = -2; land++; }
  owner[k.capital] = -2;
  for (const j of WG.within(k.capital, 4 + k.hall)) markChunks(j);
  ownedChanged();
  // its armies lay down their arms and its ships strike their colours
  S.aiArmies = S.aiArmies.filter((a) => a.kid !== k.id || a.status === 'fighting');
  S.aiArmies.forEach((a) => { if (a.kid === k.id) a.kind = 'home'; });
  S.aiFleets = S.aiFleets.filter((f) => f.owner !== k.id || f.status === 'fighting');
  if (k.allianceId) {
    const a = allianceOf(k.allianceId);
    if (a) {
      a.members = a.members.filter((m) => m !== k.id);
      if (a.leader === k.id) a.leader = a.members[0] ?? null;
      if (!a.members.length) S.alliances = S.alliances.filter((x) => x !== a);
    }
    k.allianceId = null;
  }
  k.power = 0; k.defense = 0; k.navy = 0;
  S.stats.kingdomsConquered = (S.stats.kingdomsConquered || 0) + 1;
  reveal(k.capital, 4);
  const msg = `👑 ${k.name} has fallen! With its capital surrounded, ${k.ruler} surrendered — ${land + 1} hexes are yours${Object.keys(loot).length ? ` and the treasury yields ${costText(loot)}` : ''}.`;
  log(msg, 'good'); toast(msg, 'good');
  shake(6);
  UI.panelDirty = true;
}
function neighborsFree(at, cap) { if (WG.dist(at, cap) > 2) return at; return WG.within(cap, 5).filter((n) => isPassable(n) && WG.dist(n, cap) >= 4).sort((a, b) => WG.dist(a, at) - WG.dist(b, at))[0] ?? at; }
function skirmish(d, k, hex) {
  const T = teamOfKingdom(k), g = k.power * 0.12 + 30 * k.hall;
  const local = { team: T, kind: 'local', group: { key: 'local', name: `${k.name} militia`, hex, units: armyFromPower(g, k.hall, k.personality), stats: (u) => enemyUnitStats(u, k.hall) } };
  // Nobody to hold the hex but a handful of militia facing a far stronger host: they lay down their arms.
  const defended = landForcesNear(hex).some((f) => f.team !== 'P' && teamsHostile(f.team, 'P', ['P', T]));
  if (!defended && armyPower(d.units, d.general) >= 3 * enemyArmyPower(local.group.units, k.hall)) {
    k.relation -= 10;
    const n = seizeAround(k, hex);
    if (!k.fallen) report(`🏳️ ${k.name}'s militia laid down their arms before ${d.name} — ${n} hex${n === 1 ? '' : 'es'} taken without a fight.`, 'good');
    UI.panelDirty = true;
    return true;
  }
  return gatherBattle(hex, ['P', T], { kind: 'land', title: `🏳️ ${d.name} invades ${k.name}'s land`, extra: [local], holder: T,
    onEnd: (r, lost) => {
      k.relation -= 10; k.power = Math.max(60, k.power - g * 0.5);
      if (r.win) {
        const n = seizeAround(k, hex);
        if (!k.fallen) report(`🏳️ Conquered ${n} hex${n === 1 ? '' : 'es'} of ${k.name}.`, 'good', lost);
        else if (lost && Object.keys(lost).length) report('🏳️ The last stand is over.', 'good', lost);
      } else { report(`🏳️ Repelled by ${k.name}.`, 'bad', lost); }
    } });
}

function arriveFleet(fl, o, f) {
  if (o.type === 'salvage' && f && f.type === 'wreck' && !f.salvaged) {
    f.salvaged = true; featChanged(); S.stats.wrecksSalvaged++;
    const loot = lootTier(f.tier, 0.8); gain(loot, true);
    report(`⚓ ${fl.name} salvaged the wreck: ${costText(loot)}. ${bonusDrop(f.tier)}`, 'good');
  } else if (o.type === 'cove' && f && f.type === 'cove' && !f.destroyed) {
    const coveGuns = [{ type: 'cannon', level: 3, hex: fl.at }, { type: 'tower', level: 3, hex: WG.neighbors(fl.at)[0] ?? fl.at }];
    const cove = { team: 'X', kind: 'cove', group: { key: 'cove', name: 'Pirate cove', hex: fl.at, units: fleetFromPower(f.power, 3), stats: (t) => enemyShipStats(t, 3) }, towers: coveGuns };
    gatherBattle(fl.at, ['P', 'X'], { kind: 'naval', title: `🏴‍☠️ ${fl.name} attacks the pirate cove`, extra: [cove], holder: 'X',
      onEnd: (r, lost) => {
        if (r.win) { f.destroyed = true; featChanged(); const loot = lootTier(3, 1.6); gain(loot, true); report(`🏴‍☠️ The pirate cove burns! Treasure: ${costText(loot)}. ${bonusDrop(3)}`, 'good', lost); }
        else { report('🏴‍☠️ The pirates drove your fleet off.', 'bad', lost); }
      } });
  } else if (o.type === 'blockade') {
    const k = S.kingdoms[o.kid], T = teamOfKingdom(k);
    provoke(k);
    const navy = { team: T, kind: 'knavy', k, group: { key: 'knavy', name: `${k.name} home fleet`, hex: fl.at, units: fleetFromPower(Math.max(40, k.navy), k.hall), stats: (t) => enemyShipStats(t, k.hall) }, towers: aiCity(k).buildings.filter((b) => DEF_TYPES.includes(b.type) && WG.dist(b.hex, fl.at) <= 3).map((b) => ({ type: b.type, level: b.level, hex: b.hex })) };
    gatherBattle(fl.at, ['P', T], { kind: 'naval', title: `⚓ ${fl.name} blockades ${k.name}`, extra: [navy], holder: T,
      onEnd: (r, lost) => {
        const left = (r.teams[T] || { groups: [] }).groups.find((g) => g.key === 'knavy');
        k.navy = Math.max(0, enemyFleetPower(left ? left.survivors : {}, k.hall)); k.relation -= 20;
        if (r.win) {
          const loot = { gold: Math.floor(k.res.gold * 0.25 + 200 * k.hall), food: Math.floor(k.res.food * 0.2) };
          k.res.gold -= loot.gold; k.res.food -= loot.food; gain(loot);
          report(`⚓ Blockade of ${k.name} succeeded: ${costText(loot)} plundered.`, 'good', lost);
        } else { report(`⚓ ${k.name}'s navy broke the blockade.`, 'bad', lost); }
      } });
  } else if (o.type === 'hunt') {
    const e = S.aiFleets.find((x) => x.id === o.target);
    if (e && WG.dist(e.at, fl.at) <= 2) navalEngage(fl, e);
  } else toast(`${fl.name} ${fleetHome(fl) ? 'is in harbour' : 'arrived'}`);
  UI.panelDirty = true;
}
function navalEngage(fl, e) {
  const pirate = e.owner === 'pirate', T = pirate ? 'X' : teamOfKingdom(S.kingdoms[e.owner]);
  if (!pirate) provoke(S.kingdoms[e.owner]);
  gatherBattle(e.at, ['P', T], { kind: 'naval', title: `⚓ Sea battle with the ${pirate ? 'pirates' : S.kingdoms[e.owner].name + ' navy'}`,
    onEnd: (r, lost) => {
      if (r.win) { const loot = { gold: Math.round(enemyFleetPower(e.ships, e.hall) * 1.5 + 100) }; gain(loot); report(`⚓ Victory at sea! +${costText(loot)}.`, 'good', lost); }
      else if (r.teams.P) { report('⚓ Your fleet lost the sea battle.', 'bad', lost); }
    } });
}

/* ---------- AI kingdoms ---------- */
const hostileToPlayer = (k) => k && !(S.allianceId && k.allianceId === S.allianceId) && k.treaty <= 0 && (k.atWar || k.relation < -35);
// Standing forces every kingdom keeps: guard armies on its land and navy patrols at sea.
function initAiForces(k) {
  k.wars = k.wars || {};
  k.guardsInit = true;
  const n = 1 + Math.floor(k.hall / 2);
  for (let i = S.aiArmies.filter((a) => a.kid === k.id && a.kind === 'guard').length; i < n; i++) spawnGuard(k);
  if (k.coastal) for (let i = S.aiFleets.filter((f) => f.owner === k.id).length; i < 1 + Math.floor(k.hall / 3); i++) spawnAiFleet(k, true);
}
function spawnGuard(k) {
  const own = WG.within(k.capital, 7).filter((i) => S.world.owner[i] === k.id && isPassable(i) && WG.dist(i, k.capital) >= 3);
  const at = own.length ? pick(own) : k.capital;
  const power = Math.max(160, k.power * 0.3);
  k.power = Math.max(60, k.power - power * 0.3);
  S.aiArmies.push({ id: 'g' + uid(), kid: k.id, kind: 'guard', units: armyFromPower(power, k.hall, k.personality), hall: k.hall, at, path: [], prog: 0, target: at, status: 'idle' });
}
function aiTurn(offline) {
  const pp = totalPower();
  for (const k of liveKingdoms()) {
    for (const r of Object.keys(k.res)) k.res[r] += (r === 'diamonds' ? 1 : 70) * k.hall;
    const w = { ...PERSONALITIES[k.personality].w };
    if (k.power < pp * 0.5) w.train += 3;
    if (k.hall >= AI_MAX_HALL) w.upgrade = 0;
    const action = weighted(w), visible = isSeen(k.capital);
    if (action === 'expand') {
      const limit = (6 + 4 * k.hall) * 7;
      if (kingdomTiles(k.id) < limit) {
        // only the kingdom's own neighbourhood is scanned, never the whole map
        const cand = [];
        const { owner } = S.world;
        const reach = 8 + Math.ceil(Math.sqrt(kingdomTiles(k.id) + 1)) * 2;
        for (const i of WG.within(k.capital, reach)) if (owner[i] === k.id) for (const n of WG.neighbors(i)) if (owner[n] === -1 && isPassable(n) && !(S.world.feat[n] && ['fort', 'ruins'].includes(S.world.feat[n].type))) cand.push(n);
        if (cand.length) {
          cand.sort((a, b) => WG.dist(a, k.capital) - WG.dist(b, k.capital));
          const c0 = cand[Math.floor(Math.random() * Math.min(6, cand.length))];
          for (const j of [c0].concat(WG.neighbors(c0))) if (owner[j] === -1 && isPassable(j)) owner[j] = k.id;
          worldVersion++;
        } else k.power += 10 + k.hall * 8;
      } else k.defense += 10;
    } else if (action === 'upgrade') {
      const need = 600 * Math.pow(2.2, k.hall);
      if (k.res.gold >= need && k.res.lumber >= need * 0.8) {
        k.res.gold -= need; k.res.lumber -= need * 0.8; k.hall++; k.power *= 1.1; k.defense *= 1.1;
        if (visible && !offline) log(`${k.name} upgraded its keep to level ${k.hall}.`, 'info');
      } else k.defense += 6;
    } else if (action === 'build') k.defense += 12 + k.hall * 6;
    else k.power += 15 + k.hall * 10;
    if (k.coastal) k.navy += 6 + k.hall * 4;
    if (k.treaty > 0) k.relation += 0.5;
    k.relation += k.relation > 0 ? -0.3 : 0.4;
    if (k.atWar) k.relation = Math.min(k.relation, -60);
    if (k.tradePact && k.relation < 10) { k.tradePact = false; log(`${k.name} cancelled your trade pact.`, 'bad'); }
    k.relation = clamp(k.relation, -100, 100);
    // standing forces: replace lost guards and patrols, move guards around the realm
    const guards = S.aiArmies.filter((a) => a.kid === k.id && a.kind === 'guard');
    if (guards.length < 1 + Math.floor(k.hall / 2) && k.power > 150 && Math.random() < 0.4) spawnGuard(k);
    for (const gd of guards) if (!gd.path.length && gd.status !== 'fighting' && Math.random() < 0.25) {
      const own = WG.within(k.capital, 3 + k.hall * 2).filter((i) => S.world.owner[i] === k.id && isPassable(i));
      const tgt = pick(own.length ? own : [k.capital]);
      gd.path = findPath(WG, gd.at, tgt, aiLandCost, 20000) || []; gd.status = gd.path.length ? 'moving' : 'idle';
    }
    if (k.coastal && k.navy > 50 && S.aiFleets.filter((f) => f.owner === k.id).length < 1 + Math.floor(k.hall / 3) && Math.random() < 0.4) spawnAiFleet(k, true);
  }
  // Wars between AI kingdoms — armies you can watch (or join!) on the map.
  if (Math.random() < 0.15 && S.aiArmies.filter((a) => a.kind === 'war').length < 4) {
    const a = pick(liveKingdoms().filter((k) => k.personality === 'aggressive' || k.personality === 'expansionist'));
    const targets = a ? liveKingdoms().filter((k) => k !== a && teamOfKingdom(k) !== teamOfKingdom(a) && WG.dist(k.capital, a.capital) < 55) : [];
    if (targets.length) {
      const b = pick(targets);
      if (spawnAiArmy(a, b.capital, 'war', a.power * 0.4)) { a.wars[b.id] = b.wars[a.id] = S.time + 900; if (!offline && (isSeen(a.capital) || isSeen(b.capital))) log(`⚔️ ${a.name} declared war on ${b.name}!`, 'info'); }
    }
  }
  allianceTurn(offline);
  UI.panelDirty = true;
}
function spawnAiArmy(k, targetHex, kind, power) {
  const path = findPath(WG, k.capital, targetHex, aiLandCost);
  if (!path || !path.length) return null;
  power = Math.max(60, power);
  k.power = Math.max(40, k.power - power);
  const a = { id: 'a' + uid(), kid: k.id, kind, units: armyFromPower(power, k.hall, k.personality), hall: k.hall, at: k.capital, path, prog: 0, target: targetHex, status: 'moving' };
  S.aiArmies.push(a);
  return a;
}
function spawnAiFleet(k, patrol) {
  const start = nearestWaterTo(k.capital, k.capital);
  if (start < 0 || !OCEAN[start]) return;
  const power = Math.max(60, k.navy * 0.5);
  k.navy = Math.max(0, k.navy - power);
  S.aiFleets.push({ id: 'n' + uid(), owner: k.id, ships: fleetFromPower(power, k.hall), hall: k.hall, at: start, home: start, path: [], prog: 0, life: patrol ? Infinity : rand(240, 480), status: 'moving', patrol: !!patrol });
}
function spawnPirates() {
  const coves = Object.entries(S.world.feat).filter(([, f]) => f.type === 'cove' && !f.destroyed);
  if (!coves.length || S.aiFleets.filter((f) => f.owner === 'pirate').length >= 2) return;
  const [ci, cf] = pick(coves);
  const start = nearestWaterTo(+ci, +ci);
  if (start < 0) return;
  S.aiFleets.push({ id: 'p' + uid(), owner: 'pirate', ships: fleetFromPower(cf.power * 0.5 + S.time * 0.02, 2), hall: 2, at: start, home: start, path: [], prog: 0, life: 360, status: 'moving', hunt: true });
  if (isSeen(start)) log('🏴‍☠️ A pirate fleet has put to sea!', 'bad');
}
const aiFleetHostile = (f) => f.owner === 'pirate' || hostileToPlayer(S.kingdoms[f.owner]);
const aiSpeed = (a) => Math.min(...COMBAT_UNITS.filter((u) => a.units[u] > 0).map((u) => UNITS[u].speed), 1.2);

function stepAiArmies(dt, offline) {
  callOffFriendlyRaids();
  for (const a of [...S.aiArmies]) {
    if (a.status === 'fighting') continue;
    const k = S.kingdoms[a.kid];
    const done = advance(a, dt, aiSpeed(a), aiLandCost, HEX_TIME_LAND);
    if (!done) continue;
    a.status = 'idle';
    if (a.kind === 'guard') continue;
    if (a.kind === 'home') { S.aiArmies = S.aiArmies.filter((x) => x !== a); k.power += enemyArmyPower(a.units, a.hall); continue; }
    if (a.kind === 'raid') { resolveRaid(a, offline); continue; }
    // AI-vs-AI war: a real battle at the target capital (you can join if you are nearby!)
    const target = S.kingdoms.find((x) => x.capital === a.target);
    if (!target) { S.aiArmies = S.aiArmies.filter((x) => x !== a); continue; }
    if (target.fallen) { a.kind = 'home'; a.path = findPath(WG, a.at, k.capital, aiLandCost) || []; continue; }   // nothing left to besiege
    const TA = teamOfKingdom(k), TB = teamOfKingdom(target);
    const bt = gatherBattle(target.capital, [TA, TB], { kind: 'land', title: `⚔️ ${k.name} besieges ${target.name}`, holder: TB, offline,
      onEnd: (r) => {
        const won = r.teams[TA] && r.teams[TA].won;
        const vis = !offline && (isSeen(k.capital) || isSeen(target.capital));
        if (won) { const t = transferBorderTile(target.id, k.id); if (vis) log(`⚔️ ${k.name} defeated ${target.name}${t >= 0 ? ' and seized land' : ''}.`, 'info'); }
        else if (vis) log(`⚔️ ${target.name} repelled ${k.name}'s siege.`, 'info');
        const me = S.aiArmies.find((x) => x === a);
        if (me) { me.kind = 'home'; me.path = findPath(WG, me.at, k.capital, aiLandCost) || []; }
      } });
    if (!bt) { a.kind = 'home'; a.path = findPath(WG, a.at, k.capital, aiLandCost) || []; }
  }
}
function stepAiFleets(dt) {
  for (const f of [...S.aiFleets]) {
    if (f.status === 'fighting') continue;
    f.life -= dt;
    if (f.life <= 0 && !f.path.length) {
      S.aiFleets = S.aiFleets.filter((x) => x !== f);
      if (f.owner !== 'pirate') S.kingdoms[f.owner].navy += enemyFleetPower(f.ships, f.hall);
      continue;
    }
    if (!f.path.length || (f.hunt && Math.random() < dt * 0.3)) {
      let goal = -1;
      if (aiFleetHostile(f)) {
        const prey = S.fleets.filter((pf) => WG.dist(pf.at, f.at) <= (f.owner === 'pirate' ? 30 : 18)).sort((a, b) => WG.dist(a.at, f.at) - WG.dist(b.at, f.at))[0];
        if (prey) goal = prey.at;
        else if (f.owner === 'pirate' && WG.dist(f.at, S.world.harbor) < 55 && Math.random() < 0.5) goal = S.world.harbor;
      }
      if (f.life <= 0) goal = f.home;
      if (goal < 0) goal = pick(WG.within(f.home, f.patrol ? 38 : 20).filter((i) => OCEAN[i]));
      f.path = findPath(WG, f.at, goal, fleetCost, 30000) || [];
    }
    advance(f, dt, Math.min(...SHIP_TYPES.filter((t) => f.ships[t] > 0).map((t) => SHIPS[t].speed), 1.6) * 0.8, fleetCost, HEX_TIME_SEA);
    if (f.owner === 'pirate' && f.at === S.world.harbor) { if (catchingUp()) S.aiFleets = S.aiFleets.filter((x) => x !== f); else piratesAtHarbor(f); }
  }
}
function piratesAtHarbor(p) {
  if (S.started && berths().some((m) => WG.dist(m.hex, S.world.harbor) <= 3 && shipCount(m.ships) > 0)) {
    gatherBattle(S.world.harbor, ['P', 'X'], { kind: 'naval', title: '🏴‍☠️ Pirates attack your harbour!', holder: 'P',
      onEnd: (r, lost) => {
        if (r.win) { gain({ gold: 300 }); report('🏴‍☠️ Your harbour guard sank the pirates! +💰300 bounty.', 'good', lost); }
        else { S.pirateBlockade = 180; report('🏴‍☠️ Pirates overwhelmed the harbour and blockade your port for 3 minutes.', 'bad', lost); }
      } });
  } else {
    const stolen = Math.floor(S.res.gold * 0.08);
    S.res.gold -= stolen; S.pirateBlockade = 180;
    S.aiFleets = S.aiFleets.filter((x) => x !== p);
    report(`🏴‍☠️ Pirates raided your undefended harbour, stole 💰${fmt(stolen)} and blockade your port for 3 minutes. Build warships!`, 'bad');
  }
}

/* ---------- raids on the player ----------
   Raiders look for your weakest land: undefended hexes (no division stationed,
   no watchtower/fortress) close to them are prime targets; the capital is
   attacked less often. Station divisions and build forts to protect land. */
// Which land an army can walk to from your capital: one flood fill for the whole
// map, instead of a long path search per kingdom.
let mainland = null, mainlandSeed = null;
function mainlandSet() {
  if (mainland && mainlandSeed === S.seed) return mainland;
  mainlandSeed = S.seed;
  const r = new Uint8Array(WG.N), q = [S.world.capital];
  r[S.world.capital] = 1;
  for (let h = 0; h < q.length; h++) for (const n of WG.neighbors(q[h])) if (!r[n] && isFinite(aiLandCost(n))) { r[n] = 1; q.push(n); }
  return (mainland = r);
}
function canReachCapital(k) { return !!mainlandSet()[k.capital]; }
function raidCandidates() {
  return liveKingdoms().filter((k) => !friendlyToPlayer(k) && (k.atWar || k.relation < 0 || k.personality === 'aggressive'));
}
// Raids came every five to eight minutes, which left no time to play anything
// else. Now it is closer to once an hour (sooner with a big Main Hall or a war).
function scheduleRaid() { S.raidTimer = rand(2800, 5000) / (1 + 0.08 * hallLevel()) * (S.kingdoms.some((k) => k.atWar) ? 0.6 : 1); }
// A kingdom you are allied with, or have a treaty with, does not attack you.
const friendlyToPlayer = (k) => !!k && ((S.allianceId && k.allianceId === S.allianceId) || k.treaty > 0);
// Armies already marching on you turn back the moment their kingdom becomes a
// friend — joining your alliance used to leave the raid coming anyway.
function callOffFriendlyRaids() {
  for (const a of S.aiArmies) {
    if (a.kind !== 'raid' || a.status === 'fighting') continue;
    const k = S.kingdoms[a.kid];
    if (!friendlyToPlayer(k)) continue;
    a.kind = 'home'; a.targetHex = null;
    a.path = findPath(WG, a.at, k.capital, aiLandCost) || []; a.status = a.path.length ? 'moving' : 'idle';
    log(`🤝 ${k.name} called off the army it had sent against you.`, 'good');
  }
}
function raidTargets(k) {
  const out = {};
  const reach = Math.round(80 * MAP_SCALE);
  for (const i of playerLand()) {
    const d = WG.dist(k.capital, i);
    if (d > reach) continue;
    const b = buildingAt(i);
    if (!b && hash2(i, 17) > 0.15) continue;               // mostly aim at buildings — the loot
    const def = hexDefense(i);
    const guarded = defensesNear(i, 3).length > 0 || S.buildings.some((w) => w.type === 'wall' && WG.dist(w.hex, i) <= 2);
    out[i] = (i === S.world.capital ? 0.5 : 1) * (guarded ? 1 : 4) * (1 / (1 + def / 40)) * (1 / (1 + d * 0.04)) * (b ? 1 + 0.5 * b.level : 1);
  }
  return out;
}
function launchRaid(k, forceHex) {
  if (S.shield > 0) { log(`${k.name} considered raiding you but your Peace Shield deters them.`, 'info'); return null; }
  const w = raidTargets(k);
  let a = null;
  for (let tries = 0; tries < 12 && !a; tries++) {
    const hex = forceHex ?? +weighted(w);
    if (hex == null || isNaN(hex)) break;
    a = spawnAiArmy(k, hex, 'raid', k.power * rand(0.35, 0.55));
    if (a) a.targetHex = hex; else delete w[hex];
    if (forceHex != null) break;
  }
  if (!a && forceHex == null) { a = spawnAiArmy(k, S.world.capital, 'raid', k.power * rand(0.35, 0.55)); if (a) a.targetHex = S.world.capital; }  // fall back to the capital
  if (!a) return null;
  const eta = etaAi(a), capital = a.targetHex === S.world.capital;
  const where = capital ? 'your capital' : `${TERRAIN[S.world.terrain[a.targetHex]].name} ${hexName(a.targetHex)}${isDefended(a.targetHex) ? '' : ' (undefended!)'}`;
  log(`⚠️ ${k.name} sent an army against ${where}. ETA ${fmtTime(eta)}. Station a division there or intercept it.`, 'bad');
  toast(`⚠️ ${k.name} army marching on ${where} — ETA ${fmtTime(eta)}`, 'bad');
  return a;
}
function etaAi(a) {
  const sp = Math.min(...COMBAT_UNITS.filter((u) => a.units[u] > 0).map((u) => UNITS[u].speed), 1.2);
  return a.path.reduce((s, i) => s + HEX_TIME_LAND * aiLandCost(i), 0) / sp;
}
/* Your towers, cannons, spires and fortresses within 3 hexes fight in any battle there —
   every one of them, as itself, standing on its own hex. Walls nearby stiffen them. */
function playerTowers(hex = S.world.capital) {
  const walls = S.buildings.filter((b) => b.type === 'wall' && WG.dist(b.hex, hex) <= 4).length;
  const hpMult = 1 + Math.min(0.5, walls * 0.02);
  return defensesNear(hex, 3).map((b) => ({ type: b.type, level: b.level, hex: b.hex, hpMult }));
}
function raidersHome(a, k, units) {
  if (armyHousing(units) <= 0) return;
  S.aiArmies.push({ ...a, id: 'a' + uid(), kind: 'home', status: 'moving', units, path: findPath(WG, a.at, k.capital, aiLandCost) || [], prog: 0 });
}
function resolveRaid(a, offline) {
  const k = S.kingdoms[a.kid], hex = a.targetHex ?? S.world.capital, capital = hex === S.world.capital, T = teamOfKingdom(k);
  if (S.world.owner[hex] !== -2) { raidersHome(a, k, a.units); S.aiArmies = S.aiArmies.filter((x) => x !== a); return; }
  // Nobody comes home to find their realm sacked: a raid that arrives while the
  // game is catching up on time you were away finds the gates shut and leaves.
  if (catchingUp()) {
    log(`🛡️ While you were away, ${k.name}'s army reached ${capital ? 'your capital' : hexName(hex)}, found the gates barred and marched home.`, 'info');
    S.aiArmies = S.aiArmies.filter((x) => x !== a); raidersHome(a, k, a.units);
    return;
  }
  const pillage = (why) => {
    const stolen = {};
    const f = capital ? 1 : 0.35;
    for (const res of RES) { const v = Math.floor(S.res[res] * (res === 'diamonds' ? 0.03 : rand(0.08, 0.16)) * f); stolen[res] = v; S.res[res] -= v; k.res[res] = (k.res[res] || 0) + v; }
    let lostHex = '';
    if (capital) { const t = transferBorderTile(-2, k.id); if (t >= 0 && Math.random() < 0.5) lostHex = ' and seized a border hex'; }
    else {
      const adj = WG.neighbors(hex).some((n) => S.world.owner[n] === k.id);
      const b = buildingAt(hex);
      if (b && b.type !== 'hall') { strandShips(b); S.buildings = S.buildings.filter((x) => x !== b); }
      S.world.owner[hex] = adj ? k.id : -1; ownedChanged();
      lostHex = (b && b.type !== 'hall' ? ` and destroyed your ${BUILDINGS[b.type].name}` : '') + (adj ? `, annexing ${hexName(hex)}` : ` at ${hexName(hex)}`);
    }
    S.stats.raidsLost++;
    report(`🔥 ${k.name} ${why}: plundered ${costText(stolen)}${lostHex}.`, 'bad');
    shake(capital ? 12 : 4);
  };
  const defenders = landForcesNear(hex).filter((f) => f.team === 'P');
  if (!defenders.length) {
    pillage(`pillaged your undefended land ${hexName(hex)}`);
    S.aiArmies = S.aiArmies.filter((x) => x !== a); raidersHome(a, k, a.units);
    return;
  }
  const fought = gatherBattle(hex, [T, 'P'], { kind: 'land', title: capital ? `🛡️ ${k.name} attacks your capital!` : `🛡️ ${k.name} raids ${hexName(hex)}`, holder: 'P', offline,
    onEnd: (r, lost) => {
      k.relation -= 5;
      const me = S.aiArmies.find((x) => x === a);
      if (r.win) {
        const loot = { gold: Math.round(k.res.gold * 0.05 + 100) };
        k.res.gold -= loot.gold; gain(loot); S.stats.raidsRepelled++;
        report(`🛡️ ${k.name}'s raid on ${capital ? 'your capital' : hexName(hex)} was repelled! +💰${fmt(loot.gold)}.`, 'good', lost);
      } else pillage(`broke through at ${capital ? 'your capital' : hexName(hex)}`);
      if (me) { S.aiArmies = S.aiArmies.filter((x) => x !== me); raidersHome(me, k, me.units); }
    } });
  if (!fought) { pillage(`pillaged ${capital ? 'your capital' : hexName(hex)}`); S.aiArmies = S.aiArmies.filter((x) => x !== a); raidersHome(a, k, a.units); }
}

/* ---------- diplomacy ---------- */
const DIPLO = {
  gift(k) { if (!pay({ gold: 200 })) return toast('Not enough gold', 'bad'); k.relation = Math.min(100, k.relation + 8 * (1 + 0.5 * R('diplomacy'))); toast(`${k.ruler} appreciates your gift`, 'good'); },
  treaty(k) {
    if (k.atWar) return toast('Make peace first', 'bad');
    if (k.relation < 10) return toast(`${k.ruler} does not trust you enough (relation 10+)`, 'bad');
    if (!pay({ gold: 400 })) return toast('A treaty costs 💰400', 'bad');
    k.treaty = 1200; k.relation += 5; log(`Non-aggression treaty signed with ${k.name} (20 min).`, 'good'); toast(`🕊️ Treaty signed with ${k.name}`, 'good');
  },
  pact(k) {
    if (k.relation < 35) return toast(`${k.ruler} wants better relations first (35+)`, 'bad');
    k.tradePact = !k.tradePact; toast(k.tradePact ? `⚖️ Trade pact with ${k.name}: +5% gold` : `Trade pact with ${k.name} ended`, k.tradePact ? 'good' : '');
    if (!k.tradePact) k.relation -= 10;
  },
  tribute(k) {
    if (totalPower() > 1.4 * (k.power + k.defense)) {
      const g = Math.floor(k.res.gold * 0.2); k.res.gold -= g; gain({ gold: g }); k.relation -= 20;
      log(`${k.name} paid you 💰${fmt(g)} in tribute.`, 'good'); toast(`${k.ruler} grudgingly pays 💰${fmt(g)}`, 'good');
    } else { k.relation -= 10; toast(`${k.ruler} laughs at your demand`, 'bad'); if (k.personality === 'aggressive' && Math.random() < 0.4) DIPLO.war(k, true); }
  },
  war(k, theyDeclared) {
    k.atWar = true; k.treaty = 0; k.tradePact = false; k.relation = -80;
    S.kingdoms.forEach((o) => { if (o !== k && o.allianceId && o.allianceId === k.allianceId) o.relation -= 15; });
    log(theyDeclared ? `${k.name} declared war on you!` : `You declared war on ${k.name}.`, 'bad'); toast(`⚔️ War with ${k.name}!`, 'bad');
  },
  peace(k) {
    const cost = { gold: 400 * k.hall };
    if (!pay(cost)) return toast(`Peace costs 💰${cost.gold}`, 'bad');
    k.atWar = false; k.relation = -20; log(`Peace made with ${k.name}.`, 'good'); toast(`🕊️ Peace with ${k.name}`, 'good');
  },
};

/* ---------- guard duty ----------
   A division set to guard answers for the block of land it stands on. Whenever a
   hostile army sets foot on — or marches at — any hex connected to it, the
   division marches to meet it, then returns to its post once the land is clear. */
const GUARD_TICK = 3;
function guardThreats() {
  const out = [];
  for (const a of S.aiArmies) {
    if (a.kind === 'home' || a.status === 'fighting' || !armyHousing(a.units)) continue;
    const k = S.kingdoms[a.kid];
    if (!(a.kind === 'raid' || teamsHostile(teamOfKingdom(k), 'P'))) continue;
    const hex = a.kind === 'raid' && a.targetHex != null ? a.targetHex : a.at;
    const comp = componentNear(hex, 2);
    if (comp < 0) continue;
    out.push({ hex, comp, at: a.at, id: a.id, power: armyHousing(a.units), name: k.name });
  }
  return out;
}
function guardDuty(offline) {
  const guards = S.divisions.filter((d) => d.guard && d.status !== 'fighting' && armyHousing(d.units) > 0);
  if (!guards.length) return;
  const threats = guardThreats();
  const taken = new Set();
  for (const d of guards) if (d.guardAt == null || S.world.owner[d.guardAt] !== -2) d.guardAt = d.at;
  // biggest incursions first; each one is answered by the nearest guard that can reach it
  for (const t of threats.sort((a, b) => b.power - a.power)) {
    const free = guards.filter((d) => !taken.has(d) && componentNear(d.guardAt, 3) === t.comp);
    if (!free.length) continue;
    const d = free.sort((a, b) => WG.dist(a.at, t.hex) - WG.dist(b.at, t.hex))[0];
    taken.add(d);
    if (d.order && d.order.type === 'defend' && d.order.hex === t.hex) continue;
    if (d.at === t.hex && !d.path.length) { d.order = { type: 'defend', hex: t.hex }; continue; }
    if (d.guardFail > S.time) continue;                 // no road to it; do not re-plan every few seconds
    if (giveOrder(d, 'defend', t.hex, {}, true)) {
      if (!offline && !d.warned) { d.warned = true; log(`🛡️ ${d.name} is marching to defend ${hexName(t.hex)} from ${t.name}.`, 'bad'); }
    } else { d.guardFail = S.time + 30; taken.delete(d); }
  }
  for (const d of guards) {                    // no call to answer — go back on post
    if (taken.has(d)) continue;
    d.warned = false;
    if (d.order && d.order.type === 'defend') d.order = null;
    if (!d.path.length && d.at !== d.guardAt && d.status !== 'fighting') giveOrder(d, 'move', d.guardAt, {}, true);
  }
}

/* ---------- encounters: armies scout around themselves and engage what they find ----------
   Every army — yours and theirs — watches a ring of hexes around it. March a hostile
   force into that ring and the two sides go at each other without being told to.
   Standing still lets scouts range one hex further. */
const DETECT_R = 2, DETECT_R_IDLE = 3;
const detectRange = (e, idle) => (idle ? DETECT_R_IDLE : DETECT_R) + (e && e.units && e.units.scout > 0 ? 1 : 0);
const crossing = (a, b) => a.path.length && b.path.length && a.path[0] === b.at && b.path[0] === a.at;
function checkEncounters(offline) {
  clearHostileMemo();
  // An army with nobody left in it is not an army; it should not be drawn, and
  // it should certainly not keep being dragged towards fights it cannot join.
  if (S.aiArmies.some((a) => !armyHousing(a.units))) S.aiArmies = S.aiArmies.filter((a) => armyHousing(a.units) > 0 || a.status === 'fighting');
  // While catching up on time you were away, your armies hold their ground
  // rather than fight battle after battle with nobody there to command them.
  const away = catchingUp();
  const land = S.divisions.filter((d) => !away && d.status !== 'fighting' && armyHousing(d.units) > 0 && !onCooldown(d)).map((d) => ({ team: 'P', e: d, zone: !d.path.length }))
    .concat(S.aiArmies.filter((a) => a.status !== 'fighting' && a.kind !== 'home' && armyHousing(a.units) > 0 && !onCooldown(a)).map((a) => ({ team: teamOfKingdom(S.kingdoms[a.kid]), e: a, zone: a.kind === 'guard' && !a.path.length, raid: a.kind === 'raid' })));
  // your towers, cannons, spires and fortresses open fire on hostile armies passing within range
  for (const L of land) {
    if (L.team === 'P' || L.e.status === 'fighting' || !(L.raid || teamsHostile(L.team, 'P')) || !(L.e.path.length || L.raid)) continue;
    if (away || distToTerritory(L.e.at) > 4) continue;    // nowhere near your walls; do not scan every building
    if (playerTowers(L.e.at).length) fieldBattle(L.e.at, 'P', L.team, `🗼 Your defenses open fire on the ${teamInfo(L.team).name} army`, offline);
  }
  /* Two hundred armies means twenty thousand pairs if you compare them all, sixty
     times a second. Bucket them by a coarse cell instead and compare only
     neighbours: nothing further than a cell away can be inside a detection ring. */
  const CELL = 8, bucketOf = (i) => (((WG.col(i) / CELL) | 0) + 1) * 4096 + ((WG.row(i) / CELL) | 0);
  const buckets = new Map();
  land.forEach((L, idx) => { L.idx = idx; const k = bucketOf(L.e.at); const b = buckets.get(k); if (b) b.push(L); else buckets.set(k, [L]); });
  for (const A of land) {
    if (A.e.status === 'fighting') continue;
    const c = (WG.col(A.e.at) / CELL | 0) + 1, r = WG.row(A.e.at) / CELL | 0;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const bucket = buckets.get((c + dc) * 4096 + r + dr);
      if (!bucket) continue;
      for (const B of bucket) {
        if (B.idx <= A.idx || A.team === B.team || A.e.status === 'fighting' || B.e.status === 'fighting') continue;
        const d = WG.dist(A.e.at, B.e.at);
        const reach = Math.max(detectRange(A.e, A.zone), detectRange(B.e, B.zone));
        if (!(d <= reach || crossing(A.e, B.e))) continue;
        const hostile = teamsHostile(A.team, B.team) || ((A.raid || B.raid) && (A.team === 'P' || B.team === 'P'));
        if (!hostile) continue;
        const hex = A.e.path && A.e.path.length ? A.e.at : B.e.at;
        const pl = A.team === 'P' ? A : B.team === 'P' ? B : null;
        const title = pl ? `⚔️ ${pl.e.name} engages the ${teamInfo(pl === A ? B.team : A.team).name} army` : `⚔️ ${teamInfo(A.team).name} clashes with ${teamInfo(B.team).name}`;
        fieldBattle(hex, A.team, B.team, title, offline);
      }
    }
  }
  const sea = S.fleets.filter((f) => !away && f.status !== 'fighting' && !onCooldown(f)).map((f) => ({ team: 'P', e: f }))
    .concat(S.aiFleets.filter((f) => f.status !== 'fighting' && !onCooldown(f)).map((f) => ({ team: f.owner === 'pirate' ? 'X' : teamOfKingdom(S.kingdoms[f.owner]), e: f })));
  for (let i = 0; i < sea.length; i++) for (let j = i + 1; j < sea.length; j++) {
    const A = sea[i], B = sea[j];
    if (A.team === B.team || A.e.status === 'fighting' || B.e.status === 'fighting') continue;
    if (Math.abs(WG.row(A.e.at) - WG.row(B.e.at)) > 2 || WG.dist(A.e.at, B.e.at) > 2 || !teamsHostile(A.team, B.team)) continue;
    const pl = A.team === 'P' ? A : B.team === 'P' ? B : null;
    gatherBattle(B.e.at, [A.team, B.team], { kind: 'naval', offline, title: pl ? `⚓ ${pl.e.name} engages the ${teamInfo(pl === A ? B.team : A.team).name}` : `⚓ ${teamInfo(A.team).name} and ${teamInfo(B.team).name} clash at sea`,
      onEnd: (r, lost) => {
        if (!r.teams.P) return;
        if (r.win) { gain({ gold: 200 }); report('⚓ Victory at sea! +💰200.', 'good', lost); }
        else { report('⚓ Your fleet lost the sea battle.', 'bad', lost); }
      } });
  }
}

/* ---------- the master step ---------- */
function onPlayerEnter(ent) {
  reveal(ent.at, (isFleet(ent) ? 5 : ent.units.scout > 0 ? 5 : 3) + 2 * visionBonus());
  if (!isFleet(ent)) { const f = S.world.feat[ent.at]; if (f && f.type === 'cave' && !f.explored && ent.units.scout > 0) { f.explored = true; featChanged(); } }
  const o = ent.order;
  if (o && ['intercept', 'hunt', 'attack-army'].includes(o.type)) {
    const tgt = (o.type === 'hunt' ? S.aiFleets : S.aiArmies).find((x) => x.id === o.target);
    if (!tgt) { ent.path = []; return; }
    if (WG.dist(tgt.at, ent.at) <= 2) {
      ent.path = [];
      if (o.type === 'hunt') navalEngage(ent, tgt);
      else { provoke(S.kingdoms[tgt.kid]); fieldBattle(ent.at, 'P', teamOfKingdom(S.kingdoms[tgt.kid]), `⚔️ ${ent.name} attacks the ${S.kingdoms[tgt.kid].name} army`); }
      return;
    }
    ent.replan = (ent.replan || 0) + 1;
    if (ent.replan % 4 === 0 || !ent.path.length) { const p = planPath(ent, tgt.at); if (p) ent.path = p; }
  }
}
function checkObjectives() {
  S.objectives = S.objectives || {};
  for (const o of OBJECTIVES) {
    if (S.objectives[o.id]) continue;
    let ok = false; try { ok = o.test(); } catch { ok = false; }
    if (!ok) continue;
    S.objectives[o.id] = true; gain(o.reward, true);
    log(`🎯 Objective complete: ${o.text}! Reward ${costText(o.reward)}.`, 'good');
    toast(`🎯 Objective complete: ${o.text} (+${costText(o.reward)})`, 'good');
    UI.panelDirty = true;
  }
}
function step(dt, offline = false) {
  S.time += dt;
  S.objTimer = (S.objTimer || 0) - dt;
  if (S.objTimer <= 0) { S.objTimer = 2; checkObjectives(); }
  const r = rates();
  for (const k of RES) {
    const cap = capOf(k);
    if (r[k] >= 0) { if (S.res[k] < cap) S.res[k] = Math.min(cap, S.res[k] + r[k] * dt); }
    else S.res[k] = Math.max(0, S.res[k] + r[k] * dt);
  }
  for (const b of S.buildings) {
    if (b.build > 0) { b.build -= dt; if (b.build <= 0) completeBuilding(b); }
    if (b.queue) stepQueue(b, dt);
    if (b.research) stepResearch(b, dt);
  }
  // Hungry soldiers desert: with no food and negative income, lose 1% of troops every 10 s.
  if (S.res.food <= 0 && r.food < 0) {
    S.starve = (S.starve || 0) + dt;
    if (S.starve >= 10) {
      S.starve = 0;
      let lost = 0;
      for (const u of COMBAT_UNITS) { const n = Math.ceil((S.army[u] || 0) * 0.01); S.army[u] -= n; lost += n; }
      for (const d of S.divisions) for (const u of COMBAT_UNITS) { const n = Math.floor((d.units[u] || 0) * 0.01); d.units[u] -= n; lost += n; }
      if (lost && !offline) log(`🌾 Starvation: ${lost} hungry soldiers deserted. Build farms or reduce your army.`, 'bad');
    }
  } else S.starve = 0;
  S.shield = Math.max(0, S.shield - dt);
  S.winds = Math.max(0, S.winds - dt);
  S.pirateBlockade = Math.max(0, (S.pirateBlockade || 0) - dt);
  for (const k of S.kingdoms) if (k.treaty > 0) k.treaty = Math.max(0, k.treaty - dt);

  for (const d of [...S.divisions]) if (advance(d, dt, divisionSpeed(d), divisionCost(d), HEX_TIME_LAND, onPlayerEnter)) arrive(d);
  for (const f of [...S.fleets]) if (advance(f, dt, fleetSpeed(f), fleetCost, HEX_TIME_SEA, onPlayerEnter)) arrive(f);
  for (const p of [...S.scouts]) if (advance(p, dt, scoutSpeed(), scoutCost, HEX_TIME_LAND, scoutEnter)) arrive(p);
  stepAiArmies(dt, offline);
  stepAiFleets(dt);
  checkEncounters(offline);
  retryAttacks();
  S.guardTimer = (S.guardTimer || 0) - dt;
  if (S.guardTimer <= 0) { S.guardTimer = GUARD_TICK; if (!catchingUp()) guardDuty(offline); }

  S.aiTimer -= dt;
  while (S.aiTimer <= 0) { aiTurn(offline); S.aiTimer += AI_TICK; }
  if (!offline && S.started && !playerIdle()) {      // no new raids or pirates while you are not at the screen
    S.raidTimer -= dt;
    if (S.raidTimer <= 0) {
      scheduleRaid();
      const c = raidCandidates();
      if (c.length && (hallLevel() >= 2 || S.time > 900) && S.aiArmies.filter((a) => a.kind === 'raid').length < 2) {
        const k = S.kingdoms[+weighted(Object.fromEntries(c.map((x) => [x.id, x.power * (1 + Math.max(0, -x.relation) / 25) * (x.atWar ? 3 : 1)])))];
        launchRaid(k);
      }
    }
    S.pirateTimer -= dt;
    if (S.pirateTimer <= 0) { S.pirateTimer = rand(360, 600); spawnPirates(); }
  }
}

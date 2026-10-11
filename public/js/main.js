/* ==========================================================================
   Main loop, boot, test hooks and developer cheats (F12 console).
   ========================================================================== */
'use strict';

let lastFrame = performance.now(), hudTimer = 0, panelTimer = 0, saveTimer = 15;
UI.gameSpeed = 1;

function frame(now) {
  try { frameInner(now); } catch (e) { reportError('frame', e); }
  requestAnimationFrame(frame);
}
// An error that repeats every frame would flood the console sixty times a second.
const seenErrors = new Set();
function reportError(where, e) {
  const key = where + ':' + (e && e.message);
  if (seenErrors.has(key) || seenErrors.size > 50) return;
  seenErrors.add(key);
  console.error(`[${where}]`, e);
}
function frameInner(now) {
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 1.5 && UI.gameSpeed > 0) { queueCatchUp(dt, 0); dt = 0; }   // tab was hidden: worked off below, a slice per frame
  dt = Math.min(dt, 0.25);
  GOV.sample(dt);
  if (runCatchUp(GOV.ms > 30 ? 14 : 22)) dt = 0;    // the world waits while it catches up
  let sim = dt * UI.gameSpeed;
  while (sim > 0) { const d = Math.min(1, sim); step(d); sim -= d; }
  Battles.frame(dt);
  inputFrame(dt);
  CAM.tick(dt);
  const t = now / 1000;
  // A drawing error must never take the HUD, the panel or the autosave down with it.
  try { drawWorld(ctx, t, dt); } catch (e) { canvasPoisoned = true; reportError('draw', e); }
  if (!booted) finishBoot();

  hudTimer -= dt; panelTimer -= dt; saveTimer -= dt;
  if (hudTimer <= 0) { updateHud(); renderBattleHud(); renderCatchUp(); hudTimer = 0.15; }
  if (panelTimer <= 0 || (UI.panelDirty && panelTimer < 0.75)) { renderPanel(); panelTimer = 1; }
  if (saveTimer <= 0) { save(); saveTimer = 15; }
}

// "Catching up…" banner over the map while offline time is worked off.
function renderCatchUp() {
  let b = el('catchup-banner');
  if (!CATCHUP.left) { if (b) b.hidden = true; return; }
  if (!b) { b = document.createElement('div'); b.id = 'catchup-banner'; b.className = 'paused-banner catchup'; el('stage-wrap').appendChild(b); }
  const pct = Math.round(100 * (1 - CATCHUP.left / Math.max(1, CATCHUP.away)));
  b.hidden = false;
  b.innerHTML = `⏳ Catching up on ${fmtTime(CATCHUP.away)} away… <b>${pct}%</b><i style="width:${pct}%"></i>`;
}

// The first drawn frame lifts the loading screen.
let booted = false;
function finishBoot() {
  booted = true;
  const bs = el('boot-screen');
  if (bs) { bs.classList.add('done'); setTimeout(() => bs.remove(), 450); }
}
function bootFailed(e) {
  console.error('boot failed:', e);
  const bs = el('boot-screen');
  if (!bs) return;
  bs.classList.add('failed');
  bs.querySelector('.boot-msg').innerHTML = `Your realm could not be loaded.<br><small>${esc(String(e && e.message || e))}</small>
    <div class="boot-actions"><button class="btn" onclick="location.reload()">↻ Try again</button>
    <button class="btn ghost" onclick="bootFresh()">Keep a backup and start a new realm</button></div>`;
}
function bootFresh() {
  const raw = storage.get(SAVE_KEY);
  if (raw) storage.set(SAVE_KEY + '-backup-' + Date.now(), raw);
  storage.del(SAVE_KEY);
  location.reload();
}

async function boot() {
  cv = el('stage'); ctx = cv.getContext('2d');
  watchCanvas();
  buildHud();
  const fresh = params.get('reset') === '1';
  if (fresh) {
    storage.del(SAVE_KEY);
    params.delete('reset');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }
  await API.init();
  let loaded = load();
  if (API.online) {
    el('sync').classList.add('online'); el('sync-label').textContent = 'synced';
    const remote = fresh ? null : await API.pull();
    if (remote && remote.version === SAVE_VERSION && (!loaded || remote.savedAt > S.savedAt)) { adoptState(unpackState(remote)); loaded = true; }
  }
  if (loaded) catchUp(); else newGame();
  bindInput();
  resize();
  resetView();
  updateHud();
  if (!S.started) showWelcome();
  lastFrame = performance.now();
  requestAnimationFrame(frame);
  document.body.dataset.ready = '1';
  console.log(`%c👑 Ironcrown v${GAME_VERSION}%c  Developer cheats available — type %ccheats.help()`, 'color:#f2c14e;font-weight:bold;font-size:14px', 'color:#9aa3b5', 'color:#57c26b;font-weight:bold');
}

/* ---------- test hooks (used by tests/e2e.mjs) ---------- */
window.ironcrown = {
  get state() { return S; }, UI, SETTINGS, CAM, Battles, BUILDINGS, UNITS, SHIPS, GENERALS, RESEARCH, version: GAME_VERSION,
  api: { placeBuilding, upgradeBuilding, trainUnits, buildShips, openBox, claimTile, createAlliance, joinAlliance, donate, useItem,
    createDivision, createFleet, giveOrder, setDivisionTroops, splitDivision, mergeDivisions, startResearch, assignGeneral, save, load, selectEntity, dispatchScouts, hireGeneral, launchRaid, promoteGeneral },
  debug: {
    fastForward(sec) { let t = sec; while (t > 0) { const d = Math.min(1, t); step(d, true); t -= d; } UI.panelDirty = true; renderPanel(true); updateHud(); },
    give(res) { for (const [k, v] of Object.entries(res)) S.res[k] += v; UI.panelDirty = true; updateHud(); },
    hexToClient(view, i) {
      const r = cv.getBoundingClientRect();
      const [wx, wy] = [WG.cx[i], WG.cy[i]];
      const [x, y] = CAM.toScreen(wx, wy);
      return { x: r.left + x, y: r.top + y };
    },
    focus(view, i) {
      if (view === 'world') { CAM.z = 1.3; CAM.centerOn(i); CAM.clamp(); }
      else { CAM.z = Math.max(CAM.z, 5); CAM.x = WG.cx[i]; CAM.y = WG.cy[i]; CAM.clamp(); }
    },
    freeHex(type) {
      const cap = S.world.capital;
      const cand = WG.within(cap, landRadius() + 2).filter((i) => !placementError(type, i)).sort((a, b) => WG.dist(a, cap) - WG.dist(b, cap));
      return cand.length ? cand[0] : -1;
    },
    revealAll() { S.world.seen.fill(1); fogDirty = true; UI.panelDirty = true; },
    rates, totalPower, hallLevel, kingdomTiles, playerTiles, territoryBonus, WG,
  },
};

/* ---------- developer cheats: open DevTools (F12) → Console → cheats.help() ---------- */
const cheats = {
  help() {
    const list = {
      'cheats.gold(n)': 'Add gold (default 100k)', 'cheats.res(n)': 'Add n of every resource', 'cheats.max()': 'Fill all storage to the cap',
      'cheats.hall(lvl)': 'Set Main Hall level (1-6)', 'cheats.build()': 'Finish all construction', 'cheats.research()': 'Finish research in progress',
      'cheats.researchAll()': 'Max every technology', 'cheats.army(n)': 'Add n of every unit to the garrison', 'cheats.ships(n)': 'Add n of every ship to the harbour',
      'cheats.generals(n)': 'Get n copies of every general (5★)', 'cheats.items(n)': 'Add n of every item', 'cheats.reveal()': 'Reveal the whole map',
      'cheats.time(sec)': 'Fast-forward the simulation', 'cheats.speed(x)': 'Game speed multiplier (1 = normal)', 'cheats.season(0-3)': 'Jump to spring/summer/autumn/winter',
      'cheats.raid(kid)': 'Trigger a raid now', 'cheats.seamen(n)': 'Add n seamen (ship crews)', 'cheats.pirates()': 'Spawn a pirate fleet', 'cheats.peace()': 'Everyone loves you, wars end',
      'cheats.war(kid)': 'Declare war on kingdom kid', 'cheats.god()': 'Everything: resources, army, ships, research, reveal', 'cheats.state()': 'Raw save object',
    };
    console.table(list);
    return `Ironcrown v${GAME_VERSION} cheats — ${Object.keys(list).length} commands`;
  },
  gold(n = 1e5) { S.res.gold += n; return done(`+${n} gold`); },
  res(n = 1e5) { for (const k of RES) S.res[k] += k === 'diamonds' ? Math.min(n, 5000) : n; return done('resources added'); },
  max() { for (const k of RES) S.res[k] = Math.max(S.res[k], capOf(k)); return done('storage filled'); },
  hall(lvl = 10) { S.buildings.find((b) => b.type === 'hall').level = Math.max(1, Math.floor(lvl)); claimRing(true); return done(`Main Hall → ${lvl}`); },
  build() { S.buildings.filter((b) => b.build > 0).forEach(completeBuilding); return done('construction finished'); },
  research() { S.buildings.filter((b) => b.research).forEach(completeResearch); return done('research finished'); },
  researchAll() { for (const [id, r] of Object.entries(RESEARCH)) S.research[id] = r.max; return done('all technology researched'); },
  army(n = 50) { for (const u of Object.keys(UNITS)) S.army[u] += n; return done(`+${n} of every unit (incl. seamen)`); },
  ships(n = 5) { for (const t of SHIP_TYPES) S.harbor[t] += n; return done(`+${n} of every ship`); },
  generals(n = 1) { for (const g of GENERALS) for (let k = 0; k < n; k++) { const r = grantGeneral(g.id); genInst(r.uid).stars = 5; } return done(`+${n} copy of every general (5★)`); },
  items(n = 5) { for (const k of Object.keys(ITEMS)) S.items[k] += n; return done(`+${n} of every item`); },
  reveal() { S.world.seen.fill(1); recountSeen(); return done('map revealed'); },
  time(sec = 600) { window.ironcrown.debug.fastForward(sec); return done(`${sec}s simulated`); },
  speed(x = 1) { setSpeed(clamp(x, 0, 20)); return done(`game speed ×${UI.gameSpeed}`); },
  season(n = 3) { const cal = calendar(); S.time = (Math.floor(S.time / (DAY_LENGTH * 40)) * 40 + n * 10) * DAY_LENGTH + (cal.day - 1) * 0; return done(`season → ${SEASONS[n].name}`); },
  raid(kid) {
    const k = kid != null ? S.kingdoms[kid] : pick(S.kingdoms.filter(canReachCapital));
    if (!k) return done('no kingdom has a land route to you');
    S.shield = 0;
    return done(launchRaid(k) ? `${k.name} raids you` : `${k.name} has no land route to you`);
  },
  pirates() { spawnPirates(); return done('pirates spawned'); },
  seamen(n = 100) { S.army.seaman += n; return done(`+${n} seamen`); },
  peace() { S.kingdoms.forEach((k) => { k.atWar = false; k.relation = 60; }); return done('peace in our time'); },
  war(kid = 0) { DIPLO.war(S.kingdoms[kid]); return done(`war with ${S.kingdoms[kid].name}`); },
  god() { cheats.res(1e6); cheats.max(); cheats.army(200); cheats.ships(10); cheats.researchAll(); cheats.generals(); cheats.reveal(); return done('👑 god mode'); },
  state() { return S; },
};
function done(msg) { UI.panelDirty = true; if (S) { renderPanel(true); updateHud(); } toast('🛠 Cheat: ' + msg); return '✔ ' + msg; }
window.cheats = cheats;
window.ironcrown.cheats = cheats;

function start() { boot().catch(bootFailed); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

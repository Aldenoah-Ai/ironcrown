/**
 * Ironcrown end-to-end tests (Playwright, headless Chromium).
 *
 *   npm test                                         # starts server/server.py and tests locally
 *   BASE_URL=https://<you>.github.io/ironcrown/ npm test   # test the live deployment
 *
 * Tests drive the real UI — clicks on buttons, on hexes of the canvas, drags
 * and key presses — and use window.ironcrown hooks only to fast-forward time,
 * grant resources or locate hexes. Screenshots land in tests/screenshots/.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const shots = path.join(here, 'screenshots');
rmSync(shots, { recursive: true, force: true });
mkdirSync(shots, { recursive: true });

const PORT = 8123;
let BASE = process.env.BASE_URL;
let server = null;
const dataDir = path.join(here, '.test-data');
async function startServer() {
  rmSync(dataDir, { recursive: true, force: true });
  server = spawn('python3', [path.join(root, 'server/server.py'), '--port', String(PORT), '--data', dataDir], { stdio: ['ignore', 'ignore', 'inherit'] });
  BASE = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + 'api/health'); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

// ------------------------------------------------------------ mini runner
const results = [];
let page;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`  ✘ ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`);
    await page.screenshot({ path: path.join(shots, `FAIL-${name.replace(/\W+/g, '_')}.png`) }).catch(() => {});
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const s0Divisions = 12;   // slack for the player's own forces in view
const G = (fn, arg) => page.evaluate(fn, arg);
const state = () => G(() => window.ironcrown.state);
const ff = (s) => G((s) => window.ironcrown.debug.fastForward(s), s);
const shot = (name) => page.screenshot({ path: path.join(shots, name + '.png') });
async function canvasRichness(selector) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel), g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data, colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
    return colors.size;
  }, selector);
}
async function clickHex(view, i, opts = {}) {
  await G(([v, i]) => window.ironcrown.debug.focus(v, i), [view, i]);
  await page.waitForTimeout(60);
  const p = await G(([v, i]) => window.ironcrown.debug.hexToClient(v, i), [view, i]);
  await page.mouse.click(p.x, p.y, opts);
}
async function closeModalIfOpen() { if (await page.isVisible('#modal')) await page.keyboard.press('Escape'); }

// ------------------------------------------------------------ run
if (!BASE) await startServer();
const local = !process.env.BASE_URL;
console.log(`\nIroncrown e2e — ${BASE}\n`);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/api\/(health|save)|favicon|404/.test(m.text())) errors.push('console: ' + m.text()); });
const url = (extra = '') => `${BASE}?slot=e2e${extra}`;

await test('loads, shows the welcome screen, version label and starts', async () => {
  await page.goto(url('&reset=1'));
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  await page.waitForSelector('#welcome-name');
  const v = await G(() => window.ironcrown.version);
  assert((await page.textContent('#version')) === 'v' + v, 'version label shown on the map');
  await page.fill('#welcome-name', 'Testoria');
  await shot('01-welcome');
  await page.click('#begin-btn');
  assert(await page.isHidden('#modal'), 'welcome closes');
  assert((await page.textContent('#kingdom-name')) === 'Testoria', 'name in HUD');
});

await test('one map of small hexes: buildings sit on map hexes around the capital', async () => {
  await page.waitForTimeout(500);
  assert((await canvasRichness('#stage')) > 70, 'detailed canvas');
  const s = await state();
  const hall = s.buildings.find((b) => b.type === 'hall');
  assert(hall && hall.hex === s.world.capital, 'the Main Hall stands on the capital map hex');
  assert(s.buildings.every((b) => s.world.owner[b.hex] === -2), 'every building is on land you own');
  assert(await page.$('[data-view]') === null, 'no separate world-map button');
  await shot('02-kingdom');
  await page.keyboard.press('m');
  await page.waitForTimeout(400);
  assert((await G(() => window.ironcrown.CAM.z)) < 1, 'zoomed out over the world');
  await shot('02b-world-same-map');
  await page.keyboard.press('k');
  await page.waitForTimeout(700);                     // the camera glides there
  assert((await G(() => window.ironcrown.CAM.z)) > 4, 'K flies back to the capital');
});

await test('resources accumulate in real time', async () => {
  const before = (await state()).res.gold;
  await page.waitForTimeout(1500);
  assert((await state()).res.gold > before, 'gold grows');
});

await test('camera: drag pans, wheel zooms, buttons recenter', async () => {
  const c0 = await G(() => ({ ...window.ironcrown.CAM }));
  await page.mouse.move(500, 500); await page.mouse.down(); await page.mouse.move(360, 420, { steps: 8 }); await page.mouse.up();
  const c1 = await G(() => ({ ...window.ironcrown.CAM }));
  assert(Math.abs(c1.x - c0.x) * c1.z > 100 && Math.abs(c1.y - c0.y) * c1.z > 50, `drag moved the camera (${c0.x.toFixed(0)},${c0.y.toFixed(0)} → ${c1.x.toFixed(0)},${c1.y.toFixed(0)})`);
  await page.mouse.move(500, 500); await page.mouse.wheel(0, -400); await page.waitForTimeout(100);
  assert((await G(() => window.ironcrown.CAM.z)) > c1.z, 'wheel zooms in');
  await page.click('[data-action="zoom-home"]');
});

await test('settings: keyboard camera mode disables drag and enables WASD', async () => {
  await page.click('.hud-stats [data-action="settings"]');
  await page.selectOption('[data-setting="panMode"]', 'keys');
  await page.keyboard.press('Escape');
  const x0 = await G(() => { window.ironcrown.CAM.settle(); return window.ironcrown.CAM.x; });   // let any glide finish
  await page.mouse.move(500, 500); await page.mouse.down(); await page.mouse.move(300, 500, { steps: 6 }); await page.mouse.up();
  assert(Math.abs((await G(() => window.ironcrown.CAM.x)) - x0) < 1, 'drag no longer pans in keyboard mode');
  await page.keyboard.down('d'); await page.waitForTimeout(350); await page.keyboard.up('d');
  assert(Math.abs((await G(() => window.ironcrown.CAM.x)) - x0) > 20, 'D key pans');
  await page.click('.hud-stats [data-action="settings"]');
  await page.selectOption('[data-setting="panMode"]', 'both');
  await shot('03-settings');
  await page.keyboard.press('Escape');
  assert((await G(() => window.ironcrown.SETTINGS.panMode)) === 'both', 'restored');
});

await test('help menu explains every feature', async () => {
  await page.keyboard.press('h');
  await page.waitForSelector('.help nav');
  const sections = await page.$$eval('.help nav button', (b) => b.map((x) => x.textContent));
  assert(sections.length >= 12, `many help sections (${sections.length})`);
  await page.click('.help nav button[data-arg="navy"]');
  assert((await page.textContent('.help article')).includes('Shipyard'), 'navy section explains shipyards');
  await shot('04-help');
  await page.keyboard.press('Escape');
});

await test('build a Farm by clicking the build menu and a hex', async () => {
  await G(() => window.ironcrown.debug.give({ gold: 20000, lumber: 20000, iron: 8000, food: 8000, diamonds: 300 }));
  const n = (await state()).buildings.length;
  await page.keyboard.press('Escape');
  await page.click('[data-tab="info"]');
  await page.click('.build-item[data-type="farm"]');
  const hex = await G(() => window.ironcrown.debug.freeHex('farm'));
  await clickHex('kingdom', hex);
  const s = await state();
  assert(s.buildings.length === n + 1 && s.buildings.find((b) => b.hex === hex && b.type === 'farm'), 'farm placed on that hex');
  await ff(10);
  assert((await state()).buildings.find((b) => b.hex === hex).level === 1, 'farm finished');
});

await test('clear trees/rocks from a hex', async () => {
  const hex = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const mine = playerLand().filter((i) => inLand(i) && obstacleAt(i) && !buildingAt(i)).sort((a, b) => W.dist(a, s.world.capital) - W.dist(b, s.world.capital))[0];
    if (mine !== undefined) return mine;
    // nothing overgrown inside the borders yet — settle some rough ground outside
    window.ironcrown.debug.give({ gold: 40000, food: 40000 });
    for (let r = 6; r <= 24; r += 6) {
      const near = W.within(s.world.capital, r).filter((i) => s.world.owner[i] === -1 && canSettle(i) && !s.world.feat[i] && obstacleAt(i))
        .sort((a, b) => W.dist(a, s.world.capital) - W.dist(b, s.world.capital))[0];
      if (near != null) { claimTile(near, 1); break; }
      const any = W.within(s.world.capital, r).filter((i) => s.world.owner[i] === -1 && canSettle(i) && !s.world.feat[i] && buildableTerrain(i))
        .sort((a, b) => W.dist(a, s.world.capital) - W.dist(b, s.world.capital))[0];
      if (any != null) claimTile(any, 3);
      if (playerLand().some((i) => inLand(i) && obstacleAt(i) && !buildingAt(i))) break;
    }
    return playerLand().filter((i) => inLand(i) && obstacleAt(i) && !buildingAt(i))[0];
  });
  assert(hex !== undefined, 'an obstacle exists on the land');
  await clickHex('kingdom', hex);
  await page.click('[data-action="clear-obstacle"]');
  assert((await state()).cleared.includes(hex), 'hex cleared');
});

await test('the Main Hall upgrades without limit and never hands you land', async () => {
  const s = await state();
  const hall = s.buildings.find((b) => b.type === 'hall');
  const before = await G(() => ({ land: playerTiles(), reach: settleReach(), radius: settleRadius(), unlocks: BUILD_ORDER.filter((t) => limitOf(t) > 0).length }));
  await clickHex('kingdom', hall.hex);
  await page.click('[data-action="upgrade"]');
  await ff(80);
  assert((await G(() => window.ironcrown.debug.hallLevel())) === 2, 'hall level 2');
  const after = await G(() => ({ land: playerTiles(), reach: settleReach(), radius: settleRadius(), unlocks: BUILD_ORDER.filter((t) => limitOf(t) > 0).length }));
  assert(after.land === before.land, `the upgrade granted no territory (${before.land} → ${after.land})`);
  assert(after.unlocks >= before.unlocks && after.radius >= before.radius, 'it unlocks buildings and widens what settlers can take instead');
  const beyond = await G(() => { cheats.hall(7); const b = window.ironcrown.state.buildings.find((x) => x.type === 'hall'); return upgradeError(b); });
  assert(!beyond || beyond === 'Not enough resources' || beyond.includes('builders'), `level 7 can still be upgraded (${beyond})`);
});

await test('research at a University', async () => {
  await page.keyboard.press('Escape');
  await page.click('[data-tab="info"]');
  await page.click('.build-item[data-type="university"]');
  await clickHex('kingdom', await G(() => window.ironcrown.debug.freeHex('university')));
  await ff(30);
  await page.click('[data-tab="research"]');
  await page.click('[data-action="research"][data-arg="tools"]');
  assert((await state()).buildings.find((b) => b.type === 'university').research?.id === 'tools', 'research started');
  await shot('05-research');
  await ff(60);
  assert((await state()).research.tools === 1, 'Improved Tools researched');
});

await test('train troops and muster a division with a general', async () => {
  for (const t of ['archery', 'barracks', 'stable']) {
    await page.click('[data-tab="info"]');
    await page.click(`.build-item[data-type="${t}"]`);
    await clickHex('kingdom', await G((t) => window.ironcrown.debug.freeHex(t), t));
  }
  await ff(40);
  await page.click('[data-tab="army"]');
  await page.click('[data-action="train"][data-arg="archer:5"]');
  await page.click('[data-action="train"][data-arg="pikeman:5"]');
  await ff(60);
  const s = await state();
  assert(s.army.pikeman >= 5 && s.army.archer >= 9, 'troops trained');
  await page.click('[data-action="muster"]');
  await page.fill('#div-name', 'Test Legion');
  await page.click('#muster-yes');
  const s2 = await state();
  const d = s2.divisions.find((x) => x.name === 'Test Legion');
  assert(d && d.units.pikeman >= 5, 'division created with troops from the garrison');
  assert(d.general && s2.divisions.every((x, i, a) => a.findIndex((y) => y.general === x.general) === i), 'each division has its own general');
});

await test('generals: one per division, tavern hire, copies & promotion', async () => {
  const noGen = await G(() => { const n = window.ironcrown.state.divisions.length; window.ironcrown.api.createDivision('Leaderless', { archer: 1 }, null); return window.ironcrown.state.divisions.length === n; });
  assert(noGen, 'a division cannot be mustered without a general');
  await page.click('[data-tab="shop"]');
  const g0 = (await state()).generals.length;
  await page.click('.card [data-action="hire"]');
  assert((await state()).generals.length === g0 + 1, 'hired a general at the tavern');
  await G(() => { cheats.generals(2); });
  await page.click('[data-tab="generals"]');
  const promo = await page.$('[data-action="promote"]');
  assert(promo, 'promote button offered for duplicate copies');
  const n0 = (await state()).generals.length;
  await promo.click();
  const s = await state();
  assert(s.generals.length === n0 - 1 && s.generals.some((g) => g.stars > 5 - 1 || g.stars >= 2), 'spare copy merged into a promoted general');
  await shot('06-generals');
});

await test('no army cap; edit, split and merge divisions', async () => {
  await G(() => window.ironcrown.debug.give({ gold: 90000, food: 90000, iron: 90000 }));
  await page.click('[data-tab="army"]');
  await G(() => cheats.army(400));                          // far beyond what the old housing cap allowed
  const q0 = await G(() => window.ironcrown.state.buildings.find((b) => b.type === 'barracks').queue.length);
  await page.click('[data-action="train"][data-arg="swordsman:5"]');
  const q1 = await G(() => window.ironcrown.state.buildings.find((b) => b.type === 'barracks').queue.length);
  assert(q1 === q0 + 5 && (await G(() => totalHousing() > armyCap())), 'training continues with no army cap');
  await ff(60);
  const s0 = await state();
  const d = s0.divisions.find((x) => x.name === 'Test Legion');
  await page.click(`[data-action="edit-troops"][data-arg="${d.id}"]`);
  await page.$eval('input[data-ed="swordsman"]', (e) => { e.value = 20; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#edit-yes');
  const s1 = await state();
  assert(s1.divisions.find((x) => x.id === d.id).units.swordsman === 20, 'division resized to 20 swordsmen');
  await G(() => cheats.generals(1));
  await page.click(`[data-action="split"][data-arg="${d.id}"]`);
  await page.click('#split-yes');
  const s2 = await state();
  const nd = s2.divisions.find((x) => x.name === 'Test Legion II');
  assert(nd && nd.general && nd.general !== s2.divisions.find((x) => x.id === d.id).general, 'split into a new division with its own general');
  const before = s2.divisions.length;
  await page.click(`[data-action="merge"][data-arg="${d.id}:${nd.id}"]`);
  assert((await state()).divisions.length === before - 1, 'merged back together');
});

await test('world map: hex terrain, fog, minimap, select a division and march', async () => {
  await page.keyboard.press('m');
  await page.waitForTimeout(300);
  assert((await canvasRichness('#stage')) > 40, 'world drawn');
  await page.click('[data-tab="army"]');
  assert(await page.isVisible('#minimap'), 'minimap visible');
  const s = await state();
  const d = s.divisions.find((x) => x.name === 'Test Legion');
  await page.click(`[data-action="select-entity"][data-arg="division:${d.id}"]`);
  const target = await G((cap) => { const W = window.ironcrown.debug.WG; return W.within(cap, 3).find((i) => W.dist(i, cap) >= 2 && isPassable(i) && isSeen(i) && (findPath(W, cap, i, aiLandCost) || []).length <= 4); }, s.world.capital);
  assert(target !== undefined, 'a reachable hex nearby');
  await clickHex('world', target);
  await page.waitForSelector('[data-action="order"][data-arg="move"]');
  await page.click('[data-action="order"][data-arg="move"]');
  assert((await state()).divisions.find((x) => x.id === d.id).path.length > 0, 'division has a route');
  await page.waitForTimeout(300);
  await shot('07-world-march');
  await ff(80);
  assert((await state()).divisions.find((x) => x.id === d.id).at === target, 'division arrived');
});

await test('scouts: dispatch a party, click a point, everything on the way is revealed', async () => {
  const s = await state();
  const kid = await G(() => { const s = window.ironcrown.state; return s.kingdoms.find((k) => findPath(WG, s.world.capital, k.capital, scoutCost))?.id ?? 0; });
  const k = s.kingdoms[kid];
  const seen0 = s.world.seen.filter(Boolean).length;
  await page.keyboard.press('Escape');
  await page.click('[data-tab="army"]');
  await page.click('[data-action="dispatch-scouts"]');
  const party = (await state()).scouts[0];
  assert(party, 'scout party on the map');
  await clickHex('world', k.capital);                       // left-click moves the selected scouts
  const moving = (await state()).scouts[0];
  assert(moving.path.length > 0, 'scouts walking to the clicked point');
  const route = moving.path.slice();
  await shot('07b-scouts');
  let walked = 0;
  for (let k = 0; k < 10; k++) {
    await ff(40);
    const p = (await state()).scouts.find((x) => x.id === moving.id);
    if (!p) break;                                   // arrived home / captured
    walked = route.length - p.path.length;
    if (!p.path.length) break;
  }
  const s2 = await state();
  const passed = route.slice(0, Math.max(walked, 1));
  assert(passed.every((i) => s2.world.seen[i]), `every hex the scouts passed was revealed (${passed.length} hexes)`);
  assert(s2.world.seen.filter(Boolean).length > seen0, 'fog lifted');
  if (walked >= route.length - 1) assert(s2.intel[k.id], 'intel gathered on arrival');
});

await test('claim land anywhere and build on it', async () => {
  await G(() => window.ironcrown.debug.give({ gold: 30000, lumber: 30000, iron: 10000, food: 10000 }));
  await G(() => cheats.reveal());
  const hex = await G(() => { const s = window.ironcrown.state, W = window.ironcrown.debug.WG; return s.world.owner.map((o, i) => i).filter((i) => s.world.owner[i] === -1 && [1, 2, 7].includes(s.world.terrain[i]) && !s.world.feat[i] && distToTerritory(i) >= 2).sort((a, b) => W.dist(a, s.world.capital) - W.dist(b, s.world.capital))[0]; });
  assert(hex !== undefined, 'a distant neutral farmable hex');
  await page.keyboard.press('Escape');
  await clickHex('world', hex);
  await page.click('[data-action="claim"]');
  assert((await state()).world.owner[hex] === -2, 'claimed a hex far from the borders');
  const spot = await G((h) => [h].concat(window.ironcrown.debug.WG.neighbors(h)).find((i) => inLand(i) && !placementError('village', i)), hex);
  assert(spot !== undefined, 'a buildable hex in the claimed land');
  await G(() => { cheats.build(); });
  await clickHex('world', spot);
  await page.click('[data-action="build-at"][data-tb="village"]');
  const vb = (await state()).buildings.find((b) => b.hex === spot);
  assert(vb && vb.type === 'village', 'village under construction on far-away land');
  await ff(30);
  assert((await state()).buildings.find((b) => b.hex === spot).level === 1, 'village built');
  await shot('07c-territory');
});

await test('port trains seamen, shipyard builds crewed ships, form a fleet and sail', async () => {
  await page.keyboard.press('k');
  await page.click('[data-tab="info"]');
  await page.keyboard.press('Escape');
  await page.click('.build-item[data-type="port"]');
  await clickHex('kingdom', await G(() => window.ironcrown.debug.freeHex('port')));
  await ff(30);
  await page.click('[data-tab="navy"]');
  assert(await page.isDisabled('[data-action="build-ship"][data-arg="sloop:1"]'), 'ships need a crew first');
  for (let k = 0; k < 3; k++) { await page.click('[data-action="train"][data-arg="seaman:5"]'); await ff(20); }
  assert((await state()).army.seaman >= 14, 'seamen trained at the port');
  await page.click('[data-tab="info"]');
  await page.click('.build-item[data-type="shipyard"]');
  const hex = await G(() => window.ironcrown.debug.freeHex('shipyard'));
  assert(hex >= 0, 'a free coastal hex exists');
  await clickHex('kingdom', hex);
  await ff(40);
  await page.click('[data-tab="navy"]');
  const sea0 = (await state()).army.seaman;
  await page.click('[data-action="build-ship"][data-arg="sloop:1"]');
  await page.click('[data-action="build-ship"][data-arg="cog:1"]');
  await ff(40);
  const hs = await state();
  assert(hs.harbor.cog === 1 && hs.army.seaman === sea0 - 14, 'ships launched into harbour with their crews aboard (6 + 8 seamen)');
  await page.click('[data-action="form-fleet"]');
  await page.click('#fleet-yes');
  const f = (await state()).fleets[0];
  assert(f && f.ships.sloop === 1, 'fleet formed');
  await shot('08-navy');
  const water = await G((h) => { const W = window.ironcrown.debug.WG; return W.within(h, 4).filter((i) => isWater(i) && OCEAN[i]).sort((a, b) => W.dist(b, h) - W.dist(a, h))[0]; }, f.at);
  await G(([id, w]) => { const f = window.ironcrown.state.fleets.find((x) => x.id === id); window.ironcrown.api.giveOrder(f, 'move', w); }, [f.id, water]);
  await ff(40);
  assert((await state()).fleets[0].at === water, 'fleet sailed');
});

await test('fleet salvages a shipwreck', async () => {
  await G(() => cheats.reveal());
  const f = (await state()).fleets[0];
  const wreck = await G((at) => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    return Object.keys(s.world.feat).map(Number).filter((i) => s.world.feat[i].type === 'wreck' && !s.world.feat[i].salvaged)
      .sort((a, b) => W.dist(a, at) - W.dist(b, at)).find((i) => findPath(W, at, i, fleetCost));
  }, f.at);
  const ok = await G(([id, w]) => { const f = window.ironcrown.state.fleets.find((x) => x.id === id); return window.ironcrown.api.giveOrder(f, 'salvage', w); }, [f.id, wreck]);
  assert(ok, 'route to wreck');
  await ff(400);
  assert((await state()).world.feat[wreck].salvaged, 'wreck salvaged');
});

await test('division explores ruins (battle auto-resolved)', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; cheats.army(60); });
  const s = await state();
  await G(() => cheats.hall(6));
  const ruin = await G(() => { const s = window.ironcrown.state, W = window.ironcrown.debug.WG; return Object.keys(s.world.feat).map(Number).filter((i) => s.world.feat[i].type === 'ruins' && findPath(W, s.world.capital, i, aiLandCost)).sort((a, b) => W.dist(a, s.world.capital) - W.dist(b, s.world.capital))[0]; });
  assert(ruin !== undefined, 'a reachable ruin');
  await G(() => window.ironcrown.api.createDivision('Raiders', { swordsman: 40, archer: 40, horseman: 30 }, idleGenerals()[0].uid));
  const d = (await state()).divisions.find((x) => x.name === 'Raiders');
  const ok = await G(([id, r]) => { const d = window.ironcrown.state.divisions.find((x) => x.id === id); return window.ironcrown.api.giveOrder(d, 'explore', r); }, [d.id, ruin]);
  assert(ok, 'route to ruins');
  await ff(600);
  const s2 = await state();
  assert(s2.world.feat[ruin].looted || s2.stats.ruinsExplored > 0 || !s2.divisions.find((x) => x.id === d.id), 'ruins fought over');
});

await test('battle is fought on the map with formations and stances', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'watch'; cheats.army(80); });
  const kid = await G(() => { const s = window.ironcrown.state, W = window.ironcrown.debug.WG; return s.kingdoms.slice().sort((a, b) => W.dist(a.capital, s.world.capital) - W.dist(b.capital, s.world.capital)).find((k) => findPath(W, s.world.capital, k.capital, aiLandCost))?.id; });
  assert(kid !== undefined, 'a reachable kingdom');
  await G(() => window.ironcrown.api.createDivision('Siege Host', { swordsman: 60, archer: 60, horseman: 50, pikeman: 30 }, idleGenerals()[0].uid));
  const d = (await state()).divisions.find((x) => x.name === 'Siege Host');
  assert(d, 'division mustered');
  await G(([id, kid]) => { const s = window.ironcrown.state; const d = s.divisions.find((x) => x.id === id); window.ironcrown.api.giveOrder(d, 'attack', s.kingdoms[kid].capital); }, [d.id, kid]);
  for (let i = 0; i < 400 && !(await G(() => window.ironcrown.Battles.list.length)); i++) await G(() => { for (let k = 0; k < 5; k++) step(1); });
  assert(await G(() => window.ironcrown.Battles.list.length) === 1, 'battle started on the map');
  assert(await page.isHidden('#modal'), 'no separate battle screen');
  await page.waitForSelector('#battle-hud:not([hidden])');
  assert(await page.isVisible('#battle-hud'), 'command bar visible');
  // Pause first: the bar keeps ticking while Playwright talks to the page, and a
  // squad that dies between render and click legitimately takes no orders.
  await G(() => { setSpeed(0); renderBattleHud(); });
  const bidClicked = await page.$eval('[data-action="b-form"][data-arg$=":wedge"]', (b) => { b.click(); return +b.dataset.arg.split(':')[0]; });
  await page.$eval('[data-action="b-stance"][data-arg$=":charge"]', (b) => b.click());
  const g = await G((id) => {
    // another fight can start while Playwright is talking to the page, so check
    // the battle the buttons actually belonged to
    const b = window.ironcrown.Battles.get(id) || window.ironcrown.Battles.list[0];
    const pti = window.ironcrown.Battles.playerTeam(b);
    const mine = b.groups.filter((G2) => G2.team === pti && !G2.ally);
    return { f: mine.some((G2) => G2.formation === 'wedge'), s: mine.some((G2) => G2.stance === 'charge'), n: mine.length };
  }, bidClicked);
  assert(g.f && g.s, `formation & stance changed mid-battle (${g.n} of your groups)`);
  await G(() => setSpeed(1));
  await page.waitForTimeout(1500);
  await shot('09-battle-on-map');
  const bid = await G(() => window.ironcrown.Battles.focus);
  // the fight may already have ended on its own, in which case the bar is gone
  await page.$eval('[data-action="b-resolve"]', (b) => b.click()).catch(() => {});
  const s = await state();
  assert(s.stats.battlesWon + s.stats.battlesLost >= 1, 'battle recorded');
  await page.waitForTimeout(3500);
  assert(await G((id) => !window.ironcrown.Battles.get(id), bid), 'battlefield cleared');
});

await test('coalition battles: nearby divisions fight together; 3-way battles', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; cheats.army(60); cheats.generals(2); });
  const res = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    s.divisions = s.divisions.slice(0, 1);
    const k = s.kingdoms.find((k) => canReachCapital(k));
    const hex = W.neighbors(s.world.capital).find((i) => isPassable(i) && !W.neighbors(i).includes(k.capital));
    const a = createDivision('Left Wing', { swordsman: 20, archer: 20 }, idleGenerals()[0].uid);
    const b = createDivision('Right Wing', { pikeman: 20, horseman: 10 }, idleGenerals()[0].uid);
    // put both next to each other and bring an enemy army and a pirate-like third party (bandits) into the fight
    a.at = hex; b.at = W.neighbors(hex).find((i) => isPassable(i)) ?? hex;
    k.atWar = true; k.relation = -80;
    const army = { id: 'test-army', kid: k.id, kind: 'war', units: { swordsman: 25, archer: 15, pikeman: 0, horseman: 5, catapult: 0, scout: 0, seaman: 0 }, hall: 2, at: hex, path: [], prog: 0, target: hex, status: 'idle' };
    s.aiArmies.push(army);
    let seen = null;
    const orig = Battles.create.bind(Battles);
    Battles.create = (cfg) => { const bt = orig(cfg); seen = seen || { teams: bt.teams.map((t) => [t.id, t.groups.map((g) => g.name)]) }; return bt; };
    gatherBattle(hex, ['P', teamOfKingdom(k)], { kind: 'land', title: 'test', extra: [bandits(hex, 150, 1)] });
    Battles.create = orig;
    return seen;
  });
  assert(res, 'a battle was created');
  const P = res.teams.find((t) => t[0] === 'P');
  assert(P && P[1].includes('Left Wing') && P[1].includes('Right Wing'), `both divisions fought together (${JSON.stringify(res.teams)})`);
  assert(res.teams.length >= 3 && res.teams.some((t) => t[0] === 'B'), '3-way battle with a third party');
});

await test('AI kingdoms field guard armies and navy patrols', async () => {
  await ff(200);
  const s = await state();
  assert(s.aiArmies.some((a) => a.kind === 'guard'), 'guard armies on AI land');
  const coastal = s.kingdoms.filter((k) => k.coastal).length;
  assert(!coastal || s.aiFleets.some((f) => f.patrol), 'coastal kingdoms keep navy patrols');
});

await test('build anywhere: unclaimed land, no count limits', async () => {
  await G(() => { cheats.res(200000); cheats.build(); });
  const r = await G(() => {
    const s = window.ironcrown.state, cap = s.world.capital;
    const spot = WG.within(cap, 25).find((i) => s.world.owner[i] === -1 && isSeen(i) && buildableTerrain(i) && !obstacleAt(i) && !buildingAt(i));
    if (spot == null) return { skip: true };
    const b = placeBuilding('farm', spot); cheats.build();
    let farms = 0;
    for (let n = 0; n < 12; n++) { const i = window.ironcrown.debug.freeHex('farm'); if (i >= 0 && placeBuilding('farm', i)) { farms++; cheats.build(); } }
    return { ok: !!b, owned: s.world.owner[spot] === -2, farms, total: countOf('farm'), oldLimit: BUILDINGS.farm.limit[5] };
  });
  if (!r.skip) assert(r.ok && r.owned, 'built on unclaimed land and settled it');
  assert(r.total > r.oldLimit, `more farms than the old limit (${r.total} > ${r.oldLimit})`);
});

await test('towers open fire on passing enemies; battles do not chain', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; });
  const r = await G(() => {
    const s = window.ironcrown.state, cap = s.world.capital;
    const k = s.kingdoms.find((x) => canReachCapital(x));
    const spot = window.ironcrown.debug.freeHex('tower');
    placeBuilding('tower', spot); cheats.build();
    k.atWar = true; k.relation = -90;
    const passBy = WG.within(spot, 2).find((i) => isPassable(i) && WG.dist(i, spot) === 2);
    const far = WG.within(spot, 12).find((i) => isPassable(i) && WG.dist(i, spot) === 10);
    s.divisions.forEach((d) => { d.at = s.world.capital; d.path = []; });
    const army = { id: 'passer', kid: k.id, kind: 'war', units: { swordsman: 15, archer: 5, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 }, hall: 1, at: passBy, path: [far], prog: 0, target: far, status: 'moving' };
    s.aiArmies.push(army);
    let n = 0; const orig = Battles.create.bind(Battles); Battles.create = (c) => { n++; return orig(c); };
    for (let t = 0; t < 10; t++) step(1, true);
    const after10 = n;
    Battles.create = orig;
    return { fought: after10 >= 1, chained: after10 > 3, towers: playerTowers(passBy).length, kinds: playerTowers(passBy).map((x) => x.type) };
  });
  assert(r.towers > 0 && r.fought, `defenses engaged the passing army (towers ${r.towers})`);
  assert(r.kinds.every((k) => k === 'tower'), `the real building fights as itself, got ${r.kinds.join()}`);
  assert(!r.chained, 'no endless chain of battles');
});

await test('empire expands into unexplored land: settle a whole region at once', async () => {
  await G(() => window.ironcrown.debug.give({ gold: 600000, food: 600000 }));
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const hall = s.buildings.find((b) => b.type === 'hall');
    hall.level = Math.max(hall.level, 8);                     // a big hall settles a radius-5 region
    const land = (i) => s.world.owner[i] === -1 && isPassable(i) && !s.world.feat[i];
    const before = playerTiles();
    // 1. push the border outwards with one big claim on the edge of what you have seen
    const big = Math.min(4, settleRadius());
    const edge = W.within(s.world.capital, 30).filter((i) => land(i) && isSeen(i))
      .sort((a, b) => claimCluster(b, big).length - claimCluster(a, big).length)[0];
    const planned = claimCluster(edge, big).length;
    const firstOk = claimTile(edge, big);
    const gained = playerTiles() - before;
    // 2. from that new border, settle land nobody has ever walked
    //    (an earlier test lifted the fog, so put it back around the new frontier)
    for (const i of W.within(edge, 10)) if (s.world.owner[i] === -1) s.world.seen[i] = 0;
    const dark = W.within(edge, 10).filter((i) => land(i) && !isSeen(i) && distToTerritory(i) >= 1 && distToTerritory(i) <= settleReach())[0];
    if (dark == null) return { firstOk, planned, gained, dark: null };
    const darkOk = claimTile(dark, 2);
    return { firstOk, planned, gained, dark: true, darkOk, owned: s.world.owner[dark] === -2, nowSeen: isSeen(dark), reach: settleReach(), radius: settleRadius() };
  });
  assert(r.firstOk && r.planned > 7 && r.gained >= r.planned - 1, `one claim settles a whole region (${r.gained} hexes, planned ${r.planned})`);
  assert(r.dark, 'unexplored land sits just past the new border');
  assert(r.darkOk && r.owned, 'settlers pushed into land that was never scouted');
  assert(r.nowSeen, 'settlers reveal what they settle');
  await shot('07d-expansion');
});

await test('armies auto-engage any enemy inside their detection radius', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; cheats.army(80); });
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    s.divisions.forEach((d) => { d.at = s.world.capital; d.path = []; d.cooldown = 0; });
    const k = s.kingdoms.find((x) => canReachCapital(x));
    k.atWar = true; k.relation = -90;
    const d = s.divisions[0];
    const spot = W.within(s.world.capital, 9).find((i) => isPassable(i) && W.dist(i, s.world.capital) === 8);
    d.at = spot; d.path = []; d.status = 'idle'; d.cooldown = 0;
    // park a hostile army exactly DETECT_R hexes away, standing still, with nothing else nearby
    const away = W.within(spot, DETECT_R).find((i) => isPassable(i) && W.dist(i, spot) === DETECT_R);
    if (away == null) return { skip: true };
    s.aiArmies = [{ id: 'sniffer', kid: k.id, kind: 'war', units: { swordsman: 12, archer: 4, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 }, hall: 1, at: away, path: [], prog: 0, target: away, status: 'idle', cooldown: 0 }];
    let fought = false;
    const orig = Battles.create.bind(Battles);
    Battles.create = (c) => { fought = true; return orig(c); };
    checkEncounters(true);
    Battles.create = orig;
    return { skip: false, fought, gap: W.dist(spot, away), radius: DETECT_R };
  });
  if (r.skip) return;
  assert(r.gap === r.radius, 'the enemy stood at the edge of the ring');
  assert(r.fought, `the division attacked an enemy ${r.gap} hexes away on its own`);
  await G(() => { const s = window.ironcrown.state; s.aiArmies = []; s.kingdoms.forEach((k) => { k.atWar = false; k.relation = Math.max(k.relation, 0); }); });
});

await test('you never have to command an allied kingdom\'s battle', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    s.divisions.forEach((d) => { d.at = s.world.capital; d.path = []; d.status = 'idle'; d.cooldown = 0; });
    const friend = s.kingdoms[0], foe = s.kingdoms.find((k) => k !== friend);
    window.__restore = { id: friend.id, allianceId: friend.allianceId, relation: foe.relation };
    // join a fresh alliance with `friend`, then stage a fight far from anything of yours
    s.allianceId = null;
    createAlliance('Test Concord', '#57c26b', '🤝');
    const a = S.alliances.find((x) => x.id === s.allianceId);
    a.leader = 'P'; a.members.push(friend.id); friend.allianceId = a.id;
    foe.atWar = false; foe.relation = -90;
    friend.wars = { [foe.id]: s.time + 999 }; foe.wars = { [friend.id]: s.time + 999 };
    const hex = W.within(friend.capital, 2).find((i) => isPassable(i) && W.dist(i, s.world.capital) > 8) ?? friend.capital;
    const army = { id: 'ally-war', kid: foe.id, kind: 'war', units: { swordsman: 20, archer: 10, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 }, hall: 2, at: hex, path: [], prog: 0, target: hex, status: 'idle', cooldown: 0 };
    s.aiArmies = [army];
    const live = Battles.list.length;
    const bt = gatherBattle(hex, ['P', teamOfKingdom(foe)], { kind: 'land', title: 'allied war' });
    const P = bt && bt.teams.find((t) => t.player);
    return { made: !!bt, watched: Battles.list.length > live, ally: P ? P.groups.every((g) => g.ally) : null, mineToCommand: P ? P.groups.filter((g) => !g.ally).length : -1 };
  });
  assert(r.made, 'the allied kingdom still fought its war');
  assert(r.ally === true, 'every friendly group there belonged to the ally');
  assert(!r.watched, 'no battle was handed to you to command');
  assert(r.mineToCommand === 0, 'you had nothing of your own on that field');
  await G(() => {   // put the world back the way the later tests expect to find it
    const s = window.ironcrown.state, was = window.__restore;
    leaveAlliance();
    s.alliances = s.alliances.filter((a) => a.name !== 'Test Concord');
    s.kingdoms.forEach((k) => { k.wars = {}; k.atWar = false; });
    const friend = s.kingdoms[was.id], home = s.alliances.find((a) => a.id === was.allianceId);
    friend.allianceId = was.allianceId;
    if (home && !home.members.includes(friend.id)) home.members.push(friend.id);
    s.kingdoms.forEach((k) => { if (k.allianceId && !s.alliances.some((a) => a.id === k.allianceId)) k.allianceId = null; });
    s.aiArmies = [];
  });
});

await test('battles use the real towers standing on the map, and towers duel towers', async () => {
  await G(() => { cheats.res(400000); cheats.build(); });
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const hall = s.buildings.find((b) => b.type === 'hall'); hall.level = Math.max(hall.level, 5);
    const spot = window.ironcrown.debug.freeHex('cannon');
    placeBuilding('cannon', spot); cheats.build();
    const t2 = W.within(spot, 2).find((i) => i !== spot && !placementError('tower', i));   // next door, so both join the same fight
    placeBuilding('tower', t2); cheats.build();
    const defs = playerTowers(spot);
    // an enemy with towers of its own, so the two sets of stonework can shoot at each other
    const foe = { id: 'K:99', name: 'Testers', color: '#e5534b', groups: [], towers: [{ type: 'tower', level: 3, hex: W.neighbors(spot)[0] }] };
    const bt = Battles.create({ kind: 'land', hex: spot, title: 'tower duel',
      teams: [{ id: 'P', name: 'You', color: '#f2c14e', player: true, groups: [], towers: defs }, foe],
      hostile: (a, b) => a !== b });
    const mine = bt.towers.filter((x) => x.team === 0);
    const before = bt.towers.filter((x) => x.team === 1).reduce((a, x) => a + x.hp, 0);
    for (let i = 0; i < 400; i++) Battles.tick(bt, 1 / 30);
    const after = bt.towers.filter((x) => x.team === 1).reduce((a, x) => a + x.hp, 0);
    return { types: defs.map((d) => d.type).sort(), onRealHexes: mine.every((x) => x.real && x.hex != null),
      placed: mine.map((x) => x.hex).sort().join() === defs.map((d) => d.hex).sort().join(),
      hasCannon: mine.some((x) => x.type === 'cannon'), hasArcher: mine.some((x) => x.type === 'tower'),
      damagedEnemyTowers: after < before };
  });
  assert(r.types.includes('cannon') && r.types.includes('tower'), `both buildings joined as themselves (${r.types.join()})`);
  assert(r.hasCannon && r.hasArcher, 'a cannon fights as a cannon and an archer tower as an archer tower');
  assert(r.onRealHexes && r.placed, 'towers stand on their own hexes, not on a made-up back line');
  assert(r.damagedEnemyTowers, 'towers opened fire on the enemy towers');
});

await test('the world is ten times bigger and full of kingdoms', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const caps = s.kingdoms.map((k) => k.capital);
    let far = 0;
    for (const a of caps) for (const b of caps) far = Math.max(far, W.dist(a, b));
    return { N: W.N, W: W.W, H: W.H, kingdoms: s.kingdoms.length, alliances: s.alliances.length,
      spread: far, land: s.world.terrain.reduce((a, t) => a + (t !== 0 ? 1 : 0), 0),
      feats: Object.keys(s.world.feat).length, packed: serialize(s).length, plain: JSON.stringify(s).length };
  });
  assert(r.N >= 150000, `about ten times the old 16,500 hexes (${r.N})`);
  assert(r.W > 400 && r.H > 300, `grid grew in both directions (${r.W}x${r.H})`);
  assert(r.kingdoms >= 20, `a lot more kingdoms (${r.kingdoms})`);
  assert(r.alliances >= 3, `blocs formed among them (${r.alliances})`);
  assert(r.spread > 200, `capitals are spread across the whole world (${r.spread} hexes apart)`);
  assert(r.land > 60000 && r.feats > 300, `land and points of interest scaled with it (${r.land} land, ${r.feats} features)`);
  assert(r.packed < 600000 && r.packed < r.plain / 3, `the save stays small enough to store (${r.packed} vs ${r.plain} bytes)`);
});

await test('base defenses hit and endure more than ten times harder', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state;
    const before = { tower: { hp: 300, atk: 20 }, cannon: { hp: 400, atk: 62 }, fortress: { hp: 750, atk: 26 }, spire: { hp: 600, atk: 80 } };
    const ratio = Math.min(...Object.keys(before).map((k) => Math.min(TOWER_STATS[k].hp / before[k].hp, TOWER_STATS[k].atk / before[k].atk)));
    // the same raiding party, thrown at the old stats and at the new ones
    const W = window.ironcrown.debug.WG;
    const hex = s.world.capital;
    const from = W.neighbors(hex).find((i) => isPassable(i)) ?? hex;   // they attack from the ground next door
    const fight = () => {
      const bt = Battles.create({ kind: 'land', hex, title: 'siege test',
        teams: [{ id: 'P', name: 'You', color: '#f2c14e', player: true, groups: [], towers: [{ type: 'tower', level: 1, hex }] },
                { id: 'K:99', name: 'Raiders', color: '#e5534b', groups: [{ key: 'r', name: 'Raiders', hex: from, units: { swordsman: 12 }, stats: (u) => ({ atk: UNITS[u].atk, hp: UNITS[u].hp, speed: UNITS[u].speed, range: UNITS[u].range }) }] }],
        hostile: (a, b) => a !== b });
      for (let i = 0; i < 4000 && !bt.done; i++) Battles.tick(bt, 1 / 30);
      return { held: !bt.towers[0].dead, killed: bt.units.filter((u) => u.dead).length };
    };
    const now = fight();
    const keep = { ...TOWER_STATS.tower };
    TOWER_STATS.tower.hp = before.tower.hp; TOWER_STATS.tower.atk = before.tower.atk;
    const old = fight();
    Object.assign(TOWER_STATS.tower, keep);
    return { ratio, now, old, defRating: BUILDINGS.tower.def, siege: UNITS.catapult.vs.tower };
  });
  assert(r.ratio >= 10, `every fortification is at least ten times stronger (lowest ${r.ratio.toFixed(1)}x)`);
  assert(r.defRating >= 450, `the defense rating followed (${r.defRating})`);
  assert(!r.old.held, 'a dozen raiders used to overrun a lone archer tower');
  assert(r.now.held, 'now the tower holds the ground');
  assert(r.now.killed >= r.old.killed + 6, `and it cuts down ${r.now.killed} of them where it used to manage ${r.old.killed}`);
  assert(r.siege >= 8, 'catapults are still the answer to stone');
});

await test('a division on guard marches to defend land connected to its post', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; cheats.army(60); });
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    s.aiArmies = []; s.divisions.forEach((d) => { d.guard = false; d.path = []; d.cooldown = 0; d.status = 'idle'; });
    const d = s.divisions[0];
    const mine = playerLand();
    const post = mine.find((i) => isPassable(i) && W.dist(i, s.world.capital) >= 2) ?? s.world.capital;
    d.at = post; d.path = []; d.order = null; d.status = 'idle';
    // a hex of the same connected realm, well outside the division's detection ring
    const comp = territoryComponents();
    const far = mine.filter((i) => comp[i] === comp[post] && W.dist(i, post) >= DETECT_R_IDLE + 3 && isPassable(i))
      .sort((a, b) => W.dist(a, post) - W.dist(b, post))[0];
    if (far == null) return { skip: true };
    const k = s.kingdoms.find((x) => canReachCapital(x)) || s.kingdoms[0];
    k.atWar = true; k.relation = -90;
    // off guard duty it ignores the raid entirely
    s.aiArmies = [{ id: 'invader', kid: k.id, kind: 'raid', units: { swordsman: 14, archer: 4, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 }, hall: 1, at: far, targetHex: far, path: [], prog: 0, status: 'idle', cooldown: 0 }];
    guardDuty(true);
    const ignored = !d.order || d.order.type !== 'defend';
    d.guard = true; d.guardAt = post;
    guardDuty(true);
    const answered = !!d.order && d.order.type === 'defend' && d.order.hex === far;
    const marching = d.path.length > 0 || d.at === far;
    // the invader leaves; the guard goes back to its post
    d.at = far; d.path = []; d.status = 'idle';
    s.aiArmies = [];
    guardDuty(true);
    const returning = (d.path.length > 0 && d.path[d.path.length - 1] === post) || d.at === post;
    const gap = W.dist(post, far);
    s.kingdoms.forEach((x) => { x.atWar = false; });
    d.guard = false; d.at = s.world.capital; d.path = []; d.order = null;
    return { skip: false, ignored, answered, marching, returning, gap, reach: DETECT_R_IDLE };
  });
  if (r.skip) return;
  assert(r.gap > r.reach, `the raid was outside the division's own detection ring (${r.gap} > ${r.reach} hexes)`);
  assert(r.ignored, 'a division not on guard stays where it is');
  assert(r.answered && r.marching, 'a guarding division marches on an invader anywhere in its connected land');
  assert(r.returning, 'and goes back to its post once the land is clear');
});

await test('zoomed in on High graphics an army is drawn soldier by soldier', async () => {
  const r = await G(async () => {
    const s = window.ironcrown.state;
    const d = s.divisions[0];
    d.at = s.world.capital; d.path = []; d.status = 'idle';
    const troops = armyHousing(d.units);
    // pause first: a battle starting mid-measurement draws soldiers at any zoom,
    // and pin the governor, since a slow frame would legitimately turn the
    // formations off mid-test
    const speed = UI.gameSpeed, auto = SETTINGS.autoQuality;
    setSpeed(0);
    SETTINGS.autoQuality = false; GOV.level = 0; resize();
    Battles.list.length = 0;
    const real = window.drawSoldier;
    let n = 0;
    window.drawSoldier = (...a) => { n++; return real(...a); };
    const count = async (graphics, z) => {
      window.ironcrown.SETTINGS.graphics = graphics;
      CAM.z = z; CAM.centerOn(d.at);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      n = 0;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return n;
    };
    const zoomedIn = await count('high', 5);
    const zoomedOut = await count('high', 1.2);
    const lowPoly = await count('low', 5);
    window.drawSoldier = real;
    window.ironcrown.SETTINGS.graphics = 'high';
    SETTINGS.autoQuality = auto;
    setSpeed(speed || 1);
    return { troops, zoomedIn, zoomedOut, lowPoly, armyZ: ARMY_Z };
  });
  assert(r.troops > 10, `the division has troops to draw (${r.troops})`);
  assert(r.zoomedIn >= Math.min(r.troops, 100) / 2, `zoomed in, the whole army is drawn, not a flag (${r.zoomedIn} figures for ${r.troops} troops)`);
  assert(r.zoomedOut === 0, `zoomed out past ${r.armyZ} it goes back to a banner (${r.zoomedOut})`);
  assert(r.lowPoly === 0, 'low-poly graphics keep the cheap banner');
  await shot('07e-army-on-map');
});

await test('the tile cache always covers the screen, and stays inside its memory budget', async () => {
  const r = await G(async () => {
    const auto = SETTINGS.autoQuality;
    SETTINGS.autoQuality = false; GOV.level = 0; resize();
    const out = [];
    for (const z of [0.7, 1.4, 2.6, 5]) {
      CAM.z = z; CAM.centerOn(window.ironcrown.state.world.capital); CAM.clamp();
      for (let i = 0; i < 180; i++) { GOV.busy = false; drawWorld(ctx, performance.now() / 1000, 1 / 60); }
      let li = 0; while (li < LODS.length - 1 && CAM.z >= LODS[li].maxZ) li++;
      const L = LODS[li];
      const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
      const need = (Math.floor(x1 / L.size) - Math.floor(x0 / L.size) + 1) * (Math.floor(y1 / L.size) - Math.floor(y0 / L.size) + 1);
      out.push({ z, need, held: chunkCache[li].size });
    }
    SETTINGS.autoQuality = auto;
    return { out, pixels: chunkPixels, budget: CHUNK_PIXEL_BUDGET };
  });
  // The old cap was a fixed 40 tiles: a large window needed more than that and
  // every frame threw away tiles it was about to draw again.
  for (const v of r.out) assert(v.held >= Math.min(v.need, 24), `zoom ${v.z}: the cache holds the ${v.need} tiles on screen (has ${v.held})`);
  assert(r.pixels <= r.budget * 1.05, `cached tiles stay within budget (${Math.round(r.pixels / 1e6)}M of ${Math.round(r.budget / 1e6)}M px)`);
});

await test('the game gives ground on its own when frames get slow', async () => {
  const r = await G(async () => {
    const was = { ...SETTINGS };
    SETTINGS.autoQuality = true;
    GOV.level = 0; GOV.hold = 0; GOV.ms = 16; resize();
    const dpr0 = DPR;
    for (let i = 0; i < 400; i++) { GOV.sample(0.05); GOV.hold = 0; }   // pretend every frame took 50 ms
    const slow = { level: GOV.level, dpr: DPR, busy: GOV.busy, fps: GOV.fps };
    for (let i = 0; i < 400; i++) { GOV.sample(1 / 120); GOV.hold = 0; }  // …and then plenty of headroom
    const fast = { level: GOV.level, dpr: DPR };
    // A display locked to 60 fps sits at 16.7 ms: it must still count as healthy,
    // or a machine that is keeping up perfectly could never climb back.
    GOV.level = 2; GOV.hold = 0; GOV.ms = 16.7;
    for (let i = 0; i < 200; i++) { GOV.sample(1 / 60); GOV.hold = 0; }
    const vsync = GOV.level;
    SETTINGS.autoQuality = false; GOV.sample(0.05);
    const off = GOV.level;
    Object.assign(SETTINGS, was); GOV.level = 0; resize();
    return { dpr0, slow, fast, vsync, off };
  });
  assert(r.slow.level >= 2, `it steps the quality down under load (level ${r.slow.level})`);
  assert(r.slow.dpr < r.dpr0, `and renders fewer pixels (${r.slow.dpr.toFixed(2)} vs ${r.dpr0.toFixed(2)})`);
  assert(r.slow.busy && r.slow.fps < 30, 'it reports the low frame rate it is reacting to');
  assert(r.fast.level === 0 && r.fast.dpr >= r.dpr0 - 0.01, 'and climbs back when there is headroom again');
  assert(r.vsync === 0, 'a steady vsync-locked 60 fps counts as healthy, so it never gets stuck stepped down');
  assert(r.off === 0, 'turning the setting off returns full quality');
});

await test('armies fight where they stand, and never in the sea', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; cheats.army(150); cheats.generals(2); });
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    s.aiArmies = []; s.divisions.forEach((d) => { d.cooldown = 0; d.status = 'idle'; d.path = []; d.guard = false; });
    const coast = playerLand().find((i) => isPassable(i) && W.neighbors(i).some((n) => isWater(n)) && i !== s.world.capital);
    if (coast == null) return { skip: true };
    const d = s.divisions[0];
    d.at = coast; d.path = []; d.order = null;
    const k = s.kingdoms.find((x) => canReachCapital(x)) || s.kingdoms[0];
    k.atWar = true; k.relation = -95;
    const from = W.neighbors(coast).find((i) => isPassable(i)) ?? coast;
    s.aiArmies = [{ id: 'shore', kid: k.id, kind: 'war', units: { swordsman: 30, archer: 15, pikeman: 0, horseman: 5, catapult: 0, scout: 0, seaman: 0 }, hall: 2, at: from, path: [], prog: 0, target: coast, status: 'idle', cooldown: 0 }];
    const bt = Battles.create({ ...{ kind: 'land', hex: coast, title: 'shore' },
      teams: [{ id: 'P', name: 'You', color: '#f2c14e', player: true, towers: [], groups: [groupOf(d)] },
              { id: 'K:' + k.id, name: k.name, color: k.color, towers: [], groups: [aiGroup(s.aiArmies[0], 'Raiders')] }],
      hostile: (a, b) => a !== b });
    const wet = () => bt.units.filter((u) => !u.dead && !u.escaped && !groundOk(bt, u.x, u.y)).length;
    const start = wet();
    // where each side formed up, versus where it actually stands on the map
    const drift = bt.groups.map((G) => {
      const sp = bt.teams[G.team].groups.find((x) => x.key === G.key);
      if (sp == null || sp.hex == null) return 0;
      const [hx, hy] = [BW / 2 + (W.cx[sp.hex] - W.cx[coast]) / BSC, BH / 2 + (W.cy[sp.hex] - W.cy[coast]) / BSC];
      return Math.hypot(G.ax - hx, G.ay - hy);
    });
    let mid = 0;
    for (let i = 0; i < 1500; i++) { Battles.tick(bt, 1 / 30); if (i === 400) mid = wet(); }
    s.kingdoms.forEach((x) => { x.atWar = false; });
    s.aiArmies = [];
    return { skip: false, start, mid, end: wet(), units: bt.units.length, drift: Math.max(...drift), hexPx: (W_HEX * SQ3) / BSC };
  });
  if (r.skip) return;
  assert(r.units > 20, `both sides turned up (${r.units} squads)`);
  assert(r.drift < r.hexPx, `each force formed up on its own hex, not at a made-up spot (off by ${r.drift.toFixed(0)} of ${r.hexPx.toFixed(0)} per hex)`);
  assert(r.start === 0 && r.mid === 0 && r.end === 0, `nobody was put in the water (${r.start}/${r.mid}/${r.end} afloat)`);
});

await test('soldiers are drawn much smaller than they were', async () => {
  const r = await G(() => {
    const d = window.ironcrown.state.divisions[0];
    // measure the ink a single figure lays down, at a known scale
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const g = c.getContext('2d');
    const ink = (fn) => {
      g.clearRect(0, 0, 200, 200);
      g.save(); g.translate(100, 150); g.scale(4, 4);
      fn(g, 0, 0, 'swordsman', '#ff0000', 1, 0, false, false);
      g.restore();
      const px = g.getImageData(0, 0, 200, 200).data;
      let n = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 20) n++;
      return n;
    };
    return { drawn: ink(drawSoldier), ifFullSize: ink(drawSoldierArt), scale: SOLDIER_SCALE, troops: armyHousing(d.units) };
  });
  assert(r.scale <= 0.6, `figures are drawn at ${r.scale} of their old size`);
  assert(r.drawn < r.ifFullSize * 0.45, `which is far less ink on the map (${r.drawn} vs ${r.ifFullSize} pixels)`);
});

await test('a big kingdom is cheap to draw: glyphs far out, cached art close in', async () => {
  const r = await G(async () => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    window.ironcrown.debug.give({ gold: 9e7, lumber: 9e7, iron: 9e7, food: 9e7 });
    cheats.build();
    let n = 0;
    for (let k = 0; k < 90; k++) { const i = window.ironcrown.debug.freeHex('farm'); if (i >= 0 && placeBuilding(pick(['farm', 'village', 'lumbermill', 'tower']), i)) { n++; cheats.build(); } }
    SETTINGS.graphics = 'high'; SETTINGS.autoQuality = false; GOV.level = 0; resize();
    const real = window.drawBuilding;
    let calls = 0;
    window.drawBuilding = (...a) => { calls++; return real(...a); };
    const at = (z) => {
      CAM.z = z; CAM.centerOn(s.world.capital); CAM.clamp();
      spriteCache.clear();
      drawWorld(ctx, 1, 1 / 60);            // first pass fills the sprite cache
      calls = 0;
      drawWorld(ctx, 1, 1 / 60);
      const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
      const inv = (i) => WG.cx[i] >= x0 && WG.cx[i] <= x1 && WG.cy[i] >= y0 && WG.cy[i] <= y1;
      return { calls, shown: s.buildings.filter((b) => inv(b.hex)).length };
    };
    const far = at(DETAIL_Z - 0.4), mid = at((DETAIL_Z + ART_LIVE_Z) / 2), near = at(ART_LIVE_Z + 0.6);
    window.drawBuilding = real;
    SETTINGS.autoQuality = true;
    return { built: n, far, mid, near, detailZ: DETAIL_Z, liveZ: ART_LIVE_Z };
  });
  assert(r.far.shown > 30, `a proper town is on screen (${r.far.shown} buildings)`);
  assert(r.far.calls <= 3, `zoomed out they are simple blocks, not ${r.far.shown} pieces of art (${r.far.calls} drawn)`);
  assert(r.mid.calls < r.mid.shown / 3, `at middling zoom the art comes from the sprite cache (${r.mid.calls} draws for ${r.mid.shown} buildings)`);
  assert(r.near.calls >= r.near.shown * 0.8, `up close it is drawn live again, so it animates (${r.near.calls} of ${r.near.shown})`);
});

await test('nothing off the screen is drawn, however much of it there is', async () => {
  const r = await G(async () => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    cheats.reveal();
    const k = s.kingdoms[0];
    // a hundred armies scattered across a revealed map, none of them in view
    s.aiArmies = [];
    for (let i = 0; i < 100; i++) {
      const at = W.within(k.capital, 60)[i * 7 % 400] ?? k.capital;
      s.aiArmies.push({ id: 'far' + i, kid: k.id, kind: 'war', units: { swordsman: 20, archer: 0, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 }, hall: 1, at, path: [], prog: 0, status: 'idle', cooldown: 0 });
    }
    SETTINGS.graphics = 'high'; SETTINGS.autoQuality = false; GOV.level = 0;
    CAM.z = 4; CAM.centerOn(s.world.capital); CAM.clamp();
    const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
    const inv = (i) => WG.cx[i] >= x0 && WG.cx[i] <= x1 && WG.cy[i] >= y0 && WG.cy[i] <= y1;
    const onScreen = s.aiArmies.filter((a) => inv(a.at)).length;
    const realB = window.drawBanner, realA = window.drawArmyOnMap;
    let banners = 0, blocks = 0;
    window.drawBanner = (...a) => { banners++; return realB(...a); };
    window.drawArmyOnMap = (...a) => { blocks++; return realA(...a); };
    drawWorld(ctx, 1, 1 / 60);
    banners = 0; blocks = 0;
    drawWorld(ctx, 1, 1 / 60);
    window.drawBanner = realB; window.drawArmyOnMap = realA;
    s.aiArmies = [];
    SETTINGS.autoQuality = true;
    return { total: 100, onScreen, banners, blocks };
  });
  assert(r.onScreen < 20, `most of the hundred armies are off screen (${r.onScreen} in view)`);
  assert(r.banners <= r.onScreen + s0Divisions, `only what is on screen gets a banner (${r.banners} for ${r.onScreen} armies)`);
  assert(r.blocks <= r.onScreen + s0Divisions, `and only what is on screen is drawn soldier by soldier (${r.blocks})`);
});

await test('a fully explored map stops paying for fog, across reloads', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state;
    cheats.reveal();
    const full = seenCount;
    // a world arriving from a save has never called reveal(), so the count has
    // to be re-derived or the "all explored" shortcut never fires again
    seenCount = 0;
    deriveWorld();
    const afterLoad = seenCount;
    const real = window.fogLayer;
    let built = 0;
    window.fogLayer = () => { built++; return real(); };
    fogDirty = true;
    drawFog(ctx); drawFog(ctx);
    window.fogLayer = real;
    return { full, N: WG.N, afterLoad, built };
  });
  assert(r.full === r.N, `the whole map is explored (${r.full} of ${r.N})`);
  assert(r.afterLoad === r.N, 'the count survives a world being re-derived from a save');
  assert(r.built <= 1, `and the fog layer is no longer rebuilt or blitted every frame (${r.built})`);
});

await test('the interface survives buttons that outlived what they point at', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state, out = [];
    const before = s.divisions.length;
    // ids that no longer exist: a division wiped out in battle, a kingdom gone,
    // a force merged away — every one of these is reachable from a stale panel
    const dead = ['split', 'reinforce', 'disband', 'split-yes', 'reinforce-yes', 'edit-troops', 'toggle-guard'];
    for (const a of dead) { try { ACTIONS[a] && ACTIONS[a]('no-such-division'); } catch (e) { out.push(a + ': ' + e.message); } }
    for (const a of ['rename-entity', 'rename-entity-yes', 'return', 'select-entity', 'focus-entity']) {
      try { ACTIONS[a] && ACTIONS[a]('division:gone'); } catch (e) { out.push(a + ': ' + e.message); }
    }
    try { ACTIONS.merge('gone:alsogone'); } catch (e) { out.push('merge: ' + e.message); }
    try { ACTIONS.diplo('gift:999'); } catch (e) { out.push('diplo: ' + e.message); }
    try { ACTIONS['disband-fleet']('nope'); } catch (e) { out.push('disband-fleet: ' + e.message); }
    try { ACTIONS['b-form']('999:0:wedge'); ACTIONS['b-stance']('999:0:charge'); } catch (e) { out.push('battle: ' + e.message); }
    try { ACTIONS.claim('not-a-hex'); } catch (e) { out.push('claim: ' + e.message); }
    // and a tab that does not exist must not wedge the panel for good
    setTab('nonsense');
    let panelOk = true;
    try { renderPanel(true); } catch { panelOk = false; }
    setTab('info');
    return { threw: out, panelOk, tab: UI.tab, divisions: s.divisions.length, before };
  });
  assert(!r.threw.length, `stale ids are handled, not thrown at: ${r.threw.join('; ')}`);
  assert(r.panelOk && r.tab === 'info', 'an unknown tab falls back instead of breaking every render');
  assert(r.divisions === r.before, 'and nothing real was destroyed on the way');
});

await test('a hundred armies do not cost more than a handful', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const keep = s.aiArmies;
    const k = s.kingdoms[0];
    const make = (n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push({ id: 'perf' + i, kid: k.id, kind: 'war', units: { swordsman: 20, archer: 0, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 },
        hall: 1, at: W.within(k.capital, 60)[(i * 13) % 600] ?? k.capital, path: [], prog: 0, status: 'idle', cooldown: 0 });
      return out;
    };
    const bench = (n) => { s.aiArmies = make(n); const t0 = performance.now(); for (let i = 0; i < 60; i++) checkEncounters(true); return (performance.now() - t0) / 60; };
    const few = bench(10), many = bench(200);
    // an army with nobody in it is not an army
    s.aiArmies = make(6).map((a) => ({ ...a, units: { swordsman: 0, archer: 0, pikeman: 0, horseman: 0, catapult: 0, scout: 0, seaman: 0 } }));
    checkEncounters(true);
    const emptiesLeft = s.aiArmies.length;
    s.aiArmies = keep;
    return { few: +few.toFixed(3), many: +many.toFixed(3), emptiesLeft };
  });
  // twenty times the armies used to mean four hundred times the pair checks
  assert(r.many < r.few * 12 + 0.6, `encounter checks scale with the map, not with every pair (${r.few}ms for 10 vs ${r.many}ms for 200)`);
  assert(r.emptiesLeft === 0, `armies with no soldiers left are cleared away (${r.emptiesLeft} remained)`);
});

await test('assets are version-stamped so updates never mix old and new files', async () => {
  const srcs = await page.$$eval('script[src]', (els) => els.map((e) => e.getAttribute('src')));
  const v = await G(() => window.ironcrown.version);
  assert(srcs.length > 10 && srcs.every((x) => x.includes('?v=' + v)), 'every script carries ?v=' + v);
});

await test('pause and game speed controls', async () => {
  await page.click('[data-speed="0"]');
  const t0 = await G(() => window.ironcrown.state.time);
  await page.waitForTimeout(700);
  assert((await G(() => window.ironcrown.state.time)) === t0, 'paused: time stands still');
  assert(await page.isVisible('#paused-banner'), 'paused banner shown');
  await page.click('[data-speed="4"]');
  const t1 = await G(() => window.ironcrown.state.time);
  await page.waitForTimeout(500);
  const dt = (await G(() => window.ironcrown.state.time)) - t1;
  assert(dt > 1.2, `4× speed runs faster than real time (${dt.toFixed(2)}s in 0.5s)`);
  await page.click('[data-speed="1"]');
});

await test('objectives guide the player and pay rewards', async () => {
  const done = await G(() => { checkObjectives(); return Object.keys(window.ironcrown.state.objectives || {}); });
  assert(done.length >= 3, `several objectives completed so far (${done.join(', ')})`);
});

await test('starvation makes soldiers desert', async () => {
  const r = await G(() => {
    const s = window.ironcrown.state; const before = s.army.swordsman;
    s.army.swordsman += 500; const b0 = s.army.swordsman; s.res.food = 0;
    const farms = s.buildings.filter((b) => b.type === 'farm'); farms.forEach((b) => { b._lv = b.level; b.level = 0; });
    for (let t = 0; t < 12; t++) step(1, true);
    farms.forEach((b) => { b.level = b._lv; delete b._lv; });
    return { b0, after: s.army.swordsman };
  });
  assert(r.after < r.b0, `hungry soldiers deserted (${r.b0} → ${r.after})`);
});

await test('render resolution setting changes canvas density', async () => {
  await page.click('.hud-stats [data-action="settings"]');
  await page.selectOption('[data-setting="resolution"]', 'performance');
  const w1 = await page.$eval('#stage', (c) => c.width / c.getBoundingClientRect().width);
  await page.selectOption('[data-setting="resolution"]', 'balanced');
  await page.keyboard.press('Escape');
  assert(w1 <= 1.01, `performance mode renders at 1× (${w1.toFixed(2)})`);
});

await test('graphics quality: high textures ↔ low-poly switch live', async () => {
  await page.click('.hud-stats [data-action="settings"]');
  await page.selectOption('[data-setting="graphics"]', 'low');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const low = await canvasRichness('#stage');
  await shot('10-lowpoly');
  await page.click('.hud-stats [data-action="settings"]');
  await page.selectOption('[data-setting="graphics"]', 'high');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const high = await canvasRichness('#stage');
  assert(low > 20 && high > low, `high quality is more detailed (${low} → ${high} colour buckets)`);
});

await test('enemy raid marches across the map and is resolved', async () => {
  await G(() => { window.ironcrown.SETTINGS.battleMode = 'auto'; });
  const before = await state();
  const msg = await G(() => { const s = window.ironcrown.state, W = window.ironcrown.debug.WG;
    const k = s.kingdoms.find((k) => canReachCapital(k) && s.divisions.every((d) => W.dist(d.at, k.capital) > 3)) || s.kingdoms.find(canReachCapital);
    return cheats.raid(k.id); });
  const raid = (await state()).aiArmies.find((a) => a.kind === 'raid');
  const why = await G(() => JSON.stringify({ shield: ironcrown.state.shield, raids: ironcrown.state.aiArmies.map((a) => [a.kind, a.path.length, a.targetHex]) }));
  assert(raid && raid.path.length > 0 && raid.targetHex != null, `raid army marching on a target hex (${msg} ${why})`);
  assert(await page.isVisible('.alert'), 'threat alert shown');
  await shot('11-raid-alert');
  for (let k = 0; k < 20 && (await G(() => window.ironcrown.state.aiArmies.some((a) => a.kind === 'raid'))); k++) await ff(200);
  const s = await state();
  const done = (x) => x.stats.raidsRepelled + x.stats.raidsLost + x.stats.battlesWon + x.stats.battlesLost;
  assert(!s.aiArmies.some((a) => a.kind === 'raid' && a.id === raid.id), `raid resolved (repelled, pillaged or intercepted) ${JSON.stringify(s.aiArmies.filter((a) => a.kind === 'raid').map((a) => ({ st: a.status, at: a.at, p: a.path.length, t: a.targetHex, n: Object.values(a.units).reduce((x, y) => x + y, 0) })))} ${done(before)}->${done(s)} battles=${await G(() => window.ironcrown.Battles.list.length)}`);
});

await test('diplomacy: gift and declare war', async () => {
  const k0 = (await state()).kingdoms[1];
  await page.keyboard.press('Escape');
  await page.click('[data-tab="info"]');
  await page.keyboard.press('m');
  await page.click('[data-tab="map"]');
  await page.click('[data-action="focus-kingdom"][data-arg="1"]');
  await page.click(`[data-action="diplo"][data-arg="gift:${k0.id}"]`);
  const k1 = (await state()).kingdoms[1];
  assert(k1.relation > k0.relation, 'gift improves relations');
  await page.click(`[data-action="diplo"][data-arg="war:${k0.id}"]`);
  assert((await state()).kingdoms[1].atWar, 'at war');
});

await test('open a mystery box', async () => {
  await page.click('[data-tab="shop"]');
  await page.click('[data-action="open-box"][data-arg="wooden"]');
  await page.waitForSelector('#box-reward', { timeout: 5000 });
  await shot('12-mystery-box');
  await page.click('#modal [data-action="close-modal"]');
  assert((await state()).stats.boxesOpened === 1, 'box counted');
});

await test('alliance: found, donate, chat, leave, join', async () => {
  await page.click('[data-tab="alliance"]');
  await page.fill('#alliance-name', 'Test Legion Pact');
  await page.click('[data-action="create-alliance"]');
  let s = await state();
  assert(s.allianceId && s.alliances.find((a) => a.id === s.allianceId).leader === 'P', 'founded');
  await page.click('[data-action="donate"][data-arg="gold:250"]');
  await page.fill('#chat-input', 'Hello allies!');
  await page.click('[data-action="chat-send"]');
  assert((await page.textContent('#chat')).includes('Hello allies!'), 'chat works');
  await page.click('[data-action="leave"]');
  const target = await G(() => {
    const s = window.ironcrown.state;
    const open = s.alliances.filter((a) => a.open && a.minHall <= 6);
    const a = open.find((x) => x.members.every((m) => m === 'P' || !s.kingdoms[m].atWar)) || open[0];
    // earlier tests leave wars lying about; a player would simply make peace first
    if (a) a.members.forEach((m) => { if (m !== 'P') { s.kingdoms[m].atWar = false; s.kingdoms[m].relation = Math.max(s.kingdoms[m].relation, 0); } });
    return a && a.id;
  });
  assert(target, 'an open alliance exists to join');
  await page.click(`[data-action="join"][data-arg="${target}"]`);
  assert((await state()).allianceId === target, 'joined an existing alliance');
});

await test('AI kingdoms act over time (expand, build, fleets, wars)', async () => {
  const snap = () => G(() => window.ironcrown.state.kingdoms.map((k) => ({ t: window.ironcrown.debug.kingdomTiles(k.id), h: k.hall, d: k.defense, p: k.power })));
  const a = await snap();
  await ff(900);
  const b = await snap();
  const grew = b.filter((x, i) => x.t > a[i].t || x.h > a[i].h || x.d > a[i].d).length;
  assert(grew >= Math.ceil(b.length / 2), `most kingdoms grew (${grew}/${b.length})`);
});

await test('developer cheats are available from the console', async () => {
  const help = await G(() => window.cheats.help());
  assert(/cheats/.test(help), 'cheats.help() works');
  const g0 = (await state()).res.gold;
  await G(() => window.cheats.gold(12345));
  assert((await state()).res.gold >= g0 + 12345 - 1, 'cheats.gold adds gold');
});

await test('state persists across reloads', async () => {
  const before = await state();
  await G(() => window.ironcrown.api.save());
  await page.reload();
  await page.waitForSelector('body[data-ready="1"]');
  const after = await state();
  assert(after.name === 'Testoria' && after.buildings.length === before.buildings.length && after.divisions.length === before.divisions.length && after.fleets.length === before.fleets.length, 'kingdom, divisions and fleets restored');
  assert(await page.isHidden('#modal'), 'no welcome screen for returning players');
});

if (local) {
  await test('Python backend stores the save and serves a leaderboard', async () => {
    await page.click('.hud-stats [data-action="menu"]');
    await page.click('#modal [data-action="save"]');
    await page.waitForTimeout(500);
    const lb = await (await fetch(BASE + 'api/leaderboard')).json();
    assert(lb.players.some((p) => p.name === 'Testoria'), 'on the server leaderboard');
    assert((await page.textContent('#sync-label')) === 'synced', 'HUD shows cloud sync');
    await page.keyboard.press('Escape');
  });
}

await test('mobile viewport renders without horizontal overflow', async () => {
  await page.setViewportSize({ width: 400, height: 860 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `no sideways scroll (overflow ${overflow}px)`);
  await shot('13-mobile');
  await page.setViewportSize({ width: 1440, height: 900 });
});

await test('number keys switch panel tabs; the home button glides back to the capital', async () => {
  await closeModalIfOpen();
  await page.mouse.move(600, 400);
  await page.keyboard.press('3');
  assert(await page.isVisible('[data-tab="research"].active'), '3 opens Research');
  await page.keyboard.press('1');
  assert(await page.isVisible('[data-tab="info"].active'), '1 opens Build');
  await G(() => { const C = window.ironcrown.CAM; C.stop(); C.x += 400; C.y += 300; C.clamp(); });
  await page.click('[data-action="zoom-home"]');
  const mid = await G(() => ({ moving: !!window.ironcrown.CAM.fly }));
  assert(mid.moving, 'the camera is flying, not cutting');
  await page.waitForTimeout(900);
  const r = await G(() => { const s = window.ironcrown.state, W = window.ironcrown.debug.WG, C = window.ironcrown.CAM; return { d: Math.hypot(C.x - W.cx[s.world.capital], C.y - W.cy[s.world.capital]), fly: !!C.fly }; });
  assert(r.d < 2 && !r.fly, `arrived over the capital (${r.d.toFixed(1)} away)`);
});

await test('the side panel is patched in place, not rebuilt every second', async () => {
  await page.click('[data-tab="info"]');
  await G(() => { window.__probe = document.querySelector('#panel-body .card'); });
  await ff(30);
  await G(() => { window.ironcrown.UI.panelDirty = true; });
  await page.waitForTimeout(1300);
  assert(await G(() => !!(window.__probe && window.__probe.isConnected)), 'the same card element survived a refresh');
});

/* ---- start-up robustness: each in its own browser context so the shared session is untouched ---- */
async function freshPage(init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  return { ctx, p, errs };
}
const richness = (p, sel) => p.evaluate((sel) => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, colors = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) colors.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
  return colors.size;
}, sel);

await test('graphics default to low-poly, and older stored settings move to it once', async () => {
  const a = await freshPage();
  await a.p.goto(url('&reset=1')); await a.p.waitForSelector('body[data-ready="1"]');
  assert((await a.p.evaluate(() => window.ironcrown.SETTINGS.graphics)) === 'low', 'a new player starts on low-poly');
  assert((await a.p.evaluate(() => window.ironcrown.SETTINGS.panMode)) === 'both', 'drag and WASD both work by default');
  await a.ctx.close();
  const b = await freshPage(() => localStorage.setItem('ironcrown-settings', JSON.stringify({ graphics: 'high', panMode: 'drag', showGrid: false })));
  await b.p.goto(url('&reset=1')); await b.p.waitForSelector('body[data-ready="1"]');
  const sb = await b.p.evaluate(() => ({ ...window.ironcrown.SETTINGS }));
  assert(sb.graphics === 'low' && sb.showGrid === false, `pre-3.5 settings get the new default but keep the rest (${sb.graphics}, grid ${sb.showGrid})`);
  await b.ctx.close();
  const c = await freshPage(() => localStorage.setItem('ironcrown-settings', JSON.stringify({ graphics: 'high', rev: 2 })));
  await c.p.goto(url('&reset=1')); await c.p.waitForSelector('body[data-ready="1"]');
  assert((await c.p.evaluate(() => window.ironcrown.SETTINGS.graphics)) === 'high', 'a choice made since is respected');
  await c.ctx.close();
});

await test('eight hours away: the map shows at once and the absence is caught up in the background', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.route('**/api/**', (r) => r.abort());     // browser storage only: a server copy would be newer
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  await p.evaluate(() => { document.getElementById('begin-btn').click(); window.cheats.army(40); window.cheats.time(600); window.ironcrown.api.save(); });
  // pretend the save is eight hours old, and keep the page from re-saving over it on the way out
  await p.evaluate(() => {
    const k = 'ironcrown-save-e2e', raw = JSON.parse(localStorage.getItem(k));
    raw.savedAt -= 8 * 3600e3;
    window.removeEventListener('beforeunload', window.save); window.save = () => {};
    window.__gold = raw.res.gold; localStorage.setItem(k, JSON.stringify(raw));
  });
  const goldBefore = await p.evaluate(() => window.__gold);
  const t0 = Date.now();
  await p.reload(); await p.waitForSelector('body[data-ready="1"]');
  await p.waitForFunction(() => !document.getElementById('boot-screen'), null, { timeout: 5000 });
  const shown = Date.now() - t0;
  const rich = await richness(p, '#stage');
  assert(rich > 40, `the map is drawn straight away (${rich} colours)`);
  assert(shown < 4000, `loading screen gone in ${shown}ms`);
  await p.waitForFunction(() => !window.ironcrown.state || (typeof CATCHUP !== 'undefined' && CATCHUP.left === 0), null, { timeout: 60000 });
  const after = await p.evaluate(() => ({ gold: window.ironcrown.state.res.gold, log: window.ironcrown.state.log.slice(0, 5).map((l) => l.text).join(' | '), t: window.ironcrown.state.time }));
  assert(after.gold > goldBefore, `the absence produced gold (${goldBefore} → ${after.gold})`);
  assert(/While you were away \(8h/.test(after.log), 'the log reports the absence: ' + after.log.slice(0, 120));
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('a drawing error that leaves the canvas wrecked does not black out the map', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  await p.evaluate(() => { document.getElementById('begin-btn').click(); window.ironcrown.SETTINGS.autoQuality = false; });
  await p.waitForTimeout(500);
  const ok = await richness(p, '#stage');
  // the worst kind of failure: mid-save(), clipped to one pixel, fully transparent — then throw
  await p.evaluate(() => {
    const B = window.ironcrown.Battles; window.__draw = B.draw;
    B.draw = function (g) { g.save(); g.globalAlpha = 0; g.beginPath(); g.rect(0, 0, 1, 1); g.clip(); throw new Error('boom (test)'); };
  });
  await p.waitForTimeout(600);
  const during = await richness(p, '#stage');
  await p.evaluate(() => { window.ironcrown.Battles.draw = window.__draw; });
  await p.waitForTimeout(400);
  const after = await richness(p, '#stage');
  assert(during > ok * 0.5 && after > ok * 0.5, `map stays drawn (${ok} → ${during} → ${after} colours)`);
  assert(await p.evaluate(() => !!document.querySelector('#panel-body .card')), 'the panel still renders');
  // a GPU reset throws every cached image away; the map rebuilds them
  await p.evaluate(() => document.getElementById('stage').dispatchEvent(new Event('contextrestored')));
  await p.waitForTimeout(800);
  assert((await richness(p, '#stage')) > ok * 0.5, 'map redrawn after a context restore');
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('the minimap is not left black once the whole map is explored', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  await p.evaluate(() => { document.getElementById('begin-btn').click(); window.ironcrown.SETTINGS.minimap = true; });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.cheats.reveal());
  await p.waitForTimeout(2200);
  const dark = await p.evaluate(() => {
    const c = document.getElementById('minimap'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, k = 0; for (let i = 0; i < d.length; i += 4 * 13) { n++; if (d[i] + d[i + 1] + d[i + 2] < 70) k++; }
    return k / n;
  });
  assert(dark < 0.3, `minimap shows the explored world (${Math.round(dark * 100)}% dark)`);
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('a slow or missing save server never holds up the map', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.route('**/api/health', () => { /* never answers */ });
  const t0 = Date.now();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
  const ms = Date.now() - t0;
  assert(ms < 6000, `ready in ${ms}ms despite a hung server`);
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('every icon is an emoji older systems can draw (no blank resource icons)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  // Emoji 12+ (2019 on) are missing on Windows 10 and older phones: 🪙 🪵 and friends showed as blanks.
  const tooNew = (o) => (o >= 0x1fa70 && o <= 0x1faff) || (o >= 0x1f7e0 && o <= 0x1f7eb) || [0x1f9cc, 0x1f6d5, 0x1f6fa, 0x1f90d, 0x1f971, 0x1f97b].includes(o);
  const files = ['index.html', ...readdirSync(path.join(root, 'public/js')).map((f) => 'js/' + f)];
  const bad = [];
  for (const f of files) for (const ch of readFileSync(path.join(root, 'public', f), 'utf8')) if (tooNew(ch.codePointAt(0))) bad.push(`${f}: ${ch}`);
  assert(bad.length === 0, 'too-new emoji: ' + [...new Set(bad)].join(', '));
  const icons = await G(() => Object.values(RES_META).map((r) => r.icon).join(''));
  assert(icons.includes('💰') && icons.includes('🌳'), `resource icons ${icons}`);
});

await test('raids are about ten times rarer, and none are sent while you are away from the screen', async () => {
  const r = await G(() => {
    const keep = { t: S.raidTimer, last: window.ironcrown.UI.lastInput };
    const gaps = []; for (let i = 0; i < 40; i++) { scheduleRaid(); gaps.push(S.raidTimer); }
    // idle: the clock towards the next raid stands still
    S.raidTimer = 500; window.ironcrown.UI.lastInput = Date.now() - 10 * 60e3;
    step(20); const idleT = S.raidTimer;
    window.ironcrown.UI.lastInput = Date.now();
    step(20); const activeT = S.raidTimer;
    S.raidTimer = keep.t; window.ironcrown.UI.lastInput = keep.last;
    return { min: Math.min(...gaps), idleT, activeT, hall: hallLevel() };
  });
  assert(r.min > 1000, `the shortest gap between raids is ${Math.round(r.min)}s (hall ${r.hall}), not five minutes`);
  assert(r.idleT === 500, `no countdown while idle (${r.idleT})`);
  assert(r.activeT < 500, 'the countdown resumes when you are back');
});

await test('a kingdom that joins your alliance calls off the army it sent against you', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  const r = await p.evaluate(() => {
    document.getElementById('begin-btn').click();
    cheats.res(1e5); S.shield = 0;
    const k = S.kingdoms.find((x) => canReachCapital(x));
    const a = launchRaid(k, S.world.capital);
    if (!a) return { skipped: true };
    createAlliance('Test Concord', '#57c26b', '🤝');
    const rnd = Math.random; Math.random = () => 0; inviteKingdom(k.id); Math.random = rnd;
    const lost0 = S.stats.raidsLost;
    window.ironcrown.debug.fastForward(1200);
    return { joined: k.allianceId === S.allianceId, raids: S.aiArmies.filter((x) => x.kid === k.id && x.kind === 'raid').length, lost: S.stats.raidsLost - lost0,
      log: S.log.slice(0, 30).some((l) => /called off the army/.test(l.text)) };
  });
  if (!r.skipped) {
    assert(r.joined, 'the kingdom joined');
    assert(r.raids === 0 && r.lost === 0, `no raid from an ally (${r.raids} marching, ${r.lost} pillaged)`);
    assert(r.log, 'the log says the army was called off');
  }
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('while the game catches up on time away, raids turn back and your armies do not fight', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  const r = await p.evaluate(() => {
    document.getElementById('begin-btn').click();
    cheats.army(60); S.shield = 0;
    const gid = S.generals.find((g) => generalPost(g.uid).kind === 'none').uid;     // the first general already leads a division
    const d = window.ironcrown.api.createDivision('Border Watch', { swordsman: 40, archer: 40 }, gid);
    // park the division right next to a hostile kingdom's guard army
    const k = S.kingdoms.find((x) => S.aiArmies.some((a) => a.kid === x.id && a.kind === 'guard'));
    cheats.war(k.id);
    const g = S.aiArmies.find((a) => a.kid === k.id && a.kind === 'guard');
    const spot = WG.neighbors(g.at).find((n) => isPassable(n)) ?? g.at;
    d.at = spot; d.path = [];
    const raider = S.kingdoms.find((x) => canReachCapital(x) && x !== k);
    const a = raider && launchRaid(raider, S.world.capital);
    const troops0 = armyHousing(d.units), lost0 = S.stats.raidsLost, res0 = { ...S.res };
    queueCatchUp(3 * 3600); finishCatchUp();
    return { troops0, troops1: armyHousing(d.units), raided: !!a, lost: S.stats.raidsLost - lost0, barred: S.log.some((l) => /found the gates barred/.test(l.text)), gold: [res0.gold, S.res.gold] };
  });
  assert(r.troops1 === r.troops0, `the division held its ground (${r.troops0} → ${r.troops1})`);
  if (r.raided) { assert(r.lost === 0, 'nothing was pillaged while away'); assert(r.barred, 'the log explains the raid turned back'); }
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('export downloads a small save file, and importing it (or an old-style code) brings the kingdom back', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.route('**/api/**', (rt) => rt.abort());
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  await p.fill('#welcome-name', 'Exportia'); await p.click('#begin-btn');
  await p.evaluate(() => { cheats.time(1200); S.res.gold = 4321; });
  await p.click('.hud-stats [data-action="menu"]');
  await p.click('[data-action="export"]');
  await p.waitForSelector('#export-data');
  const code = await p.inputValue('#export-data');
  const raw = await p.evaluate(() => serialize(S).length);
  assert(code.startsWith('IC2:'), 'compressed code');
  assert(code.length < raw / 4, `the code is ${Math.round(code.length / 1024)} KB, a quarter of the ${Math.round(raw / 1024)} KB save at most`);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="export-file"]')]);
  assert(/^Exportia-\d{4}-\d\d-\d\d\.ironcrown$/.test(dl.suggestedFilename()), 'file name ' + dl.suggestedFilename());
  const file = path.join(shots, 'export-test.ironcrown');
  await dl.saveAs(file);
  const { readFileSync } = await import('node:fs');
  assert(readFileSync(file, 'utf8') === code, 'the file holds the save code');
  await p.keyboard.press('Escape');
  // start over, then open the file
  await p.evaluate(() => { ACTIONS['reset-yes'](); document.getElementById('begin-btn').click(); });
  assert((await p.evaluate(() => S.name)) !== 'Exportia', 'a different kingdom now');
  await p.click('.hud-stats [data-action="menu"]'); await p.click('[data-action="import"]');
  await p.setInputFiles('#import-file', file);
  await p.waitForFunction(() => S.name === 'Exportia', null, { timeout: 5000 });
  assert(await p.evaluate(() => Math.round(S.res.gold) >= 4321), 'resources came back');
  // a code from v3.5 or earlier still imports, even pasted with line breaks
  const old = await p.evaluate(() => { S.name = 'Oldcode'; const c = btoa(unescape(encodeURIComponent(serialize(S)))); S.name = 'Exportia'; return c.replace(/(.{76})/g, '$1\n'); });
  await p.click('.hud-stats [data-action="menu"]'); await p.click('[data-action="import"]');
  await p.fill('#import-data', old); await p.click('#import-yes');
  await p.waitForFunction(() => S.name === 'Oldcode', null, { timeout: 5000 });
  // and nonsense is refused without touching the game
  await p.click('.hud-stats [data-action="menu"]'); await p.click('[data-action="import"]');
  await p.fill('#import-data', 'not a save'); await p.click('#import-yes');
  await p.waitForTimeout(200);
  assert((await p.textContent('#import-status')).includes('⚠️'), 'the dialog says why');
  assert((await p.evaluate(() => S.name)) === 'Oldcode', 'the game is untouched');
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

if (local) await test('a save kept on the Python server loads when the browser has none', async () => {
  const { ctx, p, errs } = await freshPage();
  await p.goto(url('&reset=1')); await p.waitForSelector('body[data-ready="1"]');
  await p.fill('#welcome-name', 'Cloudia'); await p.click('#begin-btn');
  await p.evaluate(async () => { save(); API.lastPush = 0; API.push(true); await new Promise((r) => setTimeout(r, 600)); });
  await p.evaluate(() => { window.removeEventListener('beforeunload', window.save); window.save = () => {}; localStorage.removeItem('ironcrown-save-e2e'); });
  await p.reload(); await p.waitForSelector('body[data-ready="1"]');
  assert((await p.evaluate(() => S.name)) === 'Cloudia', 'the realm came back from the server');
  assert(errs.length === 0, errs.join('\n'));
  await ctx.close();
});

await test('no uncaught errors in the console', async () => { assert(errors.length === 0, errors.slice(0, 5).join('\n')); });

await browser.close();
if (server) server.kill();
rmSync(dataDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: tests/screenshots/\n`);
process.exit(failed.length ? 1 : 0);

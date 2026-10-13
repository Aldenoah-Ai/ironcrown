/* ==========================================================================
   Cities on the one hex map: your buildings (anywhere on your land) and the
   procedural cities of AI kingdoms, drawn straight onto map hexes.
   ========================================================================== */
'use strict';

const villagers = [];
const popTimers = {};
const artSize = (b) => (b.type === 'hall' ? K_HEX * 3.1 : K_HEX * 1.75);
/* ---- building sprites ----
   The art is lovely and expensive: a few hundred of them in view costs more
   than the terrain does. Above the glyph threshold but below the zoom where
   you can actually see a windmill turn, each (type, level, variant) is drawn
   once into a small canvas and then blitted. Walls link to their neighbours so
   they are always drawn live. */
const ART_LIVE_Z = 3.6;             // from here up, art is drawn live and animates
const SPRITE_CAP = 150;
const spriteCache = new Map();
const spriteBox = (b) => { const s = artSize(b); return { s, bx: -s * 0.9, by: -s * 1.3, bw: s * 1.8, bh: s * 2.0 }; };
function buildingSprite(b, ppu) {
  const key = `${b.type}|${b.level}|${(b.id | 0) % 4}|${b.color || ''}|${b.build > 0 ? 1 : 0}|${SETTINGS.graphics}|${ppu}`;
  const hit = spriteCache.get(key);
  if (hit) { spriteCache.delete(key); spriteCache.set(key, hit); return hit; }
  const box = spriteBox(b), c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(box.bw * ppu)); c.height = Math.max(1, Math.ceil(box.bh * ppu));
  const g = c.getContext('2d');
  g.setTransform(ppu, 0, 0, ppu, -box.bx * ppu, -box.by * ppu);
  GFX.pat.clear(); GFX.ctx = null;
  drawBuilding(g, b, -box.s / 2, -box.s * 0.62, box.s, 0);
  GFX.pat.clear(); GFX.ctx = null;
  const spr = trimSprite(c, box, ppu);
  spriteCache.set(key, spr);
  while (spriteCache.size > SPRITE_CAP) spriteCache.delete(spriteCache.keys().next().value);
  return spr;
}
// The drawing box is generous so nothing clips; this cuts it back to the ink,
// so a blit moves the pixels of a building and not a screenful of transparency.
function trimSprite(c, box, ppu) {
  const g = c.getContext('2d');
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  try {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  } catch { x1 = -1; }
  if (x1 < 0) return { c, ...box };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const t = document.createElement('canvas');
  t.width = w; t.height = h;
  t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
  return { c: t, s: box.s, bx: box.bx + x0 / ppu, by: box.by + y0 / ppu, bw: w / ppu, bh: h / ppu };
}
function drawOnHexCached(g, b, ppu) {
  const spr = buildingSprite(b, ppu);
  g.drawImage(spr.c, WG.cx[b.hex] + spr.bx * ART, WG.cy[b.hex] + spr.by * ART, spr.bw * ART, spr.bh * ART);
}
// Draw a building's art centred on its map hex (art is authored at K_HEX scale).
function drawOnHex(g, b, t, ghost) {
  const s = artSize(b);
  g.save(); g.translate(WG.cx[b.hex], WG.cy[b.hex]); g.scale(ART, ART);
  drawBuilding(g, b, -s / 2, -s * 0.62, s, t, ghost);
  g.restore();
}
const CAT_DOT = { resource: '#c9a34a', defense: '#9aa0a8', military: '#b5452f', naval: '#3f6fb5', civic: '#e3dccb', core: '#f2c14e' };
/* Zoomed out you cannot read a farm from a barracks anyway, and drawing four
   hundred little buildings in full costs more than everything else on screen
   put together. Below DETAIL_Z each one becomes a two-rectangle block, batched
   by category so the whole city is a dozen draw calls. */
const DETAIL_Z = 1.6;
const CAT_GLYPH = {
  resource: ['#d8b45c', '#8a6f2e'], defense: ['#b3b7bf', '#6c6f78'], military: ['#c9553d', '#7d2f20'],
  naval: ['#5b8bd0', '#2b4d7e'], civic: ['#e3dccb', '#a79f8b'], core: ['#f2c14e', '#a8802a'],
};
function drawGlyphs(g, list) {
  const byCat = new Map();
  for (const b of list) {
    const cat = BUILDINGS[b.type].cat;
    let l = byCat.get(cat);
    if (!l) byCat.set(cat, (l = []));
    l.push(b);
  }
  for (const [cat, items] of byCat) {
    const [top, side] = CAT_GLYPH[cat] || CAT_GLYPH.civic;
    const w = W_HEX * (cat === 'defense' ? 0.62 : 0.84), h = W_HEX * 0.62;
    g.fillStyle = side; g.beginPath();
    for (const b of items) g.rect(WG.cx[b.hex] - w / 2, WG.cy[b.hex] - h * 0.18, w, h * 0.7);
    g.fill();
    g.fillStyle = top; g.beginPath();
    for (const b of items) g.rect(WG.cx[b.hex] - w / 2, WG.cy[b.hex] - h * 0.62, w, h * 0.46);
    g.fill();
  }
}

/* ---- AI cities: procedural, around each capital, on hexes they own ---- */
const aiCityCache = new Map();
function aiCity(k) {
  const hit = aiCityCache.get(k.id);
  if (hit && hit.hall === k.hall && hit.cap === k.capital && hit.at <= S.time && S.time - hit.at < 30) return hit;
  const R = 2 + k.hall, rng = mulberry32(k.id * 7919 + k.hall), cap = k.capital;
  const own = (i) => S.world.owner[i] === k.id && buildableTerrain(i);
  const spots = WG.within(cap, R - 1).filter((i) => own(i) && WG.dist(i, cap) >= 2).sort(() => rng() - 0.5);
  const types = ['farm', 'lumbermill', 'goldmine', 'village', 'barracks', 'farm', 'archery', 'ironmine', 'warehouse', 'stable', 'university', 'village', 'goldmine', 'workshop', 'farm', 'diamondmine', 'lumbermill', 'village'];
  const lvl = Math.max(1, Math.min(6, k.hall));
  const buildings = [{ id: 1000 + k.id, type: 'hall', hex: cap, level: lvl, build: 0, color: k.color }];
  const n = Math.min(spots.length, 4 + k.hall * 3);
  for (let j = 0; j < n; j++) buildings.push({ id: 2000 + k.id * 100 + j, type: types[j % types.length], hex: spots[j], level: lvl, build: 0 });
  const ring = WG.within(cap, R).filter((i) => own(i) && WG.dist(i, cap) === R);
  const towers = clamp(Math.round(k.defense / 70), 1, 8), step = Math.max(1, Math.floor(ring.length / towers));
  const wallSet = new Set();
  ring.forEach((i, j) => { if (j % step === 0 && j / step < towers) buildings.push({ id: 3000 + k.id * 100 + j, type: j % 3 === 2 && k.hall >= 3 ? 'cannon' : 'tower', hex: i, level: lvl, build: 0 }); else if (k.hall >= 3) wallSet.add(i); });
  wallSet.forEach((i) => buildings.push({ id: 4000 + i, type: 'wall', hex: i, level: lvl, build: 0, wallSet }));
  const c = { hall: k.hall, cap: k.capital, at: S.time, buildings, R };
  aiCityCache.set(k.id, c);
  return c;
}

// Which hexes carry one of your buildings. Rebuilt when the list changes, not
// once per frame — on a slow machine those allocations are not free.
let builtSet = null, builtSetLen = -1, builtSetId = -1;
function builtHexes() {
  const last = S.buildings.length ? S.buildings[S.buildings.length - 1].id : -1;
  if (builtSet && builtSetLen === S.buildings.length && builtSetId === last) return builtSet;
  builtSetLen = S.buildings.length; builtSetId = last;
  builtSet = new Set();
  for (const b of S.buildings) builtSet.add(b.hex);
  return builtSet;
}
function drawCityLayer(g, t, dt, vis, inView) {
  const z = CAM.z, cap = S.world.capital, detail = z >= DETAIL_Z;
  const built = builtHexes();
  // plazas
  let cobble = null;               // one pattern for every plaza, not one per hex
  const plaza = (c) => {
    if (!inView(c)) return;
    if (!cobble) cobble = SETTINGS.graphics === 'high' ? patXform(pattern(g, 'cobble'), 0, 0) : '#b8ab92';
    g.fillStyle = cobble;
    g.beginPath();
    for (const i of [c].concat(WG.neighbors(c))) WG.hexPath(g, i, 1.02);
    g.fill();
  };
  plaza(cap);
  for (const k of S.kingdoms) if (!k.fallen && isSeen(k.capital)) plaza(k.capital);
  // cleared hexes & loose rocks on your land (walk your own hexes, not the screen)
  if (detail) for (const i of playerLand()) {
    if (!inView(i)) continue;
    if (cleared(i) && [T.FOREST, T.HILLS].includes(S.world.terrain[i])) { g.fillStyle = SETTINGS.graphics === 'high' ? patXform(pattern(g, 'grass')) : '#7fae55'; g.globalAlpha = 0.9; g.beginPath(); WG.hexPath(g, i, 0.98); g.fill(); g.globalAlpha = 1; }
    if (built.has(i)) continue;
    const o = obstacleAt(i);
    if (o === 'rock' && S.world.terrain[i] !== T.HILLS) { g.save(); g.translate(WG.cx[i], WG.cy[i]); g.scale(ART, ART); rock(g, 0, 6, 12); rock(g, 10, -2, 7); g.restore(); }
    else if (o === 'tree' && S.world.terrain[i] !== T.FOREST) { g.save(); g.translate(WG.cx[i], WG.cy[i]); g.scale(ART, ART); tree(g, -8, 4, 9); tree(g, 7, 9, 8, true); g.restore(); }
  }
  // placement / hover / selection
  const h = UI.hover;
  if (UI.placing && h >= 0) {
    const err = placementError(UI.placing, h);
    g.fillStyle = err ? 'rgba(229,83,75,.4)' : 'rgba(87,194,107,.4)'; g.beginPath(); WG.hexPath(g, h, 0.95); g.fill();
    g.strokeStyle = err ? '#e5534b' : '#57c26b'; g.lineWidth = 2 / z; g.stroke();
  }
  const sel = S.buildings.find((b) => b.id === UI.selected);
  if (sel) { g.strokeStyle = `rgba(242,193,78,${0.6 + 0.4 * Math.sin(t * 5)})`; g.lineWidth = 3 / z; g.beginPath(); WG.hexPath(g, sel.hex, sel.type === 'hall' ? 1.9 : 0.95); g.stroke(); }
  // buildings (yours + AI cities), depth-sorted; tiny dots when zoomed far out
  const fighting = Battles.list.length ? Battles.towerHexes() : null;   // those are drawn by the battle instead
  const shown = (b) => inView(b.hex) && !(fighting && fighting.has(b.hex) && DEF_TYPES.includes(b.type));
  const list = S.buildings.filter(shown);
  for (const k of S.kingdoms) if (!k.fallen && isSeen(k.capital)) for (const b of aiCity(k).buildings) if (shown(b)) list.push(b);
  list.sort((a, b) => WG.cy[a.hex] - WG.cy[b.hex]);
  if (detail) {
    /* Live art is what makes windmills turn and forges smoke; it is also the most
       expensive thing on screen. It is a High-graphics luxury, it stops when a
       whole metropolis is in view, and the governor can switch it off. Classic
       and Low-poly always use the (identical, just static) cached sprites. */
    const liveArt = SETTINGS.graphics === 'high' && z >= ART_LIVE_Z && GOV.level < 1 && list.length <= 140;
    if (liveArt) for (const b of list) drawOnHex(g, b, t);
    else {
      const ppu = clamp(Math.ceil(ART * z * DPR * 1.35 * 4) / 4, 0.5, 2);   // quantised, so the cache actually hits
      for (const b of list) { if (b.type === 'wall') drawOnHex(g, b, t); else drawOnHexCached(g, b, ppu); }
    }
  } else {
    // Keep the halls — there are only a handful in view and they are what you
    // navigate by — and reduce everything else to a block.
    const halls = list.filter((b) => b.type === 'hall');
    drawGlyphs(g, list.filter((b) => b.type !== 'hall'));
    for (const b of halls) drawOnHex(g, b, t);
  }
  if (UI.placing && h >= 0 && !placementError(UI.placing, h)) { g.globalAlpha = 0.65; drawOnHex(g, { id: 0, type: UI.placing, hex: h, level: 1, build: 0 }, t, true); g.globalAlpha = 1; }
  // production popups
  for (const b of S.buildings) {
    const prod = productionOf(b);
    if (!prod || b.build > 0 || S.res[prod[0]] >= capOf(prod[0]) || !inView(b.hex)) continue;
    popTimers[b.id] = (popTimers[b.id] ?? hash2(b.id, 1) * 6) - dt;
    if (popTimers[b.id] <= 0) {
      popTimers[b.id] = 6;
      const amt = prod[1] * 6 * prodMult(prod[0]);
      if (z > 2.5) floatText(WG.cx[b.hex], WG.cy[b.hex] - 7, `+${amt >= 10 ? fmt(amt) : amt.toFixed(1)} ${RES_META[prod[0]].icon}`, RES_META[prod[0]].color);
    }
  }
  if (detail) drawVillagers(g, t, dt);
  drawFx(g, dt);
}

function drawVillagers(g, t, dt) {
  const cap = S.world.capital;
  if (villagers.length < 12) villagers.push({ x: WG.cx[cap], y: WG.cy[cap] + 8, tx: WG.cx[cap], ty: WG.cy[cap], c: pick(['#c0392b', '#2980b9', '#8e44ad', '#16a085', '#d35400']), wait: Math.random() * 3 });
  const u = ART;
  for (const v of villagers) {
    const d = dist(v.x, v.y, v.tx, v.ty);
    if (d < 0.3) {
      v.wait -= dt;
      if (v.wait <= 0) { const land = WG.within(cap, landRadius()).filter(inLand); const i = pick(land.length ? land : [cap]); v.tx = WG.cx[i] + rand(-3, 3); v.ty = WG.cy[i] + rand(-3, 3); v.wait = rand(1, 4); }
    } else { const sp = Math.min(d, dt * 8); v.x += ((v.tx - v.x) / d) * sp; v.y += ((v.ty - v.y) / d) * sp; }
    const bob = d > 0.3 ? Math.abs(Math.sin(t * 9 + v.c.length)) * 1.5 * u : 0;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(v.x, v.y + u, 3 * u, 1.2 * u, 0, 0, 7); g.fill();
    g.fillStyle = v.c; g.fillRect(v.x - 2 * u, v.y - 6 * u - bob, 4 * u, 5.5 * u);
    g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(v.x, v.y - 7.5 * u - bob, 1.8 * u, 0, 7); g.fill();
  }
}

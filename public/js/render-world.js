/* ==========================================================================
   World map renderer: hex terrain with organic coasts, features, territory,
   armies/fleets, fog of war, minimap.
   ========================================================================== */
'use strict';

function worldLandColor(i) {
  const t = S.world.terrain[i], h = hash2(i, 21, 3);
  let c = shade(TERRAIN[t].color, (h - 0.5) * 0.12);
  const season = calendar().seasonIdx;
  if (season === 3 && t !== T.DESERT) c = mix(c, '#e8eef1', WG.row(i) < WH * 0.55 ? 0.5 : 0.25);
  else if (season === 2 && (t === T.FOREST || t === T.PLAINS || t === T.MEADOW)) c = mix(c, '#b8883a', 0.2);
  return c;
}
const entPos = (e) => {
  const a = e.at, n = e.path && e.path.length ? e.path[0] : a, p = e.prog || 0;
  // divisions resting at the capital line up beside the plaza instead of covering the Main Hall
  if (e.units && !e.ships && a === S.world.capital && !(e.path && e.path.length)) {
    const k = S.divisions.filter((d) => d.at === a && !d.path.length).indexOf(e);
    return [WG.cx[a] + W_HEX * (2.6 + 1.3 * k), WG.cy[a] + W_HEX * 2.1];
  }
  return [lerp(WG.cx[a], WG.cx[n], p), lerp(WG.cy[a], WG.cy[n], p)];
};

const DS = W_HEX / 30;   // detail art was authored for 30px hexes
function drawTerrainDetail(g, i, t) {
  g.save(); g.translate(WG.cx[i], WG.cy[i]); g.scale(DS, DS);
  try { detailArt(g, i, t); } finally { g.restore(); }
}
function detailArt(g, i, t) {
  const tt = S.world.terrain[i], x = 0, y = 0, s = 30, h = (k) => hash2(i, k, 9);
  const winter = calendar().seasonIdx === 3;
  if (tt === T.FOREST) {
    for (let k = 0; k < 4; k++) tree(g, x + (h(k) - 0.5) * s * 1.1, y + (h(k + 4) - 0.5) * s * 0.9 + 4, 5 + h(k + 8) * 3, k % 2);
  } else if (tt === T.HILLS) {
    for (let k = 0; k < 2; k++) { const hx = x + (k ? 8 : -7), hy = y + (k ? 6 : -2); g.fillStyle = '#8a7a52'; g.beginPath(); g.ellipse(hx, hy, 11, 7, 0, Math.PI, 0); g.fill(); g.fillStyle = '#b3a276'; g.beginPath(); g.ellipse(hx - 3, hy - 2, 5, 3, 0, Math.PI, 0); g.fill(); }
  } else if (tt === T.MOUNTAIN) {
    const peaks = [[-8, 6, 11, 22], [7, 8, 12, 26], [0, -2, 9, 18]];
    for (const [dx, dy, w, hh] of peaks) {
      const px = x + dx, py = y + dy;
      g.fillStyle = '#6e685e'; g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - hh); g.lineTo(px + w, py); g.fill();
      g.fillStyle = '#948d80'; g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - hh); g.lineTo(px - w * 0.1, py); g.fill();
      g.fillStyle = '#f4f6f8'; g.beginPath(); g.moveTo(px - w * (winter ? 0.7 : 0.35), py - hh * (winter ? 0.3 : 0.65)); g.lineTo(px, py - hh); g.lineTo(px + w * (winter ? 0.7 : 0.35), py - hh * (winter ? 0.3 : 0.65)); g.fill();
    }
  } else if (tt === T.DESERT) {
    g.strokeStyle = 'rgba(160,120,60,.45)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const dy = (k - 1) * 8; g.beginPath(); g.moveTo(x - 12, y + dy); g.quadraticCurveTo(x, y + dy - 6, x + 12, y + dy); g.stroke(); }
    if (h(3) > 0.7) { g.fillStyle = '#4f8a3a'; g.fillRect(x + 6, y - 6, 2.5, 10); g.fillRect(x + 3, y - 3, 3, 2); g.fillRect(x + 8, y - 2, 3, 2); }
  } else if (tt === T.SWAMP) {
    g.fillStyle = 'rgba(60,90,80,.7)'; g.beginPath(); g.ellipse(x - 5, y + 3, 9, 4, 0.2, 0, 7); g.ellipse(x + 8, y - 5, 6, 3, -0.3, 0, 7); g.fill();
    g.strokeStyle = '#3b5a2a'; g.lineWidth = 1; for (let k = 0; k < 5; k++) { const rx = x + (h(k) - 0.5) * 22; g.beginPath(); g.moveTo(rx, y + 10); g.lineTo(rx + 1, y + 3); g.stroke(); }
  } else if (tt === T.MEADOW) {
    for (let k = 0; k < 6; k++) { g.fillStyle = ['#f5e663', '#ffffff', '#e58ab0'][k % 3]; g.fillRect(x + (h(k) - 0.5) * s * 1.2, y + (h(k + 6) - 0.5) * s, 2, 2); }
  } else if (tt === T.PLAINS) {
    g.strokeStyle = 'rgba(70,110,40,.5)'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) { const gx = x + (h(k) - 0.5) * s * 1.1, gy = y + (h(k + 5) - 0.5) * s * 0.9; g.beginPath(); g.moveTo(gx - 2, gy); g.lineTo(gx, gy - 4); g.lineTo(gx + 2, gy); g.stroke(); }
  }
}

function drawFeature(g, i, f, t) {
  g.save(); g.translate(WG.cx[i], WG.cy[i]); g.scale(DS * 1.4, DS * 1.4);
  try { featureArt(g, i, f, t); } finally { g.restore(); }
}
function featureArt(g, i, f, t) {
  const x = 0, y = 0;
  if (f.type === 'goldvein') {
    for (let k = 0; k < 3; k++) { const on = Math.sin(t * 3 + k * 2 + i) > 0.3; g.fillStyle = on ? '#fff6c2' : '#f2c14e'; const sx = x + (k - 1) * 8, sy = y + (k % 2) * 6 - 2; g.fillRect(sx - 3, sy - 0.5, 6, 1.5); g.fillRect(sx - 0.7, sy - 3, 1.5, 6); }
  } else if (f.type === 'cave') {
    g.fillStyle = '#6e685e'; g.beginPath(); g.ellipse(x, y + 4, 14, 11, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#17120e'; g.beginPath(); g.ellipse(x, y + 4, 6, 7, 0, Math.PI, 0); g.fill();
    if (f.explored) { g.fillStyle = f.mineral === 'gems' ? '#c8a8ff' : f.mineral === 'gold' ? '#f2c14e' : '#c6d2de'; g.beginPath(); g.arc(x + 9, y - 3, 3.5, 0, 7); g.fill(); }
    else { g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText('?', x, y - 8); g.textAlign = 'left'; }
  } else if (f.type === 'ruins') {
    g.fillStyle = f.looted ? '#8d8a82' : '#cfc7b4';
    [[-9, 12], [-2, 18], [6, 9], [12, 14]].forEach(([dx, hh], k) => { if (f.looted && k % 2) return; g.fillRect(x + dx, y + 6 - hh, 4, hh); });
    g.fillRect(x - 11, y + 6, 26, 3);
    if (!f.looted) { g.fillStyle = '#e8dcc0'; g.fillRect(x - 10, y - 13, 12, 3); }
  } else if (f.type === 'fort') {
    const c = f.captured ? '#f2c14e' : '#7a7a86';
    g.fillStyle = '#8f9199'; g.fillRect(x - 12, y - 6, 24, 14);
    for (let k = 0; k < 4; k++) g.fillRect(x - 12 + k * 7, y - 10, 4, 4);
    g.fillStyle = '#5d5f66'; g.fillRect(x - 3, y + 1, 6, 7);
    g.fillStyle = '#4a3522'; g.fillRect(x + 8, y - 22, 1.5, 14);
    g.fillStyle = c; g.fillRect(x + 9.5, y - 22, 8, 5);
  } else if (f.type === 'wreck') {
    if (f.salvaged) return;
    const bob = Math.sin(t * 1.5 + i) * 1.2;
    g.fillStyle = '#4a2f18'; g.beginPath(); g.moveTo(x - 10, y + 4 + bob); g.lineTo(x + 8, y + 1 + bob); g.lineTo(x + 5, y + 6 + bob); g.fill();
    g.fillStyle = '#3a2716'; g.save(); g.translate(x - 2, y + 2 + bob); g.rotate(0.4); g.fillRect(-1, -16, 2, 16); g.restore();
    g.fillStyle = 'rgba(239,230,210,.7)'; g.beginPath(); g.moveTo(x + 2, y - 10 + bob); g.lineTo(x + 8, y - 4 + bob); g.lineTo(x + 1, y - 3 + bob); g.fill();
  } else if (f.type === 'cove') {
    if (f.destroyed) { g.fillStyle = '#3a2716'; g.fillRect(x - 8, y + 2, 16, 3); return; }
    g.fillStyle = '#6b4424'; g.fillRect(x - 10, y - 2, 14, 10);
    g.fillStyle = '#4a2f18'; g.beginPath(); g.moveTo(x - 12, y - 2); g.lineTo(x - 3, y - 10); g.lineTo(x + 6, y - 2); g.fill();
    g.fillStyle = '#222'; g.fillRect(x + 8, y - 20, 1.5, 22);
    g.fillStyle = '#111'; g.fillRect(x + 9.5, y - 20, 11, 7);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 15, y - 17, 1.8, 0, 7); g.fill();
  }
}

function drawCastle(g, cx, cy, s, color, big) {
  shadow(g, cx, cy + s * 0.32, s * 0.45, s * 0.12);
  g.fillStyle = '#b7bac2'; g.fillRect(cx - s * 0.35, cy - s * 0.15, s * 0.7, s * 0.45);
  for (let k = 0; k < 4; k++) g.fillRect(cx - s * 0.35 + k * s * 0.2, cy - s * 0.22, s * 0.1, s * 0.08);
  g.fillStyle = '#d0d3da'; g.fillRect(cx - s * 0.18, cy - s * 0.42, s * 0.36, s * 0.35);
  g.fillStyle = color; g.beginPath(); g.moveTo(cx - s * 0.24, cy - s * 0.42); g.lineTo(cx + s * 0.24, cy - s * 0.42); g.lineTo(cx, cy - s * 0.72); g.fill();
  if (big) { g.fillStyle = color; g.fillRect(cx + s * 0.28, cy - s * 0.52, s * 0.08, s * 0.4); }
  g.fillStyle = '#3a2b1a'; g.fillRect(cx - s * 0.07, cy + s * 0.1, s * 0.14, s * 0.2);
}
/* ---- Armies drawn as armies ----
   On High graphics, a zoomed-in army is not a flag with a number on it: every
   soldier is there, at exactly the size they are in a battle, drawn up in ranks
   with the spearmen, horse and engines where they would stand. Very large hosts
   draw one figure per handful of men so the block stays a block. */
const ARMY_Z = 3.2;                 // zoom at which the banner opens out into a formation
const ARMY_MAX_SPRITES = 420;
/* Eight hosts of a thousand men each would be several thousand figures a frame.
   The budget is shared out across whatever is actually on screen, and when it
   runs out the rest stay as banners. */
const ARMY_FRAME_SPRITES = 900;
let armyBudget = ARMY_FRAME_SPRITES;
// Drawn back rank first: engines and bows behind, horse in the middle, foot leading.
const MARCH_ORDER = ['catapult', 'archer', 'scout', 'horseman', 'pikeman', 'swordsman'];
function armyRanks(units, cap) {
  let total = 0;
  for (const u of MARCH_ORDER) total += units[u] || 0;
  if (!total) return null;
  const per = Math.max(1, Math.ceil(total / Math.max(24, Math.min(ARMY_MAX_SPRITES, cap)))), list = [];
  for (const u of MARCH_ORDER) { const n = Math.round((units[u] || 0) / per); for (let k = 0; k < n; k++) list.push(u); }
  if (!list.length) list.push(MARCH_ORDER.find((u) => units[u] > 0));
  return { list, per, total };
}
// Returns the half-height of the block in map units, so a banner can sit above it.
function drawArmyOnMap(g, x, y, units, color, t, moving, face) {
  if (armyBudget <= 0) return 0;
  const R = armyRanks(units, armyBudget);
  if (!R) return 0;
  armyBudget -= R.list.length;
  const cols = Math.max(1, Math.round(Math.sqrt(R.list.length * 1.7))), rows = Math.ceil(R.list.length / cols);
  const SPX = 8.4 * SOLDIER_SCALE, SPY = 7.6 * SOLDIER_SCALE;   // ranks close up with the smaller figures
  g.save(); g.translate(x, y); g.scale(BSC, BSC);
  R.list.forEach((u, k) => {
    const c = k % cols, r = (k / cols) | 0;
    const bx = (c - (cols - 1) / 2) * SPX + (hash2(k, 7) - 0.5) * 3.2;
    const by = (r - (rows - 1) / 2) * SPY + (hash2(k, 8) - 0.5) * 2.4;
    drawSoldier(g, bx, by, u, color, face, moving ? t * 2.4 + k * 0.6 : k * 0.6, false, false);
  });
  g.restore();
  return (((rows - 1) / 2) * SPY + 13 * SOLDIER_SCALE) * BSC;
}
function drawBanner(g, x, y, color, icon, count, t, selected, enemy) {
  shadow(g, x, y + 8, 10, 3);
  if (selected) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + 2, 16 + Math.sin(t * 5) * 1.5, 0, 7); g.stroke(); }
  g.fillStyle = '#3a2716'; g.fillRect(x - 1, y - 20, 2, 28);
  g.fillStyle = enemy ? color : color;
  g.beginPath(); g.moveTo(x + 1, y - 20); g.lineTo(x + 17 + Math.sin(t * 4) * 1.5, y - 17); g.lineTo(x + 17 + Math.sin(t * 4 + 1) * 1.5, y - 6); g.lineTo(x + 1, y - 9); g.fill();
  if (enemy) { g.strokeStyle = '#300'; g.lineWidth = 1; g.stroke(); }
  g.fillStyle = 'rgba(12,14,20,.85)'; const w = 14 + String(count).length * 6; g.fillRect(x - w / 2, y + 6, w, 12);
  g.fillStyle = enemy ? '#ffb3ad' : '#fff'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText(`${icon}${count}`, x, y + 15); g.textAlign = 'left';
}

/* ---- Fog of war: one pixel per hex (2 px wide so odd rows can shift by half a hex),
   upscaled with smoothing for soft edges, then textured with pre-rendered clouds.
   A rebuild touches ~16k pixels — well under a millisecond. ---- */
let fogMask = null, fogCanvas = null, fogClouds = null, fogBuiltAt = -1e9;
const FOG_UP = WG.N > 60000 ? 2 : 4;   // mask pixels → fog canvas pixels (smaller on the big map)
function fogLayer() {
  if (fogCanvas && (!fogDirty || performance.now() - fogBuiltAt < 250)) return fogCanvas;
  fogDirty = false; fogBuiltAt = performance.now();
  const MW = WG.W * 2 + 1, MH = WG.H;
  if (!fogMask) { fogMask = document.createElement('canvas'); fogMask.width = MW; fogMask.height = MH; }
  const mg = fogMask.getContext('2d'), img = mg.createImageData(MW, MH), d = img.data, seen = S.world.seen;
  for (let r = 0; r < MH; r++) for (let c = 0; c < WG.W; c++) {
    if (seen[r * WG.W + c]) continue;
    const x = 2 * c + (r & 1);
    for (const px of [x, x + 1]) { const o = (r * MW + px) * 4; d[o] = 12; d[o + 1] = 15; d[o + 2] = 21; d[o + 3] = 242; }
  }
  mg.putImageData(img, 0, 0);
  if (!fogCanvas) { fogCanvas = document.createElement('canvas'); fogCanvas.width = MW * FOG_UP; fogCanvas.height = MH * FOG_UP; }
  const fg = fogCanvas.getContext('2d');
  fg.globalCompositeOperation = 'copy'; fg.imageSmoothingEnabled = true; fg.imageSmoothingQuality = 'high';
  fg.drawImage(fogMask, 0, 0, fogCanvas.width, fogCanvas.height);
  fg.globalCompositeOperation = 'source-atop';
  fg.drawImage(fogCloudTexture(), 0, 0);
  fg.globalCompositeOperation = 'source-over';
  return fogCanvas;
}
function fogCloudTexture() {
  if (fogClouds) return fogClouds;
  fogClouds = document.createElement('canvas'); fogClouds.width = (WG.W * 2 + 1) * FOG_UP; fogClouds.height = WG.H * FOG_UP;
  const g = fogClouds.getContext('2d'), rng = mulberry32(S.seed + 5);
  for (let k = 0; k < 160; k++) {
    const x = rng() * fogClouds.width, y = rng() * fogClouds.height, r = 12 + rng() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(70,78,98,.45)'); grd.addColorStop(1, 'rgba(70,78,98,0)');
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return fogClouds;
}
function drawFog(g) {
  // Once the whole world is explored the fog layer is entirely transparent, and
  // blitting it across the screen every frame buys nothing at all. The same goes
  // for looking at the middle of a realm you long ago finished scouting.
  // (The mask is still kept current: the minimap is drawn from it.)
  if (seenCount >= WG.N) { if (!fogMask || fogDirty) { fogBuiltAt = -1e9; fogLayer(); } return; }
  const bb = unseenBounds();
  if (bb) {
    const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
    if (bb.x1 < x0 || bb.x0 > x1 || bb.y1 < y0 || bb.y0 > y1) { fogLayer(); return; }
  }
  const hw = W_HEX * SQ3, img = fogLayer();
  const sx = (hw / 2) / FOG_UP, sy = (W_HEX * 1.5) / FOG_UP, oy = W_HEX * 0.25;   // map units per fog pixel
  const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
  const px0 = clamp(Math.floor(x0 / sx) - 2, 0, img.width), px1 = clamp(Math.ceil(x1 / sx) + 2, 0, img.width);
  const py0 = clamp(Math.floor((y0 - oy) / sy) - 2, 0, img.height), py1 = clamp(Math.ceil((y1 - oy) / sy) + 2, 0, img.height);
  if (px1 > px0 && py1 > py0) g.drawImage(img, px0, py0, px1 - px0, py1 - py0, px0 * sx, oy + py0 * sy, (px1 - px0) * sx, (py1 - py0) * sy);
}
// Blit only the part of a whole-world image that is on screen (scale = image px per map unit).
function blitCrop(g, img, scale, x, y, w, h) {
  const sx0 = clamp(x * scale, 0, img.width), sy0 = clamp(y * scale, 0, img.height), sx1 = clamp((x + w) * scale, 0, img.width), sy1 = clamp((y + h) * scale, 0, img.height);
  if (sx1 > sx0 && sy1 > sy0) g.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, sx0 / scale, sy0 / scale, (sx1 - sx0) / scale, (sy1 - sy0) / scale);
}
function blitView(g, img, scale) {
  const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
  blitCrop(g, img, scale, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
}

/* ---- Whole-world atlas ----
   A full-resolution image of a 165,000-hex world would be ~200 MB, so the
   zoomed-far-out view is a small flat-colour mosaic instead: one rectangle per
   hex, batched by colour, sized to a fixed pixel budget whatever the map. It is
   also the instant stand-in while detailed tiles stream in. */
const LIVE_Z = 1.8;                   // at or above this zoom the terrain is drawn live, hex by hex
const ATLAS_Z = 0.55;                 // below this zoom the atlas is all you see
const ATLAS_S = clamp(Math.sqrt(4.2e6 / (WG.pw * WG.ph)), 0.06, 1);
const hexRect = (g, i, w, h) => g.rect(WG.cx[i] - w / 2, WG.cy[i] - h / 2, w, h);
let atlasBmp = null, atlasKey = '', atlasJob = null;
function worldAtlas() {
  const key = `${S.seed}|${WG.N}`;
  if (atlasBmp && key === atlasKey && !atlasJob) return atlasBmp;
  if (!atlasJob || atlasJob.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(WG.pw * ATLAS_S); c.height = Math.ceil(WG.ph * ATLAS_S);
    const g = c.getContext('2d');
    g.setTransform(ATLAS_S, 0, 0, ATLAS_S, 0, 0);
    g.fillStyle = DEPTH_COLORS[6]; g.fillRect(0, 0, WG.pw, WG.ph);
    atlasJob = { key, c, g, row: 0 };
  }
  const J = atlasJob, terrain = S.world.terrain, first = !atlasBmp, t0 = performance.now();
  const w = W_HEX * SQ3 * 1.02, h = W_HEX * 1.56;
  while (J.row < WG.H && (first || performance.now() - t0 < 7)) {
    const r1 = Math.min(WG.H, J.row + 40), byCol = new Map();
    for (let r = J.row; r < r1; r++) for (let q = 0; q < WG.W; q++) {
      const i = r * WG.W + q, t = terrain[i];
      const col = t === T.WATER ? DEPTH_COLORS[Math.min(WDEPTH[i], 7) - 1] : TERRAIN[t].color;
      let list = byCol.get(col);
      if (!list) byCol.set(col, (list = []));
      list.push(i);
    }
    for (const [col, list] of byCol) { J.g.fillStyle = col; J.g.beginPath(); for (const i of list) hexRect(J.g, i, w, h); J.g.fill(); }
    J.row = r1;
  }
  if (J.row >= WG.H) { atlasBmp = J.c; atlasKey = J.key; atlasJob = null; }
  return atlasBmp || J.c;
}
// Terrain and realms flattened into one image, so the far-out view and the tile
// fallback each cost a single blit instead of two.
let atlasFull = null, atlasFullVer = -2;
function atlasComposite() {
  if (atlasFull && atlasFullVer === ownerBmpVer && !atlasJob) return atlasFull;
  const base = worldAtlas(), own = ownerBitmap();
  if (atlasJob) return base;                      // still streaming — plain terrain will do
  if (!atlasFull) atlasFull = document.createElement('canvas');
  if (atlasFull.width !== base.width) { atlasFull.width = base.width; atlasFull.height = base.height; }
  const g = atlasFull.getContext('2d');
  g.globalCompositeOperation = 'copy'; g.drawImage(base, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.drawImage(own, 0, 0);
  atlasFullVer = ownerBmpVer;
  return atlasFull;
}
// The same trick for borders: flat blocks of each realm's colour, only while zoomed far out.
let ownerBmp = null, ownerBmpVer = -1, ownerBmpAt = -1e9;
function ownerBitmap() {
  if (ownerBmp && (ownerBmpVer === worldVersion || performance.now() - ownerBmpAt < 2500)) return ownerBmp;
  ownerBmpVer = worldVersion; ownerBmpAt = performance.now();
  const c = ownerBmp || document.createElement('canvas');
  c.width = Math.ceil(WG.pw * ATLAS_S); c.height = Math.ceil(WG.ph * ATLAS_S);
  const g = c.getContext('2d');
  g.setTransform(ATLAS_S, 0, 0, ATLAS_S, 0, 0); g.clearRect(0, 0, WG.pw, WG.ph);
  const w = W_HEX * SQ3 * 1.02, h = W_HEX * 1.56;
  for (const [o, list] of ownedByOwner()) {
    g.fillStyle = (o === -2 ? '#f2c14e' : S.kingdoms[o].color) + '66';
    g.beginPath(); for (const i of list) hexRect(g, i, w, h); g.fill();
  }
  ownerBmp = c;
  return c;
}
/* ---- zoomed-in LOD: terrain cached in map tiles ("chunks"), rebuilt only when they change ----
   The coarse tier covers the mid zooms the old whole-world bitmap used to. */
const LODS = [{ maxZ: 0.95, S: 0.55, size: 320 }, { maxZ: LIVE_Z, S: 1.3, size: 224 }, { maxZ: 3.2, S: 2.5, size: 128 }, { maxZ: 6, S: 4.2, size: 96 }, { maxZ: Infinity, S: 7, size: 72 }];
const CHUNK_BUDGET_MS = 4;          // time per frame spent building new tiles
const CHUNK_SLACK = 1.7;            // cache this much more than the screen needs, never less
/* Cached tiles are canvases, and on a GPU-backed browser every one of them is a
   texture. Left unbounded, panning around a 165,000-hex world at several levels
   of detail will happily allocate hundreds of megabytes of them and keep the
   card busy doing nothing useful, so the whole cache lives on a pixel budget. */
const CHUNK_PIXEL_BUDGET = 13e6;    // ≈52 MB of canvas across every level of detail
let chunkPixels = 0, chunkCost = 4;    // rolling estimate of what one tile costs, in ms
const chunkWant = [];                  // reused each frame; this runs sixty times a second
function trimChunks(activeCache, cap) {
  while (activeCache.size > cap) evictChunk(activeCache);
  if (chunkPixels <= CHUNK_PIXEL_BUDGET) return;
  for (let guard = 0; guard < 400 && chunkPixels > CHUNK_PIXEL_BUDGET; guard++) {
    const other = chunkCache.filter((m) => m !== activeCache && m.size).sort((a, b) => b.size - a.size)[0];
    if (!evictChunk(other || activeCache)) break;
  }
}
function evictChunk(cache) {
  if (!cache || !cache.size) return false;
  const k = cache.keys().next().value, c = cache.get(k);
  cache.delete(k);
  if (c) { chunkPixels -= c.width * c.height; c.width = c.height = 0; }
  return true;
}
const chunkCache = LODS.map(() => new Map()), chunkDirty = new Set();
let chunkKey = '';
// Invalidate the tiles around a hex (buildings/clearings change which decorations show).
function markChunks(i) {
  if (i == null || i < 0) return;
  for (const L of LODS) { const cx = Math.floor(WG.cx[i] / L.size), cy = Math.floor(WG.cy[i] / L.size); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) chunkDirty.add(`${L.size}:${cx + dx},${cy + dy}`); }
}
function renderChunk(L, cx, cy, occupied) {
  const c = document.createElement('canvas'); c.width = c.height = Math.ceil(L.size * L.S);
  const g = c.getContext('2d'), x0 = cx * L.size, y0 = cy * L.size, pad = W_HEX * 3;
  g.scale(L.S, L.S); g.translate(-x0, -y0);
  g.beginPath(); g.rect(x0, y0, L.size, L.size); g.clip();
  g.fillStyle = DEPTH_COLORS[6]; g.fillRect(x0, y0, L.size, L.size);
  const hw = W_HEX * SQ3, c0 = Math.max(0, Math.floor((x0 - pad) / hw) - 1), c1 = Math.min(WG.W - 1, Math.ceil((x0 + L.size + pad) / hw));
  const r0 = Math.max(0, Math.floor((y0 - pad) / (W_HEX * 1.5)) - 1), r1 = Math.min(WG.H - 1, Math.ceil((y0 + L.size + pad) / (W_HEX * 1.5)));
  const list = [];
  for (let r = r0; r <= r1; r++) for (let q = c0; q <= c1; q++) list.push(r * WG.W + q);
  const terrain = S.world.terrain, isLandW = (i) => terrain[i] !== T.WATER, cap = S.world.capital;
  GFX.pat.clear(); GFX.ctx = null;
  drawTerrainBase(g, WG, list, isLandW, WDEPTH, worldLandColor, S.seed + 1, 0, (i) => WORLD_TEX[terrain[i]], worldShade);
  for (const i of list) {
    if (!isLandW(i) || occupied.has(i) || WG.dist(i, cap) <= 1 || (cleared(i) && S.world.owner[i] === -2)) continue;
    drawTerrainDetail(g, i, 0);
  }
  if (SETTINGS.showGrid) { g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = 0.5; g.beginPath(); for (const i of list) if (isLandW(i)) WG.hexPath(g, i, 0.99); g.stroke(); }
  GFX.pat.clear(); GFX.ctx = null;
  return c;
}
function drawChunks(g, z, occupied) {
  const key = `${calendar().seasonIdx}|${SETTINGS.graphics}|${S.seed}|${SETTINGS.showGrid}`;
  if (key !== chunkKey) { chunkKey = key; chunkCache.forEach((m) => { while (evictChunk(m)); }); chunkDirty.clear(); }
  let li = 0;
  while (li < LODS.length - 1 && z >= LODS[li].maxZ) li++;
  const L = LODS[li], cache = chunkCache[li];
  for (const k of chunkDirty) {
    if (!k.startsWith(L.size + ':')) continue;
    const id = k.slice(k.indexOf(':') + 1), c = cache.get(id);
    if (c) { chunkPixels -= c.width * c.height; c.width = c.height = 0; cache.delete(id); }
    chunkDirty.delete(k);
  }
  const [x0, y0] = CAM.toWorld(0, 0), [x1, y1] = CAM.toWorld(CW, CH);
  const cx0 = Math.floor(x0 / L.size), cx1 = Math.floor(x1 / L.size), cy0 = Math.floor(y0 / L.size), cy1 = Math.floor(y1 / L.size);
  const want = chunkWant;
  want.length = 0;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) want.push([cx, cy, Math.hypot(cx - (cx0 + cx1) / 2, cy - (cy0 + cy1) / 2)]);
  want.sort((a, b) => a[2] - b[2]);
  // The cache must always hold more than one screenful, or every frame evicts a
  // tile it is about to need again and the whole view is rebuilt over and over.
  const cap = Math.max(24, Math.ceil(want.length * CHUNK_SLACK));
  let missing = 0;
  for (const [cx, cy] of want) if (!cache.has(cx + ',' + cy)) missing++;
  // A few gaps are patched per tile; a viewful of them is one blit of the atlas.
  if (missing > 3) blitCrop(g, atlasComposite(), ATLAS_S, x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
  const t0 = performance.now();
  for (const [cx, cy] of want) {
    const k = cx + ',' + cy;
    let c = cache.get(k);
    // Start a tile only if there is room for one in this frame's budget — a tile
    // that overruns is exactly the stutter people feel while panning.
    const spent = performance.now() - t0;
    if (!c && !GOV.busy && (spent === 0 || spent + chunkCost <= CHUNK_BUDGET_MS)) {
      const s0 = performance.now();
      c = renderChunk(L, cx, cy, occupied);
      chunkCost += (performance.now() - s0 - chunkCost) * 0.3;
      cache.set(k, c); chunkPixels += c.width * c.height;
    }
    if (!c) { if (missing <= 3) blitCrop(g, atlasComposite(), ATLAS_S, cx * L.size, cy * L.size, L.size, L.size); continue; }
    cache.delete(k); cache.set(k, c);                 // LRU touch
    g.drawImage(c, cx * L.size, cy * L.size, L.size, L.size);
  }
  trimChunks(cache, cap);
}

/* Every claimed hex on the map, grouped by who owns it. Rebuilt at most twice a
   second: thirty kingdoms nibbling at the borders would otherwise re-sweep
   165,000 hexes dozens of times per AI turn. */
let ownedGroups = null, ownedGroupsVer = -1, ownedGroupsAt = -1e9;
function ownedByOwner() {
  if (ownedGroups && (ownedGroupsVer === worldVersion || performance.now() - ownedGroupsAt < 500)) return ownedGroups;
  ownedGroupsVer = worldVersion; ownedGroupsAt = performance.now();
  const owner = S.world.owner, m = new Map();
  for (let i = 0; i < owner.length; i++) { const o = owner[i]; if (o === -1) continue; let l = m.get(o); if (!l) m.set(o, (l = [])); l.push(i); }
  return (ownedGroups = m);
}
/* Borders as cached Path2D shapes, covering the region around the camera rather
   than the whole world: filling a path with every claimed hex on a 165,000-hex
   map costs real time even where it is off screen. The region is snapped to a
   coarse grid so ordinary panning reuses the same paths. */
const TERR_REGION = 900;            // map units of slack around the view
let terrPaths = null, terrPathsVer = -2, terrPathsKey = '';
function territoryPaths(vx0, vy0, vx1, vy1) {
  const q = TERR_REGION;
  const rx0 = Math.floor(vx0 / q) * q - q, ry0 = Math.floor(vy0 / q) * q - q;
  const rx1 = Math.ceil(vx1 / q) * q + q, ry1 = Math.ceil(vy1 / q) * q + q;
  const key = `${rx0},${ry0},${rx1},${ry1}|${CAM.z < LIVE_Z ? 'b' : 'h'}`;
  if (terrPaths && terrPathsVer === ownedGroupsVer && terrPathsKey === key) return terrPaths;
  const owner = S.world.owner;
  const near = (i) => WG.cx[i] >= rx0 && WG.cx[i] <= rx1 && WG.cy[i] >= ry0 && WG.cy[i] <= ry1;
  terrPaths = [];
  for (const [o, all] of ownedByOwner()) {
    const hexes = all.filter(near);
    if (!hexes.length) continue;
    const fill = new Path2D(), line = new Path2D();
    const blocky = CAM.z < LIVE_Z, bw = W_HEX * SQ3 * 1.02, bh = W_HEX * 1.56;
    for (const i of hexes) {
      const s2 = W_HEX * 1.02, x = WG.cx[i], y = WG.cy[i];
      if (blocky) fill.rect(x - bw / 2, y - bh / 2, bw, bh);
      else {
        fill.moveTo(x + HEX_CORNER[0][0] * s2, y + HEX_CORNER[0][1] * s2);
        for (let k = 1; k < 6; k++) fill.lineTo(x + HEX_CORNER[k][0] * s2, y + HEX_CORNER[k][1] * s2);
        fill.closePath();
      }
      for (let d = 0; d < 6; d++) {
        const n = WG.nb[i * 6 + d];
        if (n >= 0 && owner[n] === o) continue;
        const [x0, y0] = WG.corner(i, d, 0.94), [x1, y1] = WG.corner(i, d + 1, 0.94);
        line.moveTo(x0, y0); line.lineTo(x1, y1);
      }
    }
    terrPaths.push({ color: o === -2 ? '#f2c14e' : S.kingdoms[o].color, fill, line });
  }
  terrPathsVer = ownedGroupsVer; terrPathsKey = key;
  return terrPaths;
}
function drawTerritory(g, inView, z, vx0, vy0, vx1, vy1) {
  ownedByOwner();                       // refresh the index (throttled) before the paths key off it
  g.lineCap = 'round';
  for (const P of territoryPaths(vx0, vy0, vx1, vy1)) {
    g.fillStyle = P.color + '30'; g.fill(P.fill);
    g.strokeStyle = P.color; g.lineWidth = Math.max(1.6, 2.6 / z); g.stroke(P.line);
  }
}

function drawWorld(g, t, dt) {
  const cam = CAM, z = cam.z, { terrain, feat } = S.world;
  const es = clamp(1.3 / z, 0.22, 1.2);   // map icons keep a steady on-screen size
  healCanvas(g);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
  // Each layer is drawn on its own: one that throws is reported and skipped,
  // and the rest of the map — above all the terrain — still appears.
  const layer = (name, fn) => {
    try { fn(); } catch (e) {
      canvasPoisoned = true; reportError('draw ' + name, e);
      cam.apply(g); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
    }
  };
  // The terrain covers the screen by itself whenever the view is wholly inside
  // the map, so on those frames the clear is a screenful of wasted fill.
  const [wx0, wy0] = cam.toWorld(0, 0), [wx1, wy1] = cam.toWorld(CW, CH);
  if (wx0 < 0 || wy0 < 0 || wx1 > WG.pw || wy1 > WG.ph) { g.fillStyle = DEPTH_COLORS[6]; g.fillRect(0, 0, CW, CH); }
  cam.apply(g);
  if (shakeAmt > 0) { g.translate(rand(-shakeAmt, shakeAmt) / z, rand(-shakeAmt, shakeAmt) / z); shakeAmt *= 0.85; if (shakeAmt < 0.3) shakeAmt = 0; }
  // farOut = too small to see anything per-hex; cheapTerrain = the flat world
  // image instead of streamed tiles, which is also where the governor retreats to.
  const farOut = z < ATLAS_Z, cheapTerrain = farOut || GOV.level >= 4, live = z >= LIVE_Z && GOV.level < 3;
  const atlasOnly = farOut;
  const vis = live ? cam.visible(1) : [], isLandW = (i) => terrain[i] !== T.WATER;
  const [vx0, vy0] = cam.toWorld(-40, -40), [vx1, vy1] = cam.toWorld(CW + 40, CH + 40);
  const inView = (i) => WG.cx[i] >= vx0 && WG.cx[i] <= vx1 && WG.cy[i] >= vy0 && WG.cy[i] <= vy1;
  const cap = S.world.capital;
  const occupied = new Set(S.buildings.map((b) => b.hex));
  const nearView = (i, pad) => WG.cx[i] >= vx0 - pad && WG.cx[i] <= vx1 + pad && WG.cy[i] >= vy0 - pad && WG.cy[i] <= vy1 + pad;
  for (const k of S.kingdoms) if (!k.fallen && isSeen(k.capital) && nearView(k.capital, W_HEX * 3 * (3 + k.hall))) for (const b of aiCity(k).buildings) occupied.add(b.hex);
  layer('terrain', () => {
  if (cheapTerrain) {                                    // the whole continent in one image
    blitView(g, atlasComposite(), ATLAS_S);
  }
  if (!farOut) {
    if (!cheapTerrain) drawChunks(g, z, occupied);       // (blits the atlas where tiles are still missing)
    if (live) {
      if (SETTINGS.graphics === 'high' && GOV.level < 1 && z >= 2.4) {   // animated water on top of the cached tiles
        const water = vis.filter((i) => !isLandW(i) && WDEPTH[i] <= 4);
        if (water.length) {
          g.save(); g.beginPath(); for (const i of water) { g.moveTo(WG.cx[i] + W_HEX * 1.2, WG.cy[i]); g.arc(WG.cx[i], WG.cy[i], W_HEX * 1.2, 0, Math.PI * 2); } g.clip();
          g.globalAlpha = 0.28; g.fillStyle = patXform(pattern(g, 'water'), t * 7, t * 2); g.fillRect(-1e4, -1e4, 3e4, 3e4); g.globalAlpha = 1; g.restore();
        }
      }
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 0.6;
      g.beginPath();
      for (const i of vis) { if (isLandW(i) || hash2(i, 4) < 0.55) continue; const o = Math.sin(t + i * 0.7) * 2, x = WG.cx[i], y = WG.cy[i]; g.moveTo(x - 3 + o, y); g.quadraticCurveTo(x + o, y - 1.2, x + 3 + o, y); }
      g.stroke();
    }
    drawTerritory(g, inView, z, vx0, vy0, vx1, vy1);
  }
  });
  // A few hundred feature hexes, checked against the view — never a sweep of
  // every hex on screen (which is tens of thousands when zoomed out).
  layer('features', () => { if (z > 0.6 && !atlasOnly) for (const i of featureHexes()) { const f = feat[i]; if (f && inView(i) && isSeen(i) && !occupied.has(i)) drawFeature(g, i, f, t); } });
  layer('city', () => { if (!atlasOnly) drawCityLayer(g, t, dt, vis, inView); });
  layer('units', () => {
  const icon = (x, y, fn) => { g.save(); g.translate(x, y); g.scale(es, es); fn(); g.restore(); };
  const fullArmies = SETTINGS.graphics === 'high' && z >= ARMY_Z && GOV.level < 1;   // every soldier, not a flag
  armyBudget = ARMY_FRAME_SPRITES;
  // paths of selected entity & visible enemy raids
  const selE = selectedEntity();
  const pathLine = (e, color, dash) => {
    if (!e.path || !e.path.length) return;
    const [sx, sy] = entPos(e);
    g.strokeStyle = color; g.lineWidth = 2.5 / z; g.setLineDash(dash.map((v) => v / z)); g.lineDashOffset = (-t * 20) / z;
    g.beginPath(); g.moveTo(sx, sy); for (const p of e.path) g.lineTo(WG.cx[p], WG.cy[p]); g.stroke(); g.setLineDash([]);
    const last = e.path[e.path.length - 1];
    g.beginPath(); g.arc(WG.cx[last], WG.cy[last], 8 / z, 0, 7); g.stroke();
  };
  const onScreen = (e) => inView(e.at) || (e.path && e.path.length && inView(e.path[e.path.length - 1]));
  for (const e of S.divisions.concat(S.fleets)) if (onScreen(e)) pathLine(e, e === selE ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)', [6, 6]);
  for (const p of S.scouts) if (onScreen(p)) pathLine(p, p === selE ? 'rgba(127,212,255,.95)' : 'rgba(127,212,255,.4)', [3, 5]);
  // detection rings: an army attacks any enemy that walks inside this circle
  for (const d of S.divisions) {
    if (d.status === 'fighting' || !inView(d.at)) continue;
    const idle = !d.path.length, sel = d === selE, [rx, ry] = entPos(d);
    g.strokeStyle = sel ? 'rgba(242,193,78,.7)' : 'rgba(242,193,78,.24)';
    g.lineWidth = (sel ? 2.5 : 2) / z; g.setLineDash([3 / z, 4 / z]);
    g.beginPath(); g.arc(rx, ry, detectRange(d, idle) * W_HEX * SQ3 * 1.04, 0, 7); g.stroke(); g.setLineDash([]);
  }
  for (const a of S.aiArmies) if (a.kind === 'raid' && isSeen(a.at) && onScreen(a)) pathLine(a, 'rgba(229,83,75,.8)', [4, 6]);
  for (const a of S.aiArmies) if (a.kind === 'raid' && a.targetHex != null && inView(a.targetHex)) { g.strokeStyle = `rgba(229,83,75,${0.5 + 0.4 * Math.sin(t * 6)})`; g.lineWidth = 3 / z; g.beginPath(); WG.hexPath(g, a.targetHex, 1.3); g.stroke(); }
  // scout parties
  for (const p of S.scouts) {
    if (!inView(p.at)) continue;
    const [px0, py0] = entPos(p), sel = selE === p;
    g.save(); g.translate(px0, py0); g.scale(es, es); const x = 0, y = 0;
    if (sel) { g.strokeStyle = '#7fd4ff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 4, 13 + Math.sin(t * 5), 0, 7); g.stroke(); }
    shadow(g, x, y + 5, 7, 2.5);
    const bob = p.path.length ? Math.abs(Math.sin(t * 10)) * 1.5 : 0;
    g.fillStyle = '#3f6fb5'; g.fillRect(x - 3, y - 9 - bob, 6, 8);
    g.fillStyle = '#f1c9a5'; g.beginPath(); g.arc(x, y - 11 - bob, 2.6, 0, 7); g.fill();
    g.strokeStyle = '#c9a44a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 2, y - 11 - bob); g.lineTo(x + 8, y - 13 - bob); g.stroke();
    g.fillStyle = 'rgba(12,14,20,.85)'; g.fillRect(x - 10, y + 5, 20, 11);
    g.fillStyle = '#7fd4ff'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.fillText(`🔭${p.n}`, x, y + 13); g.textAlign = 'left';
    g.restore();
  }
  // AI forces (only where you can see them)
  for (const a of S.aiArmies) {
    if (!isSeen(a.at) || !inView(a.at)) continue;    // a hundred armies on a revealed map, two of them on screen
    if (a.status === 'fighting') continue;
    const [x, y] = entPos(a), k = S.kingdoms[a.kid];
    const top = fullArmies && !isWater(a.at) ? drawArmyOnMap(g, x, y, a.units, k.color, t, a.path.length > 0, a.path.length && WG.cx[a.path[0]] < x ? -1 : 1) : 0;
    icon(x, y - top, () => drawBanner(g, 0, 0, k.color, a.kind === 'raid' ? '⚔' : a.kind === 'guard' ? '🛡' : '', armyHousing(a.units), t, false, a.kind === 'raid' || hostileToPlayer(k)));
  }
  for (const f of S.aiFleets) {
    if (!isSeen(f.at) || !inView(f.at)) continue;
    if (f.status === 'fighting') continue;
    const [x, y] = entPos(f), pirate = f.owner === 'pirate';
    const nx = f.path.length ? WG.cx[f.path[0]] : x, main = SHIP_TYPES.slice().reverse().find((st) => f.ships[st] > 0) || 'galley';
    icon(x, y, () => {
      drawShip(g, 0, 0, main, pirate ? '#222' : S.kingdoms[f.owner].color, nx >= x ? 1 : -1, t + x, false, pirate, 0.9);
      g.fillStyle = 'rgba(12,14,20,.85)'; g.fillRect(-14, 8, 28, 12);
      g.fillStyle = pirate ? '#ddd' : shade(S.kingdoms[f.owner].color, 0.3); g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText(`⚓${shipCount(f.ships)}`, 0, 17); g.textAlign = 'left';
    });
  }
  // ships lying at anchor beside the shipyard or port that holds them
  for (const m of berths()) {
    const n = shipCount(m.ships);
    if (!n || !inView(m.hex)) continue;
    const main = SHIP_TYPES.slice().reverse().find((st) => m.ships[st] > 0);
    g.save(); g.translate(WG.cx[m.hex], WG.cy[m.hex]); g.scale(es * 0.8, es * 0.8); g.globalAlpha = 0.9;
    drawShip(g, 0, 0, main, '#f2c14e', 1, t * 0.3 + m.hex, false, false, 1);
    g.fillStyle = 'rgba(12,14,20,.75)'; g.fillRect(-13, 8, 26, 12);
    g.fillStyle = '#e8d9a8'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText(`⚓${n}`, 0, 17); g.textAlign = 'left';
    g.restore();
  }
  // player forces
  for (const f of S.fleets) {
    if (f.status === 'fighting' || !inView(f.at)) continue;
    const [fx0, fy0] = entPos(f), nx = f.path.length ? WG.cx[f.path[0]] : fx0 + 1;
    g.save(); g.translate(fx0, fy0); g.scale(es, es); const x = 0, y = 0;
    if (f === selE) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 6, 20 + Math.sin(t * 5) * 1.5, 0, 7); g.stroke(); }
    const main = SHIP_TYPES.slice().reverse().find((st) => f.ships[st] > 0) || 'sloop';
    drawShip(g, x, y, main, '#f2c14e', nx >= fx0 ? 1 : -1, t + fx0, false, false, 1);
    g.fillStyle = 'rgba(12,14,20,.85)'; g.fillRect(x - 14, y + 8, 28, 12);
    g.fillStyle = '#f2c14e'; g.font = 'bold 9px sans-serif'; g.textAlign = 'center'; g.fillText(`⚓${shipCount(f.ships)}`, x, y + 17); g.textAlign = 'left';
    g.restore();
  }
  for (const d of S.divisions) {
    if (d.status === 'fighting' || !inView(d.at)) continue;
    const [dx0, dy0] = entPos(d);
    const water = isWater(d.at);
    const top = fullArmies && !water ? drawArmyOnMap(g, dx0, dy0, d.units, d.color, t, d.path.length > 0, d.path.length && WG.cx[d.path[0]] < dx0 ? -1 : 1) : 0;
    icon(dx0, dy0 - top, () => {
      if (water) drawShip(g, 0, 0, 'cog', d.color, 1, t, false, false, 0.8);
      drawBanner(g, 0, water ? -10 : 0, d.color, '', armyHousing(d.units), t, d === selE, false);
    });
  }
  });
  layer('clouds', () => drawCloudShadows(g, WG, t));
  layer('fog', () => drawFog(g));
  layer('battles', () => Battles.draw(g, t));   // battles stay visible above the fog
  layer('labels', () => {
  // labels (on top of fog so known names stay readable)
  const fs = 12 / z;
  g.font = `bold ${fs}px sans-serif`; g.textAlign = 'center';
  const label = (text, x, y, c) => { const w = g.measureText(text).width + 10; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x - w / 2, y - fs, w, fs * 1.35); g.fillStyle = c; g.fillText(text, x, y); };
  const off = (r) => Math.max(r * W_HEX * 1.5, 26 / z);
  label(S.name, WG.cx[cap], WG.cy[cap] + off(landRadius() * 0.35), '#f2c14e');
  for (const k of S.kingdoms) if (!k.fallen && isSeen(k.capital)) label(`${k.name} · ${k.hall}${k.atWar ? ' ⚔' : ''}`, WG.cx[k.capital], WG.cy[k.capital] + off(1 + k.hall * 0.35), shade(k.color, 0.35));
  g.textAlign = 'left';
  // selection + hover
  if (UI.worldSel >= 0 && !UI.selected) { g.strokeStyle = '#fff'; g.lineWidth = 2.5 / z; g.beginPath(); WG.hexPath(g, UI.worldSel, 0.92); g.stroke(); g.strokeStyle = '#f2c14e'; g.lineWidth = 1.5 / z; g.beginPath(); WG.hexPath(g, UI.worldSel, 1.05); g.stroke(); }
  if (UI.hover >= 0 && !UI.placing) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5 / z; g.beginPath(); WG.hexPath(g, UI.hover, 0.95); g.stroke(); }
  });
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  layer('atmosphere', () => { g.setTransform(DPR, 0, 0, DPR, 0, 0); drawAtmosphere(g); });
  layer('minimap', () => drawMinimap(t));
}

/* ---------- minimap ---------- */
let miniCache = null, miniKey = '';
function drawMinimap() {
  const mc = el('minimap');
  if (!mc) return;
  mc.hidden = !SETTINGS.minimap;
  if (mc.hidden) return;
  const W = 200, H = Math.round(W * WG.ph / WG.pw), sc = W / WG.pw;
  if (mc.width !== W * DPR) { mc.width = W * DPR; mc.height = H * DPR; mc.style.width = W + 'px'; mc.style.height = H + 'px'; }
  const g = mc.getContext('2d');
  const key = `${worldVersion}-${seenCount}`;
  if (!miniCache || (key !== miniKey && performance.now() - (drawMinimap.at || 0) > 1500)) {
    drawMinimap.at = performance.now();
    miniKey = key;
    // Built from the images the map already keeps — terrain atlas, realm colours,
    // fog mask — so it costs three blits instead of a sweep of every hex.
    miniCache = document.createElement('canvas'); miniCache.width = W * DPR; miniCache.height = H * DPR;
    const m = miniCache.getContext('2d'); m.scale(DPR, DPR);
    m.imageSmoothingEnabled = true;
    m.fillStyle = DEPTH_COLORS[4]; m.fillRect(0, 0, W, H);
    m.drawImage(atlasComposite(), 0, 0, W, H);
    if (fogMask) m.drawImage(fogMask, 0, 0, W, H);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(miniCache, 0, 0);
  g.setTransform(DPR * sc, 0, 0, DPR * sc, 0, 0);
  const dot = Math.max(25, WG.pw / 110);
  g.fillStyle = '#fff';
  for (const d of S.divisions) { const [x, y] = entPos(d); g.fillRect(x - dot, y - dot, dot * 2, dot * 2); }
  g.fillStyle = '#7fd4ff';
  for (const f of S.fleets) { const [x, y] = entPos(f); g.fillRect(x - dot, y - dot, dot * 2, dot * 2); }
  g.fillStyle = '#ff5a4f';
  for (const a of S.aiArmies) if (a.kind === 'raid' && isSeen(a.at)) { const [x, y] = entPos(a); g.fillRect(x - dot * 1.2, y - dot * 1.2, dot * 2.4, dot * 2.4); }
  const cam = CAM, [x0, y0] = cam.toWorld(0, 0), [x1, y1] = cam.toWorld(CW, CH);
  g.strokeStyle = '#fff'; g.lineWidth = 2 / sc; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
}
function selectedEntity() {
  const s = UI.selEntity;
  if (!s) return null;
  return (s.kind === 'division' ? S.divisions : s.kind === 'scout' ? S.scouts : S.fleets).find((e) => e.id === s.id) || null;
}

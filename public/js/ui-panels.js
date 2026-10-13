/* ==========================================================================
   UI part 1: toasts, HUD, and the side-panel tab renderers.
   ========================================================================== */
'use strict';

function toast(text, kind = '') {
  const box = el('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = text;
  box.appendChild(t);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 4200);
}

/* ---------- HUD ---------- */
function buildHud() {
  el('resources').innerHTML = RES.map((k) => `<div class="res" id="res-${k}" style="--c:${RES_META[k].color}">
    <span class="ico">${RES_META[k].icon}</span><div class="res-txt"><span class="val">0</span><span class="cap">/0</span></div><span class="rate"></span><i class="fill"></i></div>`).join('');
  el('version').textContent = 'v' + GAME_VERSION;
}
function bumpRes(keys) {
  for (const k of keys) { const n = el('res-' + k); if (n) { n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } }
}
function updateHud() {
  const fc = el('fps-chip');
  if (fc) {
    fc.hidden = !SETTINGS.showFps;
    if (SETTINGS.showFps) { el('fps-label').textContent = GOV.fps + (GOV.level ? ` ·${'▾'.repeat(GOV.level)}` : ''); fc.title = GOV.level ? `Frame rate — quality reduced ${GOV.level} step${GOV.level > 1 ? 's' : ''} to keep up` : 'Frames per second'; }
  }
  const r = rates(), tb = territoryBonus(), u = upkeep();
  for (const k of RES) {
    const n = el('res-' + k), cap = capOf(k), v = r[k] * 60;
    n.querySelector('.val').textContent = fmt(S.res[k]);
    n.querySelector('.cap').textContent = '/' + fmt(cap);
    const rate = n.querySelector('.rate');
    rate.textContent = (v >= 0 ? '+' : '') + (Math.abs(v) >= 100 ? fmt(v) : v.toFixed(Math.abs(v) < 10 ? 1 : 0)) + '/m';
    rate.classList.toggle('neg', v < 0);
    n.querySelector('.fill').style.width = clamp((S.res[k] / cap) * 100, 0, 100) + '%';
    n.classList.toggle('full', S.res[k] >= cap);
    n.title = `${RES_META[k].name}: ${Math.floor(S.res[k])} / ${cap}\nNet ${v.toFixed(1)}/min · land bonus +${(tb[k] * 60).toFixed(1)}/min · multiplier ×${prodMult(k).toFixed(2)}` +
      (k === 'food' ? `\nTroop upkeep −${(u.food * 60).toFixed(1)}/min` : '') + (k === 'gold' && u.gold ? `\nShip upkeep −${(u.gold * 60).toFixed(1)}/min` : '');
  }
  const cal = calendar();
  el('kingdom-name').textContent = S.name;
  el('hall-label').textContent = `Main Hall ${hallLevel()} · ${playerTiles()} hexes of land`;
  el('calendar').textContent = `${cal.season.icon} ${cal.season.name} ${cal.day} · Y${cal.year}`;
  el('builders').textContent = `${buildersBusy()}/${builderCount()}`;
  const unis = universities();
  el('research-chip').textContent = unis.length ? `${unis.filter((b) => b.research).length}/${unis.length}` : '—';
  el('army-cap').textContent = fmt(totalHousing());
  el('fleet-cap').textContent = fmt(shipCount(allShips()));
  el('power').textContent = fmt(totalPower());
  el('shield-chip').hidden = S.shield <= 0;
  el('shield-time').textContent = fmtTime(S.shield);
  el('log-dot').hidden = !UI.logUnread;
  if (!API.online) el('sync-label').textContent = 'local';
  // threat alerts
  const threats = S.aiArmies.filter((a) => a.kind === 'raid');
  const pir = S.aiFleets.filter((f) => f.owner === 'pirate' && isSeen(f.at));
  const alerts = Battles.list.filter((b) => !b.done).map((b) => `<button class="alert battle" data-action="b-focus" data-arg="${b.id}">⚔️ Battle: ${esc(b.cfg.title)} — command it!</button>`)
    .concat(threats.map((a) => { const tgt = a.targetHex ?? S.world.capital, cap = tgt === S.world.capital; return `<button class="alert" data-action="focus-hex" data-arg="${a.at}">⚠ ${esc(S.kingdoms[a.kid].name)} army → ${cap ? 'capital' : hexName(tgt) + (isDefended(tgt) ? '' : ' (undefended)')} · ETA ${fmtTime(etaAi(a))}</button>`; }))
    .concat(pir.map((p) => `<button class="alert pirate" data-action="focus-hex" data-arg="${p.at}">🏴‍☠️ Pirates sighted</button>`))
    .concat(S.pirateBlockade > 0 ? [`<span class="alert">⚓ Port blockaded ${fmtTime(S.pirateBlockade)}</span>`] : [])
    .concat(S.res.food <= 0 && rates().food < 0 ? ['<span class="alert">🌾 Starving — troops are deserting! Build farms.</span>'] : []);
  const html = alerts.join('');
  if (el('alerts').dataset.html !== html) { el('alerts').innerHTML = html; el('alerts').dataset.html = html; }
}

/* ---------- helpers ---------- */
const costHtml = (cost, have) => '<span class="cost">' + Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) =>
  `<span class="${have && have[k] < v ? 'short' : ''}" title="${RES_META[k].name}">${RES_META[k].icon}${fmt(v)}</span>`).join('') + '</span>';
const statBars = (st) => `
  <div class="stat-bar atk"><span>Attack</span><div class="track"><i style="width:${st.atk}%"></i></div><b>${st.atk}</b></div>
  <div class="stat-bar hp"><span>Health</span><div class="track"><i style="width:${st.hp}%"></i></div><b>${st.hp}</b></div>
  <div class="stat-bar spd"><span>Speed</span><div class="track"><i style="width:${st.spd}%"></i></div><b>${st.spd}</b></div>`;
const btn = (label, action, arg = '', o = {}) =>
  `<button class="btn ${o.cls || ''}" data-action="${action}" data-arg="${esc(arg)}" ${o.disabled ? 'disabled' : ''} ${o.title ? `title="${esc(o.title)}"` : ''} ${o.id ? `id="${o.id}"` : ''}>${label}</button>`;
const progress = (p, cls = '') => `<div class="progress ${cls}"><i style="width:${clamp(p * 100, 0, 100)}%"></i></div>`;
const unitList = (units, table) => Object.entries(units).filter(([k, n]) => n > 0 && table[k]).map(([k, n]) => `<span class="pill" title="${table[k].name}">${table[k].icon} ${n}</span>`).join('') || '<span class="muted small">empty</span>';
const hexName = (i) => `(${WG.col(i)},${WG.row(i)})`;
const pips = (lvl, max) => `<span class="pips">${'●'.repeat(lvl)}${'○'.repeat(max - lvl)}</span>`;
function relationBar(k) {
  const v = k.relation;
  if (k.atWar) return '<span class="rel war">⚔ At war</span>';
  const c = v > 20 ? 'var(--green)' : v < -20 ? 'var(--red)' : 'var(--gold)';
  const label = v > 40 ? 'Friendly' : v > 10 ? 'Cordial' : v > -10 ? 'Neutral' : v > -40 ? 'Hostile' : 'Enemy';
  return `<span class="rel" style="color:${c}">${label} (${Math.round(v)})</span>`;
}
function generalChip(gid) {
  if (!gid || !genInst(gid)) return '<span class="muted small">No general</span>';
  const g = generalData(gid);
  return `<span class="gchip r-${g.rarity}">${g.icon} ${esc(g.name)} ${'★'.repeat(genInst(gid).stars)}</span>`;
}
function battleDefaults(e, kind) {
  const opt = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.icon ? v.icon + ' ' : ''}${v.name || v}</option>`).join('');
  return `<div class="row wrap small bdef"><span class="muted">Battle plan</span>
    <select data-entform="${kind}:${e.id}" title="Formation">${opt(FORMATIONS, e.formation || 'line')}</select>
    <select data-entstance="${kind}:${e.id}" title="Stance">${opt(STANCES, e.stance || 'advance')}</select>
    <select data-enttarget="${kind}:${e.id}" title="Target priority">${opt(TARGETS, e.target || 'nearest')}</select></div>`;
}
/* ---------- live battle command bar ---------- */
function renderBattleHud() {
  const box = el('battle-hud');
  const live = Battles.list;
  if (!live.length) { if (!box.hidden) { box.hidden = true; box.dataset.html = ''; } return; }
  const b = Battles.get(Battles.focus) || live[live.length - 1];
  const cnt = (ti) => Battles.active(b, ti).reduce((a, u) => a + Math.ceil(u.hp / u.unitHp), 0);
  const pti = Math.max(0, Battles.playerTeam(b));
  const tabs = live.length > 1 ? `<div class="bh-tabs">${live.map((x) => `<button class="${x === b ? 'active' : ''}" data-action="b-tab" data-arg="${x.id}">⚔️ ${esc(x.cfg.title.slice(0, 26))}</button>`).join('')}</div>` : '';
  // The clock and the head-counts change every second. They live in their own
  // nodes and are patched in place, so the controls underneath are never torn
  // down and rebuilt under the player's cursor mid-click.
  const clock = b.done ? (b.result.win ? '🏆 Victory' : '💀 Defeat') : fmtTime(BATTLE_LIMIT - b.t);
  const counts = b.teams.map((T, ti) => `<span style="color:${T.color === '#222' ? '#ccc' : T.color}" title="${esc(T.name)}">${cnt(ti)}${b.towers.some((x) => x.team === ti && !x.dead) ? ' 🗼' + b.towers.filter((x) => x.team === ti && !x.dead).length : ''}</span>`).join(' vs ');
  let h = tabs + `<div class="bh-head"><b>${esc(b.cfg.title)}</b><span class="muted" id="bh-clock"></span>
    <span class="bh-count" id="bh-counts"></span>
    <span class="spacer"></span>${btn('🎯', 'b-focus', b.id, { cls: 'sm ghost', title: 'Center camera' })}${b.done ? '' : btn('⏭ Auto-resolve', 'b-resolve', b.id, { cls: 'sm ghost' })}</div>`;
  if (!b.done) {
    const mine = b.groups.filter((G) => G.team === pti && !G.ally && b.teams[pti] && b.teams[pti].player && Battles.active(b, pti).some((q) => q.g === G.gi));
    const segF = (arg, cur) => `<div class="seg">${Object.entries(FORMATIONS).map(([k, f]) => `<button class="${cur === k ? 'on' : ''}" data-action="b-form" data-arg="${arg}:${k}" title="${esc(f.name + ': ' + f.desc)}">${f.icon} ${f.name}</button>`).join('')}</div>`;
    const segS = (arg, cur) => `<div class="seg">${Object.entries(STANCES).map(([k, st]) => `<button class="${cur === k ? 'on' : ''} ${k === 'retreat' ? 'warn' : ''}" data-action="b-stance" data-arg="${arg}:${k}" title="${esc(st.desc)}">${st.icon} ${st.name}</button>`).join('')}</div>`;
    const sel = (attr, arg, obj, cur) => `<select ${attr}="${arg}">${Object.entries(obj).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.icon ? v.icon + ' ' + v.name : '🎯 ' + v}</option>`).join('')}</select>`;
    if (mine.length > 1) h += `<div class="bh-row"><b class="bh-name">⚔️ All divisions</b>${segF(`${b.id}:all`, '')}${segS(`${b.id}:all`, '')}</div>`;
    const compact = mine.length > 2;
    for (const G of mine) {
      const n = Battles.active(b, pti).filter((q) => q.g === G.gi).reduce((a2, u) => a2 + Math.ceil(u.hp / u.unitHp), 0);
      h += compact
        ? `<div class="bh-row compact"><b class="bh-name">${esc(G.name)} <span class="muted">(${n})</span></b>${sel('data-bform', `${b.id}:${G.gi}`, FORMATIONS, G.formation)}${sel('data-bstance', `${b.id}:${G.gi}`, STANCES, G.stance)}${sel('data-btarget', `${b.id}:${G.gi}`, TARGETS, G.target)}</div>`
        : `<div class="bh-row"><b class="bh-name">${esc(G.name)} <span class="muted">(${n})</span></b>${segF(`${b.id}:${G.gi}`, G.formation)}${segS(`${b.id}:${G.gi}`, G.stance)}${sel('data-btarget', `${b.id}:${G.gi}`, TARGETS, G.target)}</div>`;
    }
    const allies = b.groups.filter((G) => G.team === pti && G.ally && Battles.active(b, pti).some((q) => q.g === G.gi));
    if (allies.length) h += `<div class="bh-row small muted">🤝 Fighting alongside you (they command themselves): ${allies.map((G) => esc(G.name)).join(', ')}</div>`;
    const others = b.teams.filter((T) => !T.player);
    h += `<div class="bh-row small muted">${b.teams.length > 2 ? `⚔️ ${b.teams.length}-way battle · ` : ''}${others.map((T) => { const gs = b.groups.filter((G) => b.teams[G.team] === T); return `<span style="color:${T.color === '#222' ? '#ccc' : T.color}">${esc(T.name)}</span> ${gs.length > 1 ? `(${gs.length} armies)` : ''}: ${gs[0] ? FORMATIONS[gs[0].formation].icon + ' ' + FORMATIONS[gs[0].formation].name : 'towers'}`; }).join(' &nbsp;|&nbsp; ')}</div>`;
  }
  if (box.dataset.html !== h && !UI.hudPointer && !(document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === 'SELECT')) { box.innerHTML = h; box.dataset.html = h; }
  const ec = el('bh-clock'), en = el('bh-counts');
  if (ec) ec.textContent = clock;
  if (en && en.dataset.v !== counts) { en.innerHTML = counts; en.dataset.v = counts; }
  box.hidden = false;
}

/* ---------- panel ---------- */
const PANEL_TABS = ['info', 'map', 'research', 'army', 'navy', 'generals', 'shop', 'alliance', 'log'];
function renderPanel(force) {
  if (!S) return;
  if (!force && (UI.pointerDown || (document.activeElement && el('panel').contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)))) return;
  const fn = { info: renderInfo, map: renderWorldInfo, research: renderResearch, army: renderArmy, navy: renderNavy, generals: renderGenerals, shop: renderShop, alliance: renderAlliance, log: renderLog }[UI.tab];
  if (!fn) { UI.tab = 'info'; return renderPanel(force); }      // an unknown tab must never wedge the panel
  const html = fn();
  if (html !== UI.lastPanelHtml) {
    const body = el('panel-body');
    // A new tab is drawn fresh; the same tab is patched in place, so the
    // once-a-second refresh never flickers, steals a hover or eats a click.
    if (UI.lastPanelTab !== UI.tab || !UI.lastPanelHtml) {
      const newTab = UI.lastPanelTab !== UI.tab;
      body.innerHTML = html; UI.lastPanelTab = UI.tab;
      if (newTab) { body.classList.add('fresh'); clearTimeout(renderPanel.fade); renderPanel.fade = setTimeout(() => body.classList.remove('fresh'), 250); }
    }
    else { const scroll = body.scrollTop; morphHtml(body, html); body.scrollTop = scroll; }
    UI.lastPanelHtml = html;
  }
  UI.panelDirty = false;
}
/* ---- in-place DOM patching ----
   Walks the new markup alongside the live nodes and touches only what changed:
   text that ticked, an attribute that flipped, a row that appeared. Nodes are
   matched by position, which suits panels whose layout is stable between ticks. */
const morphTpl = document.createElement('template');
function morphHtml(target, html) {
  morphTpl.innerHTML = html;
  morphChildren(target, morphTpl.content);
  morphTpl.innerHTML = '';
}
function morphChildren(a, b) {
  const bn = b.childNodes;
  for (let i = 0; i < bn.length; i++) {
    const nb = bn[i], na = a.childNodes[i];
    if (!na) { a.appendChild(nb.cloneNode(true)); continue; }
    if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName) { a.replaceChild(nb.cloneNode(true), na); continue; }
    if (nb.nodeType !== 1) { if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue; continue; }
    morphAttrs(na, nb);
    morphChildren(na, nb);
    if (na.tagName === 'SELECT') { const opt = nb.querySelector('option[selected]'); na.value = opt ? opt.value : (na.options[0] || {}).value; }
  }
  while (a.childNodes.length > bn.length) a.removeChild(a.lastChild);
}
function morphAttrs(na, nb) {
  for (const { name, value } of nb.attributes) if (na.getAttribute(name) !== value) na.setAttribute(name, value);
  for (let k = na.attributes.length - 1; k >= 0; k--) { const n = na.attributes[k].name; if (!nb.hasAttribute(n)) na.removeAttribute(n); }
  if (na.tagName === 'INPUT') {
    if (na.type === 'checkbox' || na.type === 'radio') na.checked = nb.hasAttribute('checked');
    else if (document.activeElement !== na) { const v = nb.getAttribute('value') || ''; if (na.value !== v) na.value = v; }
  }
  if (na.tagName === 'TEXTAREA' && document.activeElement !== na && na.value !== nb.value) na.value = nb.value;
}
function renderInfo() {
  const b = S.buildings.find((x) => x.id === UI.selected);
  if (b) return renderBuildingInfo(b);
  if (UI.selHex >= 0 && obstacleAt(UI.selHex)) return renderObstacle(UI.selHex);
  return renderBuildList();
}
function renderObstacle(i) {
  const o = obstacleAt(i);
  return `<div class="row"><span class="big-ico">${o === 'tree' ? '🌲' : '⛰️'}</span><div><h2>${o === 'tree' ? 'Trees' : 'Rocks'}</h2><div class="muted small">Blocking a building plot</div></div><span class="spacer"></span><button class="icon-btn" data-action="deselect">✕</button></div>
    <p class="small">Clear this hex to free space for building. You'll get ${o === 'tree' ? '🌳60 lumber' : '⛓️40 iron (and maybe a gem)'}.</p>
    ${btn('⛏️ Clear for 💰25', 'clear-obstacle', i, { cls: 'block', disabled: !inLand(i), title: inLand(i) ? '' : 'Outside your land' })}`;
}
function objectivesCard() {
  const done = S.objectives || {};
  const open = OBJECTIVES.filter((o) => !done[o.id]);
  if (!open.length) return '';
  const next = open.slice(0, 3);
  return `<div class="card obj"><div class="row"><b>🎯 Objectives</b><span class="spacer"></span><span class="small muted">${OBJECTIVES.length - open.length}/${OBJECTIVES.length}</span></div>
    ${next.map((o) => `<div class="small obj-row">▫️ ${esc(o.text)} <span class="muted">→ ${costHtml(o.reward)}</span></div>`).join('')}</div>`;
}
function renderBuildList() {
  const hall = S.buildings.find((b) => b.type === 'hall');
  let h = objectivesCard() + `<h2>Build</h2><p class="muted small">Build on <b>any hex you own</b>. Pick a structure, then click a hex of your land, or click an empty hex of your land and choose from <b>Build here</b>. Terrain matters: mills in forests, mines on hills, farms on plains.</p>
    <div class="card hl"><div class="row"><span class="big-ico">🏰</span><div><b>Main Hall · level ${hall.level}</b><div class="small muted">${playerTiles()} hexes claimed · settles radius ${settleRadius()} · ${builderCount()} builders</div></div>
    <span class="spacer"></span>${btn('Open', 'select', hall.id, { cls: 'sm ghost' })}</div>
    ${hall.build > 0 ? `<div style="margin-top:8px">${progress(1 - hall.build / hall.buildTotal)}<div class="small muted">Upgrading… ${fmtTime(hall.build)}</div></div>` : ''}</div>`;
  for (const cat of ['resource', 'defense', 'military', 'naval', 'civic']) {
    const types = BUILD_ORDER.filter((t) => BUILDINGS[t].cat === cat);
    h += `<h3>${CAT_NAMES[cat]}</h3><div class="build-grid">`;
    for (const t of types) {
      const d = BUILDINGS[t], lock = buildLockReason(t), hardLock = d.hall && hallLevel() < d.hall;
      h += `<button class="build-item ${lock ? 'locked' : ''}" data-action="place" data-arg="${t}" data-type="${t}" ${lock ? `title="${esc(lock)}"` : ''}>
        <div class="bi-top"><span class="bi-ico">${d.icon}</span><b>${d.name}</b><span class="count" title="You have ${countOf(t)} — no limit">×${countOf(t)}</span></div>
        ${hardLock ? `<div class="desc">🔒 Main Hall ${d.hall}</div>` : `<div>${costHtml(costFor(t, 1), S.res)}</div>`}
        <div class="desc">${lock && !hardLock ? '⛔ ' + esc(lock) : esc(d.desc)}</div></button>`;
    }
    h += '</div>';
  }
  return h;
}
function hallUnlocks(level) {
  const out = [];
  // Only genuinely new buildings. There are no build-count limits, so promising
  // "Farm 2→3" on the next level was telling the player about a cap that does
  // not exist.
  for (const t of BUILD_ORDER) if (limitOf(t, level - 1) === 0 && limitOf(t, level) > 0) out.push(`${BUILDINGS[t].icon} ${BUILDINGS[t].name}`);
  return out;
}
function renderBuildingInfo(b) {
  const d = BUILDINGS[b.type], prod = productionOf(b);
  let h = `<div class="row"><span class="big-ico">${d.icon}</span><div><h2>${d.name}</h2><div class="muted small">Level ${b.level}${b.type === 'hall' ? ' · no maximum' : ' / ' + hallLevel()} · ${TERRAIN[S.world.terrain[b.hex]].name} ${hexName(b.hex)}${terrainBoost(b) > 1 ? ` · terrain ×${terrainBoost(b)}` : ''}</div></div>
    <span class="spacer"></span><button class="icon-btn" data-action="deselect" title="Close">✕</button></div><p class="small muted">${esc(d.desc)}</p>`;
  if (b.build > 0) h += `<div class="card">${progress(1 - b.build / b.buildTotal)}<div class="small" style="margin-top:4px">${b.level === 0 ? 'Constructing' : 'Upgrading to level ' + (b.level + 1)}… <b>${fmtTime(b.build)}</b></div>
    ${S.items.hammer ? `<div style="margin-top:6px">${btn(`🔨 Builder's Hammer (${S.items.hammer})`, 'use-item', 'hammer', { cls: 'sm ghost' })}</div>` : ''}</div>`;
  h += '<dl class="kv">';
  if (prod) h += `<dt>Production</dt><dd>${RES_META[prod[0]].icon} ${(prod[1] * 60 * prodMult(prod[0])).toFixed(0)}/min${b.type !== 'hall' ? ` → ${(productionOf({ ...b, level: b.level + 1 })[1] * 60 * prodMult(prod[0])).toFixed(0)}` : ''}</dd>`;
  if (d.def) h += `<dt>Defense rating</dt><dd>🛡️ ${Math.round(d.def * Math.pow(Math.max(1, b.level), 1.25))}</dd>`;
  if (d.storage) h += `<dt>Storage bonus</dt><dd>+${Math.round(d.storage * b.level * 100)}%</dd>`;
  if (d.trains) h += `<dt>Unit level</dt><dd>${b.level} (+${12 * (b.level - 1)}% stats)</dd>`;
  if (d.builds) h += `<dt>Ship tier</dt><dd>${SHIP_TYPES.filter((t) => SHIPS[t].lvl <= b.level).map((t) => SHIPS[t].icon).join(' ')}</dd>`;
  if (b.type === 'hall') h += `<dt>Storage cap</dt><dd>${fmt(capOf('gold'))} (💎${capOf('diamonds')})</dd><dt>Your land</dt><dd>${playerTiles()} hexes</dd><dt>Divisions</dt><dd>${divisionLimit()}</dd>`;
  h += '</dl>';
  {
    const err = upgradeError(b);
    h += `<h3>Upgrade to level ${b.level + 1}</h3><div class="card"><div class="row wrap">${costHtml(costFor(b.type, b.level + 1), S.res)}<span class="small muted">⏱ ${fmtTime(buildTime(b.type, b.level + 1))}</span></div>
      ${b.type === 'hall' ? `<div class="small muted" style="margin-top:6px">Level ${b.level + 1}: ${hallUnlocks(b.level + 1).length ? 'unlocks ' + hallUnlocks(b.level + 1).join(' · ') + '; ' : ''}a higher level cap for every other building, a wider settling reach, more storage${(b.level + 1) % 2 ? ' and another builder' : ''}. Land itself is claimed, never granted.</div>` : ''}
      <div style="margin-top:8px">${btn('⬆ Upgrade', 'upgrade', b.id, { disabled: !!err, title: err || '', cls: 'block' })}</div>
      ${err ? `<div class="small muted" style="margin-top:4px">${esc(err)}</div>` : ''}</div>`;
  }
  if (d.trains) { h += '<h3>Training</h3>'; for (const u of d.trains) h += unitRow(u); }
  if ((b.type === 'shipyard' || b.type === 'port') && b.level > 0) { const m = berthById(b.id); if (m) h += '<h3>Moored here</h3>' + berthCard(m); }
  if (d.builds) { h += '<h3>Shipbuilding</h3><p class="small muted">Ships ordered here are launched into the water beside this shipyard.</p>'; for (const t of SHIP_TYPES) h += shipRow(t, b); }
  if (d.research) h += `<h3>Research</h3>` + uniCard(b) + `<p class="small">${btn('🎓 Open research tree', 'tab', 'research', { cls: 'sm ghost' })}</p>`;
  if (b.type === 'port' && b.level > 0) {
    const sell = (0.5 + 0.1 * b.level + 0.1 * R('trade')).toFixed(2), buy = (2.2 - 0.15 * b.level - 0.1 * R('trade')).toFixed(2);
    h += `<h3>Market</h3><p class="small muted">Sell 200 goods for ${sell}💰 each · buy 100 goods for ${buy}💰 each.</p><div class="row wrap">`;
    for (const r of ['lumber', 'iron', 'food']) h += btn(`Sell 200 ${RES_META[r].icon}`, 'trade', 'sell:' + r, { cls: 'sm ghost' }) + btn(`Buy 100 ${RES_META[r].icon}`, 'trade', 'buy:' + r, { cls: 'sm ghost' });
    h += '</div>';
  }
  if (b.type === 'scoutlodge') h += `<p class="small muted">Send scouts from the map: click any hex, then "Send scouts".</p>`;
  if (b.type !== 'hall') h += `<div style="margin-top:16px">${btn('Demolish', 'demolish', b.id, { cls: 'sm red' })}</div>`;
  return h;
}
function uniCard(b) {
  if (b.level < 1) return '<p class="small muted">Under construction.</p>';
  if (!b.research) return `<div class="card small">🎓 University L${b.level} — <b>idle</b>. Pick a project in the Research tab.</div>`;
  const r = RESEARCH[b.research.id];
  return `<div class="card small">🎓 University L${b.level}: ${r.icon} <b>${r.name} ${R(b.research.id) + 1}</b> ${progress(1 - b.research.left / b.research.total)} <span class="muted">${fmtTime(b.research.left)} left</span></div>`;
}
function unitRow(u) {
  const U = UNITS[u], t = trainerOf(u), st = unitStats(u, null), err = trainError(u), q = t ? t.queue : [];
  const vs = U.vs ? Object.entries(U.vs).map(([k, m]) => `×${m} vs ${(UNITS[k] || { name: 'towers' }).name}`).join(', ') : '';
  return `<div class="card"><div class="unit-row"><span class="unit-ico">${U.icon}</span><div><b>${U.name}</b> <span class="muted">× ${S.army[u]} at home</span>
    <div class="stats-mini">⚔ ${st.atk.toFixed(0)} · ❤ ${st.hp.toFixed(0)} · 💨 ${st.speed.toFixed(2)}${U.housing > 1 ? ' · 🏠' + U.housing : ''} · ⏱${trainTime(u).toFixed(1)}s${vs ? ' · ' + vs : ''}</div>
    <div>${costHtml(U.cost, S.res)}</div></div>
    <div class="row">${btn('+1', 'train', u + ':1', { cls: 'sm', disabled: !!err })}${btn('+5', 'train', u + ':5', { cls: 'sm', disabled: !!err })}</div></div>
    ${err ? `<div class="small muted" style="margin-top:4px">🔒 ${esc(err)}</div>` : ''}
    ${q.length && q.includes(u) ? `<div class="queue">${q.map((x, k) => `<span class="${k === 0 ? 'first' : ''}">${UNITS[x].icon}${k === 0 ? ' ' + fmtTime(t.trainLeft) : ''}</span>`).join('')}<button class="btn sm ghost" data-action="cancel-queue" data-arg="${t.id}" title="Cancel last">✕</button></div>` : ''}</div>`;
}
// `yard`: when shown on one shipyard's own card, ships are laid down there.
function shipRow(t, yard) {
  const Sh = SHIPS[t], st = shipStats(t, null), err = shipError(t) || (yard && yard.level < Sh.lvl ? `Requires a level ${Sh.lvl} Shipyard` : null);
  const yards = S.buildings.filter((b) => b.type === 'shipyard' && b.queue.length && (!yard || b === yard));
  const here = yard ? (berthById(yard.id) || { ships: {} }).ships[t] || 0 : allShips()[t] - S.fleets.reduce((s, f) => s + (f.ships[t] || 0), 0);
  return `<div class="card"><div class="unit-row"><span class="unit-ico">${Sh.icon}</span><div><b>${Sh.name}</b> <span class="muted">× ${here} ${yard ? 'moored here' : 'at anchor'}</span>
    <div class="stats-mini">⚔ ${st.atk.toFixed(0)} · ❤ ${st.hp.toFixed(0)} · 💨 ${st.speed.toFixed(2)}${Sh.cap ? ' · 🚣 carries ' + Sh.cap : ''} · ⏱${shipTime(t).toFixed(0)}s</div>
    <div class="stats-mini">${Sh.desc}</div><div>${costHtml(shipCost(t), S.res)} <span class="cost"><span class="${S.army.seaman < Sh.crew ? 'short' : ''}" title="Crew of Seamen">🧑‍✈️${Sh.crew}</span></span></div></div>
    <div class="row">${btn('+1', 'build-ship', t + ':1' + (yard ? ':' + yard.id : ''), { cls: 'sm', disabled: !!err })}</div></div>
    ${err ? `<div class="small muted" style="margin-top:4px">🔒 ${esc(err)}</div>` : ''}
    ${yards.some((b) => b.queue.includes(t)) ? `<div class="queue">${yards.map((b) => b.queue.map((x, k) => `<span class="${k === 0 ? 'first' : ''}">${SHIPS[x].icon}${k === 0 ? ' ' + fmtTime(b.trainLeft) : ''}</span>`).join('') + `<button class="btn sm ghost" data-action="cancel-queue" data-arg="${b.id}">✕</button>`).join('')}</div>` : ''}</div>`;
}
// Ships at anchor, harbour by harbour, each with a button to put a fleet to sea from it.
function berthCard(m) {
  const n = shipCount(m.ships);
  return `<div class="card"><div class="row"><span>${m.icon}</span><b>${esc(m.name)}</b><span class="spacer"></span>${btn('🎯', 'focus-hex', m.hex, { cls: 'sm ghost', title: 'Show on the map' })}</div>
    <div class="pills">${n ? unitList(m.ships, SHIPS) : '<span class="small muted">No ships moored</span>'}</div>
    ${n ? `<div class="row" style="margin-top:6px">${btn('⚓ Form a fleet here', 'form-fleet', m.id, { cls: 'sm', disabled: S.fleets.length >= fleetLimit(), title: S.fleets.length >= fleetLimit() ? 'Fleet limit reached' : '' })}</div>` : ''}</div>`;
}

/* ---------- Research tab ---------- */
function renderResearch() {
  const unis = S.buildings.filter((b) => b.type === 'university');
  let h = `<h2>Research</h2><p class="small muted">Universities study one technology at a time. Build more universities to research in parallel; upgrade them to unlock advanced tiers and study faster.</p>`;
  if (!unis.length) h += `<div class="card">🎓 You have no University yet. ${hallLevel() >= 2 ? btn('Build one', 'place', 'university', { cls: 'sm' }) : 'Reach <b>Main Hall 2</b> to build one.'}</div>`;
  else h += unis.map(uniCard).join('');
  for (const [cat, label] of Object.entries(RESEARCH_CATS)) {
    h += `<h3>${label}</h3>`;
    for (const [id, r] of Object.entries(RESEARCH)) {
      if (r.cat !== cat) continue;
      const lvl = R(id), err = researchError(id), maxed = lvl >= r.max, active = inProgress(id);
      h += `<div class="card research ${maxed ? 'done' : ''}"><div class="row"><span class="big-ico sm">${r.icon}</span><div style="flex:1"><b>${r.name}</b> ${pips(lvl, r.max)}
        <div class="small">${lvl ? `Now: ${r.desc(lvl)}` : '<span class="muted">Not researched</span>'}${!maxed ? ` → <b>${r.desc(lvl + 1)}</b>` : ''}</div>
        ${!maxed ? `<div class="row wrap small">${costHtml(researchCost(id, lvl + 1), S.res)}<span class="muted">⏱ ${fmtTime(researchTime(id, lvl + 1, freeUniversity(r.uni) || universities()[0]))}</span><span class="muted">🎓 L${r.uni}${r.req ? ' · needs ' + r.req.map((q) => RESEARCH[q].name).join(', ') : ''}</span></div>` : ''}</div>
        ${maxed ? '<span class="tag">✓</span>' : active ? '<span class="tag">⏳</span>' : btn('Study', 'research', id, { cls: 'sm', disabled: !!err, title: err || '' })}</div></div>`;
    }
  }
  return h;
}

/* ---------- Army tab ---------- */
function divisionCard(d) {
  const eta = etaOf(d), where = d.at === S.world.capital && !d.path.length ? 'At the capital' : `${d.path.length ? 'Marching' : 'Stationed'} at ${hexName(d.at)}`;
  return `<div class="card ${UI.selEntity && UI.selEntity.id === d.id ? 'hl' : ''}"><div class="row"><span class="swatch" style="background:${d.color}"></span><b>${esc(d.name)}</b><span class="spacer"></span><span class="small muted">⚡${fmt(armyPower(d.units, d.general))}</span></div>
    <div class="pills">${unitList(d.units, UNITS)}</div>
    <div class="small">${where}${d.path.length ? ` · ${d.order ? d.order.type : 'move'} · ETA ${fmtTime(eta)}` : d.at !== S.world.capital ? ' · 🛡️ guarding' : ''}${d.status === 'fighting' ? ' · ⚔ fighting' : ''}${d.waitAttack != null && d.status !== 'fighting' ? ` · ⏳ attacks ${hexName(d.waitAttack)} ${onCooldown(d) ? `in ${Math.ceil(d.cooldown - S.time)}s` : 'when the nearby battle ends'}` : ''}</div>
    <div class="small muted">👁️ Attacks any enemy within ${detectRange(d, !d.path.length)} hexes${d.units.scout > 0 ? ' (scouts extend the watch)' : ''}</div>
    <div class="row small" style="margin-top:4px"><span class="muted">General</span><select data-divgen="${d.id}">${[d.general].concat(idleGenerals().map((g) => g.uid)).concat(S.divisions.filter((x) => x !== d && x.general).map((x) => x.general)).filter((v, k, arr) => v && arr.indexOf(v) === k).map((u) => { const gd = generalData(u), post = generalPost(u); return `<option value="${u}" ${u === d.general ? 'selected' : ''}>${gd.icon} ${esc(gd.name)} ${'★'.repeat(genInst(u).stars)}${u === d.general ? '' : post.kind === 'division' ? ' (swap)' : ''}</option>`; }).join('')}</select></div>
    ${battleDefaults(d, 'division')}
    <div class="row wrap" style="margin-top:6px">${btn('🗺️ Select', 'select-entity', 'division:' + d.id, { cls: 'sm' })}
      ${btn(d.guard ? '🛡️ Guarding' : '🛡️ Guard', 'toggle-guard', d.id, { cls: d.guard ? 'sm' : 'sm ghost', title: 'Defend this stretch of your realm: march on any enemy that enters land connected to this post, then return to it' })}
      ${atHome(d) ? btn('🎚️ Troops', 'edit-troops', d.id, { cls: 'sm ghost', title: 'Add or remove soldiers' }) + btn('Disband', 'disband', d.id, { cls: 'sm ghost' }) : btn('🏠 Return', 'return', 'division:' + d.id, { cls: 'sm ghost' })}
      ${btn('✂️ Split', 'split', d.id, { cls: 'sm ghost', disabled: d.status === 'fighting' || armyHousing(d.units) < 2, title: 'Split part of this division into a new one' })}
      ${S.divisions.filter((o) => o !== d && o.at === d.at && !o.path.length && !d.path.length && o.status !== 'fighting').map((o) => btn(`🔗 Merge ${esc(o.name)} in`, 'merge', `${d.id}:${o.id}`, { cls: 'sm ghost' })).join('')}
      ${btn('✏️', 'rename-entity', 'division:' + d.id, { cls: 'sm ghost', title: 'Rename' })}</div></div>`;
}
function renderArmy() {
  const gp = armyPower(S.army, S.castellan);
  let h = `<h2>Army</h2><dl class="kv"><dt>Troops (all, incl. queued)</dt><dd>${fmt(totalHousing())}</dd><dt>Garrison power</dt><dd>⚡ ${fmt(gp)}</dd>
    <dt>Defense rating</dt><dd>🛡️ ${fmt(defenseRating())}</dd><dt>Food upkeep</dt><dd>🌾 ${(upkeep().food * 60).toFixed(1)}/min</dd><dt>Castellan</dt><dd>${generalChip(S.castellan)}</dd></dl>
    <h3>Garrison (at the capital)</h3><div class="pills">${unitList(S.army, UNITS)}</div>
    <h3>Divisions · ${S.divisions.length}/${divisionLimit()}</h3>
    <p class="small muted">Group troops into divisions, give each a general, then command them on the map: move, attack, explore ruins, capture forts, claim land and intercept raiders.</p>`;
  h += S.divisions.map(divisionCard).join('') || '<p class="small muted">No divisions in the field.</p>';
  h += `<div class="row">${btn('⚔️ Muster a new division', 'muster', '', { disabled: S.divisions.length >= divisionLimit() })}</div>`;
  if (S.boosts.warhorn || S.boosts.salve) h += `<p class="small">Next battle: ${S.boosts.warhorn ? '📯 War Horn ' : ''}${S.boosts.salve ? '🧪 Healing Salve' : ''}</p>`;
  h += scoutSection();
  h += '<h3>Train troops</h3>';
  for (const u of Object.keys(UNITS)) if (u !== 'seaman') h += unitRow(u);
  return h;
}
function scoutSection() {
  const n = S.army.scout;
  let h = `<h3>Scouts · ${n} at home</h3><p class="small muted">Dispatch a party, then click anywhere on the World map: they walk there and every hex along the way is revealed.</p>
    <div class="row"><select id="scout-dispatch" style="width:70px">${Array.from({ length: Math.max(1, n) }, (_, k) => `<option>${k + 1}</option>`).join('')}</select>${btn('🔭 Dispatch scouts', 'dispatch-scouts', '', { disabled: n < 1, title: n ? '' : 'Train scouts at the Scout Lodge' })}</div>`;
  h += S.scouts.map((p) => `<div class="member clickable" data-action="select-entity" data-arg="scout:${p.id}">🔭 <b>Scouts ×${p.n}</b><span class="spacer"></span><span class="small muted">${p.path.length ? 'moving · ETA ' + fmtTime(etaOf(p)) : hexName(p.at)}</span></div>`).join('');
  return h;
}

/* ---------- Navy tab ---------- */
function fleetCard(f) {
  const where = fleetHome(f) ? 'In the home harbour' : `${f.path.length ? 'Sailing' : 'Anchored'} at ${hexName(f.at)}`;
  return `<div class="card ${UI.selEntity && UI.selEntity.id === f.id ? 'hl' : ''}"><div class="row"><span>⚓</span><b>${esc(f.name)}</b><span class="spacer"></span><span class="small muted">⚡${fmt(fleetPower(f.ships, f.general))} · 💨${fleetSpeed(f).toFixed(2)}</span></div>
    <div class="pills">${unitList(f.ships, SHIPS)}</div>
    <div class="small">${generalChip(f.general)} · ${where}${f.path.length ? ` · ETA ${fmtTime(etaOf(f))}` : ''}${f.status === 'fighting' ? ' · ⚔ fighting' : ''}</div>
    ${battleDefaults(f, 'fleet')}
    <div class="row wrap" style="margin-top:6px">${btn('🗺️ Select', 'select-entity', 'fleet:' + f.id, { cls: 'sm' })}
      ${fleetHome(f) ? btn('Disband', 'disband-fleet', f.id, { cls: 'sm ghost' }) : btn('🏠 Return', 'return', 'fleet:' + f.id, { cls: 'sm ghost' })}
      ${btn('✏️', 'rename-entity', 'fleet:' + f.id, { cls: 'sm ghost', title: 'Rename' })}</div></div>`;
}
function renderNavy() {
  let h = `<h2>Navy</h2><dl class="kv"><dt>Ships (all)</dt><dd>${shipCount(allShips())} + ${queuedShips()} queued</dd><dt>Troop transport capacity</dt><dd>🚣 ${transportCapacity()}</dd>
    <dt>Ship upkeep</dt><dd>💰 ${(upkeep().gold * 60).toFixed(1)}/min</dd>${S.winds > 0 ? `<dt>Favourable winds</dt><dd>🌬️ ${fmtTime(S.winds)}</dd>` : ''}</dl>
    <h3>Seamen · ${S.army.seaman} ready</h3><p class="small muted">Every ship needs a crew of Seamen, trained at the Port. Crews go down with their ship.</p>${unitRow('seaman')}
    <h3>Harbours</h3><p class="small muted">New ships are launched beside the shipyard that built them, and a fleet sets sail from wherever its ships lie. Moored ships guard their harbour; a fleet can disband at any of your shipyards or ports.</p>${berths().filter((m) => m.id === 'home' || shipCount(m.ships) > 0 || m.b.type === 'shipyard').map(berthCard).join('')}
    <h3>Fleets · ${S.fleets.length}/${fleetLimit()}</h3>
    <p class="small muted">Group ships into fleets and sail them on the World map: explore, salvage shipwrecks, burn pirate coves, blockade enemy ports and hunt enemy fleets. Cogs & Galleons carry divisions across the sea automatically.</p>`;
  h += S.fleets.map(fleetCard).join('') || '<p class="small muted">No fleets at sea.</p>';
  h += `<div class="row">${btn('⚓ Form a new fleet', 'form-fleet', '', { disabled: S.fleets.length >= fleetLimit() || shipsAtBerths() === 0, title: shipsAtBerths() ? '' : 'Build ships first' })}</div><h3>Shipyard</h3>`;
  if (!countOf('shipyard')) h += `<div class="card small">🚢 No shipyard yet. ${hallLevel() >= 2 ? btn('Build one on the coast', 'place', 'shipyard', { cls: 'sm' }) : 'Reach <b>Main Hall 2</b>, then build one on the coast.'}</div>`;
  const yards = S.buildings.filter((b) => b.type === 'shipyard' && b.level > 0);
  if (yards.length > 1) {
    if (UI.yard && !yards.some((b) => String(b.id) === UI.yard)) UI.yard = '';
    h += `<div class="row"><span class="small muted">Build at</span><select data-yardsel="1"><option value="">Least busy shipyard</option>${yards.map((b) => `<option value="${b.id}" ${String(b.id) === UI.yard ? 'selected' : ''}>🚢 L${b.level} at ${hexName(b.hex)} · ${b.queue.length} queued</option>`).join('')}</select></div>`;
  }
  for (const t of SHIP_TYPES) h += shipRow(t);
  return h;
}

/* ---------- Generals tab ---------- */
function renderGenerals() {
  const discovered = new Set(S.generals.map((g) => g.id)).size;
  let h = `<h2>Generals</h2><p class="small muted">Every <b>division needs its own general</b>, and a general can hold only one post (a division, a fleet, or <b>Castellan</b> of the capital). You can own several copies of the same general: extra copies can lead other divisions, or be merged to <b>promote</b> (+★, +10% stats). Hire more at the 🍺 Tavern in the Shop.</p>
    <h3>Roster · ${S.generals.length} generals · ${discovered}/${GENERALS.length} kinds discovered</h3>`;
  const order = ['legendary', 'epic', 'rare', 'common'];
  const owned = [...S.generals].sort((a, b) => order.indexOf(generalData(a.uid).rarity) - order.indexOf(generalData(b.uid).rarity) || a.id.localeCompare(b.id) || b.stars - a.stars);
  for (const og of owned) {
    const g = generalData(og.uid), st = generalStats(og.uid), post = generalPost(og.uid), copies = copiesOf(og.id).length;
    const cur = post.kind === 'none' ? 'none:' : post.kind === 'castellan' ? 'castellan:' : `${post.kind}:${post.id}`;
    const locked = post.kind === 'division';
    const posts = locked ? S.divisions.map((d) => ['division', d.id, (d.id === post.id ? '⚔️ ' : '⇄ swap with ') + d.name])
      : [['none', '', 'Idle'], ['castellan', '', '🏰 Castellan']].concat(S.fleets.map((f) => ['fleet', f.id, '⚓ ' + f.name])).concat(S.divisions.map((d) => ['division', d.id, '⇄ lead ' + d.name]));
    const spare = S.generals.some((x) => x.id === og.id && x.uid !== og.uid && generalPost(x.uid).kind === 'none');
    h += `<div class="card general-card"><div class="general"><div class="portrait r-${g.rarity}">${g.icon}</div><div>
      <div class="rarity r-${g.rarity}">${RARITY[g.rarity].name}${g.spec ? ` · ${g.spec === 'fleet' ? '⚓ Admiral' : UNITS[g.spec].icon + ' ' + UNITS[g.spec].name + ' specialist'}` : ''}${copies > 1 ? ` · ×${copies} owned` : ''}</div>
      <b>${g.name}</b> <span class="stars">${'★'.repeat(og.stars)}${'☆'.repeat(5 - og.stars)}</span>${statBars(st)}</div></div>
      <div class="row" style="margin-top:6px"><span class="small muted">Post</span><select data-assign="${og.uid}">${posts.map(([k, id, label]) => `<option value="${k}:${id}" ${cur === `${k}:${id}` ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>
      ${spare && og.stars < 5 ? btn('⭐ Promote', 'promote', og.uid, { cls: 'sm', title: 'Merge an idle spare copy into this general' }) : ''}</div></div>`;
  }
  h += `<div class="card small">🍺 Need more commanders? ${btn('Hire at the Tavern 💰900', 'hire', '', { cls: 'sm', disabled: S.res.gold < 900 })}</div>`;
  h += '<h3>Items</h3>';
  for (const [k, it] of Object.entries(ITEMS)) {
    h += `<div class="card"><div class="row"><span class="big-ico sm">${it.icon}</span><div><b>${it.name}</b> <span class="muted">× ${S.items[k]}</span><div class="small muted">${it.desc}</div></div><span class="spacer"></span>
      ${btn('Use', 'use-item', k, { cls: 'sm', disabled: !S.items[k] || S.boosts[k] })}</div></div>`;
  }
  return h;
}

/* ---------- Shop tab ---------- */
function renderShop() {
  let h = `<h2>Mystery Boxes</h2><p class="small muted">Spend coins for a chance at rare generals, bundles of resources, or special items.</p>`;
  for (const b of BOXES) {
    h += `<div class="card"><div class="box-card"><div class="box-art" style="--glow:${b.glow}">${b.icon}</div><div><b>${b.name}</b>
      <div class="odds">${Object.entries(b.kinds).map(([k, v]) => `<span class="muted">${{ res: 'Resources', item: 'Item', general: 'General' }[k]} ${v}%</span>`).join('')}</div>
      <div class="odds">${Object.entries(b.rarity).filter(([, v]) => v).map(([r, v]) => `<span class="r-${r}">${RARITY[r].name} ${v}%</span>`).join('')}</div>
      <div class="row">${costHtml(b.cost, S.res)}<span class="spacer"></span>${btn('Open', 'open-box', b.id, { disabled: !canAfford(b.cost) })}</div></div></div></div>`;
  }
  h += `<h3>🍺 Tavern</h3><div class="card"><div class="row"><span class="big-ico">🍺</span><div><b>Hire a general</b><div class="small muted">A wandering commander joins you (usually common, 15% rare). Every division needs its own general.</div></div><span class="spacer"></span>${btn('Hire 💰900', 'hire', '', { disabled: S.res.gold < 900 })}</div></div>`;
  return h + `<p class="small muted">Boxes opened: ${S.stats.boxesOpened} · Generals owned: ${S.generals.length}</p>`;
}

/* ---------- World (Map) panel ---------- */
function ordersFor(e, i) {
  if (i < 0) return [];
  const o = [], f = S.world.feat[i], owner = S.world.owner[i], seen = isSeen(i);
  if (isScout(e)) { if (scoutCost(i) < Infinity) o.push(['move', '🔭 Scout here']); return o; }
  if (isFleet(e)) {
    if (isWater(i)) o.push(['move', '⛵ Sail here']);
    if (f && f.type === 'wreck' && !f.salvaged && seen) o.push(['salvage', '⚓ Salvage wreck']);
    if (f && f.type === 'cove' && !f.destroyed && seen) o.push(['cove', '🏴‍☠️ Attack pirate cove']);
    const k = owner >= 0 ? S.kingdoms[owner] : null;
    if (k && k.coastal && seen && !(S.allianceId && k.allianceId === S.allianceId)) o.push(['blockade', `⚓ Blockade ${k.name}`]);
    const ef = S.aiFleets.find((x) => WG.dist(x.at, i) <= 0 && seen);
    if (ef) o.push(['hunt', ef.owner === 'pirate' ? '🎯 Attack the pirates' : `⚔️ Attack the ${S.kingdoms[ef.owner].name} navy${aiFleetHostile(ef) ? '' : ' (angers them)'}`]);
  } else {
    if (isPassable(i) || (isWater(i) && canEmbark(e))) o.push(['move', S.world.owner[i] === -2 ? '🛡️ Station & guard here' : '🚶 March here']);
    if (owner === -1 && isPassable(i)) o.push(['claim', '🏳️ Annex this land']);
    if (owner >= 0 && seen && !(S.allianceId && S.kingdoms[owner].allianceId === S.allianceId)) o.push(['attack', i === S.kingdoms[owner].capital ? `⚔️ Assault ${S.kingdoms[owner].name}` : '🏳️ Invade this hex']);
    if (f && seen && ((f.type === 'ruins' && !f.looted) || (f.type === 'cave' && !f.explored))) o.push(['explore', f.type === 'ruins' ? '🏛️ Explore ruins' : '🕳️ Explore cave']);
    if (f && f.type === 'fort' && !f.captured && seen) o.push(['capture', '🏯 Capture fort']);
    const ea = S.aiArmies.find((x) => x.at === i && seen);
    if (ea) o.push(['attack-army', ea.kind === 'raid' || hostileToPlayer(S.kingdoms[ea.kid]) ? `🛡️ Intercept the ${S.kingdoms[ea.kid].name} army` : `⚔️ Attack the ${S.kingdoms[ea.kid].name} ${ea.kind === 'guard' ? 'guard' : 'army'} (angers them)`]);
  }
  return o;
}
function renderEntityCard(e) {
  const fleet = isFleet(e);
  if (isScout(e)) {
    return `<div class="card hl"><div class="row">🔭 <b>Scout party ×${e.n}</b><span class="spacer"></span><span class="small muted">sight ${scoutRadius()} hexes</span></div>
      <div class="small">${e.path.length ? `Moving · ETA ${fmtTime(etaOf(e))}` : `At ${hexName(e.at)}`}</div>
      <p class="small">👉 <b>Click anywhere on the map</b> to send them there. Every hex they pass is revealed.</p>
      <div class="row">${btn('🏠 Return home', 'return', 'scout:' + e.id, { cls: 'sm ghost' })}${btn('Deselect', 'deselect-entity', '', { cls: 'sm ghost' })}${btn('🎯 Center', 'focus-entity', '', { cls: 'sm ghost' })}</div></div>`;
  }
  let h = fleet ? fleetCard(e) : divisionCard(e);
  const i = UI.worldSel;
  const orders = ordersFor(e, i);
  h += `<h3>Orders ${i >= 0 ? 'for ' + hexName(i) : ''}</h3>`;
  if (i < 0) h += '<p class="small muted">Click a hex on the map to choose a destination or target. Right-click a hex to issue the default order instantly.</p>';
  else if (!orders.length) h += `<p class="small muted">${fleet ? 'Fleets can only sail on water.' : 'Your division cannot go there (mountains, or sea without transport ships).'}</p>`;
  else h += `<div class="orders">${orders.map(([k, label]) => btn(label, 'order', k, { cls: k === 'move' ? 'ghost' : k === 'attack' || k === 'hunt' || k === 'blockade' ? 'red' : '' })).join('')}</div>`;
  if (!fleet && i >= 0 && isWater(i) && !canEmbark(e)) h += `<p class="small muted">🚣 Transport capacity ${transportCapacity()} &lt; ${armyHousing(e.units)} troops — build Cogs to cross water.</p>`;
  h += `<div class="row" style="margin-top:8px">${btn('Deselect', 'deselect-entity', '', { cls: 'sm ghost' })}${btn('🎯 Center', 'focus-entity', '', { cls: 'sm ghost' })}</div>`;
  return h;
}
function renderWorldInfo() {
  const i = UI.worldSel, e = selectedEntity();
  let h = '';
  if (e) h += renderEntityCard(e);
  if (i < 0 && !e) {
    const tb = territoryBonus();
    h += `<h2>World Map</h2><p class="small muted">Drag to pan, scroll or pinch to zoom, and use the minimap to jump around. Click a hex to inspect it, and click one of your banners or ships to command it.</p>
      <dl class="kv"><dt>Your land</dt><dd>${playerTiles()} hexes</dd><dt>Scouts at home</dt><dd>🔭 ${S.army.scout}</dd><dt>Divisions / fleets</dt><dd>${S.divisions.length} / ${S.fleets.length}</dd>
      <dt>Land bonus</dt><dd>${RES.filter((k) => tb[k] > 0).map((k) => `${RES_META[k].icon}+${(tb[k] * 60).toFixed(k === 'diamonds' ? 1 : 0)}/m`).join(' ') || 'none'}</dd></dl>`;
    h += scoutSection();
    if (S.divisions.length || S.fleets.length) h += '<h3>Your forces</h3>' + S.divisions.map((d) => `<div class="member clickable" data-action="select-entity" data-arg="division:${d.id}"><span class="swatch" style="background:${d.color}"></span><b>${esc(d.name)}</b><span class="spacer"></span><span class="small muted">${armyHousing(d.units)} troops · ${d.path.length ? 'moving' : hexName(d.at)}</span></div>`).join('')
      + S.fleets.map((f) => `<div class="member clickable" data-action="select-entity" data-arg="fleet:${f.id}"><span>⚓</span><b>${esc(f.name)}</b><span class="spacer"></span><span class="small muted">${shipCount(f.ships)} ships · ${f.path.length ? 'sailing' : hexName(f.at)}</span></div>`).join('');
  }
  if (i >= 0) h += hexCard(i);
  h += '<h3>Known kingdoms</h3>';
  const known = S.kingdoms.filter((k) => isSeen(k.capital));
  h += known.map((k) => { if (k.fallen) return `<div class="member clickable" data-action="focus-kingdom" data-arg="${k.id}"><span class="dot" style="background:${k.color}"></span><div><b>${k.name}</b><div class="small muted">👑 Conquered</div></div></div>`; const a = allianceOf(k.allianceId); return `<div class="member clickable" data-action="focus-kingdom" data-arg="${k.id}"><span class="dot" style="background:${k.color}"></span><div><b>${k.name}</b><div class="small muted">Keep ${k.hall} · ${kingdomTiles(k.id)} hexes${a ? ' · ' + a.emblem + ' ' + esc(a.name) : ''}</div></div><span class="spacer"></span><span class="small">${relationBar(k)}</span></div>`; }).join('') || '<p class="small muted">None yet — scout into the fog.</p>';
  return h;
}
// Settling neutral land: pick how big a region the settlers take.
function claimCard(i) {
  const maxR = settleRadius(), r = clamp(UI.claimRadius || 1, 1, maxR);
  const cl = claimCluster(i, r), err = claimError(i, r), far = distToTerritory(i);
  const opts = Array.from({ length: maxR }, (_, k) => `<option value="${k + 1}" ${k + 1 === r ? 'selected' : ''}>${k + 1} (${claimCluster(i, k + 1).length} hexes)</option>`).join('');
  return `<div class="card"><b>🏳️ Unclaimed land</b> <span class="small muted">${far > 1 ? `· ${far} hexes beyond your border` : '· borders your land'}${isSeen(i) ? '' : ' · unexplored'}</span>
    <div class="row" style="margin-top:6px"><span class="small">Settle a region of radius</span><select data-claimradius="1" style="width:130px">${opts}</select></div>
    <div class="row" style="margin-top:6px">${costHtml(claimCost(i, r), S.res)}<span class="spacer"></span>${btn(`🏳️ Claim ${cl.length} hexes`, 'claim', `${i}:${r}`, { disabled: !!err, title: err || '' })}</div>
    ${err ? `<div class="small muted">${esc(err)}</div>` : `<div class="small muted">Settlers reach ${settleReach()} hexes past your border, so your empire can keep spreading. A division standing on neutral land can annex it outright.</div>`}</div>`;
}
function hexCard(i) {
  const { terrain, owner, feat } = S.world, seen = isSeen(i), ter = TERRAIN[terrain[i]], o = owner[i], f = feat[i];
  let h = `<div class="row"><h2>${seen ? ter.name : 'Unexplored'}</h2><span class="muted small">${hexName(i)}</span><span class="spacer"></span><button class="icon-btn" data-action="world-deselect">✕</button></div>`;
  if (seen) {
    h += `<p class="small">${ter.bonus ? 'Holding it gives ' + Object.entries(ter.bonus).map(([k, v]) => `${RES_META[k].icon}+${(v * 60).toFixed(0)}/min`).join(' ') + '. ' : ''}${isFinite(ter.cost) && terrain[i] !== T.WATER ? `Movement cost ×${ter.cost}.` : terrain[i] === T.MOUNTAIN ? 'Impassable to armies.' : 'Ships sail here; divisions need transports.'}</p>`;
    if (f) {
      const F = FEATURES[f.type];
      let state = '';
      if (f.type === 'cave') state = f.explored ? `Contains <b>${MINERALS[f.mineral].icon} ${MINERALS[f.mineral].name}</b> — hold this hex for ${Object.entries(MINERALS[f.mineral].bonus).map(([k, v]) => `${RES_META[k].icon}+${(v * 60).toFixed(1)}/min`).join('')}.` : 'Unexplored — minerals unknown.';
      if (f.type === 'ruins') state = f.looted ? 'Already plundered.' : `Danger tier ${f.tier} · guards ⚡~${f.guard}.`;
      if (f.type === 'fort') state = f.captured ? 'Your outpost.' : `Tier ${f.tier} · defenders ⚡~${f.guard}.`;
      if (f.type === 'wreck') state = f.salvaged ? 'Salvaged.' : `Tier ${f.tier} cargo.`;
      if (f.type === 'cove') state = f.destroyed ? 'Burned to the waterline.' : `Pirate strength ⚡~${f.power}.`;
      h += `<div class="card"><b>${F.icon} ${F.name}</b><div class="small">${state}</div><div class="small muted">${F.desc}</div></div>`;
    }
    if (o === -2) h += territoryCard(i);
    if (o === -1 && terrain[i] !== T.WATER && terrain[i] !== T.MOUNTAIN) {
      h += claimCard(i);
      h += buildHereCard(i, true);
    }
    if (o >= 0) h += kingdomCard(S.kingdoms[o]);
    const here = S.aiArmies.filter((a) => a.at === i).concat(S.aiFleets.filter((f2) => f2.at === i));
    for (const x of here) h += `<div class="card small">${x.ships ? `⛵ ${x.owner === 'pirate' ? 'Pirate fleet' : S.kingdoms[x.owner].name + (x.patrol ? ' navy patrol' : ' fleet')} — ${shipCount(x.ships)} ships ${unitList(x.ships, SHIPS)}` : `⚔️ ${S.kingdoms[x.kid].name} ${({ raid: 'raiders — coming for you!', war: 'war army', guard: 'guard army', home: 'army returning home' })[x.kind] || 'army'} — ${armyHousing(x.units)} troops ${unitList(x.units, UNITS)}`}</div>`;
  }
  if (!seen && S.world.owner[i] === -1 && terrain[i] !== T.WATER && terrain[i] !== T.MOUNTAIN && canSettle(i)) h += claimCard(i);
  const n = S.army.scout;
  h += `<h3>Scouting</h3><div class="card"><div class="row"><span>Send</span><select id="scout-count" style="width:70px">${Array.from({ length: Math.max(1, n) }, (_, k) => `<option>${k + 1}</option>`).join('')}</select><span class="small">of ${n} scouts</span><span class="spacer"></span>
    ${btn('🔭 Scout here', 'scout-here', i, { disabled: n < 1, title: n ? '' : 'Train scouts at the Scout Lodge' })}</div><div class="small muted" style="margin-top:4px">A scout party walks here from your capital, revealing every hex on the way.</div></div>`;
  const forces = S.divisions.concat(S.fleets).filter((e) => ordersFor(e, i).length);
  if (forces.length && !selectedEntity()) h += '<h3>Send forces</h3>' + forces.map((e) => `<div class="member clickable" data-action="select-entity" data-arg="${isFleet(e) ? 'fleet' : 'division'}:${e.id}">${isFleet(e) ? '⚓' : `<span class="swatch" style="background:${e.color}"></span>`}<b>${esc(e.name)}</b><span class="spacer"></span><span class="small muted">select →</span></div>`).join('');
  return h;
}
function kingdomCard(k) {
  if (k.fallen) return `<div class="card hl"><div class="row"><span class="dot" style="background:${k.color};width:16px;height:16px"></span><div><b>${k.name}</b><div class="small muted">👑 Conquered — its land is part of your realm now</div></div></div></div>`;
  const intel = S.intel[k.id], a = allianceOf(k.allianceId), allied = S.allianceId && k.allianceId === S.allianceId;
  let h = `<div class="card hl"><div class="row"><span class="dot" style="background:${k.color};width:16px;height:16px"></span><div><b>${k.name}</b><div class="small muted">${k.ruler} · ${PERSONALITIES[k.personality].name}${k.coastal ? ' · coastal' : ''}</div></div></div>
    <dl class="kv" style="margin-top:8px"><dt>Relation</dt><dd>${relationBar(k)}</dd><dt>Alliance</dt><dd>${a ? a.emblem + ' ' + esc(a.name) : '—'}</dd>
    ${k.treaty > 0 ? `<dt>Treaty</dt><dd>🕊️ ${fmtTime(k.treaty)}</dd>` : ''}${k.tradePact ? '<dt>Trade pact</dt><dd>⚖️ +5% gold</dd>' : ''}`;
  if (intel) h += `<dt>Keep level</dt><dd>${intel.hall}</dd><dt>Army (est.)</dt><dd>⚡ ~${fmt(intel.power)}</dd><dt>Defenses (est.)</dt><dd>🛡️ ~${fmt(intel.defense)}</dd>${k.coastal ? `<dt>Navy (est.)</dt><dd>⚓ ~${fmt(intel.navy)}</dd>` : ''}<dt>Treasury</dt><dd>💰${fmt(intel.res.gold)} 🌳${fmt(intel.res.lumber)}</dd><dt>Intel age</dt><dd>${fmtTime(S.time - intel.t)}</dd>`;
  else h += '<dt>Intel</dt><dd class="muted">Unknown — send scouts</dd>';
  const ring = capitalRing(k), held = ring.filter((n) => S.world.owner[n] === -2).length;
  if (!allied && ring.length) h += `<dt>Siege</dt><dd title="Hold every open hex around the capital and the kingdom surrenders">🏰 ${held}/${ring.length} hexes around the capital held</dd>`;
  h += `</dl><h3>Diplomacy</h3><div class="row wrap">${btn('🎁 Gift 💰200', 'diplo', 'gift:' + k.id, { cls: 'ghost sm' })}
    ${k.atWar ? btn(`🕊️ Make peace 💰${400 * k.hall}`, 'diplo', 'peace:' + k.id, { cls: 'sm' }) : btn('🕊️ Treaty 💰400', 'diplo', 'treaty:' + k.id, { cls: 'ghost sm', title: 'Non-aggression for 20 min (relation 10+)' })}
    ${btn(k.tradePact ? '⚖️ End pact' : '⚖️ Trade pact', 'diplo', 'pact:' + k.id, { cls: 'ghost sm', title: 'Relation 35+: +5% gold' })}
    ${btn('💰 Demand tribute', 'diplo', 'tribute:' + k.id, { cls: 'ghost sm' })}
    ${!k.atWar && !allied ? btn('⚔️ Declare war', 'diplo', 'war:' + k.id, { cls: 'red sm' }) : ''}
    ${S.allianceId && allianceOf(S.allianceId).leader === 'P' && !allied ? btn('🤝 Invite', 'invite', k.id, { cls: 'blue sm' }) : ''}</div>
    <p class="small muted" style="margin-top:6px">To attack: select a division on the map, click their land and choose <b>Invade</b>, or their capital and choose <b>Assault</b>. Hold every hex around the capital and the kingdom surrenders. Coastal kingdoms can be blockaded by fleets.</p></div>`;
  return h;
}

/* ---------- Alliance tab ---------- */
let leaderboardCache = { t: 0, data: null };
function renderAlliance() {
  const a = allianceOf(S.allianceId);
  let h = '';
  if (a) {
    const bonus = allianceBonus(), leader = a.leader === 'P';
    h += `<div class="row"><div class="emblem" style="background:${a.color}">${a.emblem}</div><div><h2>${esc(a.name)}</h2><div class="small muted">Level ${a.level} · ${a.members.length} members · ${a.open ? 'Open' : 'Invite only'}</div></div></div>
      <div style="margin:8px 0">${progress(a.level >= 10 ? 1 : a.xp / xpNeed(a.level))}<div class="small muted">${a.level >= 10 ? 'Max level' : `${fmt(a.xp)} / ${fmt(xpNeed(a.level))} XP`}</div></div>
      <div class="card"><b class="small">Shared bonuses</b><div class="small">🌾 +${Math.round(bonus.prod * 100)}% production · ⚔ +${Math.round(bonus.atk * 100)}% attack · 🛡 +${Math.round(bonus.def * 100)}% defense · ⏱ +${Math.round(bonus.train * 100)}% training</div>
      <div class="small muted">Allies never raid you and send reinforcements to defend your capital.</div></div><h3>Members</h3><div class="card">`;
    for (const m of a.members) {
      const k = m === 'P' ? null : S.kingdoms[m];
      h += `<div class="member"><span class="dot" style="background:${memberColor(m)}"></span><div><b>${esc(memberName(m))}</b> ${a.leader === m ? '👑' : ''}<div class="small muted">⚡ ${fmt(k ? k.power + k.defense : totalPower())}</div></div><span class="spacer"></span>${leader && m !== 'P' ? btn('Kick', 'kick', m, { cls: 'sm ghost' }) : ''}</div>`;
    }
    h += '</div>';
    if (leader) {
      const cands = S.kingdoms.filter((k) => !k.fallen && k.allianceId !== a.id);
      h += `<h3>Manage</h3><div class="row wrap">${btn(a.open ? '🔓 Open recruitment' : '🔒 Invite only', 'toggle-open', '', { cls: 'sm ghost' })}</div>
        <div class="card" style="margin-top:8px"><b class="small">Invite kingdoms</b>` + (cands.map((k) => `<div class="member"><span class="dot" style="background:${k.color}"></span><div class="small"><b>${k.name}</b><div>${relationBar(k)}${k.allianceId ? ' · in ' + esc(allianceOf(k.allianceId).name) : ''}</div></div><span class="spacer"></span>${btn('Invite', 'invite', k.id, { cls: 'sm blue' })}</div>`).join('') || '<div class="small muted">Every kingdom has joined you!</div>') + '</div>';
    }
    h += `<h3>Donate</h3><div class="row wrap">${[['gold', 250], ['lumber', 250], ['iron', 150], ['food', 250], ['diamonds', 5]].map(([r, v]) => btn(`${RES_META[r].icon}${v}`, 'donate', `${r}:${v}`, { cls: 'sm ghost', disabled: S.res[r] < v })).join('')}</div>
      <h3>Alliance chat</h3><div class="chat" id="chat">${a.chat.slice(-30).map((c) => `<div><b style="color:${memberColor(c.who)}">${esc(c.who === 'P' ? S.name : S.kingdoms[c.who].name)}:</b> ${esc(c.text)}</div>`).join('') || '<span class="muted">No messages yet.</span>'}</div>
      <div class="row" style="margin-top:6px"><input type="text" id="chat-input" placeholder="Message your allies…" maxlength="140" />${btn('Send', 'chat-send', '', { cls: 'sm' })}</div>
      <div style="margin-top:14px">${btn('Leave alliance', 'leave', '', { cls: 'sm red' })}</div>`;
  } else {
    const d = UI.allianceDraft || (UI.allianceDraft = { name: '', color: ALLIANCE_COLORS[0], emblem: ALLIANCE_EMBLEMS[0] });
    h += `<h2>Alliances</h2><p class="small muted">Band together for shared production, attack, defense and training bonuses. Allies never raid you and reinforce you when attacked.</p>`;
    for (const x of S.alliances) {
      const can = hallLevel() >= x.minHall;
      h += `<div class="card"><div class="row"><div class="emblem" style="background:${x.color}">${x.emblem}</div><div><b>${esc(x.name)}</b><div class="small muted">Lvl ${x.level} · ${x.members.length} members · ${x.open ? 'Open' : 'Invite only'} · Hall ${x.minHall}+</div>
        <div class="small">${x.members.map((m) => `<span class="dot" style="background:${memberColor(m)};width:8px;height:8px"></span> ${esc(memberName(m))}`).join(' ')}</div></div><span class="spacer"></span>
        ${btn(x.open ? 'Join' : 'Request', 'join', x.id, { cls: 'sm', disabled: !can, title: can ? '' : `Requires Main Hall ${x.minHall}` })}</div></div>`;
    }
    h += `<h3>Found your own</h3><div class="card"><input type="text" id="alliance-name" placeholder="Alliance name" maxlength="28" value="${esc(d.name)}" />
      <div class="row" style="margin-top:8px"><span class="small muted">Emblem</span><div class="swatches">${ALLIANCE_EMBLEMS.map((e) => `<button class="${e === d.emblem ? 'sel' : ''}" style="background:#262d3b" data-action="emblem" data-arg="${e}">${e}</button>`).join('')}</div></div>
      <div class="row" style="margin-top:8px"><span class="small muted">Colour</span><div class="swatches">${ALLIANCE_COLORS.map((c) => `<button class="${c === d.color ? 'sel' : ''}" style="background:${c}" data-action="color" data-arg="${c}"></button>`).join('')}</div></div>
      <div class="row" style="margin-top:10px">${costHtml({ gold: 1000 }, S.res)}<span class="spacer"></span>${btn('Found alliance', 'create-alliance', '', { disabled: S.res.gold < 1000 })}</div></div>`;
  }
  const rows = [{ name: S.name + ' (you)', power: totalPower(), color: '#f2c14e', you: true }]
    .concat(liveKingdoms().map((k) => ({ name: isSeen(k.capital) ? k.name : '??? (unscouted)', power: k.power + k.defense + k.navy, color: k.color }))).sort((x, y) => y.power - x.power);
  h += '<h3>Realm ranking</h3><div class="card">' + rows.map((r, n) => `<div class="member"><b style="width:20px">${n + 1}</b><span class="dot" style="background:${r.color}"></span><span ${r.you ? 'style="color:var(--gold);font-weight:700"' : ''}>${esc(r.name)}</span><span class="spacer"></span><span class="small">⚡ ${fmt(r.power)}</span></div>`).join('') + '</div>';
  if (API.online) {
    if (Date.now() - leaderboardCache.t > 30000) { leaderboardCache.t = Date.now(); API.leaderboard().then((d) => { leaderboardCache.data = d; UI.panelDirty = true; }); }
    const lb = leaderboardCache.data;
    h += '<h3>Global ranking (server)</h3><div class="card">' + (lb && lb.length ? lb.map((p, n) => `<div class="member"><b style="width:20px">${n + 1}</b><span>${esc(p.name)}</span><span class="spacer"></span><span class="small">Hall ${p.hall} · ⚡ ${fmt(p.power)}</span></div>`).join('') : '<span class="small muted">Loading…</span>') + '</div>';
  }
  return h;
}

/* ---------- Log tab ---------- */
function renderLog() {
  UI.logUnread = false;
  const st = S.stats;
  return `<h2>Chronicle</h2><dl class="kv" style="margin-bottom:10px">
    <dt>Land battles won / lost</dt><dd>${st.battlesWon} / ${st.battlesLost}</dd><dt>Sea battles won / lost</dt><dd>${st.navalWon} / ${st.navalLost}</dd>
    <dt>Raids repelled / suffered</dt><dd>${st.raidsRepelled} / ${st.raidsLost}</dd><dt>Ruins explored · wrecks salvaged</dt><dd>${st.ruinsExplored} · ${st.wrecksSalvaged}</dd>
    <dt>Scouting missions · technologies</dt><dd>${st.scouted} · ${st.researched}</dd></dl>` +
    S.log.map((l) => `<div class="log-item ${l.kind}"><time>${fmtTime(l.t)}</time><span>${esc(l.text)}</span></div>`).join('');
}

function territoryCard(i) {
  const cap = i === S.world.capital || isPlaza(i), def = hexDefense(i), b = buildingAt(i);
  let h = `<div class="card"><b>🏳️ Your land${cap ? ' — the capital' : ''}</b>
    <div class="small">Defense here: ${def > 0 ? `🛡️ ${fmt(def)}` : '<span class="bad-txt">undefended — raiders love this</span>'}${stationedAt(i).length ? ` · guarded by ${stationedAt(i).map((d) => esc(d.name)).join(', ')}` : ''}</div>`;
  if (b) return h + `<div class="row" style="margin-top:6px">${BUILDINGS[b.type].icon} <b>${BUILDINGS[b.type].name}</b> · level ${b.level}<span class="spacer"></span>${btn('Open', 'select', b.id, { cls: 'sm' })}</div></div>`;
  if (cap) return h + '</div>';
  return h + '</div>' + buildHereCard(i, false);
}
// "Build here" grid for an empty hex — yours, or unclaimed (building there settles it).
function buildHereCard(i, neutral) {
  if (!buildableTerrain(i) || buildingAt(i)) return '';
  const o = obstacleAt(i), protectedHex = defensesNear(i, 3).length > 0;
  let h = `<div class="card"><h3 style="margin-top:0">Build here${neutral ? ' <span class="muted small">(also settles this hex: +' + costHtml(hexClaimCost(i)) + ')</span>' : ''}</h3>`;
  if (o) h += `<div class="row small">${o === 'tree' ? '🌲 Trees' : '⛰️ Rocks'} cover this hex.<span class="spacer"></span>${neutral ? '' : btn('⛏️ Clear 💰25', 'clear-obstacle', i, { cls: 'sm ghost' })}</div>`;
  if (!protectedHex) h += '<div class="small muted">⚠️ No tower, cannon, spire, fortress or wall nearby: buildings here are raided far more often.</div>';
  h += '<div class="tb-grid">';
  let any = false;
  for (const t of BUILD_ORDER) {
    const err = placementError(t, i), lock = buildLockReason(t);
    if (err && !err.startsWith('Clear')) continue;
    any = true;
    const boost = terrainBoost({ type: t, hex: i });
    h += `<button class="build-item ${err || lock ? 'locked' : ''}" data-action="build-at" data-arg="${t}:${i}" data-tb="${t}" title="${esc(err || lock || '')}"><div class="bi-top"><span class="bi-ico">${BUILDINGS[t].icon}</span><b>${BUILDINGS[t].name}</b>${boost > 1 ? `<span class="count" style="color:var(--green)">×${boost}</span>` : ''}</div><div>${costHtml(costFor(t, 1), S.res)}</div><div class="desc">${esc(lock || err || BUILDINGS[t].desc)}</div></button>`;
  }
  return h + (any ? '' : '<p class="small muted">Nothing can be built on this terrain.</p>') + '</div></div>';
}

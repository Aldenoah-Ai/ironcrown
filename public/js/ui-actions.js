/* ==========================================================================
   UI part 2: modals, actions (event delegation) and map input.
   ========================================================================== */
'use strict';

UI.selHex = -1;

/* ---------- modals ---------- */
function showModal(html, wide) {
  UI.boxToken++;
  el('modal-card').innerHTML = html;
  el('modal-card').classList.toggle('wide', !!wide);
  el('modal').hidden = false;
}
function closeModal() { el('modal').hidden = true; el('modal-card').innerHTML = ''; }

function showWelcome() {
  const old = UI.badSave
    ? '<p class="card small">⚠️ Your previous save could not be read and has been set aside. Starting a fresh realm.</p>'
    : UI.oldSave ? `<p class="card small">⚠️ Your previous save was from Ironcrown v${UI.oldSave}, whose world was a tenth of the size of this one — it cannot be carried over. A fresh, far bigger realm awaits!</p>` : '';
  showModal(`<h2 style="font-size:26px">👑 Ironcrown <span class="ver">v${GAME_VERSION}</span></h2>${old}
    <p>Rule a young kingdom in a living world of rival realms, pirates and forgotten ruins.</p>
    <ul class="small muted" style="padding-left:18px">
      <li>Build on your <b>hexagonal land</b> and upgrade the Main Hall to grow it.</li>
      <li>Research at <b>Universities</b>, train troops, build <b>ships</b>.</li>
      <li>Group soldiers into <b>divisions</b> and ships into <b>fleets</b>, then command them on the <b>World map</b>.</li>
      <li>Explore ruins, caves, forts and shipwrecks. Trade, ally, or conquer.</li>
      <li>Press <b>?</b> any time for the full help guide. Drag to move the map, scroll to zoom.</li></ul>
    <label class="small muted">Name your kingdom</label><input type="text" id="welcome-name" value="${esc(S.name)}" maxlength="24" />
    <div class="actions">${btn('📖 Help guide', 'help', '', { cls: 'ghost' })}<button class="btn" data-action="begin" id="begin-btn">Begin your reign</button></div>`);
}
function showMenu() {
  showModal(`<h2>Kingdom menu</h2><dl class="kv"><dt>Version</dt><dd>v${GAME_VERSION}</dd><dt>Save slot</dt><dd>${esc(SLOT)}</dd><dt>Backend</dt><dd>${API.online ? '✅ Python server (cloud save)' : '⚪ Browser storage'}</dd><dt>Played</dt><dd>${fmtTime(S.time)}</dd></dl>
    <h3>Rename kingdom</h3><div class="row"><input type="text" id="rename-input" value="${esc(S.name)}" maxlength="24" />${btn('Rename', 'rename', '', { cls: 'sm' })}</div>
    <h3>Save data</h3><div class="row wrap">${btn('💾 Save now', 'save', '', { cls: 'sm' })}${btn('📤 Export', 'export', '', { cls: 'sm ghost' })}${btn('📥 Import', 'import', '', { cls: 'sm ghost' })}${btn('Reset game', 'reset', '', { cls: 'sm red' })}</div>
    <div class="actions">${btn('⚙️ Settings', 'settings', '', { cls: 'ghost' })}${btn('📖 Help', 'help', '', { cls: 'ghost' })}${btn('Close', 'close-modal', '', { cls: 'ghost' })}</div>`);
}
function showSettings() {
  const sel = (key, opts) => `<select data-setting="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(SETTINGS[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (key, label) => `<label class="check"><input type="checkbox" data-setting="${key}" ${SETTINGS[key] ? 'checked' : ''}/> ${label}</label>`;
  showModal(`<h2>⚙️ Settings</h2>
    <h3>Camera</h3>
    <div class="setting"><span>Move the map with</span>${sel('panMode', [['drag', '🖱️ Drag (click & drag)'], ['keys', '⌨️ Keyboard (WASD / arrows)'], ['both', 'Both']])}</div>
    ${chk('invertDrag', 'Invert drag direction')}
    ${chk('edgeScroll', 'Edge scrolling (move the mouse to the screen edge)')}
    <div class="setting"><span>Zoom speed</span>${sel('zoomSpeed', [[0.5, 'Slow'], [1, 'Normal'], [1.8, 'Fast']])}</div>
    ${chk('minimap', 'Show the minimap')}
    <h3>Display</h3>
    ${chk('showGrid', 'Show hex grid lines')}
    ${chk('prodNumbers', 'Floating production numbers')}
    ${chk('particles', 'Particles & effects')}
    <div class="setting"><span>Graphics quality</span>${sel('graphics', [['high', '✨ High — realistic textures'], ['medium', '🎨 Classic'], ['low', '🔷 Low-poly (fastest)']])}</div>
    <div class="setting"><span>Render resolution</span>${sel('resolution', [['sharp', '🔍 Sharp (full screen density)'], ['balanced', '⚖️ Balanced'], ['performance', '⚡ Performance (fastest)']])}</div>
    ${chk('autoQuality', 'Adapt automatically when frames get slow (recommended)')}
    ${chk('showFps', 'Show frame rate')}
    <div class="row" style="margin-top:6px">${btn('⚡ Make it fast', 'fast-preset', '', { cls: 'sm', title: 'Low-poly, Performance resolution, no minimap or particles' })}<span class="small muted">One click if the map feels heavy.</span></div>
    <p class="small muted">A world of ${fmt(WG.N)} hexes asks a lot of a browser. ⚡ Performance resolution has the biggest effect on high-DPI and 4K screens; with <b>Adapt automatically</b> on, the game also gives ground on its own rather than pinning your machine.</p>
    <h3>Gameplay</h3>
    <div class="setting"><span>Battles</span>${sel('battleMode', [['watch', '⚔️ Command battles on the map'], ['auto', '⚡ Auto-resolve instantly']])}</div>
    ${chk('focusBattles', 'Move the camera to battles when they start')}
    <p class="small muted">Settings are stored in this browser. Version v${GAME_VERSION}.</p>
    <div class="actions">${btn('Done', 'close-modal')}</div>`);
}
function showHelp(section) {
  const cur = HELP.find((s) => s.id === section) || HELP[0];
  showModal(`<div class="help"><nav>${HELP.map((s) => `<button class="${s === cur ? 'active' : ''}" data-action="help" data-arg="${s.id}">${s.icon} ${s.title}</button>`).join('')}</nav>
    <article><h2>${cur.icon} ${cur.title}</h2>${cur.html}<p class="small muted" style="margin-top:18px">Ironcrown v${GAME_VERSION} · press <kbd>?</kbd> or <kbd>H</kbd> to open this guide.</p></article></div>
    <div class="actions">${btn('Close', 'close-modal', '', { cls: 'ghost' })}</div>`, true);
}
function sliderRows(pool, table, prefix, defaults = 'all') {
  return Object.keys(table).filter((k) => pool[k] > 0).map((k) => {
    const v = defaults === 'all' && k !== 'scout' ? pool[k] : 0;   // scouts stay home unless chosen
    return `<div class="row slider-row"><span style="width:26px">${table[k].icon}</span><span style="width:84px">${table[k].name}</span>
    <input type="range" min="0" max="${pool[k]}" value="${v}" data-${prefix}="${k}" /><b id="${prefix}-${k}" style="width:60px;text-align:right">${v}/${pool[k]}</b></div>`;
  }).join('') || '<p class="muted small">Nothing available.</p>';
}
function generalSelect(id, optional) {
  const idle = idleGenerals();
  if (!idle.length && !optional) return `<p class="small bad-txt">No idle general! Every division needs its own commander.</p>${btn('🍺 Hire one at the Tavern (💰900)', 'hire-muster', '', { cls: 'sm' })}<select id="${id}" hidden></select>`;
  return `<select id="${id}">${optional ? '<option value="">— no admiral —</option>' : ''}${idle.map((g) => `<option value="${g.uid}">${generalData(g.uid).icon} ${esc(generalData(g.uid).name)} ${'★'.repeat(g.stars)} (${RARITY[generalData(g.uid).rarity].name})</option>`).join('')}</select>`;
}
function showMuster() {
  showModal(`<h2>⚔️ Muster a division</h2><p class="small muted">Troops leave the capital garrison and form a named division you can command on the World map.</p>
    <input type="text" id="div-name" placeholder="Division name" value="${esc(['2nd', '3rd', '4th', '5th', '6th'][S.divisions.length % 5] + ' ' + pick(['Legion', 'Guard', 'Lancers', 'Company', 'Vanguard']))}" maxlength="24" />
    <h3>Troops</h3>${sliderRows(S.army, UNITS, 'mu')}
    <h3>General (required)</h3>${generalSelect('div-general')}
    <h3>Battle plan</h3><div class="row wrap"><select id="div-form">${Object.entries(FORMATIONS).map(([k, f]) => `<option value="${k}">${f.icon} ${f.name}</option>`).join('')}</select><select id="div-stance">${Object.entries(STANCES).map(([k, f]) => `<option value="${k}">${f.icon} ${f.name}</option>`).join('')}</select></div>
    <div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Muster', 'muster-yes', '', { id: 'muster-yes' })}</div>`);
}
function showFormFleet() {
  showModal(`<h2>⚓ Form a fleet</h2><p class="small muted">Ships leave the home harbour and sail as one fleet.</p>
    <input type="text" id="fleet-name" placeholder="Fleet name" value="${esc(pick(['Royal', 'Northern', 'Storm', 'Golden', 'Iron']) + ' ' + pick(['Squadron', 'Armada', 'Flotilla', 'Fleet']))}" maxlength="24" />
    <h3>Ships</h3>${sliderRows(S.harbor, SHIPS, 'fl')}
    <h3>Admiral (optional)</h3>${generalSelect('fleet-general', true)}
    <div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Set sail', 'fleet-yes', '', { id: 'fleet-yes' })}</div>`);
}
function readSliders(prefix) { const o = {}; document.querySelectorAll(`[data-${prefix}]`).forEach((r) => { o[r.dataset[prefix]] = +r.value; }); return o; }
function showBoxOpening(box, reward) {
  const r = reward.rarity;
  showModal(`<div class="box-open"><div class="chest shake" id="chest">${box.icon}</div><p class="muted">Opening ${box.name}…</p></div>`);
  const token = UI.boxToken;
  setTimeout(() => {
    if (el('modal').hidden || token !== UI.boxToken || !el('chest')) return;
    let body;
    if (reward.kind === 'general') {
      const g = reward.general;
      body = `<div class="portrait r-${r}">${g.icon}</div><div class="rarity r-${r}">${RARITY[r].name} General</div><div class="reward-title">${g.name}</div>
        ${reward.dup ? `<p class="small">${reward.max ? `Already 5★ — converted to 💰${reward.gold}` : `Duplicate! Now ${'★'.repeat(reward.stars)}`}</p>` : '<p class="small">A new general joins your court! Assign them in the Generals tab.</p>'}
        <div style="max-width:260px;margin:auto;text-align:left">${statBars(generalStats(g.id))}</div>`;
    } else if (reward.kind === 'item') body = `<div style="font-size:70px">${ITEMS[reward.item].icon}</div><div class="reward-title">${reward.qty}× ${ITEMS[reward.item].name}</div><p class="small muted">${ITEMS[reward.item].desc}</p>`;
    else body = `<div style="font-size:70px">💰</div><div class="reward-title">Treasure!</div><p style="font-size:18px">${costHtml(reward.bundle)}</p>`;
    el('modal-card').innerHTML = `<div class="box-open" style="--r:${RARITY[r].color}"><div class="burst"><div class="reward" id="box-reward">${body}</div></div></div>
      <div class="actions" style="justify-content:center">${btn('Collect', 'close-modal', '', { cls: 'ghost' })}${btn('Open another', 'open-box', box.id, { disabled: !canAfford(box.cost) })}</div>`;
    if (r === 'legendary' || r === 'epic') celebrate();
  }, 1300);
}

// A different realm arrived without a page load (reset, import): drop
// everything that belonged to the old one.
function swapRealm() {
  CATCHUP.left = 0;
  Battles.list = []; Battles.focus = null;
  UI.fx = []; UI.selected = null; UI.selEntity = null; UI.worldSel = -1; UI.selHex = -1; UI.placing = null;
  flushRenderCaches();
  UI.panelDirty = true; UI.lastPanelHtml = '';
}

/* ---------- view / tab ---------- */
// One map: K flies to your capital, M zooms out over the world.
function setView(v) {
  if (v === 'kingdom') CAM.flyToHex(S.world.capital, Math.max(CAM.z, 4.5));
  else CAM.flyTo(CAM.x, CAM.y, 0.6);
  UI.panelDirty = true;
}
function flyToCity() { if (CAM.z < 2.5) CAM.flyToHex(S.world.capital, 4.5); }
function setTab(t) {
  if (!PANEL_TABS.includes(t)) t = 'info';
  UI.tab = t;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  UI.lastPanelHtml = ''; el('panel-body').scrollTop = 0;
  if (S) renderPanel(true);
}
function updatePlacingHint() {
  const h = el('placing-hint');
  h.hidden = !UI.placing;
  if (UI.placing) h.innerHTML = `Placing ${BUILDINGS[UI.placing].icon} ${BUILDINGS[UI.placing].name} — click a hex${UI.placing === 'wall' ? ' (drag to paint)' : ''} <button class="btn sm ghost" data-action="cancel-place">Cancel (Esc)</button>`;
}
function selectEntity(kind, id) {
  UI.selEntity = { kind, id };
  const e = selectedEntity();
  if (!e) return;
  CAM.flyToHex(e.at, Math.min(CAM.z, 2.2));
  setTab('map');
}

/* ---------- actions ---------- */
const findEnt = (arg) => { const [k, id] = String(arg || '').split(':'); return (k === 'division' ? S.divisions : k === 'scout' ? S.scouts : S.fleets).find((e) => e.id === id); };
// Reading a field of a modal that may already have closed.
const inputVal = (id) => { const e = el(id); return e && e.value != null ? String(e.value).trim() : ''; };
const ACTIONS = {
  place(t) { const l = buildLockReason(t); if (l) return toast(l, 'bad'); flyToCity(); setTab('info'); UI.placing = t; UI.selected = null; updatePlacingHint(); },
  'cancel-place'() { UI.placing = null; updatePlacingHint(); },
  select(id) { UI.selected = +id; const b = S.buildings.find((x) => x.id === +id); if (b && CAM.z < 2.5) CAM.flyToHex(b.hex, 4.5); setTab('info'); },
  'build-at'(arg) { const [t, i] = arg.split(':'); const b = placeBuilding(t, +i); if (b) { UI.selected = b.id; setTab('info'); } },
  deselect() { UI.selected = null; UI.selHex = -1; },
  upgrade(id) { upgradeBuilding(S.buildings.find((b) => b.id === +id)); },
  demolish(id) { showModal(`<h2>Demolish?</h2><p>You will get 40% of its cost back.</p><div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Demolish', 'demolish-yes', id, { cls: 'red' })}</div>`); },
  'demolish-yes'(id) { closeModal(); demolish(S.buildings.find((b) => b.id === +id)); },
  'clear-obstacle'(i) { if (clearObstacle(+i)) UI.selHex = -1; },
  train(arg) { const [u, n] = arg.split(':'); const m = trainUnits(u, +n); if (m) toast(`Training ${m} ${UNITS[u].name}${m > 1 ? 's' : ''}`); },
  'build-ship'(arg) { const [t, n] = arg.split(':'); const m = buildShips(t, +n); if (m) toast(`${SHIPS[t].name} laid down at the shipyard`); },
  'cancel-queue'(id) { cancelQueue(S.buildings.find((b) => b.id === +id)); },
  research(id) { startResearch(id); },
  tab(t) { setTab(t); },
  trade(arg) {
    const [kind, r] = arg.split(':'), port = S.buildings.filter((b) => b.type === 'port' && b.level > 0).sort((a, b) => b.level - a.level)[0];
    if (!port) return;
    if (kind === 'sell') { if (S.res[r] < 200) return toast(`Need 200 ${RES_META[r].name}`, 'bad'); S.res[r] -= 200; gain({ gold: Math.round(200 * (0.5 + 0.1 * port.level + 0.1 * R('trade'))) }); }
    else { if (!pay({ gold: Math.round(100 * (2.2 - 0.15 * port.level - 0.1 * R('trade'))) })) return toast('Not enough gold', 'bad'); gain({ [r]: 100 }); }
  },
  'world-deselect'() { UI.worldSel = -1; },
  'focus-kingdom'(kid) { const k = S.kingdoms[+kid]; UI.worldSel = k.capital; CAM.flyToHex(k.capital); setTab('map'); },
  'focus-hex'(i) { UI.worldSel = +i; CAM.flyToHex(+i, Math.min(CAM.z, 2.2)); setTab('map'); },
  'focus-entity'() { const e = selectedEntity(); if (e) CAM.flyToHex(e.at); },
  'select-entity'(arg) { const [k, id] = arg.split(':'); selectEntity(k, id); },
  'deselect-entity'() { UI.selEntity = null; },
  'toggle-guard'(id) {
    const d = S.divisions.find((x) => x.id === id);
    if (!d) return;
    d.guard = !d.guard;
    if (d.guard) { d.guardAt = d.at; toast(`🛡️ ${d.name} guards ${hexName(d.at)} and every hex connected to it`, 'good'); guardDuty(); }
    else { d.warned = false; if (d.order && d.order.type === 'defend') d.order = null; toast(`${d.name} stands down from guard duty`); }
    UI.panelDirty = true;
  },
  claim(arg) { const [i, r] = String(arg).split(':'); claimTile(+i, +r || UI.claimRadius || 1); },
  'scout-here'(i) { const p = dispatchScouts(+(el('scout-count') ? el('scout-count').value : 1), +i); if (p) { UI.selEntity = { kind: 'scout', id: p.id }; toast(`🔭 Scouts heading to ${hexName(+i)} (ETA ${fmtTime(etaOf(p))})`); } },
  'dispatch-scouts'() {
    const p = dispatchScouts(+(el('scout-dispatch') ? el('scout-dispatch').value : 1));
    if (!p) return;
    selectEntity('scout', p.id);
    toast('🔭 Scout party ready — click anywhere on the map to send them', 'good');
  },
  'tb-build'(arg) { const [t, i] = arg.split(':'); buildTerritory(t, +i); },
  hire() { hireGeneral(); },
  'hire-muster'() { if (hireGeneral()) showMuster(); },
  promote(uid) { promoteGeneral(uid); },
  'b-form'(arg) { const [id, gi, f] = arg.split(':'); const b = Battles.get(+id); if (b) battleGroups(b, gi).forEach((G) => Battles.setFormation(b, G.gi, f)); renderBattleHud(); },
  'b-stance'(arg) { const [id, gi, st] = arg.split(':'); const b = Battles.get(+id); if (b) battleGroups(b, gi).forEach((G) => Battles.setStance(b, G.gi, st)); renderBattleHud(); },
  'b-resolve'(id) { Battles.resolve(+id); },
  'b-focus'(id) { const b = Battles.get(+id); if (b) { Battles.focus = b.id; Battles.focusCam(b); } },
  'b-tab'(id) { Battles.focus = +id; renderBattleHud(); },
  order(kind) { issueOrder(selectedEntity(), kind, UI.worldSel); },
  return(arg) { const e = findEnt(arg); if (e) giveOrder(e, 'return', isFleet(e) ? S.world.harbor : S.world.capital); },
  diplo(arg) { const [k, id] = arg.split(':'); const kk = S.kingdoms[+id]; if (DIPLO[k] && kk) DIPLO[k](kk); },
  muster() { showMuster(); },
  'muster-yes'() {
    const d = createDivision(el('div-name').value, readSliders('mu'), el('div-general').value || null);
    if (d) { d.formation = el('div-form').value; d.stance = el('div-stance').value; closeModal(); toast(`⚔️ ${d.name} mustered under ${generalData(d.general).name}`, 'good'); }
  },
  'form-fleet'() { showFormFleet(); },
  'fleet-yes'() { const f = createFleet(el('fleet-name').value, readSliders('fl'), el('fleet-general').value || null); if (f) { closeModal(); toast(`⚓ ${f.name} formed`, 'good'); } },
  'edit-troops'(id) {
    const d = S.divisions.find((x) => x.id === id);
    if (!d) return toast('That division is gone', 'bad');
    const pool = {}; for (const u of Object.keys(UNITS)) if (u !== 'seaman' && (d.units[u] || S.army[u])) pool[u] = (d.units[u] || 0) + (S.army[u] || 0);
    showModal(`<h2>🎚️ ${esc(d.name)} — troops</h2><p class="small muted">Drag to set exactly how many of each soldier this division has. Extra soldiers go back to (or come from) the capital garrison.</p>
      ${Object.keys(pool).map((u) => `<div class="row slider-row"><span style="width:26px">${UNITS[u].icon}</span><span style="width:84px">${UNITS[u].name}</span><input type="range" min="0" max="${pool[u]}" value="${d.units[u] || 0}" data-ed="${u}" /><b id="ed-${u}" style="width:70px;text-align:right">${d.units[u] || 0}/${pool[u]}</b></div>`).join('')}
      <div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Apply', 'edit-troops-yes', id, { id: 'edit-yes' })}</div>`);
  },
  'edit-troops-yes'(id) { if (setDivisionTroops(S.divisions.find((x) => x.id === id), readSliders('ed'))) { closeModal(); toast('Division updated', 'good'); } },
  split(id) {
    const d = S.divisions.find((x) => x.id === id);
    if (!d) return toast('That division is gone', 'bad');
    showModal(`<h2>✂️ Split ${esc(d.name)}</h2><p class="small muted">Choose which soldiers form the new division. It needs its own general.</p>
      <input type="text" id="split-name" value="${esc(d.name)} II" maxlength="24" />
      ${Object.keys(d.units).filter((u) => d.units[u] > 0).map((u) => `<div class="row slider-row"><span style="width:26px">${UNITS[u].icon}</span><span style="width:84px">${UNITS[u].name}</span><input type="range" min="0" max="${d.units[u]}" value="${Math.floor(d.units[u] / 2)}" data-sp="${u}" /><b id="sp-${u}" style="width:70px;text-align:right">${Math.floor(d.units[u] / 2)}/${d.units[u]}</b></div>`).join('')}
      <h3>General</h3>${generalSelect('split-general')}
      <div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Split', 'split-yes', id, { id: 'split-yes' })}</div>`);
  },
  'split-yes'(id) { const nd = splitDivision(S.divisions.find((x) => x.id === id), readSliders('sp'), inputVal('split-name'), inputVal('split-general') || null); if (nd) { closeModal(); toast(`✂️ ${nd.name} formed`, 'good'); } },
  merge(arg) { const [a, b] = arg.split(':'); mergeDivisions(S.divisions.find((x) => x.id === a), S.divisions.find((x) => x.id === b)); },
  reinforce(id) {
    const d = S.divisions.find((x) => x.id === id);
    if (!d) return toast('That division is gone', 'bad');
    showModal(`<h2>➕ Reinforce ${esc(d.name)}</h2>${sliderRows(S.army, UNITS, 'rf', 'none')}<div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Reinforce', 'reinforce-yes', id)}</div>`);
  },
  'reinforce-yes'(id) { reinforceDivision(S.divisions.find((x) => x.id === id), readSliders('rf')); closeModal(); },
  disband(id) { disbandDivision(S.divisions.find((x) => x.id === id)); },
  'disband-fleet'(id) { disbandFleet(S.fleets.find((x) => x.id === id)); },
  'rename-entity'(arg) { const e = findEnt(arg); if (!e) return toast('That force is gone', 'bad'); showModal(`<h2>Rename</h2><input type="text" id="ent-name" value="${esc(e.name)}" maxlength="24" /><div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Save', 'rename-entity-yes', arg)}</div>`); },
  'rename-entity-yes'(arg) { const e = findEnt(arg), v = inputVal('ent-name'); if (e && v) e.name = v.slice(0, 24); closeModal(); },
  invite(kid) { inviteKingdom(+kid); },
  kick(kid) { kickMember(+kid); },
  join(id) { joinAlliance(id); },
  leave() { leaveAlliance(); },
  'toggle-open'() { const a = allianceOf(S.allianceId); a.open = !a.open; },
  donate(arg) { const [r, v] = arg.split(':'); donate(r, +v); },
  'chat-send'() { const i = el('chat-input'); playerChat(i.value); i.value = ''; i.blur(); },
  emblem(e) { UI.allianceDraft.emblem = e; },
  color(c) { UI.allianceDraft.color = c; },
  'create-alliance'() { const d = UI.allianceDraft; if (!d) return; d.name = inputVal('alliance-name'); if (createAlliance(d.name, d.color, d.emblem)) UI.allianceDraft = null; },
  'use-item'(k) { useItem(k); },
  'open-box'(id) { openBox(id); },
  menu() { showMenu(); },
  settings() { showSettings(); },
  help(section) { showHelp(section); },
  'close-modal'() { closeModal(); },
  begin() { S.name = (el('welcome-name').value || 'Ironcrown').trim().slice(0, 24) || 'Ironcrown'; S.started = true; closeModal(); save(); toast(`Long live ${S.name}!`, 'good'); },
  rename() { const v = inputVal('rename-input').slice(0, 24); if (v) { S.name = v; save(); toast('Kingdom renamed'); } closeModal(); },
  save() { save(); API.push(true); toast('Game saved', 'good'); },
  async export() {
    const code = await encodeSave(S), raw = serialize(S).length;
    UI.exportCode = code;
    const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
    showModal(`<h2>Export save</h2>
      <p class="small">Download a save file to keep or send, or copy the save code. Either one restores this kingdom with <b>☰ Menu → Import</b>, in any browser.</p>
      <div class="row wrap">${btn('💾 Download save file', 'export-file')}${btn('📋 Copy save code', 'export-copy', '', { cls: 'ghost' })}</div>
      <p class="small muted">Save code · ${kb(code.length)}${code.startsWith(SAVE_CODE_PREFIX) ? ` (compressed from ${kb(raw)})` : ''}</p>
      <textarea id="export-data" readonly onclick="this.select()">${code}</textarea>
      <div class="actions">${btn('Close', 'close-modal', '', { cls: 'ghost' })}</div>`);
  },
  'export-file'() {
    const code = UI.exportCode;
    if (!code) return;
    const day = new Date().toISOString().slice(0, 10), name = (S.name || 'Ironcrown').replace(/[^\w-]+/g, '_');
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${name}-${day}.ironcrown`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Save file downloaded', 'good');
  },
  'export-copy'() {
    const code = UI.exportCode;
    if (!code) return;
    const done = () => toast('Save code copied', 'good');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { el('export-data').select(); document.execCommand('copy'); done(); });
    else { el('export-data').select(); document.execCommand('copy'); done(); }
  },
  import() {
    showModal(`<h2>Import save</h2>
      <p class="small">Open a save file, or paste a save code. <b>This replaces the kingdom you are playing now.</b></p>
      <label class="btn ghost file-pick">📂 Open save file…<input type="file" id="import-file" accept=".ironcrown,.txt,.json,text/plain,application/json" hidden></label>
      <p class="small muted" id="import-status">…or paste a code below.</p>
      <textarea id="import-data" placeholder="IC2:H4sI…"></textarea>
      <div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Import', 'import-yes', '', { id: 'import-yes' })}</div>`);
    el('import-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      el('import-status').textContent = `Reading ${f.name}…`;
      try { el('import-data').value = await f.text(); await ACTIONS['import-yes'](); }
      catch (err) { el('import-status').textContent = `⚠️ ${err.message || err}`; }
    });
  },
  async 'import-yes'() {
    const status = el('import-status');
    try {
      const d = await decodeSave(inputVal('import-data'));
      adoptState(d); swapRealm(); save(); closeModal(); resetView(); updateHud();
      toast(`Save imported: welcome back to ${S.name}`, 'good');
    } catch (err) {
      const msg = err && err.message && !/JSON|atob|decod|Invalid character|is not valid|URI|Unexpected|incorrect header|Failed to fetch/i.test(err.message) ? err.message : 'That save code or file could not be read';
      if (status) status.textContent = '⚠️ ' + msg;
      toast(msg, 'bad');
    }
  },
  reset() { showModal(`<h2>Reset everything?</h2><p>Your kingdom will be lost forever.</p><div class="actions">${btn('Cancel', 'close-modal', '', { cls: 'ghost' })}${btn('Reset', 'reset-yes', '', { cls: 'red' })}</div>`); },
  'reset-yes'() { storage.del(SAVE_KEY); newGame(); swapRealm(); resetView(); showWelcome(); },
  'fast-preset'() {
    Object.assign(SETTINGS, { graphics: 'low', resolution: 'performance', minimap: false, particles: false, showGrid: false, autoQuality: true });
    saveSettings(); worldVersion++; resize(); UI.lastPanelHtml = '';
    toast('⚡ Set for speed: low-poly, performance resolution, no minimap', 'good');
    showSettings();
  },
  'zoom-in'() { CAM.zoomSmooth(CW / 2, CH / 2, 1.3); },
  'zoom-out'() { CAM.zoomSmooth(CW / 2, CH / 2, 0.77); },
  'zoom-home'() { CAM.flyToHex(S.world.capital); },
};
function issueOrder(e, kind, i) {
  if (!e || i < 0) return;
  const extra = {};
  if (kind === 'blockade') { const k = S.kingdoms[S.world.owner[i]]; return giveOrder(e, 'blockade', k.capital, { kid: k.id }) && toast(`⚓ ${e.name} sails to blockade ${k.name}`); }
  if (kind === 'hunt') extra.target = (S.aiFleets.find((x) => x.at === i) || {}).id;
  if (kind === 'attack-army') extra.target = (S.aiArmies.find((x) => x.at === i) || {}).id;
  if (giveOrder(e, kind, i, extra) && e.path.length) toast(`${isScout(e) ? '🔭' : isFleet(e) ? '⚓' : '⚔️'} ${e.name}: ${kind === 'move' ? 'moving' : kind} → ${hexName(i)} (ETA ${fmtTime(etaOf(e))})`);
}
function resetView() {
  UI.selected = null; UI.placing = null; UI.worldSel = -1; UI.selEntity = null; UI.selHex = -1;
  CAM.stop(); CAM.z = 5.5; CAM.centerOn(S.world.capital);
  setTab('info');
}

/* ---------- input ---------- */
const keysDown = new Set();
const mouse = { x: -1, y: -1, inside: false };
function bindInput() {
  UI.lastInput = Date.now();
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => { UI.lastInput = Date.now(); }, { capture: true, passive: true });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (t && !t.disabled && ACTIONS[t.dataset.action]) {
      // The panel refreshes about once a second while the world keeps moving, so
      // a button can outlive what it points at. Never let that wedge the click.
      try {
        const r = ACTIONS[t.dataset.action](t.dataset.arg);
        if (r && typeof r.catch === 'function') r.catch((err) => { console.error('action ' + t.dataset.action + ':', err); toast('Something went wrong — please try again', 'bad'); });
      }
      catch (err) { console.error('action ' + t.dataset.action + ':', err); toast('That is no longer available', 'bad'); }
      UI.panelDirty = true; renderPanel(true); updateHud();
    }
    const tab = e.target.closest('[data-tab]'); if (tab) setTab(tab.dataset.tab);
    const sp = e.target.closest('[data-speed]'); if (sp) setSpeed(+sp.dataset.speed);
    if (e.target === el('modal') && S.started) closeModal();
  });
  el('panel').addEventListener('pointerdown', () => { UI.pointerDown = true; });
  el('battle-hud').addEventListener('pointerdown', () => { UI.hudPointer = true; });
  window.addEventListener('pointerup', () => setTimeout(() => { UI.hudPointer = false; }, 0));
  window.addEventListener('pointerup', () => setTimeout(() => { UI.pointerDown = false; }, 0));
  document.addEventListener('input', (e) => {
    const d = e.target.dataset;
    for (const p of ['mu', 'fl', 'rf', 'ed', 'sp']) if (d[p] !== undefined) { const lbl = el(`${p}-${d[p]}`); if (lbl) lbl.textContent = `${e.target.value}/${e.target.max}`; }
    if (e.target.id === 'alliance-name' && UI.allianceDraft) UI.allianceDraft.name = e.target.value;
  });
  document.addEventListener('change', (e) => {
    const d = e.target.dataset;
    if (d.setting) {
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      SETTINGS[d.setting] = d.setting === 'zoomSpeed' ? +v : v;
      saveSettings();
      if (d.setting === 'minimap') el('minimap').hidden = !SETTINGS.minimap;
    }
    if (d.assign) { const [k, id] = e.target.value.split(':'); assignGeneral(d.assign, k, id); UI.panelDirty = true; e.target.blur(); renderPanel(true); }
    if (d.divgen) {
      const div = S.divisions.find((x) => x.id === d.divgen), uidv = e.target.value, post = generalPost(uidv);
      if (post.kind === 'division') { const other = S.divisions.find((x) => x.id === post.id); [other.general, div.general] = [div.general, uidv]; }
      else { unassignGeneral(uidv, true); div.general = uidv; }
      toast(`${generalData(uidv).name} now leads ${div.name}`, 'good'); e.target.blur(); UI.panelDirty = true; renderPanel(true);
    }
    for (const [attr, field] of [['entform', 'formation'], ['entstance', 'stance'], ['enttarget', 'target']]) if (d[attr]) { const ent = findEnt(d[attr]); if (ent) ent[field] = e.target.value; e.target.blur(); }
    if (d.claimradius) { UI.claimRadius = +e.target.value; UI.panelDirty = true; renderPanel(true); return; }
    if (d.btarget) { const [id, gi] = d.btarget.split(':'); const b = Battles.get(+id); if (b) Battles.setTarget(b, +gi, e.target.value); e.target.blur(); }
    if (d.bform) { const [id, gi] = d.bform.split(':'); const b = Battles.get(+id); if (b) Battles.setFormation(b, +gi, e.target.value); e.target.blur(); }
    if (d.bstance) { const [id, gi] = d.bstance.split(':'); const b = Battles.get(+id); if (b) Battles.setStance(b, +gi, e.target.value); e.target.blur(); }
    if (d.setting === 'graphics') { worldVersion++; UI.lastPanelHtml = ''; }
    if (d.setting === 'resolution') resize();
  });
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    if (e.key === 'Enter' && e.target.id === 'chat-input') return ACTIONS['chat-send']();
    if (e.key === 'Enter' && e.target.id === 'welcome-name') return ACTIONS.begin();
    if (typing) return;
    if (e.key === 'Escape') {
      if (!el('modal').hidden && S.started) closeModal();
      else if (UI.placing) ACTIONS['cancel-place']();
      else { UI.selected = null; UI.worldSel = -1; UI.selEntity = null; UI.selHex = -1; }
      UI.panelDirty = true;
    }
    if (!el('modal').hidden) return;
    const k = e.key.toLowerCase();
    if (k === '?' || k === 'h') showHelp();
    if (k === 'p') setSpeed(UI.gameSpeed === 0 ? (UI.lastSpeed || 1) : 0);
    if (k === 'k') setView('kingdom');
    if (k === 'm') setView('world');
    if (k === '+' || k === '=') ACTIONS['zoom-in']();
    if (k === '-') ACTIONS['zoom-out']();
    if (k === ' ' || k === 'home') { e.preventDefault(); ACTIONS['zoom-home'](); }
    if (/^[1-9]$/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) setTab(PANEL_TABS[+k - 1]);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keysDown.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => keysDown.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keysDown.clear());

  // --- canvas pointer handling: click, drag-to-pan, pinch-zoom, wall painting ---
  const pointers = new Map();
  let drag = null, pinchDist = 0, lastPaint = -1;
  const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hexAt = (p) => { const [wx, wy] = CAM.toWorld(p.x, p.y); return WG.at(wx, wy); };
  const canDragPan = () => SETTINGS.panMode !== 'keys';
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = dist(a.x, a.y, b.x, b.y); drag = null; return; }
    drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, button: e.button, paint: UI.placing === 'wall' && e.button === 0 };
    if (drag.paint) { const i = hexAt(p); if (placeBuilding('wall', i)) lastPaint = i; if (buildLockReason('wall')) { UI.placing = null; updatePlacingHint(); } }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = local(e);
    mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = dist(a.x, a.y, b.x, b.y);
      if (pinchDist) { CAM.stop(); CAM.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchDist); }
      pinchDist = d;
      return;
    }
    UI.hover = hexAt(p);
    if (drag) {
      if (drag.paint) {
        const i = UI.hover;
        if (i !== lastPaint && UI.placing === 'wall' && !placementError('wall', i) && !buildLockReason('wall')) { placeBuilding('wall', i); lastPaint = i; }
      } else if (dist(p.x, p.y, drag.sx, drag.sy) > 6 && (canDragPan() || e.pointerType === 'touch')) {
        drag.moved = true;
        const inv = SETTINGS.invertDrag ? -1 : 1;
        CAM.pan((p.x - drag.x) * inv, (p.y - drag.y) * inv);
        cv.style.cursor = 'grabbing';
      }
      drag.x = p.x; drag.y = p.y;
    }
    updateTooltip(p);
  });
  const end = (e) => {
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    cv.style.cursor = '';
    if (drag && !drag.moved && !drag.paint) handleClick(p, drag.button);
    drag = null; lastPaint = -1;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); drag = null; });
  cv.addEventListener('pointerleave', () => { mouse.inside = false; UI.hover = -1; el('tooltip').hidden = true; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e), dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const f = Math.exp(-clamp(dy, -600, 600) * 0.0015 * SETTINGS.zoomSpeed);
    // Trackpads send a stream of tiny deltas that already feel smooth; a mouse
    // wheel's big notches glide instead of jumping.
    if (Math.abs(dy) < 40) { CAM.stop(); CAM.zoomAt(p.x, p.y, f); } else CAM.zoomSmooth(p.x, p.y, f);
  }, { passive: false });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // minimap: click / drag to jump
  const mm = el('minimap');
  const mmMove = (e) => { const r = mm.getBoundingClientRect(); CAM.stop(); CAM.x = ((e.clientX - r.left) / r.width) * WG.pw; CAM.y = ((e.clientY - r.top) / r.height) * WG.ph; CAM.clamp(); };
  mm.addEventListener('pointerdown', (e) => { mm.setPointerCapture(e.pointerId); const r = mm.getBoundingClientRect(); CAM.flyTo(((e.clientX - r.left) / r.width) * WG.pw, ((e.clientY - r.top) / r.height) * WG.ph); mm.dataset.drag = '1'; });
  mm.addEventListener('pointermove', (e) => { if (mm.dataset.drag) mmMove(e); });
  mm.addEventListener('pointerup', () => { delete mm.dataset.drag; });

  new ResizeObserver(resize).observe(el('stage-wrap'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('beforeunload', save);
}
function handleClick(p, button) {
  const [wx, wy] = CAM.toWorld(p.x, p.y), i = WG.at(wx, wy);
  if (UI.placing) {
    const type = UI.placing;
    if (placeBuilding(type, i) && (type !== 'wall' || buildLockReason('wall'))) { UI.placing = null; updatePlacingHint(); }
    return renderPanel(true);
  }
  const sel = selectedEntity();
  const hit = S.divisions.filter((d) => d.status !== 'fighting').concat(S.fleets, S.scouts).map((e) => { const [x, y] = entPos(e); const [sx, sy] = CAM.toScreen(x, y); return [e, dist(sx, sy, p.x, p.y - 8)]; }).filter(([, d]) => d < 20).sort((a, b) => a[1] - b[1])[0];
  const kindOf = (e) => (isScout(e) ? 'scout' : isFleet(e) ? 'fleet' : 'division');
  if (button === 0 && sel && isScout(sel) && i >= 0 && (!hit || hit[0] === sel)) { UI.worldSel = i; if (i !== sel.at) issueOrder(sel, 'move', i); }
  else if (button === 2 && sel && i >= 0) {
    const o = ordersFor(sel, i), best = o.find(([kk]) => kk !== 'move') || o[0];
    UI.worldSel = i;
    if (best) issueOrder(sel, best[0], i); else toast('No valid order for that hex', 'bad');
  } else if (hit && button === 0) { UI.selEntity = { kind: kindOf(hit[0]), id: hit[0].id }; UI.worldSel = hit[0].at; UI.selected = null; setTab('map'); }
  else if (button === 0 && i >= 0) {
    const b = S.world.owner[i] === -2 ? buildingAt(i) : null;
    if (b && !sel) { UI.selected = b.id; UI.selHex = -1; UI.worldSel = -1; setTab('info'); }
    else { UI.worldSel = i; UI.selected = null; setTab('map'); }
  }
  renderPanel(true);
}
function updateTooltip(p) {
  const i = UI.hover, tip = el('tooltip'), ki = i;
  let html = null;
  if (ki >= 0 && (buildingAt(ki) && S.world.owner[ki] === -2 || UI.placing)) {
    const b = buildingAt(ki), o = obstacleAt(ki);
    if (b && !UI.placing) html = `<b>${BUILDINGS[b.type].name}</b> · level ${b.level}${b.build > 0 ? `<br>🔨 ${fmtTime(b.build)}` : ''}${b.research ? `<br>🎓 ${RESEARCH[b.research.id].name}` : ''}`;
    else if (o && !UI.placing) html = `<b>${o === 'tree' ? 'Trees' : 'Rocks'}</b><br>Click to clear`;
    else if (UI.placing) { const err = placementError(UI.placing, i); html = err ? `⛔ ${esc(err)}` : `✅ Build ${BUILDINGS[UI.placing].name} here`; }
  } else if (i >= 0) {
    const seen = isSeen(i), o = S.world.owner[i], f = S.world.feat[i];
    html = seen ? `<b>${TERRAIN[S.world.terrain[i]].name}</b> ${hexName(i)}${f ? `<br>${FEATURES[f.type].icon} ${FEATURES[f.type].name}` : ''}${o === -2 ? '<br>Your territory' : o >= 0 ? '<br>' + S.kingdoms[o].name : ''}` : `<b>Unexplored</b> ${hexName(i)}<br>Send scouts, a fleet or a division`;
    const sel = selectedEntity();
    if (sel && seen) { const o2 = ordersFor(sel, i); if (o2.length) html += `<br><span class="muted">Right-click: ${(o2.find(([k]) => k !== 'move') || o2[0])[1]}</span>`; }
  }
  if (!html) { tip.hidden = true; return; }
  tip.innerHTML = html; tip.hidden = false;
  tip.style.left = Math.min(p.x + 14, CW - 220) + 'px'; tip.style.top = Math.min(p.y + 14, CH - 60) + 'px';
}
// Keyboard / edge scrolling, applied every frame.
function inputFrame(dt) {
  if (!el('modal').hidden) return;
  const cam = CAM, sp = 700 * dt;
  let dx = 0, dy = 0;
  if (SETTINGS.panMode !== 'drag') {
    if (keysDown.has('a') || keysDown.has('arrowleft')) dx += sp;
    if (keysDown.has('d') || keysDown.has('arrowright')) dx -= sp;
    if (keysDown.has('w') || keysDown.has('arrowup')) dy += sp;
    if (keysDown.has('s') || keysDown.has('arrowdown')) dy -= sp;
  }
  if (SETTINGS.edgeScroll && mouse.inside) {
    const m = 22;
    if (mouse.x < m) dx += sp; if (mouse.x > CW - m) dx -= sp;
    if (mouse.y < m) dy += sp; if (mouse.y > CH - m) dy -= sp;
  }
  if (dx || dy) cam.pan(dx, dy);
}

// 'all' = every one of your groups still fighting in battle b
function battleGroups(b, gi) {
  if (gi !== 'all') return [b.groups[+gi]].filter(Boolean);
  const pti = Battles.playerTeam(b);
  return b.groups.filter((G) => G.team === pti && !G.ally && Battles.active(b, pti).some((q) => q.g === G.gi));
}

// Game speed: 0 = paused, 1/2/4 = faster. Battles on the map follow the same clock.
function setSpeed(x) {
  if (x > 0) UI.lastSpeed = x;
  UI.gameSpeed = x;
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === x));
  let banner = el('paused-banner');
  if (!banner) { banner = document.createElement('div'); banner.id = 'paused-banner'; banner.className = 'paused-banner'; banner.textContent = '⏸ Paused — press P or ▶ to resume'; el('stage-wrap').appendChild(banner); }
  banner.hidden = x !== 0;
}

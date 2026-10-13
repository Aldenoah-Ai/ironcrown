/* ==========================================================================
   Alliances: AI alliances, founding your own, invites, donations, chat.
   ========================================================================== */
'use strict';

const xpNeed = (lvl) => Math.round(800 * Math.pow(lvl, 1.5));
const allianceOf = (id) => S.alliances.find((a) => a.id === id);
const memberName = (m) => (m === 'P' ? S.name + ' (you)' : S.kingdoms[m].name);
const memberColor = (m) => (m === 'P' ? '#f2c14e' : S.kingdoms[m].color);

const ALLIANCE_NAMES = ['The Iron Pact', 'Sunspear Accord', 'Order of the Silver Rose', 'The Tidebound', 'League of the Nine Hearths',
  'Covenant of Ash', 'The Verdant Concord', 'Hammer of the North', 'The Gilded Compact', 'Wardens of the Pale'];
/* Roughly half the realms band together. On a world of thirty kingdoms that is
   several rival blocs rather than the three hand-written ones of the small map. */
function createAlliances() {
  const n = S.kingdoms.length;
  const count = clamp(Math.round(n / 5), 1, ALLIANCE_NAMES.length);
  const pool = S.kingdoms.map((k) => k.id).sort(() => Math.random() - 0.5).slice(0, Math.round(n * 0.55));
  S.alliances = [];
  for (let i = 0; i < count && pool.length; i++) {
    const size = Math.max(1, Math.min(pool.length, 1 + Math.floor(Math.random() * 4)));
    const members = pool.splice(0, size);
    const a = { id: 'a' + i, name: ALLIANCE_NAMES[i], emblem: ALLIANCE_EMBLEMS[i % ALLIANCE_EMBLEMS.length], color: ALLIANCE_COLORS[i % ALLIANCE_COLORS.length],
      members, open: Math.random() < 0.6, minHall: 1 + (i % 3), level: 1 + (i % 4), leader: members[0], xp: 0, chat: [] };
    members.forEach((m) => { S.kingdoms[m].allianceId = a.id; });
    S.alliances.push(a);
  }
}
function joinAlliance(id) {
  const a = allianceOf(id);
  if (!a || S.allianceId) return false;
  if (hallLevel() < a.minHall) { toast(`${a.name} requires Main Hall ${a.minHall}`, 'bad'); return false; }
  if (a.members.some((m) => m !== 'P' && S.kingdoms[m].atWar)) { toast(`You are at war with a member of ${a.name}`, 'bad'); return false; }
  if (!a.open) {
    const leader = S.kingdoms[a.leader];
    const chance = clamp(0.35 + leader.relation / 100 + (totalPower() / (leader.power + leader.defense) - 1) * 0.25 + 0.05 * R('diplomacy'), 0.05, 0.9);
    if (Math.random() > chance) { toast(`${leader.ruler} declined your request to join ${a.name}`, 'bad'); leader.relation -= 3; return false; }
  }
  a.members.push('P');
  S.allianceId = a.id;
  a.members.forEach((m) => { if (m !== 'P') S.kingdoms[m].relation += 20; });
  chat(a, a.leader, `Welcome to ${a.name}, ${S.name}!`);
  log(`You joined ${a.name}.`, 'good');
  toast(`${a.emblem} You joined ${a.name}!`, 'good');
  UI.panelDirty = true;
  return true;
}
function createAlliance(name, color, emblem) {
  name = (name || '').trim().slice(0, 28);
  if (S.allianceId) return false;
  if (name.length < 3) { toast('Alliance name needs at least 3 characters', 'bad'); return false; }
  if (S.alliances.some((a) => a.name.toLowerCase() === name.toLowerCase())) { toast('That name is taken', 'bad'); return false; }
  if (!pay({ gold: 1000 })) { toast('Founding an alliance costs 💰1000', 'bad'); return false; }
  const a = { id: 'p' + uid(), name, emblem, color, members: ['P'], leader: 'P', open: true, minHall: 1, level: 1, xp: 0, chat: [] };
  S.alliances.push(a);
  S.allianceId = a.id;
  log(`You founded the alliance ${name}.`, 'good');
  toast(`${emblem} ${name} founded!`, 'good');
  UI.panelDirty = true;
  return true;
}
function leaveAlliance() {
  const a = allianceOf(S.allianceId);
  if (!a) return;
  a.members = a.members.filter((m) => m !== 'P');
  S.allianceId = null;
  if (!a.members.length) { S.alliances = S.alliances.filter((x) => x !== a); log(`${a.name} was disbanded.`, 'info'); }
  else {
    if (a.leader === 'P') { a.leader = a.members.reduce((b, m) => (S.kingdoms[m].power > S.kingdoms[b].power ? m : b), a.members[0]); chat(a, a.leader, `${S.name} has left. I will lead us now.`); }
    a.members.forEach((m) => { S.kingdoms[m].relation -= 10; });
    log(`You left ${a.name}.`, 'info');
  }
  UI.panelDirty = true;
}
function inviteKingdom(kid) {
  const a = allianceOf(S.allianceId), k = S.kingdoms[kid];
  if (!a || a.leader !== 'P' || k.allianceId === a.id) return false;
  if (k.atWar) { toast(`You are at war with ${k.name}`, 'bad'); return false; }
  const chance = clamp(0.3 + k.relation / 100 + (totalPower() / (k.power + k.defense) - 1) * 0.2 + a.level * 0.03 + 0.1 * R('diplomacy'), 0.05, 0.92);
  if (Math.random() < chance) {
    const prev = allianceOf(k.allianceId);
    if (prev) prev.members = prev.members.filter((m) => m !== kid);
    a.members.push(kid); k.allianceId = a.id; k.relation += 15;
    chat(a, kid, pick([`${k.ruler} is honoured to join ${a.name}.`, 'Our banners fly beside yours.', 'Together we are unstoppable!']));
    log(`${k.name} accepted your invitation to ${a.name}.`, 'good');
    toast(`🤝 ${k.name} joined ${a.name}!`, 'good');
  } else { k.relation -= 2; toast(`${k.name} declined your invitation`, 'bad'); }
  UI.panelDirty = true;
  return true;
}
function kickMember(kid) {
  const a = allianceOf(S.allianceId);
  if (!a || a.leader !== 'P') return;
  a.members = a.members.filter((m) => m !== kid);
  S.kingdoms[kid].allianceId = null; S.kingdoms[kid].relation -= 25;
  log(`${S.kingdoms[kid].name} was expelled from ${a.name}.`, 'info');
  UI.panelDirty = true;
}
function donate(res, amount) {
  const a = allianceOf(S.allianceId);
  if (!a) return;
  amount = Math.min(amount, Math.floor(S.res[res]));
  if (amount <= 0) { toast('Nothing to donate', 'bad'); return; }
  S.res[res] -= amount;
  addAllianceXp(a, res === 'diamonds' ? amount * 20 : amount);
  toast(`Donated ${RES_META[res].icon}${fmt(amount)} to ${a.name}`, 'good');
  UI.panelDirty = true;
}
function addAllianceXp(a, xp) {
  a.xp += xp;
  while (a.level < 10 && a.xp >= xpNeed(a.level)) {
    a.xp -= xpNeed(a.level); a.level++;
    if (a.id === S.allianceId) { log(`${a.name} reached level ${a.level}! Shared bonuses increased.`, 'good'); toast(`${a.emblem} ${a.name} reached level ${a.level}!`, 'good'); }
  }
}
function chat(a, who, text) {
  a.chat.push({ who, text, t: S.time });
  if (a.chat.length > 40) a.chat.shift();
  if (a.id === S.allianceId) UI.panelDirty = true;
}
function playerChat(text) {
  const a = allianceOf(S.allianceId);
  text = (text || '').trim().slice(0, 140);
  if (!a || !text) return;
  chat(a, 'P', text);
  const others = a.members.filter((m) => m !== 'P');
  if (others.length && Math.random() < 0.8) {
    const m = pick(others);
    setTimeout(() => chat(a, m, pick(['Aye!', `Agreed, ${S.name}.`, 'Ha! Well said.', 'For the alliance!', 'My scouts are on it.', 'We march at dawn.', 'Send more lumber and I am yours.'])), 900 + Math.random() * 1500);
  }
}
function allianceTurn(offline) {
  for (const a of S.alliances) {
    const ai = a.members.filter((m) => m !== 'P');
    addAllianceXp(a, ai.reduce((s, m) => s + S.kingdoms[m].hall * 15, 0));
    if (!offline && ai.length && Math.random() < 0.35) {
      const me = S.kingdoms[pick(ai)];
      const enemies = S.kingdoms.filter((k) => !k.fallen && k.allianceId !== a.id);
      const enemy = enemies.length ? pick(enemies).name : 'the pirates';
      chat(a, me.id, pick([
        `Anyone have spare ${pick(['lumber', 'iron', 'food'])}? Building a new ${pick(['tower', 'granary', 'shipyard'])}.`,
        `Scouts spotted ${enemy} troops near our border.`,
        `${enemy} just upgraded their keep. Keep an eye on them.`,
        `Pirate sails sighted off the coast — keep your warships close.`,
        `Alliance level ${a.level + 1} soon — keep donating!`,
        `Who wants to hit ${enemy} together?`,
        a.members.includes('P') ? `Good work out there, ${S.name}.` : 'Quiet day in the realm.',
      ]));
    }
    if (a.leader !== 'P' && a.open && Math.random() < 0.03) {
      const free = S.kingdoms.filter((k) => !k.fallen && k.allianceId == null);
      if (free.length) { const k = pick(free); a.members.push(k.id); k.allianceId = a.id; if (!offline && isSeen(k.capital)) log(`${k.name} joined ${a.name}.`, 'info'); }
    }
  }
}

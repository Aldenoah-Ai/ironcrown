/* ==========================================================================
   In-game help guide (opened with the ? button, or the H / ? keys).
   ========================================================================== */
'use strict';

const HELP = [
  { id: 'start', icon: '🚀', title: 'Getting started', html: `
    <p>You rule a small kingdom in a world of rival realms, pirates and forgotten ruins. The game runs in real time, and your economy keeps working while you're away (up to 8 hours).</p>
    <ol>
      <li><b>Build economy first.</b> Open the <b>🏗️ Build</b> tab, pick a Gold Mine, Lumber Mill or Farm, and click a free hex inside your golden border.</li>
      <li><b>Upgrade the Main Hall</b> (click the castle). It has <b>no maximum level</b>. Each level claims another ring of land around your capital, adds storage, builders and divisions, and raises every building's level cap and count limits. Ports, Shipyards, Universities and Stables unlock at level 2.</li>
      <li><b>Train troops</b> in the <b>⚔️ Army</b> tab and group them into <b>divisions</b>.</li>
      <li>Zoom out (scroll, or press <kbd>M</kbd>) to see the whole world, then explore, claim land, fight and trade. <kbd>K</kbd> flies you home.</li>
      <li>Build a <b>University</b> and start <b>🎓 Research</b> early, because it multiplies everything.</li>
    </ol>
    <p><b>🎯 Objectives</b> at the top of the Build tab guide you through every system (farms, the Main Hall, troops, scouting, land, defenses, research, divisions, battles, fleets, alliances) and pay rewards when completed.</p>
    <p class="tip">Tip: hover over anything for a tooltip. The top bar shows every resource with its storage cap and income per minute. Hover a resource for a full breakdown.</p>` },
  { id: 'camera', icon: '🎥', title: 'One map, camera & controls', html: `
    <p><b>There is only one map, made of small hexes.</b> Land, sea, your city, enemy cities, armies and battles all share the same hex grid. <b>Zoom in</b> (scroll or pinch) to build and manage your city. <b>Zoom out</b> to see the continent: every kingdom's cities and territory, and every army, guard, fleet and battle. Enemy capitals are real cities too: zoom in on one to see its keep, buildings, walls and towers.</p>
    <table class="keys">
      <tr><td>Drag with mouse or finger</td><td>Move the map</td></tr>
      <tr><td>Scroll wheel / pinch</td><td>Zoom in & out</td></tr>
      <tr><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows</td><td>Move the map (or drag it; Settings → Camera)</td></tr>
      <tr><td><kbd>+</kbd> <kbd>−</kbd> / zoom buttons</td><td>Zoom</td></tr>
      <tr><td><kbd>Space</kbd> / 🏠 button</td><td>Recenter on your capital</td></tr>
      <tr><td><kbd>K</kbd> / <kbd>M</kbd></td><td>Fly to your capital / zoom out to the whole world</td></tr>
      <tr><td>Left-click</td><td>Select a building, hex, division or fleet</td></tr>
      <tr><td>Right-click</td><td>Give the selected division/fleet the default order for that hex</td></tr>
      <tr><td><kbd>1</kbd> … <kbd>9</kbd></td><td>Switch panel tab (Build, Map, Research, Army, Navy, Generals, Shop, Alliance, Log)</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Cancel placement / deselect / close dialogs</td></tr>
      <tr><td><kbd>H</kbd> or <kbd>?</kbd></td><td>This help guide</td></tr>
      <tr><td><kbd>P</kbd> / ⏸ 1× 2× 4×</td><td>Pause or change game speed (top-left of the map)</td></tr>
    </table>
    <h4>Performance</h4>
    <p>The game starts on <b>🔷 Low-poly</b> graphics, the fastest. If it still lags, open ⚙️ Settings and press <b>⚡ Make it fast</b>, or set <b>Render resolution → ⚡ Performance</b>, which has the biggest effect on high-DPI and 4K screens.</p>
    <h4>Graphics quality</h4>
    <p>⚙️ Settings → <b>Graphics quality</b> switches instantly between <b>✨ High</b>, <b>🎨 Classic</b> and <b>🔷 Low-poly</b>. High has realistic procedural textures (grass blades, meadow flowers, forest litter, rock, sand ripples, snow), hill-shading, animated water with sun glints, and drifting cloud shadows. Classic uses flat colours. Low-poly draws every hex as flat-shaded facets and is the fastest option on weak devices.</p>
    <p>Open <b>⚙️ Settings</b> in the top bar to choose how the camera moves: <b>Drag</b>, <b>Keyboard</b> or <b>Both</b>. You can also invert dragging, turn on edge scrolling, change the zoom speed and toggle the minimap. Click or drag the <b>minimap</b> in the corner to jump anywhere.</p>` },
  { id: 'kingdom', icon: '🏰', title: 'Kingdom & buildings', html: `
    <p>Your kingdom is the land you own on the map (gold border), centred on the <b>Main Hall</b> and its cobbled plaza. Coastal buildings (Port, Shipyard) must touch the sea.</p>
    <ul>
      <li><b>Placing:</b> Build tab → choose → click a hex. Green is valid, red explains why not. Walls can be <b>painted by dragging</b>.</li>
      <li><b>Trees & rocks</b> block some hexes. Click them and pay 🪙25 to clear them, which gives lumber or iron.</li>
      <li><b>Upgrading:</b> click a building → Upgrade. A building's level can't exceed the Main Hall's level.</li>
      <li><b>Builders:</b> each construction or upgrade takes a builder (🔨 in the top bar). More builders come with Hall levels and the Engineering research.</li>
      <li><b>Demolish</b> refunds 40% of the cost.</li>
    </ul>
    <table class="keys"><tr><th>Building</th><th>Unlocks at Hall</th><th>Does</th></tr>
      ${BUILD_ORDER.map((t) => `<tr><td>${BUILDINGS[t].icon} ${BUILDINGS[t].name}</td><td>${BUILDINGS[t].hall || 1}</td><td>${BUILDINGS[t].desc}</td></tr>`).join('')}</table>` },
  { id: 'resources', icon: '💰', title: 'Resources & seasons', html: `
    <p>There are five resources: 🪙 Gold, ⛓️ Iron, 💎 Diamonds, 🪵 Lumber and 🌾 Food. They flow in automatically from mines, mills, farms, the Main Hall (taxes), Ports (trade) and the <b>land you hold on the World map</b>.</p>
    <ul>
      <li><b>Storage</b> is capped by the Main Hall. Warehouses and the Banking research raise it. A full bar turns gold.</li>
      <li><b>Upkeep:</b> every soldier eats food, and every ship costs a little gold. If your food runs out while income is negative, <b>soldiers desert</b> (1% every 10 seconds) until you fix it.</li>
      <li><b>Seasons</b> pass every 10 in-game days (15 minutes). Spring +10% food, autumn +15% food, <b>winter −30% food and slower marches</b>. The map turns snowy.</li>
      <li><b>Market:</b> a Port lets you sell surplus goods for gold, or buy what you lack.</li>
    </ul>` },
  { id: 'research', icon: '🎓', title: 'Universities & research', html: `
    <p>Build a <b>University</b> (Main Hall 2) and open the <b>🎓 Research</b> tab. Each university studies <b>one technology at a time</b>, so build more to research in parallel. A university's level decides which tier it can study (🎓 L1–L3) and makes it study faster.</p>
    <p>Technologies have up to 3 levels (● pips), and some need prerequisites. Highlights:</p>
    <ul>
      ${Object.values(RESEARCH).map((r) => `<li>${r.icon} <b>${r.name}</b>: ${r.desc(1)} per level${r.max > 1 ? ` (max ${r.max})` : ''}</li>`).join('')}
    </ul>
    <p class="tip">"Faster ships" = Navigation + Lateen Sails. "Faster horses" = Horse Breeding. "Better armour" = Iron Armour and Heavy Cavalry.</p>` },
  { id: 'army', icon: '⚔️', title: 'Army & divisions', html: `
    <p>Train troops in the <b>⚔️ Army</b> tab (or by clicking a military building). New troops join the <b>garrison</b> at your capital, which defends against raids.</p>
    <table class="keys"><tr><th>Unit</th><th>Trained at</th><th>Strengths</th></tr>
      ${Object.entries(UNITS).map(([k, u]) => `<tr><td>${u.icon} ${u.name}</td><td>${BUILDINGS[u.from].name}</td><td>${u.vs ? Object.entries(u.vs).map(([v, m]) => `×${m} vs ${(UNITS[v] || { name: 'towers' }).name}`).join(', ') : k === 'scout' ? 'Explores and spies' : '—'}${u.research ? ' · needs ' + RESEARCH[u.research].name : ''}</td></tr>`).join('')}</table>
    <h4>Divisions</h4>
    <ul>
      <li>Click <b>Muster a new division</b>, name it, choose troops with the sliders, pick its <b>general (required, one per division)</b> and its default battle plan.</li>
      <li><b>Station divisions to protect land.</b> An idle division guards its hex and the six around it (dashed gold ring). Enemy armies that come close must fight it first.</li>
      <li>Divisions appear as <b>banners</b> on the World map. Select one (click the banner, or use Select in the Army tab), then click any hex to see its <b>orders</b>:
        <b>March</b>, <b>Station & guard</b>, <b>Assault</b> an enemy capital, <b>Invade</b> an enemy hex, <b>Explore</b> ruins or caves, <b>Capture</b> a fort, or <b>Intercept</b> an enemy army. Idle divisions next to a fight join it automatically.</li>
      <li>Right-click a hex to give the default order instantly. The route is drawn as a dashed line with an ETA.</li>
      <li>Terrain matters: forests, hills and swamps are slow, and <b>mountains are impassable</b>. To cross water, divisions board transport ships automatically if your Cogs and Galleons have enough capacity.</li>
      <li><b>Change a division's size:</b> at the capital, <b>🎚️ Troops</b> sets exactly how many of each soldier it has, with extras going back to the garrison. Anywhere, <b>✂️ Split</b> it into two (the new one needs a general), or <b>🔗 Merge</b> two divisions standing on the same hex.</li>
      <li>There is <b>no army cap</b>. Train as many soldiers and seamen as you can feed and pay for. Upkeep is food for troops and gold for ships.</li>
      <li>The number of divisions you can field grows with the Main Hall.</li>
    </ul>` },
  { id: 'generals', icon: '🎖️', title: 'Generals & items', html: `
    <p>Generals have <b>Attack, Health and Speed</b> ratings (the bars) that boost the troops they lead. <b>Specialists</b> add +15% to one unit type, and <b>Admirals</b> (⚓) add +15% to ships.</p>
    <ul>
      <li><b>Every division needs its own general</b>, and a general can hold only <b>one post</b>: a division, a fleet (optional admiral), or <b>Castellan</b> (leads the home garrison).</li>
      <li>You can <b>own several copies</b> of the same general. Each copy can lead a different division.</li>
      <li><b>Promote:</b> merge an idle spare copy into a general for +★ (+10% stats each, max 5★).</li>
      <li>Swap commanders from the division card (General dropdown) or the Generals tab.</li>
      <li>Get generals from the <b>🍺 Tavern</b> in the Shop (🪙900), <b>Mystery Boxes</b>, <b>ruins</b> and destroyed <b>pirate coves</b>.</li>
    </ul>
    <h4>Items</h4><ul>${Object.values(ITEMS).map((i) => `<li>${i.icon} <b>${i.name}</b>: ${i.desc}</li>`).join('')}</ul>` },
  { id: 'navy', icon: '⚓', title: 'Navy & fleets', html: `
    <p>Build a <b>Port</b> and a <b>Shipyard</b> on the coast (Main Hall 2). Every ship needs a crew of <b>🧑‍✈️ Seamen</b>, which you train at the Port. Then build ships from the <b>⚓ Navy</b> tab. Higher shipyard levels unlock bigger ships, up to the mighty <b>Man o' War</b> at Shipyard level 6.</p>
    <table class="keys"><tr><th>Ship</th><th>Shipyard</th><th>Role</th></tr>
      ${Object.values(SHIPS).map((s) => `<tr><td>${s.icon} ${s.name}</td><td>L${s.lvl}</td><td>${s.desc} Crew ${s.crew}.</td></tr>`).join('')}</table>
    <ul>
      <li>New ships wait in the <b>home harbour</b>, where they guard your port against pirates. <b>Form a fleet</b> to send them out, with an admiral if you have one.</li>
      <li>Select a fleet on the World map to: <b>Sail</b>, <b>Salvage</b> shipwrecks, <b>Attack pirate coves</b>, <b>Blockade</b> a coastal kingdom (sink its navy and plunder its harbour), or <b>Hunt</b> enemy fleets.</li>
      <li>Fleets reveal the fog as they sail. <b>Cogs</b> and <b>Galleons</b> give your divisions transport capacity to cross the sea to islands.</li>
      <li>🏴‍☠️ <b>Pirates</b> sail from their coves and prey on your fleets and harbour. If your harbour has no ships, they steal gold and blockade your port.</li>
    </ul>` },
  { id: 'world', icon: '🗺️', title: 'World map & exploration', html: `
    <p>The World map is a procedurally generated hex continent of about <b>${fmt(WG.N)} hexes</b> — ten times the area of the old map — with seas, islands, lakes and varied terrain, shared by around <b>${AI_KINGDOM_COUNT} rival kingdoms</b>:</p>
    <ul>${Object.values(TERRAIN).map((t) => `<li><b>${t.name}</b>: ${t.cost === Infinity ? (t.name === 'Sea' ? 'ships only' : 'impassable') : 'move cost ×' + t.cost}${t.bonus ? ' · holding it gives ' + Object.entries(t.bonus).map(([k, v]) => RES_META[k].icon + '+' + (v * 60).toFixed(0) + '/min').join(' ') : ''}</li>`).join('')}</ul>
    <h4>Points of interest</h4>
    <ul>${Object.values(FEATURES).map((f) => `<li>${f.icon} <b>${f.name}</b>: ${f.desc}</li>`).join('')}</ul>
    <h4>Fog of war & scouting</h4>
    <p>Unexplored land is hidden. <b>Scouts are units you move:</b> Army tab (or Map panel) → <b>Dispatch scouts</b>, then pan the map and <b>click any point</b>. The party walks there, and <b>every hex it passes is revealed</b>, along with a radius around it. Scouts also explore caves and gather <b>intel</b> on kingdoms they pass. Click a party's banner to select it again and send it somewhere new, or order it home. Enemy land may capture scouts. Divisions and fleets also reveal hexes as they move. The Scout Lodge and Cartography extend sight.</p>
    <h4>Expanding your empire</h4>
    <p>Most of the world belongs to nobody, and it is all yours to take. Click any neutral hex → <b>Claim</b>. You pick <b>how big a region to settle</b>: the radius starts at 1 and grows with your Main Hall, up to 6 rings (over a hundred hexes) in one go.</p>
    <p>The Main Hall does <b>not</b> hand you land. Upgrading it unlocks buildings, widens how big a region your settlers can take and reveals more of the country — but every hex of your realm is one you claimed.</p>
    <p>You do <b>not</b> have to scout first. Settlers push up to <b>3 hexes past your border</b> into land nobody has walked, and they reveal everything they take — so each claim gives you a new frontier to claim from again. Cartography research sends them further. A division standing on neutral land can also <b>🏳️ Annex this land</b> outright, taking the ground around it.</p>
    <p>There is no limit on how much land you can hold; a large realm only makes each new claim a little dearer. <b>Beware:</b> raiders target your <b>undefended</b> hexes, meaning no stationed division and no watchtower or fortress. Undefended land can be pillaged, burned or annexed.</p>` },
  { id: 'territory', icon: '🏘️', title: 'Building on your land', html: `
    <p>The whole world is one map of small hexes. <b>You can build anywhere:</b> on any hex you own, or on any explored unclaimed land, which settles that hex for a small fee. There is <b>no limit</b> on how many of each building you have. The Main Hall only decides which building types are unlocked and how high they can be upgraded. Click an empty hex and pick from <b>Build here</b>, or choose a building in the 🏗️ Build tab and click a hex.</p>
    <ul>
      <li><b>Terrain matters:</b> Lumber Mills produce more in forests, Gold and Iron Mines on hills (and a lot more on a gold vein), Diamond Mines on a gem cave, and Farms on plains or meadows.</li>
      <li>Forests have trees and hills have rocks. Clear them (🪙25, which pays back in lumber or iron) before building, unless the building uses them: lumber mills go straight into forests and mines onto rocky hills.</li>
      <li>Towers, Cannons, Spires and <b>Fortresses</b> fight in every battle within 3 hexes, and they <b>open fire on any hostile army that marches past</b> within range. Each one fights <b>as itself, on its own hex</b>: an Archer Tower looses arrows, a Cannon lobs iron, a Fortress mans two turrets, a Spire throws arcane bolts.</li>
      <li><b>Raiders pick soft targets:</b> buildings with no tower, cannon, spire, fortress or wall nearby are about 4× more likely to be attacked. The Build here panel warns you about unprotected spots.</li>
      <li>Ports and Shipyards need a coastal hex. Fleets can dock at any of your ports.</li>
    </ul>` },
  { id: 'combat', icon: '🛡️', title: 'Combat, raids & defense', html: `
    <ul>
      <li><b>Battles happen right on the map</b> where the armies meet, with no separate screen. The camera jumps there (optional) and a <b>command bar</b> appears at the bottom.</li>
      <li>Each of your divisions is its own group. For each one, choose:
        <ul>${Object.values(FORMATIONS).map((f) => `<li>${f.icon} <b>${f.name}</b>: ${f.desc}</li>`).join('')}</ul>
        <b>Stance:</b> ${Object.values(STANCES).map((st) => `${st.icon} <b>${st.name}</b> (${st.desc.toLowerCase()})`).join('; ')}.
        <br><b>Target priority:</b> nearest, weakest, archers & siege, cavalry, or towers.</li>
      <li>Set each division's default <b>battle plan</b> on its card. The enemy picks formations to counter yours, for example a Square against cavalry or Skirmish against archers.</li>
      <li><b>Guard duty.</b> Press <b>🛡️ Guard</b> on a division's card and it takes the ground it is standing on as its post. From then on, if any enemy sets foot on — or marches at — <b>any hex connected to that post</b>, the division leaves on its own to meet them, and walks back to its post once the land is clear. Several guards share the work: the nearest one answers each call.</li>
      <li><b>Your armies watch the ground around them.</b> Every division guards a ring of ${DETECT_R}–${DETECT_R_IDLE} hexes (wider when standing still, wider again with scouts in the ranks), drawn as a dashed circle on the map. Any enemy army that steps inside it is attacked at once, with no order from you. Enemy armies watch just as carefully, so marching past a hostile force starts a fight.</li>
      <li><b>Coalition battles:</b> every force within one hex of a fight joins it. Your nearby divisions fight together, an enemy army fights beside its capital's garrison and towers, and allied kingdoms fight on your side. A third kingdom hostile to both sides turns it into a <b>3-way battle</b>, and each side only fights the teams it's hostile to. <b>Auto-resolve</b> finishes a fight instantly, and Settings can auto-resolve every battle. With several divisions, the <b>All divisions</b> row sets everyone's formation and stance at once.</li>
      <li><b>You only ever command your own troops.</b> Allied kingdoms fighting beside you run themselves, and a war between an ally and someone else is never handed to you — it is resolved without you unless forces of yours are on that field.</li>
      <li>After a battle, the forces that fought rest for 30 seconds, and beaten armies fall back home. Fights don't chain endlessly.</li>
      <li><b>Counters:</b> Pikemen crush cavalry, Horsemen ride down archers and catapults, Archers shred pikemen, Swordsmen beat archers up close, and Catapults smash towers.</li>
      <li><b>Raids:</b> hostile kingdoms send armies at your <b>weakest land</b>, usually undefended outlying hexes and sometimes the capital. A red ⚠ alert shows the target and ETA, and the target hex pulses red. Intercept the army, station a division on the target, or build a watchtower or fortress. Undefended targets are pillaged without a fight.</li>
      <li><b>Fortifications are formidable.</b> Towers, Cannons, Fortresses and Spires hit and endure about <b>fourteen times</b> harder than they once did — a defended town is a serious undertaking for any army, yours or theirs. Bring <b>Catapults</b> (×10 against stonework), Cannons or Spires if you mean to take one.</li>
      <li><b>Nobody is moved into position.</b> A battle forms up exactly where each force is standing: your division fights from its own hex, the enemy from theirs, the towers from theirs. Soldiers keep their feet on land and ships stay on the water — no one is ever shoved into the sea to make room for a battle line.</li>
      <li><b>Battles are fought on the real landscape.</b> Nothing is faked for the fight: the towers on the field are the buildings that actually stand there, on their real hexes, with their real type and level. Build more of them and more of them fight. <b>Towers shoot at towers too</b> — Cannons and Arcane Spires would rather knock the enemy's stonework down than chase infantry. Walls stiffen your towers; Masonry and Fortification research help too.</li>
      <li><b>Field Medicine</b> saves part of your casualties. War Horns and Healing Salves boost your next battle.</li>
      <li>Winning an assault on a capital loots its treasury and can seize border hexes.</li>
    </ul>` },
  { id: 'diplomacy', icon: '🕊️', title: 'AI kingdoms & diplomacy', html: `
    <p>Every kingdom keeps <b>🛡 guard armies</b> that move around its land, and coastal kingdoms keep <b>⚓ navy patrols</b> at sea. You can attack any army or fleet, but attacking a kingdom you aren't at war with makes it hostile.</p>
    <p>Six AI kingdoms live on the map. Each has a personality (Aggressive, Expansionist, Builder, Balanced). They <b>expand</b> their borders, <b>upgrade</b> their keeps, <b>build</b> defenses, <b>train</b> armies, keep <b>navies</b>, and <b>march on each other</b>. You can watch their armies move once you've scouted the area.</p>
    <p>Click a kingdom's land → <b>Diplomacy</b>:</p>
    <ul>
      <li>🎁 <b>Gift</b>: improve relations (better with Diplomacy research).</li>
      <li>🕊️ <b>Treaty</b>: 20 minutes of non-aggression (relation 10+).</li>
      <li>⚖️ <b>Trade pact</b>: +5% gold per pact (relation 35+).</li>
      <li>💰 <b>Demand tribute</b>: works if you're much stronger, and angers them.</li>
      <li>⚔️ <b>Declare war</b> / 🕊️ <b>Make peace</b>. Kingdoms at war raid you often and their fleets attack yours.</li>
    </ul>
    <p>Relation ranges from −100 (enemy) to +100 (friendly). Kingdoms below −35 or at war are hostile on the map.</p>` },
  { id: 'alliances', icon: '🤝', title: 'Alliances', html: `
    <ul>
      <li>Join one of the AI alliances (some are invite-only and may decline), or <b>found your own</b> for 🪙1000.</li>
      <li>Alliances give shared bonuses to production, attack, defense and training speed. Allies never raid you and they <b>reinforce your capital</b> in raids.</li>
      <li>Donate resources to level the alliance up (max 10). As leader you can invite or kick kingdoms and toggle open recruitment.</li>
      <li>Alliance chat is where your allies gossip and react to you.</li>
    </ul>` },
  { id: 'shop', icon: '🎁', title: 'Mystery boxes', html: `
    <p>The <b>🎁 Shop</b> sells three boxes, with their odds shown on each card:</p>
    <ul>${BOXES.map((b) => `<li>${b.icon} <b>${b.name}</b> (${Object.entries(b.cost).map(([k, v]) => RES_META[k].icon + v).join('')}): generals ${b.kinds.general}%, items ${b.kinds.item}%, resources ${b.kinds.res}%. Legendary chance ${b.rarity.legendary}%.</li>`).join('')}</ul>` },
  { id: 'graphics', icon: '✨', title: 'Graphics & the map at scale', html: `
    <ul>
      <li><b>Armies are armies.</b> On <b>✨ High</b> graphics, zoom past ${ARMY_Z}× and a division stops being a flag with a number on it: every soldier is drawn, at the size they are in a battle, in ranks — engines and bows behind, horse in the middle, foot leading. Very large hosts draw one figure per handful of men so the block stays legible. Classic and Low-poly keep the cheap banner.</li>
      <li><b>Figures are small</b> — about half the size they used to be, so a company looks like a company standing on the ground rather than a handful of giants.</li>
      <li><b>The world is drawn in layers.</b> Zoomed right out you see a whole-continent image; closer in, terrain streams as tiles at four levels of detail; closest of all it is drawn hex by hex with animated water. This is what keeps a ${fmt(WG.N)}-hex map running smoothly.</li>
      <li><b>Your buildings simplify as you zoom out.</b> Past ${DETAIL_Z}× each one is a coloured block by category — you can read the shape and trade of a city at a glance, and four hundred of them cost almost nothing. Between there and ${ART_LIVE_Z}× the full art is drawn once and reused; closer than that it is drawn live, so windmills turn and forges smoke.</li>
      <li><b>Only what is on screen is drawn at all</b> — armies, fleets, scouts, battles and borders elsewhere in the world cost nothing, and fog stops being drawn over country you have already explored.</li>
      <li><b>The animated art is a High-graphics luxury.</b> Classic and Low-poly draw exactly the same buildings from a cache: the same detail, just standing still. If your machine is struggling, Classic costs a good deal less than High and looks nearly identical at anything but the closest zoom.</li>
      <li><b>It adapts to your machine.</b> Settings → <b>Adapt automatically</b> (on by default) watches the real frame rate and gives ground when it drops: first it stops streaming new terrain tiles, then it renders fewer pixels, then it falls back to the flat world image. It climbs back as soon as there is headroom. Turn on <b>Show frame rate</b> to watch it work — a ▾ next to the number means it has stepped down.</li>
      <li><b>If it still stutters:</b> Settings → <b>⚡ Make it fast</b> sets low-poly, Performance resolution and no minimap in one click. Performance resolution has the biggest effect on high-DPI and 4K screens, because every full-screen pass costs a pixel.</li>
    </ul>` },
  { id: 'saves', icon: '💾', title: 'Saving, settings & version', html: `
    <ul>
      <li>The game autosaves to this browser every 15 seconds and when you leave. If the optional Python server is running, it also syncs to the cloud and shows a global leaderboard.</li>
      <li>☰ Menu → Export/Import moves a save between browsers, and Reset starts over.</li>
      <li>⚙️ Settings holds the camera mode, zoom speed, edge scrolling, grid lines, particles, minimap and battle mode.</li>
      <li>The version number appears in the bottom-left corner of the map and in the menu.</li>
      <li><b>Developer cheats:</b> open the browser console (F12) and type <code>cheats.help()</code>.</li>
    </ul>` },
];

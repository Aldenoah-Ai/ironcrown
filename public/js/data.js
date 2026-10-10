/* ==========================================================================
   Ironcrown — data tables & constants
   All game scripts are classic <script>s sharing one global scope, loaded in
   the order listed in index.html (data → util → state → … → main).
   ========================================================================== */
'use strict';

const GAME_VERSION = '3.5.0';
const SAVE_VERSION = 4;

// ONE map made of small hexes (pointy-top, odd-r offset). Cities, land, sea,
// armies and battles all live on this single grid. v3.4 grew it to ten times
// the area — ~165,000 hexes — at the same hex size, so the world is vast
// rather than merely finer-grained.
const WW = 474, WH = 348, W_HEX = 11;
// The terrain noise is sampled in its own units so that continents keep the
// same scale however big the grid is; these grow with the map.
const NW = (50 * WW) / 150, NH = (36 * WH) / 110;
const MAP_SCALE = Math.sqrt((WW * WH) / (150 * 110));   // ≈3.16: hex distances that used to be tuned for the small map
const AI_KINGDOM_COUNT = 30;
const K_HEX = 34;               // reference size the building art is drawn at (scaled onto a map hex)
const ART = W_HEX / K_HEX;      // art units → map units
const HEX_BONUS = 0.12;         // resource bonus of one small land hex (terrain table is per 'big' area)

const AI_MAX_HALL = 10;          // the player's Main Hall has no maximum
const AI_TICK = 20;               // seconds between AI kingdom turns
const DAY_LENGTH = 90;            // seconds per in-game day
const OFFLINE_CAP = 8 * 3600;

const RES = ['gold', 'iron', 'diamonds', 'lumber', 'food'];
const RES_META = {
  gold:     { name: 'Gold',     icon: '🪙', color: '#f2c14e' },
  iron:     { name: 'Iron',     icon: '⛓️', color: '#9fb3c8' },
  diamonds: { name: 'Diamonds', icon: '💎', color: '#6fe3f2' },
  lumber:   { name: 'Lumber',   icon: '🪵', color: '#c8894a' },
  food:     { name: 'Food',     icon: '🌾', color: '#9bd46a' },
};

const SEASONS = [
  { name: 'Spring', icon: '🌸', food: 1.1,  march: 1 },
  { name: 'Summer', icon: '☀️', food: 1.0,  march: 1.05 },
  { name: 'Autumn', icon: '🍂', food: 1.15, march: 1 },
  { name: 'Winter', icon: '❄️', food: 0.7,  march: 0.85 },
];

/* ---- Buildings (each occupies one hex; the Main Hall sits on the central plaza) ----
   limit[] = how many you may own at Main Hall level 1..6 */
const BUILDINGS = {
  hall:        { name: 'Main Hall', icon: '🏰', cat: 'core', base: { gold: 450, lumber: 450, iron: 180 }, mult: 2.3, time: 14, limit: [1,1,1,1,1,1],
                 desc: 'Heart of the kingdom. Each level expands your hexagonal land, raises storage, adds builders and unlocks new buildings and levels.' },
  goldmine:    { name: 'Gold Mine', icon: '🪙', cat: 'resource', produces: 'gold', rate: 1.1, base: { lumber: 80, food: 20 }, mult: 1.75, time: 4, limit: [2,3,4,5,6,6],
                 desc: 'Digs gold coins out of the hills.' },
  ironmine:    { name: 'Iron Mine', icon: '⛏️', cat: 'resource', produces: 'iron', rate: 0.6, base: { gold: 100, lumber: 90 }, mult: 1.75, time: 5, limit: [1,2,3,4,5,5],
                 desc: 'Iron for weapons, armour, cannons and ship fittings.' },
  diamondmine: { name: 'Diamond Mine', icon: '💎', cat: 'resource', produces: 'diamonds', rate: 0.04, base: { gold: 700, iron: 250, lumber: 250 }, mult: 1.9, time: 10, hall: 3, limit: [0,0,1,2,3,3],
                 desc: 'Rare gems — spend them on Royal Reliquaries, galleons and Arcane Spires.' },
  lumbermill:  { name: 'Lumber Mill', icon: '🪵', cat: 'resource', produces: 'lumber', rate: 1.0, base: { gold: 80 }, mult: 1.75, time: 4, limit: [2,3,4,5,6,6],
                 desc: 'Saws timber for buildings and ships.' },
  farm:        { name: 'Farm', icon: '🌾', cat: 'resource', produces: 'food', rate: 1.3, base: { gold: 60, lumber: 40 }, mult: 1.75, time: 4, limit: [2,3,4,5,6,6],
                 desc: 'Feeds your people and your soldiers. Harvests change with the seasons.' },
  village:     { name: 'Village', icon: '🏘️', cat: 'resource', produces: 'gold', rate: 0.6, base: { lumber: 120, food: 60 }, mult: 1.7, time: 5, limit: [2,3,4,5,6,7],
                 desc: 'Settlers pay taxes in gold. Build them anywhere on your land.' },
  warehouse:   { name: 'Warehouse', icon: '📦', cat: 'resource', storage: 0.2, base: { gold: 250, lumber: 300 }, mult: 1.8, time: 6, hall: 2, limit: [0,1,2,2,3,3],
                 desc: '+20% storage capacity per level.' },
  wall:        { name: 'Wall', icon: '🧱', cat: 'defense', def: 140, base: { lumber: 25, iron: 5 }, mult: 1.6, time: 1, limit: [14,24,34,44,54,64],
                 desc: 'Stone segments that link up with neighbours. Drag to paint a line of walls.' },
  tower:       { name: 'Archer Tower', icon: '🗼', cat: 'defense', def: 630, base: { gold: 150, lumber: 120 }, mult: 1.8, time: 6, limit: [2,5,8,12,16,20],
                 desc: 'Rains arrows on raiders within 3 hexes and watches the land around it.', vision: 6 },
  cannon:      { name: 'Cannon', icon: '💣', cat: 'defense', def: 1330, base: { gold: 400, iron: 250 }, mult: 1.8, time: 8, hall: 3, limit: [0,0,2,4,7,10],
                 desc: 'Heavy iron cannon — devastating against massed troops, and it duels enemy towers.' },
  fortress:    { name: 'Fortress', icon: '🏯', cat: 'defense', def: 2100, base: { gold: 600, lumber: 400, iron: 250 }, mult: 1.8, time: 12, hall: 2, limit: [0,2,3,5,7,9],
                 desc: 'Walled stronghold. Its two turrets join any battle within 3 hexes — perfect for guarding far-off land.' },
  spire:       { name: 'Arcane Spire', icon: '🔮', cat: 'defense', def: 3080, base: { gold: 1500, iron: 600, diamonds: 40 }, mult: 1.9, time: 12, hall: 5, limit: [0,0,0,0,2,4],
                 desc: 'Crackling crystal spire, the strongest defense in the realm.' },
  archery:     { name: 'Archery Range', icon: '🏹', cat: 'military', trains: ['archer'], base: { gold: 120, lumber: 150 }, mult: 1.8, time: 5, limit: [1,1,1,1,1,1],
                 desc: 'Trains Archers. Level raises archer stats.' },
  barracks:    { name: 'Barracks', icon: '⚔️', cat: 'military', trains: ['swordsman', 'pikeman'], base: { gold: 150, lumber: 120, iron: 40 }, mult: 1.8, time: 5, limit: [1,1,1,1,1,1],
                 desc: 'Trains Swordsmen and Pikemen.' },
  stable:      { name: 'Stables', icon: '🐎', cat: 'military', trains: ['horseman'], base: { gold: 350, lumber: 250, iron: 120 }, mult: 1.8, time: 7, hall: 2, limit: [0,1,1,1,1,1],
                 desc: 'Trains Horsemen — fast cavalry.' },
  workshop:    { name: 'Siege Workshop', icon: '🛠️', cat: 'military', trains: ['catapult'], base: { gold: 500, lumber: 500, iron: 200 }, mult: 1.8, time: 9, hall: 3, limit: [0,0,1,1,1,1],
                 desc: 'Builds Catapults (requires the Siege Engineering research).' },
  scoutlodge:  { name: 'Scout Lodge', icon: '🔭', cat: 'military', trains: ['scout'], base: { gold: 100, lumber: 100 }, mult: 1.8, time: 4, limit: [1,1,1,1,1,1],
                 desc: 'Trains Scouts. Level increases how far scouts reveal.' },
  port:        { name: 'Port', icon: '⚓', cat: 'naval', coastal: true, rate: 0.9, trains: ['seaman'], base: { gold: 350, lumber: 350 }, mult: 1.8, time: 8, hall: 2, limit: [0,1,1,2,2,2],
                 desc: 'Must touch the sea. Trains Seamen (ship crews), earns trade gold and hosts the market.' },
  shipyard:    { name: 'Shipyard', icon: '🚢', cat: 'naval', coastal: true, builds: true, base: { gold: 400, lumber: 500, iron: 80 }, mult: 1.85, time: 9, hall: 2, limit: [0,1,1,2,2,3],
                 desc: 'Must touch the sea. Builds warships and transports; higher levels unlock bigger ships.' },
  university:  { name: 'University', icon: '🎓', cat: 'civic', research: true, base: { gold: 500, lumber: 400, iron: 100 }, mult: 1.9, time: 10, hall: 2, limit: [0,1,1,2,2,3],
                 desc: 'Researches technologies. Each university runs one project; higher levels unlock advanced tiers and study faster.' },
};
const BUILD_ORDER = ['goldmine','ironmine','diamondmine','lumbermill','farm','village','warehouse','wall','tower','fortress','cannon','spire','archery','barracks','stable','workshop','scoutlodge','port','shipyard','university'];
// Past Main Hall 6 the limits keep growing by this much per hall level.
const LIMIT_GROW = { goldmine: 1, ironmine: 1, diamondmine: 0.5, lumbermill: 1, farm: 1, village: 1, warehouse: 0.5, wall: 10, tower: 4, fortress: 2, cannon: 3, spire: 2, port: 0.34, shipyard: 0.5, university: 0.5 };
// Terrain that makes a building more productive when built on it.
const TERRAIN_BOOST = { goldmine: { 4: 1.5, goldvein: 2 }, ironmine: { 4: 1.6 }, diamondmine: { gems: 2.5 }, lumbermill: { 3: 1.6 }, farm: { 1: 1.3, 2: 1.35 }, village: { 2: 1.2, 1: 1.1 } };
const CAT_NAMES = { resource: 'Economy', defense: 'Defenses', military: 'Military', naval: 'Naval', civic: 'Learning', core: 'Kingdom' };

/* ---- Land units ---- vs = damage multipliers against unit types */
const UNITS = {
  archer:    { name: 'Archer',    icon: '🏹', from: 'archery',    atk: 9,  hp: 45,  speed: 1.0,  range: 130, cost: { gold: 30, food: 15 },             time: 3,  housing: 1, vs: { pikeman: 1.3 } },
  swordsman: { name: 'Swordsman', icon: '🗡️', from: 'barracks',   atk: 12, hp: 100, speed: 0.9,  range: 16,  cost: { gold: 35, iron: 15, food: 20 },  time: 4,  housing: 1, vs: { archer: 1.2 } },
  pikeman:   { name: 'Pikeman',   icon: '🔱', from: 'barracks',   atk: 10, hp: 90,  speed: 0.85, range: 24,  cost: { gold: 30, iron: 20, food: 15 },  time: 4,  housing: 1, vs: { horseman: 2.0 } },
  horseman:  { name: 'Horseman',  icon: '🐎', from: 'stable',     atk: 19, hp: 150, speed: 1.8,  range: 18,  cost: { gold: 70, iron: 30, food: 40 },  time: 6,  housing: 2, vs: { archer: 1.5, catapult: 2 } },
  catapult:  { name: 'Catapult',  icon: '☄️', from: 'workshop',   atk: 42, hp: 130, speed: 0.55, range: 200, cost: { gold: 150, lumber: 120, iron: 60 }, time: 12, housing: 3, vs: { tower: 10 }, splash: true, research: 'siege' },
  scout:     { name: 'Scout',     icon: '🔭', from: 'scoutlodge', atk: 2,  hp: 25,  speed: 2.4,  range: 16,  cost: { gold: 40, food: 10 },             time: 3,  housing: 1 },
  seaman:    { name: 'Seaman',    icon: '🧑‍✈️', from: 'port',       atk: 5,  hp: 40,  speed: 1.0,  range: 16,  cost: { gold: 25, food: 15 },             time: 2.5, housing: 1 },
};
const COMBAT_UNITS = ['archer', 'swordsman', 'pikeman', 'horseman', 'catapult'];

/* ---- Ships ---- lvl = shipyard level required, cap = troop transport capacity */
const SHIPS = {
  sloop:   { name: 'Sloop',   icon: '⛵', crew: 6,  atk: 10, hp: 90,  speed: 2.2, range: 110, cost: { gold: 120, lumber: 150 },                         time: 8,  lvl: 1, cap: 0,  upkeep: 0.01, desc: 'Fast scout & raider.' },
  cog:     { name: 'Cog',     icon: '🛶', crew: 8,  atk: 4,  hp: 170, speed: 1.2, range: 90,  cost: { gold: 150, lumber: 220 },                         time: 10, lvl: 1, cap: 20, upkeep: 0.01, desc: 'Transport — carries 20 troops across the sea.' },
  galley:  { name: 'Galley',  icon: '⛴️', crew: 12, atk: 22, hp: 230, speed: 1.5, range: 22,  cost: { gold: 260, lumber: 300, iron: 60 },               time: 14, lvl: 2, cap: 0,  upkeep: 0.02, desc: 'Oared warship that rams and boards.' },
  frigate: { name: 'Frigate', icon: '🚢', crew: 18, atk: 34, hp: 330, speed: 1.6, range: 170, cost: { gold: 500, lumber: 450, iron: 180 },              time: 22, lvl: 3, cap: 0,  upkeep: 0.03, desc: 'Cannon broadsides at long range.' },
  galleon: { name: 'Galleon', icon: '🏴', crew: 30, atk: 52, hp: 640, speed: 1.0, range: 180, cost: { gold: 1100, lumber: 800, iron: 400, diamonds: 10 }, time: 35, lvl: 5, cap: 10, upkeep: 0.05, desc: 'Floating fortress; also carries 10 troops.' },
  manowar: { name: "Man o' War", icon: '🛳️', crew: 50, atk: 85, hp: 1050, speed: 0.9, range: 210, cost: { gold: 2600, lumber: 1700, iron: 950, diamonds: 30 }, time: 60, lvl: 6, cap: 15, upkeep: 0.08, desc: 'Ship of the line: two gun decks of cannon. The mightiest vessel afloat.' },
};
const SHIP_TYPES = Object.keys(SHIPS);

const RARITY = {
  common:    { name: 'Common',    color: '#a8b0bd', dupXp: 1 },
  rare:      { name: 'Rare',      color: '#4ea1f2', dupXp: 2 },
  epic:      { name: 'Epic',      color: '#b07cf2', dupXp: 3 },
  legendary: { name: 'Legendary', color: '#f2a33a', dupXp: 5 },
};
// spec: a unit type, or 'fleet' (+15% to all ships)
const GENERALS = [
  { id: 'aldric',   name: 'Sir Aldric',           icon: '🧔', rarity: 'common',    atk: 28, hp: 34, spd: 24, lore: 'A loyal knight of modest talent. Everyone starts somewhere.' },
  { id: 'bran',     name: 'Bran Ironfoot',        icon: '👨‍🦰', rarity: 'common',    atk: 34, hp: 38, spd: 18, spec: 'swordsman', lore: 'Never retreated. Also never hurried.' },
  { id: 'mira',     name: 'Mira of the Vale',     icon: '👩', rarity: 'common',    atk: 30, hp: 26, spd: 40, spec: 'archer', lore: 'Can split an apple at eighty paces.' },
  { id: 'tomas',    name: 'Old Tomas',            icon: '👴', rarity: 'common',    atk: 24, hp: 48, spd: 20, spec: 'pikeman', lore: 'Has survived eleven wars and two marriages.' },
  { id: 'hale',     name: 'Captain Hale',         icon: '🧑‍✈️', rarity: 'common',    atk: 30, hp: 32, spd: 36, spec: 'fleet', lore: 'Knows every reef between here and the edge of the map.' },
  { id: 'seraph',   name: 'Lady Seraphine',       icon: '👸', rarity: 'rare',      atk: 44, hp: 52, spd: 38, lore: 'A tactician whose banners never fall.' },
  { id: 'kael',     name: 'Kael Stormrider',      icon: '🏇', rarity: 'rare',      atk: 50, hp: 36, spd: 66, spec: 'horseman', lore: 'Rides ahead of the thunder.' },
  { id: 'gorran',   name: 'Gorran the Bold',      icon: '🧌', rarity: 'rare',      atk: 58, hp: 50, spd: 28, spec: 'swordsman', lore: 'Bold is an understatement.' },
  { id: 'corvina',  name: 'Admiral Corvina',      icon: '🦜', rarity: 'rare',      atk: 52, hp: 48, spd: 58, spec: 'fleet', lore: 'Her fleets arrive with the tide — and leave with your gold.' },
  { id: 'valeria',  name: 'Valeria Nightshade',   icon: '🧝‍♀️', rarity: 'epic',      atk: 72, hp: 54, spd: 70, spec: 'archer', lore: 'Her arrows arrive before the sound of the bowstring.' },
  { id: 'thorne',   name: 'Thorne Blackwood',     icon: '🧙', rarity: 'epic',      atk: 66, hp: 74, spd: 46, spec: 'catapult', lore: 'Warlord of the deep forests and master of siegecraft.' },
  { id: 'ysolde',   name: 'Ysolde the Unbroken',  icon: '🛡️', rarity: 'epic',      atk: 56, hp: 90, spd: 40, spec: 'pikeman', lore: 'Shields of her legion never break.' },
  { id: 'maren',    name: 'Maren Tidewalker',     icon: '🧜‍♀️', rarity: 'epic',      atk: 70, hp: 66, spd: 72, spec: 'fleet', lore: 'Sailors swear the sea parts for her flagship.' },
  { id: 'aurelius', name: 'Aurelius Dawnbringer', icon: '🦁', rarity: 'legendary', atk: 90, hp: 86, spd: 64, lore: 'The sun rises wherever he marches.' },
  { id: 'morrigan', name: 'Queen Morrigan',       icon: '🐦‍⬛', rarity: 'legendary', atk: 94, hp: 70, spd: 82, spec: 'horseman', lore: 'Crows gather before her cavalry charges.' },
  { id: 'ragnar',   name: 'Ragnar Wolfheart',     icon: '🐺', rarity: 'legendary', atk: 98, hp: 92, spd: 56, spec: 'swordsman', lore: 'Howls answer his war cry.' },
  { id: 'leviathan',name: 'The Leviathan',        icon: '🐙', rarity: 'legendary', atk: 96, hp: 98, spd: 60, spec: 'fleet', lore: 'Nobody knows who is under the helm. Nobody asks.' },
];

const ITEMS = {
  warhorn: { name: 'War Horn',         icon: '📯', desc: '+30% attack in your next battle (land or sea).' },
  salve:   { name: 'Healing Salve',    icon: '🧪', desc: '+30% health in your next battle (land or sea).' },
  hammer:  { name: "Builder's Hammer", icon: '🔨', desc: 'Instantly finishes all constructions in progress.' },
  scroll:  { name: "Scholar's Scroll", icon: '📜', desc: 'Instantly completes all research in progress.' },
  map:     { name: 'Ancient Map',      icon: '🗺️', desc: 'Reveals the lands around an unexplored kingdom.' },
  winds:   { name: 'Favourable Winds', icon: '🌬️', desc: 'Fleets sail 50% faster for 5 minutes.' },
  shield:  { name: 'Peace Shield',     icon: '🕊️', desc: 'Enemies will not raid you for 15 minutes.' },
};

const BOXES = [
  { id: 'wooden', name: 'Wooden Crate',    icon: '📦', glow: '#c8894a55', cost: { gold: 300 },
    kinds: { res: 62, item: 26, general: 12 }, rarity: { common: 82, rare: 16, epic: 2, legendary: 0 }, resScale: 1 },
  { id: 'silver', name: 'Silver Chest',    icon: '🧰', glow: '#9fb3c866', cost: { gold: 1500 },
    kinds: { res: 38, item: 32, general: 30 }, rarity: { common: 45, rare: 40, epic: 13, legendary: 2 }, resScale: 4 },
  { id: 'royal',  name: 'Royal Reliquary', icon: '👑', glow: '#f2a33a77', cost: { diamonds: 60 },
    kinds: { res: 15, item: 30, general: 55 }, rarity: { common: 0, rare: 48, epic: 38, legendary: 14 }, resScale: 10 },
];

/* ---- World terrain ---- cost = land movement cost (Infinity = impassable) */
const T = { WATER: 0, PLAINS: 1, MEADOW: 2, FOREST: 3, HILLS: 4, MOUNTAIN: 5, DESERT: 6, SWAMP: 7 };
const TERRAIN = {
  0: { name: 'Sea',      color: '#2c6f9c', cost: Infinity },
  1: { name: 'Plains',   color: '#8db35a', cost: 1,   bonus: { food: 0.3 } },
  2: { name: 'Meadow',   color: '#9cc464', cost: 1,   bonus: { food: 0.2, gold: 0.1 } },
  3: { name: 'Forest',   color: '#4e8a3e', cost: 1.5, bonus: { lumber: 0.35 } },
  4: { name: 'Hills',    color: '#a39266', cost: 2,   bonus: { iron: 0.25 } },
  5: { name: 'Mountains',color: '#8a8378', cost: Infinity },
  6: { name: 'Desert',   color: '#dcc58a', cost: 1.3, bonus: { gold: 0.15 } },
  7: { name: 'Swamp',    color: '#5f7a4e', cost: 2.2, bonus: { food: 0.1, lumber: 0.15 } },
};
const FEATURES = {
  goldvein: { name: 'Gold Vein',       icon: '✨', desc: 'Rich seam of gold. Hold this hex for +0.6 gold/s.' },
  cave:     { name: 'Cave',            icon: '🕳️', desc: 'Explore it with a division or scouts to discover its minerals, then claim the hex to mine them.' },
  ruins:    { name: 'Ancient Ruins',   icon: '🏛️', desc: 'Abandoned structures guarded by bandits. Send a division to explore for treasure.' },
  fort:     { name: 'Abandoned Fort',  icon: '🏯', desc: 'Old stronghold. Capture it with a division to gain an outpost that extends your reach.' },
  wreck:    { name: 'Shipwreck',       icon: '⚓', desc: 'Sunken ship. Sail a fleet here to salvage it.' },
  cove:     { name: 'Pirate Cove',     icon: '🏴‍☠️', desc: 'Pirates raid from here. Destroy it with a fleet for a big reward.' },
};
const MINERALS = {
  iron:  { name: 'Iron ore',   bonus: { iron: 0.9 },      icon: '⛓️' },
  gold:  { name: 'Gold ore',   bonus: { gold: 1.0 },      icon: '🪙' },
  gems:  { name: 'Gemstones',  bonus: { diamonds: 0.05 }, icon: '💎' },
};

/* ---- Research (Universities) ----
   uni = university level needed, req = prerequisite research ids, max = levels */
const RESEARCH = {
  tools:        { cat: 'economy',  name: 'Improved Tools',     icon: '🔧', max: 3, uni: 1, base: { gold: 300, lumber: 200 },            time: 30, desc: (l) => `+${8 * l}% all production` },
  crops:        { cat: 'economy',  name: 'Crop Rotation',      icon: '🌽', max: 3, uni: 1, base: { gold: 250, food: 200 },              time: 30, desc: (l) => `+${15 * l}% food` },
  mining:       { cat: 'economy',  name: 'Deep Mining',        icon: '⛏️', max: 3, uni: 1, base: { gold: 400, lumber: 300 },            time: 40, req: ['tools'], desc: (l) => `+${15 * l}% from mines` },
  banking:      { cat: 'economy',  name: 'Banking',            icon: '🏦', max: 3, uni: 2, base: { gold: 800, iron: 200 },              time: 60, req: ['tools'], desc: (l) => `+${20 * l}% storage` },
  architecture: { cat: 'economy',  name: 'Architecture',       icon: '📐', max: 3, uni: 2, base: { gold: 700, lumber: 700 },            time: 60, req: ['masonry'], desc: (l) => `-${12 * l}% construction time` },
  trade:        { cat: 'economy',  name: 'Trade Routes',       icon: '⚖️', max: 3, uni: 2, base: { gold: 900, lumber: 400 },            time: 60, desc: (l) => `+${25 * l}% port income, better market` },
  armor:        { cat: 'military', name: 'Iron Armour',        icon: '🛡️', max: 3, uni: 1, base: { gold: 400, iron: 300 },              time: 40, desc: (l) => `+${10 * l}% infantry health` },
  weapons:      { cat: 'military', name: 'Steel Weapons',      icon: '⚔️', max: 3, uni: 1, base: { gold: 400, iron: 350 },              time: 40, desc: (l) => `+${10 * l}% attack (all troops)` },
  longbows:     { cat: 'military', name: 'Longbows',           icon: '🏹', max: 3, uni: 2, base: { gold: 600, lumber: 500 },            time: 50, req: ['weapons'], desc: (l) => `+${15 * l}% archer attack, +${10 * l}% range` },
  horses:       { cat: 'military', name: 'Horse Breeding',     icon: '🐎', max: 3, uni: 1, base: { gold: 500, food: 400 },              time: 45, desc: (l) => `+${15 * l}% horseman speed, +${8 * l}% health` },
  barding:      { cat: 'military', name: 'Heavy Cavalry',      icon: '🏇', max: 3, uni: 2, base: { gold: 900, iron: 500 },              time: 70, req: ['horses', 'armor'], desc: (l) => `+${12 * l}% horseman attack & health` },
  drill:        { cat: 'military', name: 'Drill Sergeants',    icon: '📣', max: 3, uni: 1, base: { gold: 350, food: 300 },              time: 35, desc: (l) => `-${15 * l}% training time` },
  logistics:    { cat: 'military', name: 'Logistics',          icon: '🧭', max: 3, uni: 2, base: { gold: 700, food: 600 },              time: 60, req: ['drill'], desc: (l) => `+${12 * l}% division march speed` },
  medicine:     { cat: 'military', name: 'Field Medicine',     icon: '⚕️', max: 3, uni: 2, base: { gold: 800, food: 500 },              time: 60, req: ['armor'], desc: (l) => `Recover ${10 * l}% of battle casualties` },
  siege:        { cat: 'military', name: 'Siege Engineering',  icon: '☄️', max: 3, uni: 3, base: { gold: 1400, lumber: 1000, iron: 600 }, time: 90, req: ['weapons'], hall: 3, desc: (l) => (l === 1 ? 'Unlocks Catapults' : `+${15 * (l - 1)}% catapult attack`) },
  shipwright:   { cat: 'naval',    name: 'Shipwrighting',      icon: '🪚', max: 3, uni: 1, base: { gold: 500, lumber: 600 },            time: 45, desc: (l) => `-${10 * l}% ship cost, -${15 * l}% build time` },
  navigation:   { cat: 'naval',    name: 'Navigation',         icon: '🧭', max: 3, uni: 1, base: { gold: 500, lumber: 400 },            time: 45, desc: (l) => `+${12 * l}% fleet speed` },
  sails:        { cat: 'naval',    name: 'Lateen Sails',       icon: '⛵', max: 3, uni: 2, base: { gold: 800, lumber: 700 },            time: 60, req: ['navigation'], desc: (l) => `+${10 * l}% more fleet speed` },
  hulls:        { cat: 'naval',    name: 'Reinforced Hulls',   icon: '🪵', max: 3, uni: 2, base: { gold: 800, lumber: 600, iron: 300 },  time: 60, req: ['shipwright'], desc: (l) => `+${12 * l}% ship health` },
  cannons:      { cat: 'naval',    name: 'Naval Cannons',      icon: '💥', max: 3, uni: 3, base: { gold: 1200, iron: 800 },             time: 80, req: ['hulls'], desc: (l) => `+${12 * l}% ship attack` },
  cartography:  { cat: 'naval',    name: 'Cartography',        icon: '🗺️', max: 2, uni: 2, base: { gold: 700, lumber: 300 },            time: 60, req: ['navigation'], desc: (l) => `+${l} vision range for fleets, divisions & scouts` },
  masonry:      { cat: 'civic',    name: 'Masonry',            icon: '🧱', max: 3, uni: 1, base: { gold: 300, iron: 150 },              time: 35, desc: (l) => `+${10 * l}% defense rating` },
  fortification:{ cat: 'civic',    name: 'Fortification',      icon: '🏰', max: 3, uni: 2, base: { gold: 900, iron: 500 },              time: 70, req: ['masonry'], desc: (l) => `+${12 * l}% tower strength in battles & raids` },
  diplomacy:    { cat: 'civic',    name: 'Diplomacy',          icon: '🕊️', max: 3, uni: 1, base: { gold: 500 },                         time: 40, desc: (l) => `+${50 * l}% relation from gifts, better invites` },
  espionage:    { cat: 'civic',    name: 'Espionage',          icon: '🕵️', max: 3, uni: 2, base: { gold: 700, food: 200 },              time: 50, req: ['diplomacy'], desc: (l) => `-${25 * l}% scouts captured` },
  administration:{cat: 'civic',    name: 'Administration',     icon: '📚', max: 3, uni: 2, base: { gold: 800, lumber: 400 },            time: 60, desc: (l) => `+${3 * l} territory limit` },
  engineering:  { cat: 'civic',    name: 'Engineering',        icon: '🏗️', max: 2, uni: 3, base: { gold: 1500, lumber: 1200, iron: 500 }, time: 100, req: ['architecture'], hall: 4, desc: (l) => `+${l} builder${l > 1 ? 's' : ''}` },
};
const RESEARCH_CATS = { economy: '💰 Economy', military: '⚔️ Military', naval: '⚓ Naval', civic: '🏛️ Civic' };

const KINGDOM_NAMES = [
  'Vharn Empire', 'Duchy of Elsmere', 'Karrak Hold', 'Sunspear Dominion', 'The Mistral League', 'Grimhollow',
  'Ostara Throne', 'Brightwater Realm', 'Thornmarch', 'Caldera Reach', 'The Amber Coast', 'Vaskin Confederacy',
  'Highfell', 'Drakemoor', 'Saltspire Republic', 'Iselheim', 'The Verdant Pale', 'Orrindale',
  'Ashfen Dominion', 'Cobalt Marches', 'Ruvaal Khanate', 'Windrest', 'The Gilded Sound', 'Blackbriar',
  'Northreach', 'Solmere', 'Tarnhold', 'The Ivory League', 'Ferrowind', 'Umbral Crown',
  'Larkspur Free State', 'Kethran Sultanate',
];
const RULERS = [
  'King Oswin', 'Duchess Ilse', 'Warlord Karrak', 'Sultana Reyna', 'Doge Venn', 'Baron Grim',
  'Queen Ostara', 'Prince Aldo', 'Margrave Toll', 'Archon Vela', 'Consul Mira', 'Hetman Vask',
  'Jarl Hallis', 'Lord Drake', 'Admiral Serra', 'Countess Isel', 'Warden Pell', 'Duke Orrin',
  'Regent Ashma', 'Elector Bruhn', 'Khan Ruvaal', 'Lady Wren', 'Provost Calen', 'Reeve Thistle',
  'King Harald', 'Queen Solene', 'Castellan Tarn', 'Chancellor Ivo', 'Despot Ferro', 'Empress Nyx',
  'Speaker Lark', 'Sultan Kethran',
];
const KINGDOM_COLORS = [
  '#d9534f', '#5bc0de', '#9b59b6', '#f0ad4e', '#1abc9c', '#8d6e63',
  '#e84393', '#7f8c8d', '#6ab04c', '#eb4d4b', '#4834d4', '#e1b12c',
  '#22a6b3', '#be2edd', '#ff7979', '#badc58', '#f0932b', '#686de0',
  '#30336b', '#95afc0', '#c23616', '#0097e6', '#8c7ae6', '#44bd32',
  '#e58e26', '#b33771', '#3dc1d3', '#fd7272', '#546de5', '#574b90',
  '#f19066', '#63cdda',
];
const PERSONALITIES = {
  aggressive:   { name: 'Aggressive',   w: { expand: 2, upgrade: 1, build: 1, train: 4 } },
  expansionist: { name: 'Expansionist', w: { expand: 5, upgrade: 1, build: 1, train: 2 } },
  builder:      { name: 'Builder',      w: { expand: 1, upgrade: 3, build: 4, train: 1 } },
  balanced:     { name: 'Balanced',     w: { expand: 2, upgrade: 2, build: 2, train: 2 } },
};
const ALLIANCE_COLORS = ['#f2c14e', '#e5534b', '#4ea1f2', '#57c26b', '#b07cf2', '#e84393'];
const ALLIANCE_EMBLEMS = ['🦅', '🐉', '🦁', '🐺', '⚜️', '🌙'];
const DIVISION_COLORS = ['#f2c14e', '#e8e8e8', '#ff8a5c', '#7fd4ff', '#b3f07a', '#ff9ad5'];

/* ---- Battle formations & stances (battles are fought on the world map) ---- */
const FORMATIONS = {
  line:     { name: 'Line',     icon: '〰️', desc: 'Balanced. Infantry in front, archers behind, cavalry on the flanks. +10% ranged attack.', ranged: 1.1, melee: 1, takeRanged: 1, takeMelee: 1, speed: 1 },
  wedge:    { name: 'Wedge',    icon: '🔺', desc: 'Spearhead charge. +25% melee attack but take +15% damage.', ranged: 1, melee: 1.25, takeRanged: 1.15, takeMelee: 1.15, speed: 1.1 },
  square:   { name: 'Square',   icon: '⏹️', desc: 'Shield wall. −30% melee damage taken (−45% vs cavalry), slow, +10% ranged damage taken.', ranged: 1, melee: 0.9, takeRanged: 1.1, takeMelee: 0.7, speed: 0.6 },
  skirmish: { name: 'Skirmish', icon: '✳️', desc: 'Loose order. −40% damage from arrows, cannons and catapults, faster, −10% melee attack.', ranged: 1, melee: 0.9, takeRanged: 0.6, takeMelee: 1, speed: 1.15 },
};
const STANCES = {
  advance: { name: 'Advance', icon: '➡️', desc: 'March in formation and engage enemies that come close.' },
  hold:    { name: 'Hold',    icon: '✋', desc: 'Stand your ground; only fight what comes within reach.' },
  charge:  { name: 'Charge',  icon: '⚡', desc: 'Break formation — every squad attacks its chosen target.' },
  retreat: { name: 'Retreat', icon: '↩️', desc: 'Fall back off the field; escaped troops survive.' },
};
const TARGETS = { nearest: 'Nearest', weakest: 'Weakest', ranged: 'Archers & siege', cavalry: 'Cavalry', towers: 'Towers' };
/* Every defensive building fights as itself: an Archer Tower shoots arrows, a Cannon
   lobs iron, a Fortress mans two turrets, a Spire throws arcane bolts. `siege` towers
   prefer to duel other towers. */
const DEF_POWER = 14;      // v3.4: fortifications hit and endure ~14x harder than they used to
const TOWER_STATS = {
  tower:    { hp: 300 * DEF_POWER, atk: 20 * DEF_POWER, range: 175, rate: 1.25, shot: 'arrow' },
  cannon:   { hp: 400 * DEF_POWER, atk: 62 * DEF_POWER, range: 250, rate: 2.4,  shot: 'ball',  splash: true, siege: true },
  fortress: { hp: 750 * DEF_POWER, atk: 26 * DEF_POWER, range: 195, rate: 1.15, shot: 'arrow', count: 2 },
  spire:    { hp: 600 * DEF_POWER, atk: 80 * DEF_POWER, range: 265, rate: 1.9,  shot: 'bolt',  siege: true },
};

/* ---- Objectives: a guided path through the game's systems (rewards on completion) ---- */
const OBJECTIVES = [
  { id: 'farm2',    text: 'Build a second Farm',                 test: () => countOf('farm') >= 2 && S.buildings.filter((b) => b.type === 'farm' && b.level > 0).length >= 2, reward: { gold: 200, lumber: 200 } },
  { id: 'hall2',    text: 'Upgrade the Main Hall to level 2',    test: () => hallLevel() >= 2, reward: { gold: 500, lumber: 400, iron: 150 } },
  { id: 'barracks', text: 'Build a Barracks and train 5 Swordsmen', test: () => S.buildings.some((b) => b.type === 'barracks' && b.level > 0) && (S.army.swordsman + S.divisions.reduce((a, d) => a + d.units.swordsman, 0)) >= 11, reward: { gold: 300, iron: 150 } },
  { id: 'scout',    text: 'Send scouts to explore the fog',      test: () => S.stats.scouted >= 5, reward: { gold: 250, food: 250 } },
  { id: 'claim',    text: 'Claim land away from your capital',   test: () => playerTiles() >= 80, reward: { gold: 400, food: 300 } },
  { id: 'defense',  text: 'Protect an outlying building with a Tower', test: () => S.buildings.some((b) => b.type === 'tower' && b.level > 0 && WG.dist(b.hex, S.world.capital) >= 6), reward: { gold: 400, lumber: 300 } },
  { id: 'uni',      text: 'Build a University and research a technology', test: () => S.stats.researched >= 1, reward: { gold: 600, diamonds: 10 } },
  { id: 'division', text: 'Muster a second division',            test: () => S.divisions.length >= 2, reward: { gold: 500, food: 400 } },
  { id: 'win',      text: 'Win a battle',                        test: () => S.stats.battlesWon + S.stats.raidsRepelled >= 1, reward: { gold: 800, diamonds: 10 } },
  { id: 'fleet',    text: 'Build a ship and form a fleet',       test: () => S.fleets.length >= 1, reward: { gold: 700, lumber: 500 } },
  { id: 'hall5',    text: 'Reach Main Hall 5',                   test: () => hallLevel() >= 5, reward: { gold: 3000, diamonds: 30 } },
  { id: 'ally',     text: 'Join or found an alliance',           test: () => !!S.allianceId, reward: { gold: 1000, diamonds: 15 } },
];

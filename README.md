# 👑 Ironcrown `v3.6.1`

A browser kingdom-strategy game and living world simulation. Build a kingdom on a hex map, research technologies at
universities, raise armies and navies, group them into divisions and fleets, explore ruins, caves, forts and
shipwrecks, fight pirates, and trade with, ally or conquer thirty AI kingdoms that grow on their own.

**▶ Play: https://fanaustinca.github.io/ironcrown/**

It's pure HTML5 Canvas + vanilla JavaScript with no build step and no dependencies. It also runs straight from
`public/index.html` on disk. An optional Python server adds cloud saves and a global leaderboard.

## Features

| Area | What's in it |
|---|---|
| **One map, small hexes** | The whole world is a single grid of about **165,000** small hexes — ten times the area of v3.3, at the same hex size. Land, sea, your city, enemy cities, armies and battles all share it, so there's no scale jump when zooming. You can build on any hex you own, and terrain boosts production (mills in forests, mines on hills, farms on plains). Enemy capitals are procedural cities (keep, buildings, walls, towers), and AI land shows farms, mines and villages. Every army, guard, fleet and battle is on the same map. |
| **Hex kingdom** | A **Main Hall with no maximum level**. It never hands you territory — every hex is one you claimed — but each level unlocks buildings, widens how big a region your settlers can take, and scales limits and builders. The coastline has curves, beaches, foam and shallow-water bands. You can clear trees and rocks, paint walls by dragging, and build 18 building types. |
| **Economy** | Gold, Iron, Diamonds, Lumber and Food, plus storage caps and Warehouses. Upkeep is food for troops and gold for ships. Four seasons affect harvests and marching. There's a Port market, and offline progress runs for up to 8 hours. |
| **Research** | Universities run one project each: 26 technologies in 4 trees, each with up to 3 levels. They include faster ships, faster horses, better armour, siege engineering, cartography, banking and engineering. |
| **Army & divisions** | Archers, Swordsmen, Pikemen, Horsemen and Catapults, with counter bonuses. There's no army cap, only upkeep. You group troops into named divisions, each led by its own general, which you can resize, split or merge, and march them on the map to assault capitals, invade hexes, explore ruins and caves, capture forts and intercept raiders. |
| **Guard duty** | Put a division on **🛡️ Guard** and the ground it stands on becomes its post. Any enemy that sets foot on — or marches at — **any hex connected to that post** brings it out to meet them, and it walks back once the land is clear. Several guards divide the work between them, nearest first. |
| **Detection & auto-engage** | Every army — yours and theirs — watches a ring of 2–3 hexes around it (wider standing still, wider again with scouts along), drawn as a dashed circle on the map. Any enemy that walks inside is attacked at once, with no order from you. |
| **On-map battles** | There's no separate battle screen: fights happen where the armies meet, **across the real landscape**. A command bar lets you set each division's formation (Line / Wedge / Square / Skirmish), stance (Advance / Hold / Charge / Retreat) and target priority mid-battle. **Coalition battles:** every force within one hex joins, so your divisions fight together and enemy armies fight beside their garrison and towers. 3-way battles happen when a third side is hostile to both. Allied kingdoms fight on your side but **command themselves** — their wars are never handed to you. |
| **Formidable defenses** | Towers, Cannons, Fortresses and Arcane Spires hit and endure about **fourteen times** harder than in v3.3. A defended town is a real undertaking for any army — bring Catapults (×10 against stonework), Cannons or Spires if you mean to take one. |
| **Fight where you stand** | A battle forms up exactly where each force is: your division on its hex, the enemy on theirs, the towers on theirs. Nobody is marched to a tidy battle line first, and land units keep their feet on land while ships stay afloat — no more armies shoved into the sea. |
| **Real towers** | Nothing is invented for a battle. The towers on the field are the buildings that actually stand there, on their own hexes, at their own level: an Archer Tower looses arrows, a Cannon lobs iron, a Fortress mans two turrets, an Arcane Spire throws bolts. Build more and more of them fight — and **towers shoot at towers**, with cannons and spires preferring to bring the other side's stonework down. |
| **Scouts** | Scout parties are units: dispatch one, click any point on the map, and every hex along the route is revealed. They also explore caves and gather intel. |
| **Expansion** | Almost the whole map is unclaimed, and all of it is takeable. A claim settles a **whole region at once** — radius 1 to 6, growing with the Main Hall — and settlers push a few hexes **past your border into unexplored land**, revealing what they take, so every claim opens a new frontier. Divisions standing on neutral ground can annex it outright. There is no cap on how much land you hold. Raiders target your least-defended hexes. |
| **Navy & fleets** | Seamen trained at the Port crew every ship. The Shipyard builds Sloops, Cogs, Galleys, Frigates, Galleons and the Man o' War. Grouped into fleets, they can sail, salvage wrecks, burn pirate coves, blockade coastal kingdoms and hunt enemy fleets. Cogs and Galleons ferry divisions across the sea. |
| **Graphics** | 🔷 Low-poly (the default — fastest), 🎨 Classic, or ✨ High (procedural grass, rock, sand, snow and water textures, hill-shading, water caustics and glints, cloud shadows), switchable live in Settings. |
| **Armies drawn as armies** | On High graphics, zoom in past 3.2× and a division is no longer a banner with a number: every soldier is drawn, at the size they are in a battle, in ranks — engines and bows behind, horse in the middle, foot leading. Huge hosts draw one figure per handful so the block stays legible. |
| **Adapts to your machine** | Aimed at ordinary hardware: on an emulated medium laptop (4x CPU throttle, software rasterisation, a 300-building empire on a fully explored map) Classic graphics hold 45–58 fps. An optional governor (on by default) watches the real frame rate and gives ground when it drops — it stops streaming terrain tiles, then renders fewer pixels, then falls back to the flat world image — and climbs back when there's headroom. There's an FPS chip, and one-click **⚡ Make it fast** in Settings. Cached terrain tiles live on a fixed memory budget so panning can't quietly allocate hundreds of megabytes of textures. |
| **Built to scale** | A 165,000-hex world is rendered in layers: a whole-continent atlas when zoomed out, streamed terrain tiles at four levels of detail in between, and live hex-by-hex drawing up close. Buildings follow the same idea — coloured blocks far out, cached sprites in the middle, live animated art up close — and nothing off screen is drawn at all. Tile counts, territory bonuses, realm components and pathfinding buffers are all cached so nothing sweeps the whole map per frame, and saves are run-length encoded to a fraction of their raw size. |
| **World simulation** | A procedurally generated hex continent with islands, lakes, mountains, hills, forests, deserts and swamps, under a fog of war. **Thirty** AI kingdoms in half a dozen rival alliances expand, upgrade, build, keep guard armies and navy patrols, and march armies on each other and on you. Pirates roam. |
| **Generals** | 17 generals in 4 rarities, each with Attack / Health / Speed bars. There's one general per division, and each general holds only one post. You can own several copies of a general and merge copies to promote (+★). You can hire more at the Tavern. Specialists and admirals get extra bonuses. |
| **Diplomacy & alliances** | Gifts, non-aggression treaties, trade pacts, tribute, war and peace. You can join AI alliances or found your own, then invite, donate and chat. Allies reinforce you. |
| **Mystery boxes** | Three boxes with their odds shown. Rewards are generals, resources or items. |
| **Battle sim** | An animated land and naval battle simulator with real towers, cannons, catapult splash and ship broadsides. You can watch at 1×/2×/4×, skip, or auto-resolve. |
| **Camera** | Drag or WASD/arrows to pan, scroll or pinch to zoom, a minimap, and zoom buttons. Jumps (home, minimap, focus buttons, `K`/`M`) glide rather than cut, and mouse-wheel zoom eases (instant with *reduce motion*). Settings can limit panning to drag or keys and turn on edge scrolling. |
| **UI** | Detailed HUD with calendar, builders, research, housing, navy and power. It also has threat alerts with ETAs, rich tooltips, a 16-section help guide (`H` / `?`), settings, and a version label. Keys `1`–`9` switch panel tabs. The side panel is patched in place each second rather than rebuilt, so nothing flickers or loses its hover. |
| **Saves you can carry** | ☰ Menu → 📤 Export downloads a `.ironcrown` save file or copies a save code, gzip-compressed to about a seventh of the raw save (~35 KB); 📥 Import opens a file or a pasted code (older uncompressed codes too) in any browser. |
| **Fair raids** | Raids come roughly once an hour (sooner at war or with a big Main Hall). None are sent while the tab is in the background or you have been idle for 3 minutes; one that arrives while you are offline turns back, and your armies hold their ground during the catch-up. A kingdom that joins your alliance or signs a treaty calls off any army it already sent. |
| **Loads reliably** | A loading screen until the first frame is drawn. Time away (up to 8 h) is simulated a slice per frame behind a progress banner, with the map already on screen, instead of freezing the page first. A drawing error in one layer can't blank the map (each layer is isolated and the context is reset next frame), a GPU reset rebuilds every cached image, and a slow or absent save server can't hold up start-up. |

## Project layout

```
public/                 ← the game; GitHub Pages serves this folder
  index.html            HUD, map canvas, side panel, modals
  style.css
  js/                   classic scripts sharing one global scope (load order in index.html)
    data.js             constants & data tables (buildings, units, ships, research, generals…)
    util.js             RNG, noise, formatting, HexGrid (odd-r), A* pathfinding
    state.js            save format, settings, persistence, backend sync, calendar
    economy.js          kingdom hex land, obstacles, construction, production, bonuses
    military.js         unit/ship stats, training, shipbuilding, divisions, fleets, generals, boxes
    research.js         universities & technology
    world.js            world generation, features, territory, scouting
    sim.js              movement & orders, AI kingdoms/armies/fleets, pirates, raids, diplomacy, step()
    alliances.js
    battle.js           on-map land & naval battles: formations, stances, targets
    render-common.js    camera, organic coastlines, building art, particles
    gfx.js              graphics quality: procedural textures, hill-shading, low-poly mode
    render-city.js      buildings on the map (yours + procedural AI cities), villagers, effects
    render-world.js     world map, fog of war, minimap
    help.js             in-game help guide
    ui-panels.js        HUD & side-panel tabs
    ui-actions.js       modals, actions, map input (drag / keys / edge / pinch / wheel)
    main.js             game loop, boot, test hooks, dev cheats
server/server.py        optional backend (stdlib only): static files + /api/save + /api/leaderboard
tests/e2e.mjs           Playwright headless-browser suite (70 tests + screenshots)
.github/workflows/deploy.yml   CI: run tests → deploy public/ to GitHub Pages
deploy.sh               one-shot git init + gh repo create + Pages setup
```

## Run locally

```bash
npm install          # Playwright, for the tests only
npm run serve        # python3 server/server.py → http://127.0.0.1:8000 (with cloud saves)
# …or just open public/index.html in a browser
```

## Developer cheats (F12)

Open DevTools (F12) → Console and type `cheats.help()`. The commands include `cheats.god()`, `cheats.res(1e5)`,
`cheats.hall(6)`, `cheats.army(50)`, `cheats.ships(5)`, `cheats.researchAll()`, `cheats.generals()`,
`cheats.reveal()`, `cheats.time(600)`, `cheats.speed(5)`, `cheats.season(3)`, `cheats.raid()`, `cheats.pirates()`,
`cheats.peace()`, `cheats.war(kid)`, `cheats.seamen(100)` and `cheats.generals(2)`.

## Tests

```bash
npx playwright install chromium
npm test             # starts the Python server and drives the real UI headlessly
npm run test:live    # the same suite against the live GitHub Pages URL
```

The suite covers:

- the welcome screen and version label
- hex rendering
- camera drag, zoom and keyboard mode
- the help guide
- building, clearing obstacles and upgrading the hall
- research
- training and mustering a division with a general
- world marching, scouting and fog
- shipyard → ships → fleet → sailing and salvage
- ruins exploration
- a watched capital assault
- an AI raid march
- stale panel buttons being handled rather than thrown at
- encounter checks scaling with the map instead of with every pair of armies
- buildings drawn as blocks far out, from the sprite cache in the middle, live up close
- nothing off screen being drawn, however many armies exist
- a fully explored map no longer paying for fog, across reloads
- the tile cache covering the screen and staying inside its memory budget
- the performance governor stepping quality down under load and back up after
- armies forming up on their own hexes, with nobody standing in the sea
- the Main Hall granting no territory
- a ten-times-larger world with thirty kingdoms, and a save small enough to store
- fortifications more than ten times stronger
- guard duty: a division defending land connected to its post
- armies drawn soldier by soldier when zoomed in on High graphics
- settling a whole region at once, and pushing into unexplored land
- armies auto-engaging enemies inside their detection radius
- allied kingdoms' battles never being handed to you to command
- real map buildings fighting as themselves, and towers duelling towers
- diplomacy, mystery boxes and alliances
- AI growth, cheats, persistence, the Python API, mobile layout and a clean console
- start-up robustness: eight hours away loads the map at once and catches up behind it, a wrecked canvas recovers, a GPU reset rebuilds, a hung save server is ignored, the minimap after full exploration
- low-poly and drag-plus-keys defaults (and the one-time move of older stored settings), number-key tabs, gliding camera, in-place panel updates
- emoji every system can draw, compressed save files that export and import (and old codes), a server save that loads at start-up
- raids ten times rarer and paused while you are idle, none landing while offline, allies calling off their armies

## Deploy to GitHub Pages

```bash
./deploy.sh                      # or manually:
git init -b main && git add -A && git commit -m "Ironcrown"
gh repo create ironcrown --public --source=. --remote=origin --push
gh api -X POST repos/{owner}/ironcrown/pages -f build_type=workflow
```

After that, every push to `main` runs the Playwright tests and deploys `public/` if they pass.

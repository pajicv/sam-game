# SAM Battery Simulator — Game Design & Implementation Document

---

## Concept Summary

A browser-based strategic/tactical air defense simulator. The player operates a ground-based surface-to-air missile battery in two alternating modes: a **Map Mode** for repositioning and strategic planning, and a **Radar Mode** for engaging incoming threats. The core tension is the radar paradox — your radar must be on to fight, but emitting makes you a target.

**Setting:** Two fictional African nations — the Northern Coalition and the Southern Alliance — fight a proxy war equipped with Western, Russian, and Chinese hardware. No real flags, no real politics. The conflict is a vehicle for asymmetric hardware matchups. The player picks a side and fights a campaign of escalating engagements across a fictional theatre.

---

## Factions

### Northern Coalition
Equipped primarily with Russian and Chinese technology. Doctrine: mass, speed, saturation. More missiles per battery, faster reload, shorter range. Overwhelm rather than precision.

**SAM System: S-300 / HQ-9 hybrid**
- Small missiles (vs drones): 8
- Large missiles (vs aircraft): 8
- Total: 16 per deployment
- Radar range: 85% of baseline
- Reload speed: Fast (between waves)
- Radar signature: Heavy — emissions detected faster by enemy Hunter-capable aircraft
- Special ability — Salvo mode: fire 2 large missiles simultaneously at a single target. Increases intercept probability on fast movers.

### Southern Alliance
Equipped primarily with US and NATO technology. Doctrine: stealth, precision, electronic warfare. Fewer missiles, longer range, lower emissions.

**SAM System: Patriot PAC-3 / NASAMS**
- Small missiles (vs drones): 6
- Large missiles (vs aircraft): 4
- Total: 10 per deployment
- Radar range: 120% of baseline
- Reload speed: Slow (between waves)
- Radar signature: Light — 2 extra seconds before enemy Hunter launch threshold
- Special ability — IFF Uplink: identify one unknown blip's true aircraft type per wave without emitting radar at all. One use per wave. Particularly valuable for confirming stealth targets before committing a large missile.

Each side's strengths map directly to playstyle. Northern Coalition players spend missiles more freely but manage range carefully and must reposition faster. Southern Alliance players are conservative with shots, reach further, and use information advantage to classify stealth threats.

---

## Core Loop

```
FACTION SELECT → pick Northern Coalition or Southern Alliance
    ↓
CAMPAIGN MAP → select next mission, see theatre overview
    ↓
MISSION BRIEFING → threat intel, ingress hints, objectives
    ↓
MAP MODE → choose position on sector grid → commit
    ↓
RADAR MODE → engage threats → manage heat and emissions
    ↓
Reposition trigger (heat maxed / hunter inbound / wave end)
    ↓
MAP MODE → reposition → commit
    ↓
INTER-WAVE INTEL → next wave composition hint
    ↓
All waves complete → Mission result screen → next mission
```

---

## Game Modes

### Map Mode
- Full sector map visible, ~15×15 tile grid
- Player drags battery icon to choose position
- Terrain tradeoffs shown on hover
- Radar coverage circle previewed live as player moves
- Threat ingress arrows on map edge (from prior wave intel)
- Position Heat meter visible — drains while in map mode
- Resupply available at supply depot tiles
- Incoming Hunter missiles shown as blips closing on map edge
- Commit button → transition to Radar Mode

### Radar Mode
- Map dims to ~30% opacity, still spatially readable
- Radar scope overlaid at battery position — large circle, rotating sweep line
- Threats appear as blips, classified by size and blink rate
- HUD: missile count, radar emission state, heat bar, wave counter, faction ability status
- Player actions: click blip to fire, toggle radar ON/OFF, trigger emergency reposition
- Jammer aircraft: when airborne, scope shows noise bands and false blips instead of clean returns
- Hunter missiles: fast-closing blips on scope edge, also visible on dimmed map

---

## Core Mechanics

### Radar Emission
- Radar has two states: ON and OFF
- ON: see and engage threats. Heat builds. Hunter launch timer ticks.
- OFF: blind. Heat dissipates. Hunter loses lock after 4 seconds dark.
- Player toggles manually, or uses auto-blink (configurable pulse interval)
- Blink timing is the primary skill — emit long enough to track and fire, go dark before Hunter launches
- Northern Coalition: heavy radar signature, Hunter launches after 4s continuous emission
- Southern Alliance: light signature, Hunter launches after 6s continuous emission

### Threat Classification
Blips are read by size and blink rate only. No labels until classification confirmed. Player learns to read the scope.

| Blip appearance | Aircraft class |
|-----------------|----------------|
| Large, slow pulse | Strategic bomber — Drifter class |
| Medium, steady | Strike aircraft |
| Medium, no blink, small | Stealth strike — F-35 class |
| Tiny, very many | Drone swarm |
| Fast blink, rapid closure | Hunter missile inbound |
| Scope bloom + false blips | Jammer aircraft active |

Southern Alliance IFF Uplink: one confirmed ID per wave without emitting.

### Missile Inventory

Two separate pools, managed independently:

**Small missiles** — designed for drones and slow low-signature targets (Shahed-136, MQ-9, Wing Loong). Fast fly-out, limited warhead.

**Large missiles** — designed for aircraft (all Strike, Drifter, Jammer, Stealth classes). Longer range, heavier warhead, slower reload cycle.

**Misfire penalty — wrong type, reduced effectiveness:**
- Small missile vs aircraft: 40% intercept probability (vs 90% correct type). Missile may miss or fail to destroy.
- Large missile vs drone: guaranteed kill, but wastes a scarce large missile. Tactically punishing, not hard-blocked.

This creates the primary resource pressure: swarm waves drain small missiles, then the bomber wave arrives and you need large ones. Firing large missiles at drones out of panic is the classic mistake the game punishes.

**Resupply during Map Mode:**
- Supply depot tile: +4 small, +2 large
- Standard reposition: +2 small, +1 large

**Active missile selection:**
- Left-click blip: fires small missile
- Right-click blip: fires large missile
- HUD shows both pools clearly at all times
- Northern Coalition Salvo: fires 2 large missiles simultaneously at one target

### Position Heat
- Meter fills continuously in Radar Mode
- Fills faster: radar ON, open terrain
- Fills slower: radar OFF, forest/jungle/ruins
- At 100%: airstrike inbound, forced reposition
- Triggered early if a Hunter gets a confirmed track on your position

### Hunter Missiles
- Spawned by Hunter-capable aircraft when your radar has been ON beyond the threshold
- Homes on your emission source coordinates at the moment of lock
- Visible on both radar scope (fast blip) and dimmed map
- Loses lock and goes ballistic if radar stays OFF for 4+ seconds
- Core dilemma: go dark now and lose your intercept track, or finish the shot and run

### Jammer Aircraft
- Does not attack the battery directly
- While in range: radar scope shows horizontal noise bands, false blips injected
- Player cannot reliably classify other threats while jammer is active
- Priority target: shooting it down immediately restores clean scope
- EA-18G Growler (faces Northern Coalition players)
- Su-24MP Fencer-F / J-16D (faces Southern Alliance players)
- Appears in later waves and specific mission types

### Repositioning
- 3–5 second blind transition depending on distance moved
- Cannot fire during transition
- Slowed by difficult terrain (jungle, ruins)
- Northern Coalition: faster vehicle platform, -1 second on all repositions
- Southern Alliance: arrives at new position with partial radar picture fading in from prior sweep

---

## Aircraft Rosters

### Threats facing Northern Coalition players (Southern Alliance aircraft)

| Aircraft | Class | Radar Signature | Missile type needed | Special behavior |
|----------|-------|-----------------|---------------------|-----------------|
| F-16 Viper | Strike | Medium | Large | HARM-capable — launches Hunter if radar ON >4s |
| F/A-18 Hornet | Strike | Medium | Large | Standard fast mover, maneuvers on intercept |
| EA-18G Growler | Jammer | Large | Large | Blooms scope, injects false blips |
| F-35 Lightning II | Stealth Strike | Very small | Large | Near-invisible, classifiable only at short range |
| B-52 Stratofortress | Drifter | Massive | Large | Slow, high value, always escorted by F-16s |
| MQ-9 Reaper | Drone | Small | Small | Slow, persistent, often precedes strike wave |
| AGM-88 HARM | Hunter missile | Tiny | Small | Launched by F-16 or F/A-18 |

### Threats facing Southern Alliance players (Northern Coalition aircraft)

| Aircraft | Class | Radar Signature | Missile type needed | Special behavior |
|----------|-------|-----------------|---------------------|-----------------|
| Su-34 Fullback | Strike | Medium | Large | Low altitude ingress — reduces your effective radar range |
| MiG-29 Fulcrum | Strike | Medium | Large | High agility, harder to intercept mid-maneuver |
| MiG-31 Foxhound | Fast Mover | Medium | Large | Extremely high speed — very short engagement window |
| J-10 Vigorous Dragon | Strike | Medium | Large | Standard Chinese fast mover, similar to F-16 class |
| Tu-160 Blackjack | Drifter | Massive | Large | Highest value target, always escorted |
| Tu-95 Bear | Drifter | Massive | Large | Slower than Tu-160, carries cruise missiles |
| Su-24MP Fencer-F | Jammer | Large | Large | Russian EW aircraft, scope interference |
| J-16D | Jammer | Large | Large | Chinese EW variant, stronger bloom effect |
| Shahed-136 | Swarm | Tiny (×many) | Small | 10–30 units per wave, pure small-missile drain |
| Wing Loong II | Drone | Small | Small | Larger Chinese strike drone, carries munitions |
| Kh-31P | Hunter missile | Tiny | Small | Russian anti-radiation missile, launched by Su-34/MiG-29 |

---

## Terrain Types

| Tile | Radar Range | Heat Rate | Concealment | Movement speed |
|------|-------------|-----------|-------------|----------------|
| Open field | 100% | Fast | None | Fast |
| Savanna | 95% | Medium-fast | Low | Fast |
| Jungle / dense forest | 70% | Slow | High | Medium |
| Ridge / escarpment | 130% | Normal | Low | Slow |
| Ruins / urban | 85% | Medium | Medium | Slow |
| Supply depot | 90% | Normal | Low | Fast |
| Dry riverbed | 100% | Fast | None | Very fast |

Savanna and dry riverbed suit fast repositioning but offer no protection. Jungle provides the best concealment at significant range cost — the core terrain tradeoff of the game. Ridge is powerful early but becomes dangerous as Hunter pressure increases.

---

## Campaign Structure

Each faction has a campaign of 6 missions across a fictional theatre map. Missions escalate in threat type and terrain complexity.

### Northern Coalition Campaign — "Iron Curtain"
Defending against Southern Alliance (Western hardware).

| # | Mission | Location | Key threat | Core challenge |
|---|---------|----------|------------|----------------|
| 1 | First Contact | Open savanna | F-16 strikes | Learn blink timing |
| 2 | The Growler Problem | Jungle edge | EA-18G Growler | Operate with scope bloom |
| 3 | Ghost Track | Ridge line | F-35 stealth package | Classify near-invisible blips |
| 4 | HARM Alley | Ruins | F-16 HARM saturation | Constant Hunter pressure, reposition speed |
| 5 | Fortress Run | Supply corridor | B-52 + F-16 escort | Escort before bomber priority |
| 6 | Final Push | Mixed terrain | Full combined package | All mechanics simultaneously |

### Southern Alliance Campaign — "Desert Shield"
Defending against Northern Coalition (Russian/Chinese hardware).

| # | Mission | Location | Key threat | Core challenge |
|---|---------|----------|------------|----------------|
| 1 | Border Skirmish | Dry riverbed | MiG-29 strikes | Short engagement windows |
| 2 | The Bear Hunt | Open savanna | Tu-95 + Wing Loong drones | Inventory vs swarm before bomber |
| 3 | Low and Fast | Jungle ridge | Su-34 low altitude | Reduced radar range, tricky intercepts |
| 4 | Shahed Season | Supply depot | Shahed-136 mass wave | 30+ drones, pure resource management |
| 5 | Foxhound Sprint | Urban ruins | MiG-31 high speed | Minimal engagement window, reaction time |
| 6 | The Blackjack | Mixed theatre | Tu-160 + full escort | Highest value target, maximum escort threat |

---

## Visual Design

### Aesthetic
- Near-black background
- Monochrome green radar scope, phosphor glow via CSS drop-shadow
- Map: muted earth tones — savanna amber, jungle dark green, ruins grey, riverbed sandy
- Threat blips: simple geometric shapes, size and blink rate only
- Faction accent color: Northern Coalition in red-amber, Southern Alliance in blue-teal applied to HUD, battery icon, UI chrome
- UI: minimal, industrial, numeric readouts

### Map Mode Visuals
- 15×15 tile grid, Africa-inspired terrain palette
- Battery shown as faction-colored crosshair
- Radar coverage: semi-transparent green circle
- Ingress direction: dim orange arrows on map edges
- Heat bar: bottom of screen, red fill, drains visibly while in map mode

### Radar Mode Visuals
- Circular PPI scope, green sweep line
- Blips fade in as sweep passes them, fade out slowly (phosphor persistence)
- Jammer active: horizontal noise bands sweep across scope, false blips appear and disappear
- Stealth blips: very faint, appear only when sweep is very close
- Hunters: fast blink, rapid inward movement
- EMITTING / DARK state: large overlay text, top of scope

---

## HUD Layout

### Radar Mode
```
[NORTHERN COALITION]    SM: 6/8   LG: 5/8      SALVO: READY
Heat: ████████░░         Wave: 3 / 6            JAMMER: ACTIVE ⚠
[RADAR OFF]   [REPOSITION]          [SM ←]  [→ LG]  active selection
```

### Map Mode
```
Sector: GRID D3    Terrain: Jungle    Resupply: +4 SM  +2 LG available
Heat dissipating...
[COMMIT POSITION]                              IFF UPLINK: READY (Southern only)
```

---

## Wave Structure

Each mission runs 6 waves. Escalation pattern:

- Wave 1: Single threat class. Tutorial wave, learn the blip.
- Wave 2: Second class added. Missile management begins.
- Wave 3: Hunter-capable threat introduced. Blink timing critical.
- Wave 4: Jammer appears OR swarm wave. Scope clarity or inventory pressure.
- Wave 5: Stealth element added. Classification under uncertainty.
- Wave 6: Full combined package. All mechanics under pressure.

Mission success: protected asset survives all 6 waves. Asset HP shown as secondary bar. Threats that reach the asset deal damage.

---

## Scoring & Progression

- Score per wave: intercepts × efficiency multiplier (% missiles remaining)
- Asset damage penalty reduces final score
- Campaign score unlocks: harder terrain variants, electronic warfare mode (jammer from wave 1), night mode (reduced radar range overall)
- Completing both campaigns unlocks mirror challenges: same missions, opposite hardware roster

---

## Tech Stack

### Vanilla JS + Canvas (recommended)

Single HTML file, zero dependencies. GitHub Pages or Netlify deploy in seconds.

- Radar sweep: canvas rotation loop
- Map: 2D array → canvas or CSS grid render
- No build step, mobile browser compatible as-is

**Canvas layers:**
- Canvas 1: map (redrawn on state change only)
- Canvas 2: radar scope overlay (redrawn every animation frame)
- CSS stacks them

### File Structure
```
index.html              ← single entry point
js/
  game.js               ← game state, main loop, faction data
  map.js                ← terrain grid, tile rendering, positioning
  radar.js              ← scope render, blip system, jammer effect, phosphor fade
  threats.js            ← spawner, aircraft behaviors, Hunter AI, Jammer logic
  missiles.js           ← fire control, inventory, salvo mode
  campaign.js           ← mission sequences, wave configs per faction, briefing data
  ui.js                 ← HUD, mode transitions, faction theming
  audio.js              ← Web Audio API synth tones, no audio files needed
css/
  style.css             ← layout, phosphor glow, faction CSS color variables
```

---

## Implementation Plan

### Phase 1 — Foundation
1. HTML shell with two canvases (map + radar overlay)
2. Map tile renderer — 15×15 grid, terrain tiles with Africa palette
3. Radar scope renderer — circle, rotating sweep line, phosphor glow CSS
4. Mode switch — map dims to 30%, radar overlaid
5. Basic blip: spawn one dot at map edge, move inward on scope

**Milestone:** place battery, switch to radar, see a blip moving.

### Phase 2 — Core Combat Loop
6. Threat spawner — spawn from map edges, convert to radar blip positions
7. Missile fire — two pools (SM / LG), left-click fires small, right-click fires large, fly-out delay, intercept probability check (full if correct type, 40% if mismatched)
8. Radar ON/OFF toggle — blips only update while emitting
9. Hunter logic — radar ON beyond threshold spawns Hunter at edge
10. Hunter homing — closes on last known emission coordinates
11. Battery destruction check — Hunter reaches position, mission over

**Milestone:** core tension playable. Engage, go dark, evade Hunters.

### Phase 3 — Map Mode Depth
12. Position Heat meter — fills in radar mode, drains in map mode
13. Reposition flow — transition animation, blind period, new commit
14. Terrain effects — heat rate and radar range per tile type
15. Resupply logic — depot tiles grant +4 SM +2 LG, standard reposition +2 SM +1 LG, both pools tracked separately

**Milestone:** full two-mode loop. Repositioning is a real decision.

### Phase 4 — Factions & Aircraft
16. Faction select screen — Northern Coalition vs Southern Alliance
17. Faction data module — SAM stats, roster, UI theme colors
18. Aircraft type system — each type: signature size, blink rate, speed, special behavior flag
19. Jammer aircraft — scope bloom effect, false blip injection while airborne
20. Stealth aircraft — reduced blip size, short detection range only
21. Southern Alliance IFF Uplink ability implementation
22. Northern Coalition Salvo mode — fires 2 large missiles simultaneously at one target, consumes 2 LG inventory

**Milestone:** two factions feel mechanically distinct.

### Phase 5 — Full Threat Roster & Waves
23. Full threat roster per faction (7 types each, aircraft data objects)
24. Blip classification visuals — size and blink rate encodes type
25. Wave manager — escalation configs per mission, wave sequencer
26. Protected asset — HP bar, damage on breach, mission fail trigger
27. Mission end states — success/failure screen, score display

**Milestone:** complete playable mission, both factions.

### Phase 6 — Campaign
28. Campaign map screen — mission nodes on theatre overview
29. Both campaign sequences — Iron Curtain and Desert Shield wave configs
30. Inter-wave intel screen — next wave composition hint text
31. Mission briefing screen — objectives, terrain thumbnail, threat preview
32. Campaign score tracking and unlock flags

**Milestone:** full campaign flow, start to finish, both sides.

### Phase 7 — Polish
33. Sound design — Web Audio API synth tones: radar ping, missile launch, explosion, jammer tone, Hunter warning
34. Phosphor glow refinement — blip fade trails, sweep persistence
35. Screen shake on near-miss and on destruction
36. Tutorial overlay on mission 1 of each campaign
37. Mobile touch support — tap to fire, swipe to pan map
38. Faction-themed CSS variables applied consistently throughout

### Phase 8 — Optional Extensions
- Night mode: reduced radar range, harder classification
- Electronic warfare mode: jammer active from wave 1
- Mirror challenge campaigns: same missions, opposite roster
- Fog of war on map: ingress direction unknown until scope contact
- Local high score table per faction

---

## Key Design Risks

**Risk 1 — Blink becomes button mashing**
Optimal rapid toggling collapses tension. Fix: Hunter requires 4s minimum continuous lock. Blinks must be deliberate pauses.

**Risk 2 — Map mode breaks pacing**
Slow repositioning → players ignore it and tank hits. Fix: 5 second max reposition. The decision is *where*, not a drawn-out process.

**Risk 3 — Classification is too hard**
Blip differences must be read in 1–2 seconds. Fix: only two signals — size and blink rate. Stealth is just very small. Jammer is scope noise, not a blip type.

**Risk 4 — Running out of missiles isn't fun**
Zero inventory forces passive watching. Fix: always resupply before the final wave. Northern Coalition's 16-missile stock provides a deliberate buffer.

**Risk 5 — Factions feel like a reskin**
If stats differ but play feels identical, faction choice is cosmetic. Fix: Salvo and IFF Uplink are mechanically distinct moments that create different decision rhythms. Northern manages ammo; Southern manages information.

**Risk 6 — Dual missile pools feel like extra busywork**
If players just always right-click everything to be safe, the small missile pool becomes irrelevant. Fix: small missiles have noticeably faster fly-out time and tighter turn radius — they're genuinely better against drones, not just cheaper. And large missiles against a 20-drone Shahed wave run out visibly and painfully fast, making the lesson land naturally rather than through punishment text.

---

Validate core feel before building campaign:

- Single fixed position (no map mode)
- Radar scope only
- 3 threat types: Strike (F-16), Hunter (AGM-88), Jammer (EA-18G)
- Northern Coalition faction — SM: 8, LG: 8, Salvo available
- Radar ON/OFF toggle
- 3 waves, win/lose condition

Roughly 2–3 focused sessions in vanilla JS. Enough to know whether radar blink tension actually feels right before committing to full build.

---

*Document version 2.1 — April 2026*

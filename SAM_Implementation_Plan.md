# SAM Battery Simulator — Implementation Plan

**Version 1.0 — April 2026**
**Platform:** Browser (Vanilla JS + Canvas API)
**Dependencies:** Zero. All libraries are native browser APIs.

---

## 1. Technology Stack & Libraries

The entire game ships as a static site — no build step, no npm runtime dependencies, no framework. Every "library" is a browser-native API.

| API / Library | Role in Game | Module |
|---|---|---|
| **Canvas 2D API** | All rendering: map tiles, radar scope, blips, HUD overlays, missile trails, phosphor fade | `map.js`, `radar.js`, `ui.js` |
| **requestAnimationFrame** | Main game loop at ~60 FPS. Drives sweep, blip movement, missile flight, heat tick, hunter tracking | `game.js` |
| **Web Audio API** (`AudioContext`, `OscillatorNode`, `GainNode`, `BiquadFilterNode`) | Synthesized SFX — radar ping, missile launch, explosion, jammer tone, hunter warning. No audio files. | `audio.js` |
| **PointerEvent / TouchEvent** | Desktop (click, right-click) and mobile (tap, long-press) input. Map drag for repositioning. | `ui.js` |
| **CSS Custom Properties** | Faction theming — Northern Coalition red-amber vs Southern Alliance blue-teal. Hot-swapped at faction select. | `style.css` |
| **performance.now()** | High-resolution delta-time for frame-rate-independent physics. All movement and timers use `dt`, never frame count. | `game.js` |

### Why no external libraries?

Canvas 2D covers everything this game needs: rotated lines (radar sweep), arcs (scope circle), filled rectangles (map tiles), alpha compositing (phosphor glow), and pixel-level blip rendering. Phaser or PixiJS would add 300KB+ for features not used here (sprite sheets, tilemaps, built-in physics). Web Audio oscillator nodes produce all the military-aesthetic synth tones without loading a single WAV file.

---

## 2. Architecture & Module Map

Strict module separation. Each JS file owns one domain and exposes a minimal public interface. No global mutable state — a single `GameState` object is passed by reference through `update()` and `render()` calls.

### 2.1 File Structure

```
index.html             ← single entry point, two stacked <canvas> elements
js/
  game.js              ← GameState object, main loop, faction configs, mode FSM
  map.js               ← terrain grid, tile renderer, coverage preview, repositioning
  radar.js             ← PPI scope, sweep line, phosphor fade, blip rendering
  threats.js           ← aircraft spawner, movement AI, hunter homing, jammer logic
  missiles.js          ← fire control, inventory pools, fly-out simulation, intercept calc
  campaign.js          ← mission data, wave sequencer, briefing/intel screens
  ui.js                ← HUD renderer, mode transitions, input routing, faction theming
  audio.js             ← Web Audio synth: oscillators, envelopes, effect chains
css/
  style.css            ← layout, phosphor glow filters, faction CSS variables
```

### 2.2 Game State Object

A single plain object holds all mutable game state. Passed to every `update()` and `render()` function. Never mutated outside of update functions.

```js
const GameState = {
  mode: 'MAP' | 'RADAR' | 'TRANSITION' | 'BRIEFING' | 'RESULT',
  faction: 'NORTH' | 'SOUTH',

  battery: { gridX, gridY, worldX, worldY },

  radar: {
    on: bool,
    sweepAngle: float,    // current sweep position in radians
    emitTimer: float,     // seconds radar has been continuously ON
  },

  heat: { value: 0-100, rate: float },

  missiles: { small: int, large: int, smallMax: int, largeMax: int },

  threats: [{
    id, type, class, x, y, vx, vy, hp,
    classified: bool,
    blipSize: float,
    blinkRate: float,
    speed: float,
    heading: float,
    timeSinceSweep: float,
    special: string|null,  // 'hunter_capable', 'jammer', 'stealth', 'low_alt', etc.
  }],

  activeMissiles: [{
    x, y, vx, vy, targetId, type: 'SMALL'|'LARGE', timeAlive: float
  }],

  hunters: [{
    x, y, heading, targetX, targetY,
    lockActive: bool, lockTimer: float
  }],

  wave: { current: int, total: 6, spawnQueue: [], active: bool },
  asset: { hp: 100 },
  campaign: { missionIndex: int, score: int, unlocks: {} },

  falseBlips: [],          // jammer ghost blips
  dt: float,               // delta time in seconds
  time: float,             // total elapsed time
};
```

### 2.3 Main Loop

A single `requestAnimationFrame` loop drives everything. Delta time is clamped to 100ms to prevent physics explosions on tab-switch resume.

```js
let lastTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  state.dt = dt;
  state.time += dt;

  // UPDATE PHASE
  if (state.mode === 'RADAR') {
    updateRadarSweep(state);
    updateThreats(state);
    updateMissiles(state);
    updateHunters(state);
    updateHeat(state);
    checkWaveEnd(state);
  }

  // RENDER PHASE
  renderMap(mapCtx, state);              // redraws only if dirty flag set
  if (state.mode === 'RADAR') {
    renderRadar(radarCtx, state);        // redraws every frame
  }
  renderHUD(radarCtx, state);

  requestAnimationFrame(gameLoop);
}
```

### 2.4 Mode Finite State Machine

```
    FACTION_SELECT
         │
         ▼
    CAMPAIGN_MAP  ←──────────────────┐
         │                           │
         ▼                           │
     BRIEFING                        │
         │                           │
         ▼                           │
       MAP  ◄────────┐               │
         │           │               │
         ▼           │               │
      RADAR ─────► MAP (reposition)  │
         │                           │
         ▼                           │
  WAVE_COMPLETE ──► INTER_WAVE_INTEL │
         │              │            │
         │              ▼            │
         │            MAP ───► RADAR │
         │                           │
         ▼                           │
  MISSION_RESULT ────────────────────┘
```

Transitions are handled by a `setMode(newMode)` function that triggers entry/exit logic — for example, entering MAP mode starts heat drain, exiting RADAR mode stops the sweep timer.

---

## 3. Physics & Mathematics

All physics are 2D, frame-rate independent, and use real-time seconds as the time unit. Coordinate system: origin at map top-left, X right, Y down. All angles in radians, 0 = east, increasing counter-clockwise (standard math convention, compatible with `Math.atan2`).

### 3.1 Coordinate Systems

| System | Units | Usage | Conversion |
|---|---|---|---|
| **Grid** | Integer tile indices (0–14) | Map mode positioning, terrain lookup | `worldX = gridX * TILE_SIZE + TILE_SIZE / 2` |
| **World** | Pixels (float) | All entity positions, physics simulation | Base coordinate system |
| **Radar** | Pixels relative to battery | Blip rendering on scope | `radarX = worldX - battery.worldX` |
| **Screen** | Canvas pixels | Final render output | Viewport offset + camera transform |

### 3.2 Movement & Kinematics

All entities use velocity-based movement with delta-time integration. No acceleration model — aircraft move at constant speed once spawned, missiles reach max speed instantly (acceptable simplification for a tactical game).

```js
// Position update (every frame)
entity.x += entity.vx * dt;
entity.y += entity.vy * dt;

// Velocity from speed + heading angle
entity.vx = entity.speed * Math.cos(entity.heading);
entity.vy = entity.speed * Math.sin(entity.heading);

// Distance between two entities
const dx = target.x - source.x;
const dy = target.y - source.y;
const dist = Math.sqrt(dx * dx + dy * dy);   // faster than Math.hypot

// Angle from source to target
const angle = Math.atan2(dy, dx);
```

### 3.3 Radar Sweep Geometry

The radar is a PPI (Plan Position Indicator) scope — a top-down circular display with a rotating sweep line. One revolution every 3 seconds.

```js
const SWEEP_PERIOD = 3.0;                              // seconds per revolution
const SWEEP_SPEED  = (2 * Math.PI) / SWEEP_PERIOD;     // radians/sec

function updateRadarSweep(state) {
  if (!state.radar.on) return;
  state.radar.sweepAngle =
    (state.radar.sweepAngle + SWEEP_SPEED * state.dt) % (2 * Math.PI);
}

// Did the sweep line pass over a blip this frame?
function sweepPassedBlip(sweepAngle, prevAngle, blipAngle) {
  const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const s = norm(prevAngle);
  const e = norm(sweepAngle);
  const b = norm(blipAngle);
  if (s < e) return b >= s && b <= e;
  return b >= s || b <= e;        // wrapped past 2π
}
```

### 3.4 World-to-Radar Projection (Polar Coordinates)

Blips on the scope are positioned in polar coordinates relative to the battery, then converted back to cartesian for canvas rendering.

```js
function worldToRadar(entity, battery, scopeRadius, radarRange) {
  const dx    = entity.x - battery.worldX;
  const dy    = entity.y - battery.worldY;
  const dist  = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  // Scale world distance to scope pixel radius
  const r = (dist / radarRange) * scopeRadius;

  return {
    scopeX:  scopeCenterX + r * Math.cos(angle),
    scopeY:  scopeCenterY + r * Math.sin(angle),
    dist,
    angle,
    inRange: dist <= radarRange,
  };
}
```

### 3.5 Phosphor Persistence (Exponential Decay)

The classic radar glow where blips fade after the sweep passes. Each blip stores time since last sweep contact. Alpha decays with exponential half-life.

```js
const PHOSPHOR_HALF_LIFE = 2.0;                          // seconds to 50% fade
const DECAY_RATE = Math.LN2 / PHOSPHOR_HALF_LIFE;

function blipAlpha(timeSinceSweep) {
  return Math.exp(-DECAY_RATE * timeSinceSweep);
  // t=0 → 1.0,  t=2.0 → 0.5,  t=4.0 → 0.25
}
```

The rendering math: `ctx.globalAlpha = blipAlpha(blip.timeSinceSweep)` before drawing each blip circle, producing the phosphor trail naturally.

### 3.6 Missile Intercept Probability

When a fired missile reaches its target (`distance < INTERCEPT_RADIUS`), an intercept check runs. Probability depends on missile-target type match and target modifiers.

```js
function checkIntercept(missile, target) {
  let p;

  // Base probability by type match
  if (missile.type === 'SMALL' && target.class === 'DRONE')    p = 0.90;
  else if (missile.type === 'LARGE' && target.class !== 'DRONE') p = 0.90;
  else if (missile.type === 'SMALL' && target.class !== 'DRONE') p = 0.40;  // mismatch
  else if (missile.type === 'LARGE' && target.class === 'DRONE') p = 1.00;  // overkill

  // Target modifiers (multiplicative)
  if (target.maneuvering)  p *= 0.75;   // MiG-29, F/A-18 evasion
  if (target.stealth)      p *= 0.85;   // F-35 reduced RCS
  if (target.lowAltitude)  p *= 0.80;   // Su-34 terrain masking
  if (target.highSpeed)    p *= 0.70;   // MiG-31 Foxhound

  return Math.random() < p;
}
```

### 3.7 Hunter Missile Homing (Proportional Navigation)

Anti-radiation missiles (AGM-88 HARM, Kh-31P) home on the battery's last known emission coordinates. They use simplified proportional navigation: steer toward the target with clamped turn rate.

```js
const HUNTER_SPEED     = 400;     // pixels/sec (very fast)
const HUNTER_TURN_RATE = 1.5;     // radians/sec max steering
const LOCK_LOSS_TIME   = 4.0;     // seconds dark before lock is lost

function updateHunter(hunter, battery, radarOn, dt) {
  if (radarOn) {
    hunter.targetX    = battery.worldX;
    hunter.targetY    = battery.worldY;
    hunter.lockTimer  = 0;
    hunter.lockActive = true;
  } else {
    hunter.lockTimer += dt;
    if (hunter.lockTimer >= LOCK_LOSS_TIME) {
      hunter.lockActive = false;    // goes ballistic — flies straight
    }
  }

  if (hunter.lockActive) {
    const desired = Math.atan2(
      hunter.targetY - hunter.y,
      hunter.targetX - hunter.x
    );
    // Signed angle difference, normalized to [-π, π]
    let steer = desired - hunter.heading;
    steer = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;
    // Clamp turn rate
    steer = Math.max(-HUNTER_TURN_RATE * dt,
            Math.min( HUNTER_TURN_RATE * dt, steer));
    hunter.heading += steer;
  }

  hunter.x += HUNTER_SPEED * Math.cos(hunter.heading) * dt;
  hunter.y += HUNTER_SPEED * Math.sin(hunter.heading) * dt;
}
```

Key behavior: if the player cuts radar for 4+ seconds, the hunter goes ballistic — continues straight at its last heading, likely missing the battery. This is the core blink-timing mechanic.

### 3.8 Heat Accumulation

Heat is a linear accumulator with terrain-modified rates. Reaching 100 forces a reposition. Drains in Map mode.

```js
const HEAT_RATES = {
  //                  radar ON   radar OFF (still accumulates, just slower)
  'open':    { on: 5.0,  off: 2.0  },
  'savanna': { on: 4.0,  off: 1.5  },
  'jungle':  { on: 1.5,  off: 0.5  },
  'ridge':   { on: 3.5,  off: 1.5  },
  'ruins':   { on: 2.5,  off: 1.0  },
  'depot':   { on: 3.0,  off: 1.5  },
  'river':   { on: 5.0,  off: 2.0  },
};

const MAP_HEAT_DRAIN = -8.0;   // drains at 8 units/sec in map mode

function updateHeat(state) {
  const terrain = getTerrain(state.battery.gridX, state.battery.gridY);
  const rate    = state.radar.on ? HEAT_RATES[terrain].on
                                 : HEAT_RATES[terrain].off;

  if (state.mode === 'RADAR') {
    state.heat.value = Math.min(100, state.heat.value + rate * state.dt);
  } else if (state.mode === 'MAP') {
    state.heat.value = Math.max(0, state.heat.value + MAP_HEAT_DRAIN * state.dt);
  }

  if (state.heat.value >= 100) triggerForcedReposition(state);
}
```

### 3.9 Radar Emission Timer & Hunter Spawn

The core tension loop: radar ON builds an emission timer. When it crosses the faction threshold, a Hunter spawns from the edge.

```js
const EMISSION_THRESHOLD = {
  NORTH: 4.0,    // Heavy signature — hunter launches after 4s continuous emit
  SOUTH: 6.0,    // Light signature — 2 extra seconds grace
};

function updateEmission(state) {
  if (state.radar.on) {
    state.radar.emitTimer += state.dt;
    const threshold = EMISSION_THRESHOLD[state.faction];

    if (state.radar.emitTimer >= threshold) {
      spawnHunter(state);             // spawn from a random map edge
      state.radar.emitTimer = 0;      // reset timer (next one starts counting)
    }
  } else {
    // Going dark resets the emission timer (must be continuous)
    state.radar.emitTimer = 0;
  }
}
```

---

## 4. Rendering Pipeline

### 4.1 Canvas Layer Stack

Two HTML5 Canvas elements stacked via CSS `position: absolute`. The map canvas redraws only on state changes. The radar canvas redraws every frame.

```html
<div id="game-container" style="position: relative; width: 800px; height: 800px;">
  <canvas id="map-canvas"   style="position: absolute; z-index: 0;"></canvas>
  <canvas id="radar-canvas" style="position: absolute; z-index: 1;"></canvas>
</div>
```

| Layer | Canvas | Redraw Rate | Content |
|---|---|---|---|
| Bottom | `mapCanvas` | On state change | 15×15 terrain grid, battery icon, radar coverage circle, ingress arrows |
| Top | `radarCanvas` | Every frame (60fps) | PPI scope, sweep line, blips, phosphor trails, jammer noise, HUD text |

### 4.2 Radar Scope Rendering

```js
function renderRadar(ctx, state) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R  = Math.min(cx, cy) * 0.85;   // scope radius (85% of half-canvas)

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Scope background (dark circle)
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(0, 10, 0, 0.9)';
  ctx.fill();
  ctx.clip();                             // all subsequent draws clipped to circle

  // 2. Range rings (concentric circles at 25%, 50%, 75%)
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
  ctx.lineWidth = 1;
  for (const frac of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * frac, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // 3. Sweep line
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + R * Math.cos(state.radar.sweepAngle),
    cy + R * Math.sin(state.radar.sweepAngle)
  );
  ctx.stroke();

  // 4. Sweep "glow" trailing wedge (fades behind sweep line)
  const gradient = ctx.createConicGradient(state.radar.sweepAngle, cx, cy);
  gradient.addColorStop(0,    'rgba(0, 255, 0, 0.12)');
  gradient.addColorStop(0.08, 'rgba(0, 255, 0, 0.04)');
  gradient.addColorStop(0.15, 'rgba(0, 255, 0, 0.0)');
  gradient.addColorStop(1,    'rgba(0, 255, 0, 0.0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fill();

  // 5. Blips (phosphor persistence)
  for (const blip of state.threats) {
    const pos = worldToRadar(blip, state.battery, R, radarRange);
    if (!pos.inRange) continue;

    const alpha = blipAlpha(blip.timeSinceSweep);
    if (alpha < 0.05) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(pos.scopeX, pos.scopeY, blip.blipSize, 0, 2 * Math.PI);
    ctx.fill();

    // Blink effect (skip rendering on off-phase of blink)
    if (blip.blinkRate > 0) {
      const blinkPhase = Math.sin(state.time * blip.blinkRate * Math.PI * 2);
      if (blinkPhase < -0.3) continue;   // dark phase of blink cycle
    }
  }
  ctx.globalAlpha = 1.0;
}
```

### 4.3 Map Tile Rendering

```js
const TILE_SIZE = 48;   // pixels per tile
const GRID_SIZE = 15;

const TERRAIN_COLORS = {
  open:    '#C4A265',   // sandy tan
  savanna: '#A8B560',   // dusty green-yellow
  jungle:  '#2D5A27',   // deep green
  ridge:   '#8B7355',   // brown escarpment
  ruins:   '#6B6B6B',   // grey concrete
  depot:   '#4A7A5B',   // military green
  river:   '#C2B280',   // dry sandy
};

function renderMap(ctx, state) {
  if (!mapDirty) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const terrain = mapGrid[gy][gx];
      ctx.fillStyle = TERRAIN_COLORS[terrain];
      ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Tile border
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.strokeRect(gx * TILE_SIZE, gy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // Radar coverage preview (semi-transparent green circle)
  if (state.mode === 'MAP') {
    const range = getRadarRange(state);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(state.battery.worldX, state.battery.worldY, range, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // In radar mode: dim map to 30%
  if (state.mode === 'RADAR') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  mapDirty = false;
}
```

### 4.4 Phosphor Glow CSS

The green CRT glow is applied via CSS filter on the radar canvas — no per-pixel shader needed.

```css
#radar-canvas {
  filter: drop-shadow(0 0 4px #00ff00)
          drop-shadow(0 0 8px rgba(0, 255, 0, 0.3));
}

/* Faction color variables */
:root {
  --faction-primary: #D4A017;    /* Northern Coalition: amber */
  --faction-accent: #C0392B;     /* Northern Coalition: red */
  --faction-glow: rgba(212, 160, 23, 0.3);
}

:root[data-faction="south"] {
  --faction-primary: #2E86AB;    /* Southern Alliance: teal */
  --faction-accent: #1B4965;     /* Southern Alliance: navy */
  --faction-glow: rgba(46, 134, 171, 0.3);
}
```

---

## 5. Jammer Interference System

When a jammer aircraft (EA-18G Growler, Su-24MP, J-16D) is active within range, the radar scope degrades with two effects: horizontal noise bands and false blip injection.

### 5.1 Noise Band Rendering

```js
function renderJammerNoise(ctx, cx, cy, R, time) {
  const bandCount = 6;
  const bandWidth = 3 + Math.sin(time * 2.5) * 2;

  ctx.save();
  ctx.globalAlpha = 0.3 + Math.sin(time * 4) * 0.1;
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = bandWidth;

  for (let i = 0; i < bandCount; i++) {
    const baseY = cy - R + (2 * R * i / bandCount) + Math.sin(time * 3 + i) * 15;

    ctx.beginPath();
    for (let x = cx - R; x <= cx + R; x += 4) {
      const noiseY = baseY + (Math.random() - 0.5) * 8;
      if ((x - cx) ** 2 + (noiseY - cy) ** 2 <= R * R) {
        ctx.lineTo(x, noiseY);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
```

### 5.2 False Blip Injection

```js
function spawnFalseBlips(state) {
  const count = 3 + Math.floor(Math.random() * 4);   // 3–6 ghosts
  for (let i = 0; i < count; i++) {
    state.falseBlips.push({
      angle:     Math.random() * 2 * Math.PI,
      dist:      0.3 + Math.random() * 0.7,          // 30–100% of range
      lifetime:  1.5 + Math.random() * 2.0,
      blinkRate: 0.5 + Math.random() * 2.0,           // randomized — doesn't match any real type
      size:      2 + Math.random() * 4,
    });
  }
}
```

False blips are rendered identically to real blips but with randomized blink rates that don't match any known aircraft pattern. The player must either shoot down the jammer to clear the scope, or use the Southern Alliance IFF Uplink to confirm one target.

---

## 6. Audio System (Web Audio API)

All sounds are synthesized in real-time — no audio file loading, no CDN, no latency.

### 6.1 Synth Architecture

```js
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type = 'sine', volume = 0.3) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}
```

### 6.2 Sound Effect Recipes

| Effect | Synthesis Method |
|---|---|
| **Radar ping** | 1200Hz sine, 50ms, sharp attack/fast decay. Triggered each sweep revolution. |
| **Missile launch** | White noise burst (80ms) → 400Hz→200Hz frequency sweep (150ms). Sounds like a hiss-thump. |
| **Explosion** | Low-pass filtered white noise, 300ms, cutoff sweep from 2000Hz→200Hz. |
| **Hunter warning** | 800Hz square wave, pulsing at 4Hz (on 125ms, off 125ms). Loops until hunter destroyed or lock lost. |
| **Jammer tone** | 60Hz sawtooth + 120Hz sawtooth (harmonics). Constant drone while jammer active. Sounds like electrical interference. |
| **Blip classification confirm** | Two-tone chirp: 600Hz→900Hz sine, 80ms total. |
| **Salvo fire (Northern)** | Double missile-launch sound, 50ms apart. |
| **IFF Uplink (Southern)** | Digital chirp sequence: 1000, 1200, 1400Hz, 40ms each, triangle wave. |

---

## 7. Threat AI & Spawning

### 7.1 Spawn System

Threats spawn at map edges based on ingress direction arrows defined per wave. Spawn position is randomized along the relevant edge ±20% of edge length.

```js
function spawnThreat(type, edge, state) {
  const config   = AIRCRAFT_DATA[type];
  const mapSize  = GRID_SIZE * TILE_SIZE;
  const margin   = mapSize * 0.2;

  let x, y, heading;
  switch (edge) {
    case 'N': x = margin + Math.random() * (mapSize - 2*margin); y = 0;        heading = Math.PI/2;  break;
    case 'S': x = margin + Math.random() * (mapSize - 2*margin); y = mapSize;  heading = -Math.PI/2; break;
    case 'E': x = mapSize; y = margin + Math.random() * (mapSize - 2*margin);  heading = Math.PI;    break;
    case 'W': x = 0;       y = margin + Math.random() * (mapSize - 2*margin);  heading = 0;          break;
  }

  return {
    id:              nextId++,
    type:            config.type,
    class:           config.class,
    x, y, heading,
    vx:              config.speed * Math.cos(heading),
    vy:              config.speed * Math.sin(heading),
    speed:           config.speed,
    hp:              1,
    classified:      false,
    blipSize:        config.blipSize,
    blinkRate:       config.blinkRate,
    timeSinceSweep:  Infinity,
    special:         config.special,
    maneuvering:     config.maneuvering || false,
    stealth:         config.stealth || false,
    lowAltitude:     config.lowAltitude || false,
    highSpeed:       config.highSpeed || false,
  };
}
```

### 7.2 Aircraft Data Tables

```js
// Threats facing Northern Coalition (Southern Alliance aircraft)
const AIRCRAFT_NORTH = {
  'F-16':    { class:'STRIKE',  speed:120, blipSize:4, blinkRate:0,   special:'hunter_capable' },
  'F/A-18':  { class:'STRIKE',  speed:110, blipSize:4, blinkRate:0,   special:'hunter_capable', maneuvering:true },
  'EA-18G':  { class:'JAMMER',  speed: 80, blipSize:6, blinkRate:0,   special:'jammer' },
  'F-35':    { class:'STEALTH', speed:100, blipSize:1.5, blinkRate:0, special:null, stealth:true },
  'B-52':    { class:'DRIFTER', speed: 50, blipSize:8, blinkRate:0.3, special:null },
  'MQ-9':    { class:'DRONE',   speed: 40, blipSize:2, blinkRate:0,   special:null },
  'AGM-88':  { class:'HUNTER',  speed:400, blipSize:1.5, blinkRate:6, special:null },
};

// Threats facing Southern Alliance (Northern Coalition aircraft)
const AIRCRAFT_SOUTH = {
  'Su-34':     { class:'STRIKE',  speed:110, blipSize:4, blinkRate:0,   special:'hunter_capable', lowAltitude:true },
  'MiG-29':    { class:'STRIKE',  speed:130, blipSize:4, blinkRate:0,   special:'hunter_capable', maneuvering:true },
  'MiG-31':    { class:'FAST',    speed:200, blipSize:4, blinkRate:0,   special:null, highSpeed:true },
  'J-10':      { class:'STRIKE',  speed:120, blipSize:4, blinkRate:0,   special:'hunter_capable' },
  'Tu-160':    { class:'DRIFTER', speed: 60, blipSize:9, blinkRate:0.3, special:null },
  'Tu-95':     { class:'DRIFTER', speed: 45, blipSize:8, blinkRate:0.3, special:null },
  'Su-24MP':   { class:'JAMMER',  speed: 80, blipSize:6, blinkRate:0,   special:'jammer' },
  'J-16D':     { class:'JAMMER',  speed: 85, blipSize:6, blinkRate:0,   special:'jammer' },
  'Shahed-136':{ class:'DRONE',   speed: 30, blipSize:1.5, blinkRate:0, special:null },
  'WingLoong': { class:'DRONE',   speed: 35, blipSize:2, blinkRate:0,   special:null },
  'Kh-31P':    { class:'HUNTER',  speed:380, blipSize:1.5, blinkRate:6, special:null },
};
```

### 7.3 Threat Movement Toward Asset

Threats steer toward the protected asset position (center-ish of map). If not intercepted, they deal damage on arrival.

```js
function updateThreatMovement(threat, assetPos, dt) {
  // Steer toward asset
  const desired = Math.atan2(assetPos.y - threat.y, assetPos.x - threat.x);
  let steer     = desired - threat.heading;
  steer         = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;

  const turnRate = threat.maneuvering ? 2.0 : 0.8;  // rad/sec
  steer = clamp(steer, -turnRate * dt, turnRate * dt);
  threat.heading += steer;

  threat.vx = threat.speed * Math.cos(threat.heading);
  threat.vy = threat.speed * Math.sin(threat.heading);
  threat.x += threat.vx * dt;
  threat.y += threat.vy * dt;
}
```

---

## 8. Missile Fire Control

### 8.1 Input Mapping

| Input | Action |
|---|---|
| Left-click on blip | Fire small missile |
| Right-click on blip | Fire large missile |
| Long-press on mobile (>300ms) | Fire large missile |
| Short-tap on mobile | Fire small missile |

### 8.2 Missile Fly-Out

Missiles are not instant — they have a fly-out time creating a brief delay between fire and intercept.

```js
const MISSILE_SPEED = { SMALL: 300, LARGE: 250 };   // pixels/sec
const INTERCEPT_RADIUS = 15;                          // pixels — proximity fuse

function fireMissile(state, targetId, type) {
  if (type === 'SMALL' && state.missiles.small <= 0) return;
  if (type === 'LARGE' && state.missiles.large <= 0) return;

  const target = state.threats.find(t => t.id === targetId);
  if (!target) return;

  // Lead calculation: aim where target will be, not where it is
  const dx   = target.x - state.battery.worldX;
  const dy   = target.y - state.battery.worldY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const tof  = dist / MISSILE_SPEED[type];             // estimated time of flight

  const aimX = target.x + target.vx * tof;
  const aimY = target.y + target.vy * tof;
  const aimAngle = Math.atan2(aimY - state.battery.worldY,
                              aimX - state.battery.worldX);

  state.activeMissiles.push({
    x: state.battery.worldX,
    y: state.battery.worldY,
    vx: MISSILE_SPEED[type] * Math.cos(aimAngle),
    vy: MISSILE_SPEED[type] * Math.sin(aimAngle),
    targetId,
    type,
    timeAlive: 0,
  });

  if (type === 'SMALL') state.missiles.small--;
  else                   state.missiles.large--;

  playMissileLaunchSound();
}
```

### 8.3 Salvo Mode (Northern Coalition)

Fires 2 large missiles simultaneously at one target. Both missiles run independent intercept checks — dramatically increases kill probability against fast movers.

```js
function fireSalvo(state, targetId) {
  if (state.faction !== 'NORTH') return;
  if (state.missiles.large < 2) return;

  fireMissile(state, targetId, 'LARGE');
  fireMissile(state, targetId, 'LARGE');   // second missile, slight angle offset
  playSalvoSound();
}
```

### 8.4 IFF Uplink (Southern Alliance)

Instantly reveals one blip's true aircraft type without emitting radar. One use per wave. Critical for confirming stealth contacts before committing a large missile.

```js
function useIFFUplink(state, blipId) {
  if (state.faction !== 'SOUTH') return;
  if (state.iffUsedThisWave) return;

  const threat = state.threats.find(t => t.id === blipId);
  if (!threat) return;

  threat.classified = true;
  state.iffUsedThisWave = true;
  playIFFSound();
}
```

---

## 9. Wave Manager & Escalation

### 9.1 Wave Configuration Format

Each mission defines 6 waves. Each wave specifies spawn timing, composition, and ingress direction.

```js
const MISSION_1_WAVES = [
  {
    wave: 1,
    spawnDelay: 2.0,           // seconds between spawns
    threats: [
      { type: 'F-16', count: 2, edge: 'N' },
    ],
  },
  {
    wave: 2,
    spawnDelay: 1.5,
    threats: [
      { type: 'F-16', count: 2, edge: 'N' },
      { type: 'MQ-9', count: 4, edge: 'E' },
    ],
  },
  {
    wave: 3,
    spawnDelay: 1.5,
    threats: [
      { type: 'F-16',   count: 3, edge: 'N' },   // HARM-capable
      { type: 'F/A-18', count: 1, edge: 'W' },
    ],
  },
  // ... waves 4-6 escalate further
];
```

### 9.2 Wave State Machine

```
WAVE_IDLE → (start wave) → SPAWNING → (all spawned) → ACTIVE → (all threats resolved) → WAVE_COMPLETE
                                                                       │
                                                                       ▼
                                                            INTER_WAVE_INTEL → next wave
```

A wave ends when all threats in the spawn queue have been spawned AND all active threats are either destroyed or have exited the map (reached the asset or left the area).

---

## 10. Terrain System

### 10.1 Map Generation

Maps are hand-authored per mission as 15×15 arrays. Stored in `campaign.js`.

```js
const MISSION_1_MAP = [
  'SSSSOOOOOOOSSSS',
  'SSSSOOOOOOSSSSS',
  'JJJSSOOOORRRSS',
  'JJJJSSOOORRRRS',
  // ... 15 rows of 15 chars
];

const TILE_KEY = {
  'O': 'open', 'S': 'savanna', 'J': 'jungle',
  'R': 'ridge', 'U': 'ruins', 'D': 'depot', 'V': 'river',
};
```

### 10.2 Terrain Effect Lookup

```js
const TERRAIN_EFFECTS = {
  open:    { radarMod: 1.00, heatMod: 1.0,  moveMod: 1.0  },
  savanna: { radarMod: 0.95, heatMod: 0.85, moveMod: 1.0  },
  jungle:  { radarMod: 0.70, heatMod: 0.30, moveMod: 0.6  },
  ridge:   { radarMod: 1.30, heatMod: 0.80, moveMod: 0.5  },
  ruins:   { radarMod: 0.85, heatMod: 0.55, moveMod: 0.5  },
  depot:   { radarMod: 0.90, heatMod: 0.70, moveMod: 1.0  },
  river:   { radarMod: 1.00, heatMod: 1.0,  moveMod: 1.3  },
};

function getRadarRange(state) {
  const terrain   = getTerrain(state.battery.gridX, state.battery.gridY);
  const baseMod   = TERRAIN_EFFECTS[terrain].radarMod;
  const factionMod = state.faction === 'NORTH' ? 0.85 : 1.20;
  return BASE_RADAR_RANGE * baseMod * factionMod;
}
```

---

## 11. Input System

### 11.1 Click-to-Fire Target Selection

The player clicks on a blip to fire. The system finds the closest blip to the click point within a hit radius.

```js
const CLICK_HIT_RADIUS = 20;   // pixels tolerance for blip selection

function handleFireClick(clickX, clickY, button, state) {
  const missileType = (button === 2) ? 'LARGE' : 'SMALL';   // right-click = large

  let closest = null;
  let closestDist = Infinity;

  for (const threat of state.threats) {
    const pos = worldToRadar(threat, state.battery, scopeRadius, radarRange);
    if (!pos.inRange) continue;

    const dx = pos.scopeX - clickX;
    const dy = pos.scopeY - clickY;
    const d  = Math.sqrt(dx * dx + dy * dy);

    if (d < CLICK_HIT_RADIUS && d < closestDist) {
      closest     = threat;
      closestDist = d;
    }
  }

  if (closest) {
    fireMissile(state, closest.id, missileType);
  }
}
```

### 11.2 Mobile Touch Mapping

```js
let touchStartTime = 0;
const LONG_PRESS_MS = 300;

canvas.addEventListener('touchstart', e => {
  touchStartTime = performance.now();
});

canvas.addEventListener('touchend', e => {
  const duration = performance.now() - touchStartTime;
  const type = duration >= LONG_PRESS_MS ? 'LARGE' : 'SMALL';
  const touch = e.changedTouches[0];
  handleFireClick(touch.clientX, touch.clientY, type === 'LARGE' ? 2 : 0, state);
});
```

---

## 12. Scoring System

```js
function calculateWaveScore(state, interceptCount, missilesUsed) {
  const efficiency = 1 - (missilesUsed / (state.missiles.smallMax + state.missiles.largeMax));
  const baseScore  = interceptCount * 100;
  const multiplier = 1.0 + efficiency;   // 1.0x to 2.0x based on ammo conservation
  return Math.round(baseScore * multiplier);
}

function calculateMissionScore(waveScores, assetHP) {
  const total       = waveScores.reduce((a, b) => a + b, 0);
  const damagePen   = Math.max(0, 100 - assetHP) * 10;   // -10 per HP lost
  return Math.max(0, total - damagePen);
}
```

---

## 13. Implementation Phases & Milestones

### Phase 1 — Foundation (Sessions 1–2)

1. HTML shell with two stacked `<canvas>` elements
2. Map tile renderer — 15×15 grid with Africa palette
3. Radar scope renderer — circle, rotating sweep line, phosphor glow CSS
4. Mode switch — map dims to 30%, radar overlaid
5. Single blip: spawn one dot at map edge, move inward on scope

**Milestone:** Place battery, switch to radar, see a blip moving.

### Phase 2 — Core Combat (Sessions 3–4)

6. Threat spawner — spawn from map edges, world-to-radar coordinate conversion
7. Missile fire — two pools, left/right click, fly-out delay, intercept probability roll
8. Radar ON/OFF toggle — blips only update when emitting
9. Hunter spawn logic — emission timer, threshold per faction
10. Hunter homing — proportional navigation, lock-loss on dark
11. Battery destruction check — hunter reaches position → mission over

**Milestone:** Core tension playable. Engage, go dark, evade hunters.

### Phase 3 — Map Mode (Sessions 5–6)

12. Heat meter — fills in radar mode (terrain-dependent), drains in map mode
13. Reposition flow — transition animation, blind period, new commit
14. Terrain effects — heat rate and radar range per tile type
15. Resupply — depot tiles (+4 SM / +2 LG), standard reposition (+2 SM / +1 LG)

**Milestone:** Full two-mode loop. Repositioning is a real decision.

### Phase 4 — Factions & Aircraft (Sessions 7–8)

16. Faction select screen — Northern Coalition vs Southern Alliance
17. Faction data module — SAM stats, roster, UI theme colors (CSS variables)
18. Aircraft type system — each type as data object with signature, speed, behavior flags
19. Jammer aircraft — scope bloom + false blip injection
20. Stealth aircraft — reduced blip size, short detection range
21. IFF Uplink ability (Southern)
22. Salvo mode (Northern)

**Milestone:** Two factions feel mechanically distinct.

### Phase 5 — Full Roster & Waves (Sessions 9–10)

23. Full threat roster per faction (7–11 types each)
24. Blip classification visuals — size + blink rate encode type
25. Wave manager — escalation configs, wave sequencer, spawn queues
26. Protected asset — HP bar, damage on breach, mission fail
27. Mission end states — success/failure screen, score display

**Milestone:** Complete playable mission, both factions.

### Phase 6 — Campaign (Sessions 11–12)

28. Campaign map screen — mission nodes on theatre overview
29. Both campaign sequences — 6 missions each with wave configs
30. Inter-wave intel screen — next wave composition hints
31. Mission briefing screen — objectives, terrain thumbnail, threat preview
32. Campaign score tracking and unlock flags

**Milestone:** Full campaign flow, start to finish, both sides.

### Phase 7 — Polish (Sessions 13–14)

33. Web Audio synth tones — all effects from section 6
34. Phosphor glow refinement — trail persistence, sweep gradient
35. Screen shake on near-miss and destruction
36. Tutorial overlay on mission 1 of each campaign
37. Mobile touch support — tap/long-press fire, swipe map pan
38. Faction CSS variables applied consistently

### Phase 8 — Optional Extensions

- Night mode: reduced radar range, harder classification
- Electronic warfare mode: jammer active from wave 1
- Mirror campaigns: same missions, opposite roster
- Fog of war: ingress direction unknown until scope contact
- Local high score table per faction (localStorage)

---

## 14. Performance Considerations

| Concern | Mitigation |
|---|---|
| 60 FPS with 30+ blips | Avoid `Math.hypot` (slower than manual sqrt). Batch canvas draw calls. Skip blips with alpha < 0.05. |
| Map canvas thrashing | Only redraw on `mapDirty` flag (mode switch, reposition). Never in the 60fps loop. |
| GC pressure from allocations | Reuse threat/missile objects from a pool. Avoid per-frame array allocation. |
| Mobile performance | Reduce scope resolution on low-DPI devices. Simplify jammer noise (fewer bands). |
| Tab-switch physics explosion | `dt` clamped to 100ms max. Entities won't teleport. |
| Audio context restrictions | Create `AudioContext` on first user interaction (click/tap), not on page load. Complies with autoplay policy. |

---

## 15. Key Constants Reference

```js
// Radar
const BASE_RADAR_RANGE   = 350;       // pixels
const SWEEP_PERIOD       = 3.0;       // seconds per revolution
const PHOSPHOR_HALF_LIFE = 2.0;       // seconds

// Emission / Hunters
const EMISSION_THRESHOLD_NORTH = 4.0; // seconds continuous emit → hunter spawn
const EMISSION_THRESHOLD_SOUTH = 6.0;
const HUNTER_SPEED       = 400;       // pixels/sec
const HUNTER_TURN_RATE   = 1.5;       // rad/sec
const LOCK_LOSS_TIME     = 4.0;       // seconds dark → lock lost

// Missiles
const SMALL_MISSILE_SPEED = 300;      // pixels/sec
const LARGE_MISSILE_SPEED = 250;
const INTERCEPT_RADIUS    = 15;       // pixels

// Heat
const HEAT_MAX = 100;
const MAP_HEAT_DRAIN = -8.0;          // units/sec

// Grid
const TILE_SIZE = 48;
const GRID_SIZE = 15;

// Factions
const FACTION_MISSILES = {
  NORTH: { small: 8, large: 8 },      // 16 total
  SOUTH: { small: 6, large: 4 },      // 10 total
};

const RESUPPLY = {
  depot:    { small: 4, large: 2 },
  standard: { small: 2, large: 1 },
};
```

---

*End of Implementation Plan — SAM Battery Simulator v1.0*

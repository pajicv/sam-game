/* ── threats.js — aircraft spawner, movement AI, hunter homing ── */
'use strict';

const Threats = (() => {
  const HUNTER_SPEED      = 120;   // world units/sec (~Mach 3 HARM)
  const HUNTER_TURN_RATE  = 1.0;   // rad/sec
  const LOCK_LOSS_TIME    = 4.0;   // seconds dark before lock lost

  const ASSET_DAMAGE = { STRIKE:20, FAST:10, DRIFTER:35, DRONE:8, JAMMER:5, STEALTH:25 };
  const ASSET_POS = { x: 720, y: 720 }; // world center (WORLD_SIZE/2)

  let nextId = 1;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Spawning ──

  function spawnThreat(type, edge, state) {
    const faction = state.faction;
    const aircraftDB = Campaign.getAircraftData(faction);
    const config = aircraftDB[type];
    if (!config) { console.warn('Unknown aircraft:', type); return null; }

    const mapSize = MapModule.WORLD_SIZE;
    const margin  = mapSize * 0.05;
    // Spawn well beyond map edge so threats have travel time before entering radar range
    const offMap  = 400 + Math.random() * 300;

    let x, y, heading;
    switch (edge) {
      case 'N': x = margin + Math.random() * (mapSize - 2*margin); y = -offMap;        heading = Math.PI/2;       break;
      case 'S': x = margin + Math.random() * (mapSize - 2*margin); y = mapSize+offMap; heading = -Math.PI/2;      break;
      case 'E': x = mapSize+offMap; y = margin + Math.random() * (mapSize - 2*margin); heading = Math.PI;         break;
      case 'W': x = -offMap;       y = margin + Math.random() * (mapSize - 2*margin);  heading = 0;               break;
      default:  x = mapSize/2; y = -offMap; heading = Math.PI/2;
    }

    return {
      id:            nextId++,
      type,
      class:         config.class,
      x, y, heading,
      vx: config.speed * Math.cos(heading),
      vy: config.speed * Math.sin(heading),
      speed:         config.speed,
      hp:            1,
      classified:    false,
      blipSize:      config.blipSize,
      blinkRate:     config.blinkRate,
      timeSinceSweep: Infinity,
      special:       config.special || null,
      maneuvering:   config.maneuvering || false,
      stealth:       config.stealth     || false,
      lowAltitude:   config.lowAltitude || false,
      highSpeed:     config.highSpeed   || false,
      justSpawned:   true,
    };
  }

  function spawnHunterThreat(state) {
    const mapSize = MapModule.WORLD_SIZE;
    const edges   = ['N','S','E','W'];
    const edge    = edges[Math.floor(Math.random() * edges.length)];
    const margin  = mapSize * 0.1;

    let x, y, heading;
    switch (edge) {
      case 'N': x = margin + Math.random() * (mapSize - 2*margin); y = -20;        heading = Math.PI/2;  break;
      case 'S': x = margin + Math.random() * (mapSize - 2*margin); y = mapSize+20; heading = -Math.PI/2; break;
      case 'E': x = mapSize+20; y = margin + Math.random() * (mapSize - 2*margin); heading = Math.PI;    break;
      case 'W': x = -20;       y = margin + Math.random() * (mapSize - 2*margin);  heading = 0;          break;
    }

    const hunterType = state.faction === 'NORTH' ? 'AGM-88' : 'Kh-31P';
    const config     = Campaign.getAircraftData(state.faction)[hunterType];

    return {
      id:            nextId++,
      type:          hunterType,
      class:         'HUNTER',
      x, y, heading,
      vx: 0, vy: 0,
      speed:         HUNTER_SPEED,
      hp:            1,
      classified:    false,
      blipSize:      config ? config.blipSize : 1.5,
      blinkRate:     6,
      timeSinceSweep: Infinity,
      special:       null,
      lockActive:    true,
      lockTimer:     0,
      targetX:       state.battery.worldX,
      targetY:       state.battery.worldY,
    };
  }

  // ── Update: threat movement ──

  function updateThreats(state) {
    const dt = state.dt;
    const assetPos = ASSET_POS;
    const mapSize  = MapModule.WORLD_SIZE;
    const toRemove = [];

    for (const t of state.threats) {
      if (t.class === 'HUNTER') {
        _updateHunter(t, state);
        // Check battery hit
        const dx = t.x - state.battery.worldX;
        const dy = t.y - state.battery.worldY;
        if (Math.sqrt(dx*dx + dy*dy) < 20) {
          // Battery destroyed
          state.batteryDestroyed = true;
          toRemove.push(t.id);
          Audio.playBatteryDestroyed();
        }
        continue;
      }

      // Move toward asset
      const desired = Math.atan2(assetPos.y - t.y, assetPos.x - t.x);
      let steer     = desired - t.heading;
      steer         = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;
      const turnRate = t.maneuvering ? 2.0 : 0.8;
      steer = clamp(steer, -turnRate * dt, turnRate * dt);
      t.heading += steer;

      t.vx = t.speed * Math.cos(t.heading);
      t.vy = t.speed * Math.sin(t.heading);
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.justSpawned = false;

      // Check asset reach
      const dx = t.x - assetPos.x;
      const dy = t.y - assetPos.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        const dmg = ASSET_DAMAGE[t.class] || 10;
        state.asset.hp = Math.max(0, state.asset.hp - dmg);
        toRemove.push(t.id);
        Audio.playAssetHit();
        continue;
      }

      // Check exit (off map entirely — generous margin for spawn distance)
      if (t.x < -900 || t.x > mapSize + 900 || t.y < -900 || t.y > mapSize + 900) {
        toRemove.push(t.id);
      }
    }

    state.threats = state.threats.filter(t => !toRemove.includes(t.id));
  }

  function _updateHunter(hunter, state) {
    const dt = state.dt;
    // Hunter homes on targeting radar emission only
    if (state.radar.targeting.on) {
      hunter.targetX    = state.battery.worldX;
      hunter.targetY    = state.battery.worldY;
      hunter.lockTimer  = 0;
      hunter.lockActive = true;
    } else {
      hunter.lockTimer += dt;
      if (hunter.lockTimer >= LOCK_LOSS_TIME) {
        hunter.lockActive = false;
      }
    }

    if (hunter.lockActive) {
      const desired = Math.atan2(hunter.targetY - hunter.y, hunter.targetX - hunter.x);
      let steer     = desired - hunter.heading;
      steer         = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;
      steer         = clamp(steer, -HUNTER_TURN_RATE * dt, HUNTER_TURN_RATE * dt);
      hunter.heading += steer;
    }

    hunter.x += HUNTER_SPEED * Math.cos(hunter.heading) * dt;
    hunter.y += HUNTER_SPEED * Math.sin(hunter.heading) * dt;
    hunter.timeSinceSweep += dt;

    // Off-map removal (miss)
    const mapSize = MapModule.WORLD_SIZE;
    if (hunter.x < -200 || hunter.x > mapSize + 200 || hunter.y < -200 || hunter.y > mapSize + 200) {
      hunter._removeMe = true;
    }
  }

  // ── Update: emission timer & hunter spawning ──

  function updateEmission(state) {
    if (state.mode !== 'RADAR') return;
    const threshold = state.faction === 'NORTH' ? 12.0 : 15.0;

    if (state.radar.targeting.on) {
      state.radar.targeting.emitTimer += state.dt;
      if (state.radar.targeting.emitTimer >= threshold) {
        _spawnHunterFromEmission(state);
        state.radar.targeting.emitTimer = 0;
      }
    } else {
      state.radar.targeting.emitTimer = 0;
    }
  }

  function _spawnHunterFromEmission(state) {
    // Only spawn if there's a hunter_capable threat in radar range
    const radarRange = MapModule.getRadarRange(state);
    const hasCapable = state.threats.some(t => {
      if (t.special !== 'hunter_capable') return false;
      const dx = t.x - state.battery.worldX;
      const dy = t.y - state.battery.worldY;
      return Math.sqrt(dx*dx + dy*dy) <= radarRange * 1.5;
    });
    if (!hasCapable && state.threats.filter(t => t.class === 'STRIKE' || t.class === 'FAST').length === 0) return;

    const hunter = spawnHunterThreat(state);
    state.threats.push(hunter);
    Audio.startHunterWarning();
  }

  // ── Wave management ──

  function updateWave(state) {
    if (!state.wave.active) return;

    // Process spawn queue
    if (state.wave.spawnQueue.length > 0) {
      state.wave.spawnTimer = (state.wave.spawnTimer || 0) + state.dt;
      const delay = state.wave.spawnDelay || 2.0;

      if (state.wave.spawnTimer >= delay) {
        state.wave.spawnTimer = 0;
        const entry = state.wave.spawnQueue.shift();
        const threat = spawnThreat(entry.type, entry.edge, state);
        if (threat) state.threats.push(threat);
      }
    }

    // Wave ends when queue is empty AND all non-hunter threats are gone
    const activeCombat = state.threats.filter(t => t.class !== 'HUNTER');
    if (state.wave.spawnQueue.length === 0 && activeCombat.length === 0 && state.wave.active) {
      state.wave.active = false;
      _onWaveComplete(state);
    }
  }

  function startWave(state) {
    const missions = Campaign.getMissions(state.faction);
    const mission  = missions[state.campaign.missionIndex];
    if (!mission) return;

    const waveIndex = state.wave.current;
    const waveDef   = mission.waves[waveIndex];
    if (!waveDef) return;

    // Clear old threats (not hunters)
    state.threats = state.threats.filter(t => t.class === 'HUNTER');

    // Build spawn queue
    state.wave.spawnQueue = [];
    for (const entry of waveDef.threats) {
      for (let i = 0; i < entry.count; i++) {
        state.wave.spawnQueue.push({ type: entry.type, edge: entry.edge });
      }
    }
    state.wave.spawnDelay = waveDef.spawnDelay;
    state.wave.spawnTimer = 0;
    state.wave.active     = true;
    state.iffUsedThisWave = false;

    // Resupply between waves
    if (waveIndex > 0) _resupply(state, 'standard');
  }

  function _resupply(state, type) {
    const amounts = type === 'depot'
      ? { small: 4, large: 2 }
      : { small: 2, large: 1 };
    state.missiles.small = Math.min(state.missiles.smallMax, state.missiles.small + amounts.small);
    state.missiles.large = Math.min(state.missiles.largeMax, state.missiles.large + amounts.large);
  }

  function resupplyDepot(state) { _resupply(state, 'depot'); }

  function _onWaveComplete(state) {
    // Remove dead hunters
    state.threats = state.threats.filter(t => !t._removeMe);

    // Score this wave
    const ws = state.wave.currentWaveScore || 0;
    state.campaign.waveScores.push(ws);
    state.campaign.score += ws;

    // Check if mission is over
    if (state.wave.current + 1 >= state.wave.total) {
      // Mission complete
      state.missionComplete = true;
    } else {
      state.waveJustCompleted = true;
    }
  }

  function cleanupRemoved(state) {
    const hunters = state.threats.filter(t => t.class === 'HUNTER');
    const hadHunters = hunters.length > 0;
    state.threats = state.threats.filter(t => !t._removeMe);
    const stillHasHunters = state.threats.some(t => t.class === 'HUNTER');
    if (hadHunters && !stillHasHunters) {
      Audio.stopHunterWarning();
    }
  }

  // ── Jammer false blips ──

  function updateJammer(state) {
    if (state.mode !== 'RADAR' || !state.radar.targeting.on) {
      Audio.stopJammerTone();
      state.jammerSpawnTimer = 0;
      return;
    }
    const radarRange = MapModule.getRadarRange(state);
    const jammers = state.threats.filter(t => t.special === 'jammer');
    const activeJammer = jammers.find(j => {
      const dx = j.x - state.battery.worldX;
      const dy = j.y - state.battery.worldY;
      return Math.sqrt(dx*dx + dy*dy) <= radarRange;
    });

    if (activeJammer) {
      Audio.startJammerTone();
      // Periodically inject false blips
      state.jammerSpawnTimer = (state.jammerSpawnTimer || 0) + state.dt;
      if (state.jammerSpawnTimer > 1.5) {
        state.jammerSpawnTimer = 0;
        const count = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < count; i++) {
          state.falseBlips.push({
            angle:        Math.random() * 2 * Math.PI,
            dist:         0.3 + Math.random() * 0.7,
            lifetime:     1.5 + Math.random() * 2.0,
            blinkRate:    0.5 + Math.random() * 2.0,
            size:         2 + Math.random() * 4,
            timeSinceSweep: Infinity,
          });
        }
      }
    } else {
      Audio.stopJammerTone();
      state.jammerSpawnTimer = 0;
    }
  }

  return {
    spawnThreat, updateThreats, updateEmission,
    updateWave, startWave, cleanupRemoved,
    updateJammer, resupplyDepot,
    ASSET_POS,
  };
})();

/* ── yu-threats.js — NATO threats, F-117 stealth, B-52 cruise launch, 10s emission ── */
'use strict';

const Threats = (() => {
  const HUNTER_SPEED      = 120;
  const HUNTER_TURN_RATE  = 1.0;
  const LOCK_LOSS_TIME    = 4.0;
  const EMISSION_THRESHOLD = 10.0; // S-125 targeting radar detectable after 10s continuous emission

  const ASSET_DAMAGE = {
    STRIKE:20, FAST:10, DRIFTER:35, DRONE:8, JAMMER:5,
    STEALTH:25, CRUISE:15,
  };
  // F-117A does 30 HP asset damage (overrides STEALTH default)
  const STEALTH_DAMAGE_OVERRIDE = {
    'F-117A': 30,
    'B-2A':   35,
  };

  const ASSET_POS = { x: 720, y: 720 };
  const CRUISE_LAUNCH_RANGE = 600; // B-52 launches BGM-109 at this distance from asset

  let nextId = 1;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Spawning ──

  function spawnThreat(type, edge, state) {
    const aircraftDB = Campaign.getAircraftData();
    const config = aircraftDB[type];
    if (!config) { console.warn('Unknown aircraft:', type); return null; }

    const mapSize = MapModule.WORLD_SIZE;
    const margin  = mapSize * 0.05;
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
      hp:            config.hp || 1,
      classified:    false,
      blipSize:      config.blipSize,
      blinkRate:     config.blinkRate,
      timeSinceSweep: Infinity,
      timeSinceSurvSweep: Infinity,
      special:       config.special || null,
      maneuvering:   config.maneuvering || false,
      stealth:       config.stealth     || false,
      stealthProfile: config.stealthProfile || null,
      lowAltitude:   config.lowAltitude || false,
      highSpeed:     config.highSpeed   || false,
      justSpawned:   true,
      cruiseLaunched: false, // B-52 cruise missile launch flag
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

    const config = Campaign.getAircraftData()['AGM-88'];

    return {
      id:            nextId++,
      type:          'AGM-88',
      class:         'HUNTER',
      x, y, heading,
      vx: 0, vy: 0,
      speed:         HUNTER_SPEED,
      hp:            1,
      classified:    false,
      blipSize:      config ? config.blipSize : 1.5,
      blinkRate:     6,
      timeSinceSweep: Infinity,
      timeSinceSurvSweep: Infinity,
      special:       null,
      lockActive:    true,
      lockTimer:     0,
      targetX:       state.battery.worldX,
      targetY:       state.battery.worldY,
    };
  }

  // Spawn BGM-109 cruise missiles from B-52H position
  function _spawnCruiseMissiles(bomber, state, count) {
    const aircraftDB = Campaign.getAircraftData();
    const config = aircraftDB['BGM-109'];
    if (!config) return;

    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.3;
      const heading = Math.atan2(ASSET_POS.y - bomber.y, ASSET_POS.x - bomber.x) + spread;
      state.threats.push({
        id:            nextId++,
        type:          'BGM-109',
        class:         config.class,
        x: bomber.x + (Math.random() - 0.5) * 40,
        y: bomber.y + (Math.random() - 0.5) * 40,
        heading,
        vx: config.speed * Math.cos(heading),
        vy: config.speed * Math.sin(heading),
        speed:         config.speed,
        hp:            1,
        classified:    false,
        blipSize:      config.blipSize,
        blinkRate:     config.blinkRate,
        timeSinceSweep: Infinity,
        timeSinceSurvSweep: Infinity,
        special:       null,
        maneuvering:   false,
        stealth:       false,
        stealthProfile: null,
        lowAltitude:   true,
        highSpeed:     false,
        justSpawned:   false,
        cruiseLaunched: false,
      });
    }
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
        const dx = t.x - state.battery.worldX;
        const dy = t.y - state.battery.worldY;
        if (Math.sqrt(dx*dx + dy*dy) < 20) {
          state.batteryDestroyed = true;
          toRemove.push(t.id);
          Audio.playBatteryDestroyed();
        }
        continue;
      }

      // B-52H cruise missile launch
      if (t.special === 'cruise_launcher' && !t.cruiseLaunched) {
        const dx = t.x - assetPos.x;
        const dy = t.y - assetPos.y;
        if (Math.sqrt(dx*dx + dy*dy) <= CRUISE_LAUNCH_RANGE) {
          t.cruiseLaunched = true;
          const count = 2 + Math.floor(Math.random() * 2); // 2-3 cruise missiles
          _spawnCruiseMissiles(t, state, count);
          // B-52 turns away after launch
          t.heading = Math.atan2(t.y - assetPos.y, t.x - assetPos.x);
          t.vx = t.speed * Math.cos(t.heading);
          t.vy = t.speed * Math.sin(t.heading);
        }
      }

      // Move toward asset (or away if B-52 has launched)
      if (t.cruiseLaunched) {
        // Continue on current heading (retreating)
        t.x += t.vx * dt;
        t.y += t.vy * dt;
      } else {
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
      }
      t.justSpawned = false;

      // Asset reach check
      const dx = t.x - assetPos.x;
      const dy = t.y - assetPos.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        let dmg = ASSET_DAMAGE[t.class] || 10;
        // Override for specific stealth types
        if (STEALTH_DAMAGE_OVERRIDE[t.type]) {
          dmg = STEALTH_DAMAGE_OVERRIDE[t.type];
        }
        state.asset.hp = Math.max(0, state.asset.hp - dmg);
        toRemove.push(t.id);
        Audio.playAssetHit();
        continue;
      }

      // Off-map removal
      if (t.x < -900 || t.x > mapSize + 900 || t.y < -900 || t.y > mapSize + 900) {
        toRemove.push(t.id);
      }
    }

    state.threats = state.threats.filter(t => !toRemove.includes(t.id));
  }

  function _updateHunter(hunter, state) {
    const dt = state.dt;
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

    const mapSize = MapModule.WORLD_SIZE;
    if (hunter.x < -200 || hunter.x > mapSize + 200 || hunter.y < -200 || hunter.y > mapSize + 200) {
      hunter._removeMe = true;
    }
  }

  // ── Update: emission timer & hunter spawning (2s threshold!) ──

  function updateEmission(state) {
    if (state.mode !== 'RADAR') return;

    if (state.radar.targeting.on) {
      state.radar.targeting.emitTimer += state.dt;
      if (state.radar.targeting.emitTimer >= EMISSION_THRESHOLD) {
        _spawnHunterFromEmission(state);
        state.radar.targeting.emitTimer = 0;
      }
    } else {
      state.radar.targeting.emitTimer = 0;
    }
  }

  function _spawnHunterFromEmission(state) {
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

    const activeCombat = state.threats.filter(t => t.class !== 'HUNTER');
    if (state.wave.spawnQueue.length === 0 && activeCombat.length === 0 && state.wave.active) {
      state.wave.active = false;
      _onWaveComplete(state);
    }
  }

  function startWave(state) {
    const missions = Campaign.getMissions();
    const mission  = missions[state.campaign.missionIndex];
    if (!mission) return;

    const waveIndex = state.wave.current;
    const waveDef   = mission.waves[waveIndex];
    if (!waveDef) return;

    state.threats = state.threats.filter(t => t.class === 'HUNTER');

    state.wave.spawnQueue = [];
    for (const entry of waveDef.threats) {
      for (let i = 0; i < entry.count; i++) {
        state.wave.spawnQueue.push({ type: entry.type, edge: entry.edge });
      }
    }
    state.wave.spawnDelay = waveDef.spawnDelay;
    state.wave.spawnTimer = 0;
    state.wave.active     = true;
    state.opticalTrack.usedThisWave = false;

    if (waveIndex > 0) _resupply(state, 'standard');
  }

  function _resupply(state, type) {
    const amounts = type === 'depot'
      ? { small: 2, large: 1 }  // Reduced depot resupply for Yugoslavia
      : { small: 1, large: 1 }; // Standard: +1SM +1LG (less than other factions)
    state.missiles.small = Math.min(state.missiles.smallMax, state.missiles.small + amounts.small);
    state.missiles.large = Math.min(state.missiles.largeMax, state.missiles.large + amounts.large);
  }

  function resupplyDepot(state) { _resupply(state, 'depot'); }

  function _onWaveComplete(state) {
    state.threats = state.threats.filter(t => !t._removeMe);

    const ws = state.wave.currentWaveScore || 0;
    state.campaign.waveScores.push(ws);
    state.campaign.score += ws;

    if (state.wave.current + 1 >= state.wave.total) {
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
      state.jammerSpawnTimer = (state.jammerSpawnTimer || 0) + state.dt;
      // S-125 is more resistant to ECM — slower false blip rate, fewer blips
      if (state.jammerSpawnTimer > 2.5) {
        state.jammerSpawnTimer = 0;
        const count = 2 + Math.floor(Math.random() * 3);
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

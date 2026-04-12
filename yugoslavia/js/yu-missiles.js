/* ── yu-missiles.js — S-125 fire control, 0.8x speed, TV camera track ── */
'use strict';

const Missiles = (() => {
  // 0.8× missile speed for older S-125 propulsion
  const MISSILE_SPEED    = { SMALL: 72, LARGE: 60 };
  const INTERCEPT_RADIUS = 18;
  const MAX_FLIGHT_TIME  = 25;

  // TV camera guidance (late-model SNR-125): 50% hit chance, 25km range, no radar emission
  const TV_TRACK_HIT_PROB = 0.50;
  const TV_TRACK_RANGE    = 1200; // ~25km in world units (WORLD_SIZE=1440 covers ~30km)

  // F-117A intercept score bonus
  const STEALTH_SCORE_BONUS = {
    'F-117A': 300,
    'B-2A':   200,
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Standard fire control ──

  function fireMissile(state, targetId, type, angleOffset = 0) {
    if (type === 'SMALL' && state.missiles.small <= 0) return false;
    if (type === 'LARGE' && state.missiles.large <= 0) return false;

    const target = state.threats.find(t => t.id === targetId);
    if (!target) return false;

    const spd = MISSILE_SPEED[type];
    const dx  = target.x - state.battery.worldX;
    const dy  = target.y - state.battery.worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const tof  = dist / spd;

    const aimX  = target.x + target.vx * tof;
    const aimY  = target.y + target.vy * tof;
    const base  = Math.atan2(aimY - state.battery.worldY, aimX - state.battery.worldX);
    const angle = base + angleOffset;

    state.activeMissiles.push({
      x:         state.battery.worldX,
      y:         state.battery.worldY,
      vx:        spd * Math.cos(angle),
      vy:        spd * Math.sin(angle),
      targetId,
      type,
      timeAlive: 0,
      isOptical: false,
    });

    if (type === 'SMALL') state.missiles.small--;
    else                   state.missiles.large--;

    Audio.playMissileLaunch();
    state.campaign.totalMissiles = (state.campaign.totalMissiles || 0) + 1;
    return true;
  }

  // ── TV Camera Track — fire with optronic guidance, no radar emission (25km range) ──
  function fireOpticalTrack(state, targetId) {
    if (!state.opticalTrack || state.opticalTrack.usedThisWave) return false;
    if (state.missiles.small <= 0) return false;

    const target = state.threats.find(t => t.id === targetId);
    if (!target) return false;

    // Range check: TV camera effective to 25km
    const dx = target.x - state.battery.worldX;
    const dy = target.y - state.battery.worldY;
    if (Math.sqrt(dx*dx + dy*dy) > TV_TRACK_RANGE) return false;

    const spd = MISSILE_SPEED.SMALL;
    // TV track fires with lead calculation (better than pure optical)
    const dist = Math.sqrt(dx*dx + dy*dy);
    const tof = dist / spd;
    const aimX = target.x + target.vx * tof * 0.6; // partial lead (TV guidance)
    const aimY = target.y + target.vy * tof * 0.6;
    const angle = Math.atan2(aimY - state.battery.worldY, aimX - state.battery.worldX);

    state.activeMissiles.push({
      x:         state.battery.worldX,
      y:         state.battery.worldY,
      vx:        spd * Math.cos(angle),
      vy:        spd * Math.sin(angle),
      targetId,
      type:      'SMALL',
      timeAlive: 0,
      isOptical: true,
    });

    state.missiles.small--;
    state.opticalTrack.usedThisWave = true;
    state.campaign.totalMissiles = (state.campaign.totalMissiles || 0) + 1;

    Audio.playOpticalTrack();
    return true;
  }

  // ── Intercept probability ──

  function checkIntercept(missile, target) {
    // TV camera track: higher hit probability than old optical, but still flat
    if (missile.isOptical) {
      return Math.random() < TV_TRACK_HIT_PROB;
    }

    let p;
    const mc = missile.type;
    const tc = target.class;

    if      (mc === 'SMALL' && tc === 'DRONE')   p = 0.90;
    else if (mc === 'LARGE' && tc !== 'DRONE')   p = 0.90;
    else if (mc === 'SMALL' && tc !== 'DRONE')   p = 0.40;
    else if (mc === 'LARGE' && tc === 'DRONE')   p = 1.00;
    else                                          p = 0.50;

    if (target.maneuvering)  p *= 0.75;
    if (target.stealth)      p *= 0.85;
    if (target.lowAltitude)  p *= 0.80;
    if (target.highSpeed)    p *= 0.70;

    return Math.random() < p;
  }

  // ── Update per frame ──

  function updateMissiles(state) {
    const dt  = state.dt;
    const toRemove = [];
    let interceptCount = 0;

    for (const m of state.activeMissiles) {
      m.timeAlive += dt;
      if (m.timeAlive > MAX_FLIGHT_TIME) { toRemove.push(m); continue; }

      m.x += m.vx * dt;
      m.y += m.vy * dt;

      const target = state.threats.find(t => t.id === m.targetId);
      if (target) {
        // Optical track missiles have reduced homing (no radar guidance)
        const turnRate = m.isOptical ? 1.5 : 3.0;
        const desiredAngle = Math.atan2(target.y - m.y, target.x - m.x);
        let steer = desiredAngle - Math.atan2(m.vy, m.vx);
        steer = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;
        steer = Math.max(-turnRate * dt, Math.min(turnRate * dt, steer));
        const currentAngle = Math.atan2(m.vy, m.vx) + steer;
        const spd = MISSILE_SPEED[m.type];
        m.vx = spd * Math.cos(currentAngle);
        m.vy = spd * Math.sin(currentAngle);

        // Proximity check
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < INTERCEPT_RADIUS) {
          toRemove.push(m);
          if (checkIntercept(m, target)) {
            target.hp--;
            if (target.hp <= 0) {
              target._removeMe = true;
              interceptCount++;
              _scoreIntercept(state, target, m.type, m.isOptical);
              Audio.playInterceptConfirm();

              // Track objective kills
              if (state.currentMission && state.currentMission.objective) {
                const obj = state.currentMission.objective;
                if (obj.type === 'kill_type' && target.type === obj.target) {
                  state.objectiveKills = (state.objectiveKills || 0) + 1;
                }
              }
            }
          } else {
            Audio.playMiss();
          }
        }
      }

      // Off-map removal
      const ms = MapModule.WORLD_SIZE;
      if (m.x < -200 || m.x > ms + 200 || m.y < -200 || m.y > ms + 200) {
        toRemove.push(m);
      }
    }

    state.activeMissiles = state.activeMissiles.filter(m => !toRemove.includes(m));

    for (const t of state.threats.filter(t => t._removeMe)) {
      Audio.playExplosion();
    }
    state.threats = state.threats.filter(t => !t._removeMe);

    if (interceptCount > 0) {
      state.campaign.totalIntercepts = (state.campaign.totalIntercepts || 0) + interceptCount;
      state.wave.currentWaveScore = (state.wave.currentWaveScore || 0) + interceptCount * 100;
    }
  }

  function _scoreIntercept(state, target, missileType, isOptical) {
    let bonus = 100;
    if (target.class === 'STEALTH') bonus += 80;
    if (target.class === 'FAST')    bonus += 50;
    if (target.class === 'JAMMER')  bonus += 60;
    if (target.class === 'CRUISE')  bonus += 40;
    // Efficiency bonus
    if ((missileType === 'SMALL' && target.class === 'DRONE') ||
        (missileType === 'LARGE' && target.class !== 'DRONE')) bonus += 40;
    // Stealth-specific score bonuses (F-117A = 300 extra)
    if (STEALTH_SCORE_BONUS[target.type]) {
      bonus += STEALTH_SCORE_BONUS[target.type];
    }
    // Optical track bonus — shooting without radar is impressive
    if (isOptical) bonus += 50;

    state.wave.currentWaveScore = (state.wave.currentWaveScore || 0) + bonus;
  }

  return {
    fireMissile, fireOpticalTrack,
    updateMissiles, checkIntercept,
  };
})();

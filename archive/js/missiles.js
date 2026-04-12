/* ── missiles.js — fire control, inventory pools, fly-out, intercept ── */
'use strict';

const Missiles = (() => {
  const MISSILE_SPEED   = { SMALL: 90, LARGE: 75 };
  const INTERCEPT_RADIUS = 18; // pixels proximity fuse
  const MAX_FLIGHT_TIME  = 25;  // seconds before missile expires

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Fire control ──

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

    // Lead calculation
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
    });

    if (type === 'SMALL') state.missiles.small--;
    else                   state.missiles.large--;

    Audio.playMissileLaunch();
    return true;
  }

  function fireSalvo(state, targetId) {
    if (state.faction !== 'NORTH') return;
    if (state.missiles.large < 2) return;
    fireMissile(state, targetId, 'LARGE', -0.05);
    fireMissile(state, targetId, 'LARGE',  0.05);
    Audio.playSalvo();
  }

  function useIFFUplink(state, blipId) {
    if (state.faction !== 'SOUTH') return;
    if (state.iffUsedThisWave) return;
    const threat = state.threats.find(t => t.id === blipId);
    if (!threat) return;
    threat.classified = true;
    state.iffUsedThisWave = true;
    Audio.playIFFChirp();
  }

  // ── Intercept probability ──

  function checkIntercept(missile, target) {
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

      // Homing: steer toward current target position (proportional navigation)
      const target = state.threats.find(t => t.id === m.targetId);
      if (target) {
        const desiredAngle = Math.atan2(target.y - m.y, target.x - m.x);
        let steer = desiredAngle - Math.atan2(m.vy, m.vx);
        steer = ((steer + Math.PI) % (2 * Math.PI)) - Math.PI;
        const turnRate = 3.0; // rad/sec
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
            // Kill target
            target.hp--;
            if (target.hp <= 0) {
              target._removeMe = true;
              interceptCount++;
              _scoreIntercept(state, target, m.type);
              Audio.playInterceptConfirm();
            }
          } else {
            Audio.playMiss();
          }
        }
      } else {
        // Target destroyed mid-flight: fly to last known position
        // Just let it expire
      }

      // Off-map removal
      const ms = MapModule.WORLD_SIZE;
      if (m.x < -200 || m.x > ms + 200 || m.y < -200 || m.y > ms + 200) {
        toRemove.push(m);
      }
    }

    state.activeMissiles = state.activeMissiles.filter(m => !toRemove.includes(m));

    // Remove dead threats
    for (const t of state.threats.filter(t => t._removeMe)) {
      Audio.playExplosion();
    }
    state.threats = state.threats.filter(t => !t._removeMe);

    if (interceptCount > 0) {
      state.wave.currentWaveScore = (state.wave.currentWaveScore || 0) + interceptCount * 100;
    }
  }

  function _scoreIntercept(state, target, missileType) {
    let bonus = 100;
    if (target.class === 'STEALTH') bonus += 80;
    if (target.class === 'FAST')    bonus += 50;
    if (target.class === 'JAMMER')  bonus += 60;
    // Efficiency bonus: correct missile type
    if ((missileType === 'SMALL' && target.class === 'DRONE') ||
        (missileType === 'LARGE' && target.class !== 'DRONE')) bonus += 40;
    state.wave.currentWaveScore = (state.wave.currentWaveScore || 0) + bonus;
  }

  return {
    fireMissile, fireSalvo, useIFFUplink,
    updateMissiles, checkIntercept,
  };
})();

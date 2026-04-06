/* ── radar.js — PPI scope, sweep, phosphor fade, blip rendering ── */
'use strict';

const Radar = (() => {
  const TGT_SWEEP_PERIOD  = 3.0;
  const SURV_SWEEP_PERIOD = 6.0;
  const TGT_SWEEP_SPEED   = (2 * Math.PI) / TGT_SWEEP_PERIOD;
  const SURV_SWEEP_SPEED  = (2 * Math.PI) / SURV_SWEEP_PERIOD;
  const SURV_RANGE_MULT   = 2.0; // surveillance range = 2× targeting range
  const PHOSPHOR_HALF     = 2.0;
  const DECAY_RATE        = Math.LN2 / PHOSPHOR_HALF;
  const SCOPE_FRAC        = 0.82; // scope radius as fraction of half-canvas

  let canvas = null;
  let ctx    = null;
  let W = 720, H = 720;
  let cx, cy, R;  // scope center & radius

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    cx = W / 2;
    cy = H / 2;
    R  = Math.min(cx, cy) * SCOPE_FRAC;
  }

  // ── Math helpers ──

  function blipAlpha(timeSinceSweep) {
    return Math.exp(-DECAY_RATE * timeSinceSweep);
  }

  function normAngle(a) {
    return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  function sweepPassedBlip(sweepAngle, prevAngle, blipAngle) {
    const s = normAngle(prevAngle);
    const e = normAngle(sweepAngle);
    const b = normAngle(blipAngle);
    if (s < e) return b >= s && b <= e;
    return b >= s || b <= e;
  }

  function worldToRadar(entity, battery, radarRange) {
    const dx    = entity.x - battery.worldX;
    const dy    = entity.y - battery.worldY;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const r     = (dist / radarRange) * R;
    return {
      scopeX:  cx + r * Math.cos(angle),
      scopeY:  cy + r * Math.sin(angle),
      dist, angle,
      inRange: dist <= radarRange,
    };
  }

  function updateSweep(state) {
    const survOn = state.radar.surveillance.on;
    const tgtOn  = state.radar.targeting.on;
    if (!survOn && !tgtOn) return;

    const tgtRange  = MapModule.getRadarRange(state);
    const survRange = tgtRange * SURV_RANGE_MULT;
    let pinged = false;

    // Advance surveillance sweep
    if (survOn) {
      const prevSurv = state.radar.surveillance.sweepAngle;
      state.radar.surveillance.sweepAngle = (state.radar.surveillance.sweepAngle + SURV_SWEEP_SPEED * state.dt) % (2 * Math.PI);

      for (const t of state.threats) {
        const pos = worldToRadar(t, state.battery, survRange);
        if (!pos.inRange) continue;
        if (sweepPassedBlip(state.radar.surveillance.sweepAngle, prevSurv, pos.angle)) {
          t.timeSinceSurvSweep = 0;
          if (!pinged) { Audio.playRadarPing(); pinged = true; }
        } else {
          t.timeSinceSurvSweep = (t.timeSinceSurvSweep === undefined ? Infinity : t.timeSinceSurvSweep) + state.dt;
        }
      }
    }

    // Advance targeting sweep
    if (tgtOn) {
      const prevTgt = state.radar.targeting.sweepAngle;
      state.radar.targeting.sweepAngle = (state.radar.targeting.sweepAngle + TGT_SWEEP_SPEED * state.dt) % (2 * Math.PI);

      for (const t of state.threats) {
        const pos = worldToRadar(t, state.battery, tgtRange);
        if (!pos.inRange) continue;
        if (sweepPassedBlip(state.radar.targeting.sweepAngle, prevTgt, pos.angle)) {
          t.timeSinceSweep = 0;
          if (!pinged) { Audio.playRadarPing(); pinged = true; }
        } else {
          t.timeSinceSweep = (t.timeSinceSweep === undefined ? Infinity : t.timeSinceSweep) + state.dt;
        }
      }
    }

    // False blips fade on targeting sweep (jammer affects targeting radar)
    if (tgtOn) {
      const prevTgt = (state.radar.targeting.sweepAngle - TGT_SWEEP_SPEED * state.dt + 2 * Math.PI) % (2 * Math.PI);
      for (const fb of state.falseBlips) {
        if (sweepPassedBlip(state.radar.targeting.sweepAngle, prevTgt, fb.angle)) {
          fb.timeSinceSweep = 0;
        } else {
          fb.timeSinceSweep = (fb.timeSinceSweep || Infinity) + state.dt;
          fb.lifetime -= state.dt;
        }
      }
    } else {
      // No targeting radar — false blips decay naturally
      for (const fb of state.falseBlips) {
        fb.timeSinceSweep = (fb.timeSinceSweep || Infinity) + state.dt;
        fb.lifetime -= state.dt;
      }
    }
    state.falseBlips = state.falseBlips.filter(f => f.lifetime > 0);
  }

  // ── Rendering ──

  function render(state) {
    ctx.clearRect(0, 0, W, H);

    if (state.mode !== 'RADAR') return;

    const tgtRange  = MapModule.getRadarRange(state);
    const survRange = tgtRange * SURV_RANGE_MULT;
    const survOn    = state.radar.surveillance.on;
    const tgtOn     = state.radar.targeting.on;
    // Scope maps to the larger of the two active ranges
    const scopeRange = survOn ? survRange : tgtRange;
    // Targeting ring radius on scope (inner ring)
    const tgtRingFrac = survOn ? (tgtRange / survRange) : 1.0;

    // 1. Scope background
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0,8,0,0.92)';
    ctx.fill();
    ctx.clip();

    // 2. Range rings — surveillance outer quadrants
    ctx.strokeStyle = 'rgba(0,200,0,0.12)';
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * frac, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Targeting range ring (inner boundary) — only when surveillance is active
    if (survOn) {
      ctx.strokeStyle = 'rgba(0,255,0,0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, R * tgtRingFrac, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cardinal cross-hairs
    ctx.strokeStyle = 'rgba(0,180,0,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // 3. Jammer noise (affects targeting radar area)
    const hasJammer = state.threats.some(t => t.special === 'jammer' && worldToRadar(t, state.battery, tgtRange).inRange);
    if (hasJammer && tgtOn) {
      _renderJammerNoise(state.time);
    }

    // 4a. Surveillance sweep glow (dimmer, full scope)
    if (survOn) {
      try {
        const gradient = ctx.createConicGradient(state.radar.surveillance.sweepAngle, cx, cy);
        gradient.addColorStop(0,    'rgba(0,180,0,0.07)');
        gradient.addColorStop(0.05, 'rgba(0,180,0,0.02)');
        gradient.addColorStop(0.10, 'rgba(0,180,0,0.00)');
        gradient.addColorStop(1,    'rgba(0,180,0,0.00)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, 2 * Math.PI);
        ctx.fill();
      } catch (e) {}
    }

    // 4b. Targeting sweep glow (brighter, inner ring only)
    if (tgtOn) {
      try {
        const tgtR = R * tgtRingFrac;
        const gradient = ctx.createConicGradient(state.radar.targeting.sweepAngle, cx, cy);
        gradient.addColorStop(0,    'rgba(0,255,0,0.15)');
        gradient.addColorStop(0.07, 'rgba(0,255,0,0.05)');
        gradient.addColorStop(0.15, 'rgba(0,255,0,0.00)');
        gradient.addColorStop(1,    'rgba(0,255,0,0.00)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, tgtR, 0, 2 * Math.PI);
        ctx.fill();
      } catch (e) {}
    }

    // 5. False blips (jammer — in targeting area)
    for (const fb of state.falseBlips) {
      const r = fb.dist * R * tgtRingFrac;
      const sx = cx + r * Math.cos(fb.angle);
      const sy = cy + r * Math.sin(fb.angle);
      const alpha = blipAlpha(fb.timeSinceSweep || Infinity);
      if (alpha < 0.05) continue;
      const blinkPhase = Math.sin(state.time * fb.blinkRate * Math.PI * 2);
      if (blinkPhase < -0.3) continue;
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(sx, sy, fb.size, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    // 6. Real blips — render surveillance (dim) and targeting (bright) layers
    for (const t of state.threats) {
      if (t.class === 'HUNTER') {
        _renderHunterBlip(t, state, scopeRange);
        continue;
      }

      const tgtPos  = worldToRadar(t, state.battery, tgtRange);
      const survPos = worldToRadar(t, state.battery, survRange);
      // Map position to scope using scopeRange
      const scopePos = worldToRadar(t, state.battery, scopeRange);

      const inTgtRange  = tgtPos.inRange;
      const inSurvRange = survPos.inRange;

      // Targeting blip (bright, full rendering) — takes priority
      if (tgtOn && inTgtRange) {
        const alpha = blipAlpha(t.timeSinceSweep !== undefined ? t.timeSinceSweep : Infinity);
        if (alpha < 0.05) continue;
        if (t.blinkRate > 0) {
          const blinkPhase = Math.sin(state.time * t.blinkRate * Math.PI * 2);
          if (blinkPhase < -0.3) continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        if (t.classified) {
          ctx.shadowColor = '#00ff88';
          ctx.shadowBlur  = 6;
        }
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(scopePos.scopeX, scopePos.scopeY, t.blipSize, 0, 2 * Math.PI);
        ctx.fill();
        if (t.classified) {
          ctx.font = '9px Courier New';
          ctx.fillStyle = '#00ff88';
          ctx.textAlign = 'left';
          ctx.globalAlpha = alpha;
          ctx.fillText(t.type, scopePos.scopeX + t.blipSize + 3, scopePos.scopeY + 4);
        }
        ctx.restore();
      }
      // Surveillance blip (dim, small, grey-green, no classification)
      else if (survOn && inSurvRange) {
        const alpha = blipAlpha(t.timeSinceSurvSweep !== undefined ? t.timeSinceSurvSweep : Infinity);
        if (alpha < 0.05) continue;
        if (t.blinkRate > 0) {
          const blinkPhase = Math.sin(state.time * t.blinkRate * Math.PI * 2);
          if (blinkPhase < -0.3) continue;
        }
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = '#5a8a5a';
        ctx.beginPath();
        ctx.arc(scopePos.scopeX, scopePos.scopeY, Math.max(2, t.blipSize * 0.6), 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      }
    }

    // 7. Active missiles (small dots)
    for (const m of state.activeMissiles) {
      const pos = worldToRadar(m, state.battery, scopeRange);
      if (!pos.inRange) continue;
      ctx.save();
      ctx.fillStyle = '#ffff00';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(pos.scopeX, pos.scopeY, 1.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    // 8a. Surveillance sweep line (dimmer, full radius)
    if (survOn) {
      ctx.strokeStyle = 'rgba(0,180,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + R * Math.cos(state.radar.surveillance.sweepAngle),
        cy + R * Math.sin(state.radar.surveillance.sweepAngle)
      );
      ctx.stroke();
    }

    // 8b. Targeting sweep line (bright, inner radius)
    if (tgtOn) {
      const tgtR = R * tgtRingFrac;
      ctx.strokeStyle = 'rgba(0,255,0,0.85)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + tgtR * Math.cos(state.radar.targeting.sweepAngle),
        cy + tgtR * Math.sin(state.radar.targeting.sweepAngle)
      );
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // No radar at all indicator
    if (!survOn && !tgtOn) {
      ctx.strokeStyle = 'rgba(255,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.15, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // end clip

    // 9. Scope bezel
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(0,180,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 10. Compass labels
    _renderCompass();

    // 11. HUD overlay
    _renderHUD(state, tgtRange, hasJammer);
  }

  function _renderHunterBlip(hunter, state, scopeRange) {
    const pos = worldToRadar(hunter, state.battery, scopeRange);
    // Hunters always show on scope regardless of range (they're inbound)
    const clampedR = Math.min(pos.dist / scopeRange, 1.0);
    const angle = pos.angle;
    const sx = cx + clampedR * R * Math.cos(angle);
    const sy = cy + clampedR * R * Math.sin(angle);

    const alpha = blipAlpha(hunter.timeSinceSweep);
    const blinkPhase = Math.sin(state.time * 6 * Math.PI * 2);
    if (blinkPhase < -0.3) return;

    ctx.save();
    ctx.globalAlpha = Math.max(alpha, 0.5);
    ctx.fillStyle   = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function _renderJammerNoise(time) {
    const bandCount = 6;
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(time * 4) * 0.08;
    ctx.strokeStyle = '#00ff00';
    const bw = 3 + Math.sin(time * 2.5) * 1.5;
    ctx.lineWidth = bw;

    for (let i = 0; i < bandCount; i++) {
      const baseY = cy - R + (2 * R * i / bandCount) + Math.sin(time * 3 + i) * 12;
      ctx.beginPath();
      let first = true;
      for (let x = cx - R; x <= cx + R; x += 4) {
        const ny = baseY + (Math.random() - 0.5) * 7;
        if ((x - cx) ** 2 + (ny - cy) ** 2 <= R * R) {
          first ? ctx.moveTo(x, ny) : ctx.lineTo(x, ny);
          first = false;
        } else if (!first) {
          ctx.stroke();
          ctx.beginPath();
          first = true;
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function _renderCompass() {
    const labels = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
    ctx.save();
    ctx.font = '10px Courier New';
    ctx.fillStyle = 'rgba(0,200,0,0.4)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const off = R + 12;
    for (const [lbl, dx, dy] of labels) {
      ctx.fillText(lbl, cx + dx * off, cy + dy * off);
    }
    ctx.restore();
  }

  function _renderHUD(state, radarRange, hasJammer) {
    // Top-left: faction + mode
    const factionColor = state.faction === 'NORTH' ? '#D4A017' : '#2E86AB';
    ctx.save();
    ctx.font = 'bold 11px Courier New';
    ctx.fillStyle = factionColor;
    ctx.textAlign = 'left';
    const facLabel = state.faction === 'NORTH' ? 'NORTHERN COALITION' : 'SOUTHERN ALLIANCE';
    ctx.fillText(facLabel, 8, 18);

    ctx.font = '10px Courier New';
    ctx.fillStyle = '#888';
    const missionLabel = state.currentMission ? `MISSION: ${state.currentMission.name.toUpperCase()}` : '';
    ctx.fillText(missionLabel, 8, 32);

    // Wave counter
    ctx.fillStyle = '#aaa';
    ctx.fillText(`WAVE ${state.wave.current + 1}/${state.wave.total}`, 8, 46);

    // Top-right: missile inventory
    ctx.textAlign = 'right';
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Courier New';
    const sm = state.missiles.small;
    const lg = state.missiles.large;
    ctx.fillText(`SM: ${'■'.repeat(Math.max(0,sm))}${'□'.repeat(Math.max(0, state.missiles.smallMax - sm))}  ${sm}`, W - 8, 18);
    ctx.fillText(`LG: ${'■'.repeat(Math.max(0,lg))}${'□'.repeat(Math.max(0, state.missiles.largeMax - lg))}  ${lg}`, W - 8, 32);

    // Heat bar
    const heatW = 120;
    const heatH = 8;
    const heatX = W - heatW - 8;
    const heatY = 44;
    ctx.fillStyle = '#111';
    ctx.fillRect(heatX, heatY, heatW, heatH);
    const heatFrac = state.heat.value / 100;
    const heatColor = heatFrac > 0.8 ? '#ff3333' : heatFrac > 0.6 ? '#ff8800' : '#00aa44';
    ctx.fillStyle = heatColor;
    ctx.fillRect(heatX, heatY, heatW * heatFrac, heatH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(heatX, heatY, heatW, heatH);
    ctx.fillStyle = '#666';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'right';
    ctx.fillText(`HEAT ${Math.round(state.heat.value)}%`, W - 8, heatY + heatH + 10);

    // Asset HP bar (bottom left)
    const assetFrac = state.asset.hp / 100;
    const assetW = 100;
    const assetColor = assetFrac > 0.6 ? '#00aa44' : assetFrac > 0.3 ? '#ff8800' : '#ff3333';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666';
    ctx.font = '8px Courier New';
    const assetName = state.currentMission ? state.currentMission.assetName : 'ASSET';
    ctx.fillText(assetName.toUpperCase(), 8, H - 28);
    ctx.fillStyle = '#111';
    ctx.fillRect(8, H - 22, assetW, 7);
    ctx.fillStyle = assetColor;
    ctx.fillRect(8, H - 22, assetW * assetFrac, 7);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, H - 22, assetW, 7);
    ctx.fillStyle = '#666';
    ctx.fillText(`HP ${state.asset.hp}%`, 8, H - 8);

    // Radar status indicators (bottom right)
    ctx.textAlign = 'right';
    const survOn = state.radar.surveillance.on;
    const tgtOn  = state.radar.targeting.on;

    // Surveillance status
    ctx.fillStyle = survOn ? '#5a8a5a' : '#333';
    ctx.font = '9px Courier New';
    ctx.fillText(survOn ? 'SURV ON [Q]' : 'SURV OFF [Q]', W - 8, H - 38);

    // Targeting status + emission bar
    if (tgtOn) {
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 10px Courier New';
      ctx.fillText('TGT ACTIVE [R]', W - 8, H - 26);
      // Emission timer bar
      const threshold = state.faction === 'NORTH' ? 12.0 : 15.0;
      const emFrac = Math.min(state.radar.targeting.emitTimer / threshold, 1.0);
      const emW = 80;
      ctx.fillStyle = emFrac > 0.7 ? '#ff3333' : emFrac > 0.4 ? '#ff8800' : '#444';
      ctx.fillRect(W - emW - 8, H - 18, emW * emFrac, 5);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(W - emW - 8, H - 18, emW, 5);
      ctx.fillStyle = '#555';
      ctx.font = '8px Courier New';
      ctx.fillText('EMISSION', W - 8, H - 8);
    } else {
      ctx.fillStyle = '#555';
      ctx.font = 'bold 10px Courier New';
      ctx.fillText(survOn ? 'TGT DARK [R]' : 'ALL DARK', W - 8, H - 26);
    }

    // Hunter warning
    const hunters = state.threats.filter(t => t.class === 'HUNTER' && t.lockActive);
    if (hunters.length > 0) {
      const flash = Math.sin(state.time * 8) > 0;
      if (flash) {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 13px Courier New';
        ctx.fillText(`!! HUNTER MISSILE x${hunters.length} !!`, W / 2, H - 50);
      }
    }

    // Jammer warning
    if (hasJammer) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px Courier New';
      ctx.fillText('JAMMER ACTIVE — SCOPE DEGRADED', W / 2, H - 36);
    }

    // IFF uplink availability (Southern)
    if (state.faction === 'SOUTH') {
      ctx.textAlign = 'left';
      ctx.font = '9px Courier New';
      ctx.fillStyle = state.iffUsedThisWave ? '#333' : '#2E86AB';
      ctx.fillText(`IFF: ${state.iffUsedThisWave ? 'USED' : 'READY [I]'}`, 8, H - 44);
    }

    // Salvo mode (Northern)
    if (state.faction === 'NORTH') {
      ctx.textAlign = 'left';
      ctx.font = '9px Courier New';
      ctx.fillStyle = state.missiles.large >= 2 ? '#D4A017' : '#333';
      ctx.fillText(`SALVO [S]: ${state.missiles.large >= 2 ? 'READY' : 'NO AMMO'}`, 8, H - 44);
    }

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#555';
    ctx.font = '9px Courier New';
    ctx.fillText(`SCORE: ${state.campaign.score}`, W - 8, H - 44);

    ctx.restore();
  }

  return {
    init, updateSweep, render,
    worldToRadar, blipAlpha, sweepPassedBlip,
    get R() { return R; },
    get cx() { return cx; },
    get cy() { return cy; },
  };
})();

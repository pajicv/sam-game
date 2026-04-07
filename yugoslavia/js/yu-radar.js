/* ── yu-radar.js — PPI scope with stealth detection modifiers ── */
'use strict';

const Radar = (() => {
  const TGT_SWEEP_PERIOD  = 3.0;
  const SURV_SWEEP_PERIOD = 6.0;
  const TGT_SWEEP_SPEED   = (2 * Math.PI) / TGT_SWEEP_PERIOD;
  const SURV_SWEEP_SPEED  = (2 * Math.PI) / SURV_SWEEP_PERIOD;
  const SURV_RANGE_MULT   = 2.0;
  const PHOSPHOR_HALF     = 2.0;
  const DECAY_RATE        = Math.LN2 / PHOSPHOR_HALF;
  const SCOPE_FRAC        = 0.82;

  // Stealth detection modifiers
  const STEALTH_PROFILES = {
    f117: { tgtMod: 0.35, survMod: 0.55 },
    b2:   { tgtMod: 0.50, survMod: 0.70 },
  };

  let canvas = null;
  let ctx    = null;
  let W = 720, H = 720;
  let cx, cy, R;

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    cx = W / 2;
    cy = H / 2;
    R  = Math.min(cx, cy) * SCOPE_FRAC;
  }

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

  // Get effective radar range for a threat (applies stealth modifiers)
  function _getEffectiveRange(baseRange, threat, isSurveillance) {
    if (threat.stealthProfile && STEALTH_PROFILES[threat.stealthProfile]) {
      const prof = STEALTH_PROFILES[threat.stealthProfile];
      return baseRange * (isSurveillance ? prof.survMod : prof.tgtMod);
    }
    return baseRange;
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
        // Apply stealth detection modifier for surveillance
        const effRange = _getEffectiveRange(survRange, t, true);
        const pos = worldToRadar(t, state.battery, effRange);
        if (!pos.inRange) {
          t.timeSinceSurvSweep = (t.timeSinceSurvSweep === undefined ? Infinity : t.timeSinceSurvSweep) + state.dt;
          continue;
        }
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
        // Apply stealth detection modifier for targeting
        const effRange = _getEffectiveRange(tgtRange, t, false);
        const pos = worldToRadar(t, state.battery, effRange);
        if (!pos.inRange) {
          t.timeSinceSweep = (t.timeSinceSweep === undefined ? Infinity : t.timeSinceSweep) + state.dt;
          continue;
        }
        if (sweepPassedBlip(state.radar.targeting.sweepAngle, prevTgt, pos.angle)) {
          t.timeSinceSweep = 0;
          if (!pinged) { Audio.playRadarPing(); pinged = true; }
        } else {
          t.timeSinceSweep = (t.timeSinceSweep === undefined ? Infinity : t.timeSinceSweep) + state.dt;
        }
      }
    }

    // False blips
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
    const scopeRange = survOn ? survRange : tgtRange;
    const tgtRingFrac = survOn ? (tgtRange / survRange) : 1.0;

    // 1. Scope background
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0,8,0,0.92)';
    ctx.fill();
    ctx.clip();

    // 2. Range rings
    ctx.strokeStyle = 'rgba(0,200,0,0.12)';
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * frac, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Targeting range ring
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

    // 3. Jammer noise
    const hasJammer = state.threats.some(t => t.special === 'jammer' && worldToRadar(t, state.battery, tgtRange).inRange);
    if (hasJammer && tgtOn) {
      _renderJammerNoise(state.time);
    }

    // 4a. Surveillance sweep glow
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

    // 4b. Targeting sweep glow (slight red undertone for Yugoslav theme)
    if (tgtOn) {
      try {
        const tgtR = R * tgtRingFrac;
        const gradient = ctx.createConicGradient(state.radar.targeting.sweepAngle, cx, cy);
        gradient.addColorStop(0,    'rgba(20,255,20,0.15)');
        gradient.addColorStop(0.07, 'rgba(10,255,10,0.05)');
        gradient.addColorStop(0.15, 'rgba(0,255,0,0.00)');
        gradient.addColorStop(1,    'rgba(0,255,0,0.00)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, tgtR, 0, 2 * Math.PI);
        ctx.fill();
      } catch (e) {}
    }

    // 5. False blips
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

    // 6. Real blips
    for (const t of state.threats) {
      if (t.class === 'HUNTER') {
        _renderHunterBlip(t, state, scopeRange);
        continue;
      }

      // Calculate effective ranges for this threat
      const effTgtRange  = _getEffectiveRange(tgtRange, t, false);
      const effSurvRange = _getEffectiveRange(survRange, t, true);
      const tgtPos  = worldToRadar(t, state.battery, effTgtRange);
      const survPos = worldToRadar(t, state.battery, effSurvRange);
      const scopePos = worldToRadar(t, state.battery, scopeRange);

      const inTgtRange  = tgtPos.inRange;
      const inSurvRange = survPos.inRange;

      // Targeting blip (bright)
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
          ctx.shadowColor = '#ff8888';
          ctx.shadowBlur  = 6;
        }
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(scopePos.scopeX, scopePos.scopeY, t.blipSize, 0, 2 * Math.PI);
        ctx.fill();
        if (t.classified) {
          ctx.font = '9px Courier New';
          ctx.fillStyle = '#ff8888';
          ctx.textAlign = 'left';
          ctx.globalAlpha = alpha;
          ctx.fillText(t.type, scopePos.scopeX + t.blipSize + 3, scopePos.scopeY + 4);
        }
        ctx.restore();
      }
      // Surveillance blip (dim)
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

    // 7. Active missiles
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

    // 8a. Surveillance sweep line
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

    // 8b. Targeting sweep line
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

    // No radar indicator
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
    const factionColor = '#C41E3A';
    ctx.save();
    ctx.font = 'bold 11px Courier New';
    ctx.fillStyle = factionColor;
    ctx.textAlign = 'left';
    ctx.fillText('3RD ARMY AIR DEFENSE — S-125 NEVA', 8, 18);

    ctx.font = '10px Courier New';
    ctx.fillStyle = '#888';
    const missionLabel = state.currentMission ? `MISSION: ${state.currentMission.name.toUpperCase()}` : '';
    ctx.fillText(missionLabel, 8, 32);

    // Wave counter
    ctx.fillStyle = '#aaa';
    ctx.fillText(`WAVE ${state.wave.current + 1}/${state.wave.total}`, 8, 46);

    // Missile inventory
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

    // Asset HP bar
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

    // Radar status
    ctx.textAlign = 'right';
    const survOn = state.radar.surveillance.on;
    const tgtOn  = state.radar.targeting.on;

    ctx.fillStyle = survOn ? '#5a8a5a' : '#333';
    ctx.font = '9px Courier New';
    ctx.fillText(survOn ? 'SURV ON [Q]' : 'SURV OFF [Q]', W - 8, H - 38);

    if (tgtOn) {
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 10px Courier New';
      ctx.fillText('TGT ACTIVE [R]', W - 8, H - 26);
      // Emission timer bar (2s threshold — Serbian red)
      const threshold = 2.0;
      const emFrac = Math.min(state.radar.targeting.emitTimer / threshold, 1.0);
      const emW = 80;
      ctx.fillStyle = emFrac > 0.7 ? '#ff3333' : emFrac > 0.4 ? '#C41E3A' : '#444';
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
        ctx.fillText(`!! HARM INBOUND x${hunters.length} !!`, W / 2, H - 50);
      }
    }

    // Jammer warning
    if (hasJammer) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffaa00';
      ctx.font = '10px Courier New';
      ctx.fillText('EA-6B JAMMER — SCOPE DEGRADED', W / 2, H - 36);
    }

    // Optical track availability
    ctx.textAlign = 'left';
    ctx.font = '9px Courier New';
    if (state.opticalTrack && !state.opticalTrack.usedThisWave) {
      ctx.fillStyle = '#C41E3A';
      ctx.fillText('OPTICAL: READY [O]', 8, H - 44);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillText('OPTICAL: USED', 8, H - 44);
    }

    // Mission objective (Mission 5: must kill F-117)
    if (state.currentMission && state.currentMission.objective) {
      ctx.textAlign = 'center';
      ctx.font = '9px Courier New';
      const obj = state.currentMission.objective;
      const killed = state.objectiveKills || 0;
      const met = killed >= obj.count;
      ctx.fillStyle = met ? '#00cc44' : '#C41E3A';
      ctx.fillText(
        met ? `OBJECTIVE: ${obj.target} DESTROYED ✓` : `OBJECTIVE: DESTROY ${obj.target} (${killed}/${obj.count})`,
        W / 2, 60
      );
    }

    // Score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#555';
    ctx.font = '9px Courier New';
    ctx.fillText(`SCORE: ${state.campaign.score}`, W - 8, H - 54);

    ctx.restore();
  }

  return {
    init, updateSweep, render,
    worldToRadar, blipAlpha, sweepPassedBlip,
    _getEffectiveRange,
    get R() { return R; },
    get cx() { return cx; },
    get cy() { return cy; },
  };
})();

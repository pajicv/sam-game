/* ── yu-ui.js — overlays, HUD, input routing, optical track ── */
'use strict';

const UI = (() => {
  let els = {};
  let state = null;
  let onMissionSelected   = null;
  let onBriefingDeploy    = null;
  let onSurveillanceToggle = null;
  let onTargetingToggle   = null;
  let onReposition        = null;
  let onMapTileClick      = null;
  let onInterWaveContinue = null;
  let onResultContinue    = null;

  let hoverGridX = -1, hoverGridY = -1;
  let touchStartTime = 0;
  let opticalMode = false;

  function init(gameState, callbacks) {
    state = gameState;
    onMissionSelected    = callbacks.onMissionSelected;
    onBriefingDeploy     = callbacks.onBriefingDeploy;
    onSurveillanceToggle = callbacks.onSurveillanceToggle;
    onTargetingToggle    = callbacks.onTargetingToggle;
    onReposition         = callbacks.onReposition;
    onMapTileClick       = callbacks.onMapTileClick;
    onInterWaveContinue  = callbacks.onInterWaveContinue;
    onResultContinue     = callbacks.onResultContinue;

    els = {
      campaignMap:    document.getElementById('overlay-campaign-map'),
      briefing:       document.getElementById('overlay-briefing'),
      interWave:      document.getElementById('overlay-inter-wave'),
      result:         document.getElementById('overlay-result'),
      ctrlBar:        document.getElementById('ctrl-bar'),
      tutorial:       document.getElementById('tutorial'),
      radarCanvas:    document.getElementById('radar-canvas'),
      mapDiv:         document.getElementById('map-div'),
    };

    _bindKeyboard();
    _bindRadarCanvas();
    _bindMapClicks();
  }

  // ── Campaign map ──

  function showCampaignMap(missions, progress) {
    _hideAll();
    els.campaignMap.classList.remove('hidden');

    const grid = document.getElementById('campaign-grid');
    grid.innerHTML = '';

    missions.forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'mission-node';
      const unlocked = i === 0 || (progress[i - 1] && progress[i - 1].completed);
      const completed = progress[i] && progress[i].completed;
      const stars = progress[i] ? progress[i].stars : 0;

      if (!unlocked) div.classList.add('locked');
      else if (completed) div.classList.add('completed');
      else div.classList.add('available');

      div.innerHTML = `
        <span class="mnum">${i + 1}</span>
        <span class="mname">${m.name}</span>
        <span class="mstars">${completed ? '\u2605'.repeat(stars) + '\u2606'.repeat(3 - stars) : (unlocked ? '\u2014' : '\uD83D\uDD12')}</span>
      `;

      if (unlocked) {
        div.addEventListener('click', () => { Audio.resume(); onMissionSelected && onMissionSelected(i); });
      }
      grid.appendChild(div);
    });
  }

  // ── Briefing ──

  function showBriefing(mission) {
    _hideAll();
    els.briefing.classList.remove('hidden');

    const h1 = document.getElementById('briefing-title');
    const body = document.getElementById('briefing-body');
    if (h1) h1.textContent = mission.name.toUpperCase();
    if (body) {
      const objText = mission.objective
        ? `<p style="color:#C41E3A;font-weight:bold;">OBJECTIVE: Destroy at least ${mission.objective.count}\u00d7 ${mission.objective.target}</p>`
        : '';
      body.innerHTML = `
        <p>${mission.briefing}</p>
        ${objText}
        <div id="briefing-threats">
          <strong>EXPECTED THREATS:</strong><br>
          ${mission.threats.map(t => '\u2022 ' + t).join('<br>')}
        </div>
        <ul>
          <li>Position battery on map, then press <strong>ENGAGE</strong></li>
          <li>LEFT-CLICK blip \u2192 fire small missile (SM)</li>
          <li>RIGHT-CLICK blip \u2192 fire large missile (LG)</li>
          <li>[Q] surveillance \u00b7 [R] targeting \u00b7 [M] map \u00b7 [O] TV track</li>
        </ul>
      `;
    }
  }

  function bindBriefingDeploy() {
    const btn = document.getElementById('btn-briefing-deploy');
    if (btn) btn.onclick = () => { onBriefingDeploy && onBriefingDeploy(); };
    const back = document.getElementById('btn-briefing-back');
    if (back) back.onclick = () => { onResultContinue && onResultContinue('campaign'); };
  }

  // ── Inter-wave intel ──

  function showInterWave(state, nextWaveDef) {
    _hideAll();
    els.interWave.classList.remove('hidden');

    const title = document.getElementById('inter-wave-title');
    if (title) title.textContent = `WAVE ${state.wave.current + 1} COMPLETE`;

    const score = document.getElementById('inter-wave-score');
    if (score) score.textContent = `WAVE SCORE: +${state.campaign.waveScores[state.campaign.waveScores.length - 1] || 0}`;

    const lines = document.getElementById('intel-lines');
    if (lines && nextWaveDef) {
      const types = {};
      for (const e of nextWaveDef.threats) {
        types[e.type] = (types[e.type] || 0) + e.count;
      }
      lines.innerHTML = '<strong>INTEL \u2014 NEXT WAVE:</strong><br>' +
        Object.entries(types).map(([t, c]) => '\u2022 ' + c + '\u00d7 ' + t).join('<br>');
    } else if (lines) {
      lines.innerHTML = '<strong>FINAL WAVE CLEARED</strong>';
    }

    const btn = document.getElementById('btn-inter-wave-continue');
    if (btn) btn.onclick = () => { onInterWaveContinue && onInterWaveContinue(); };
  }

  // ── Mission result ──

  function showResult(state) {
    _hideAll();
    els.result.classList.remove('hidden');

    const success = !state.batteryDestroyed && state.asset.hp > 0;

    // Check mission objective
    let objectiveMet = true;
    if (state.currentMission && state.currentMission.objective) {
      const obj = state.currentMission.objective;
      const kills = state.objectiveKills || 0;
      objectiveMet = kills >= obj.count;
    }
    const fullSuccess = success && objectiveMet;

    const title = document.getElementById('result-title');
    const grade = document.getElementById('result-grade');
    const big   = document.getElementById('score-big');
    const stats = document.getElementById('result-stats');

    if (title) {
      if (!success) title.textContent = 'MISSION FAILED';
      else if (!objectiveMet) title.textContent = 'OBJECTIVE NOT MET';
      else title.textContent = 'MISSION COMPLETE';
    }

    const total = state.campaign.score;
    if (big) big.textContent = total.toLocaleString();

    let gradeStr = 'F';
    if (fullSuccess) {
      if (total >= 3000) gradeStr = 'S';
      else if (total >= 2000) gradeStr = 'A';
      else if (total >= 1200) gradeStr = 'B';
      else if (total >= 600)  gradeStr = 'C';
      else if (total >= 200)  gradeStr = 'D';
    }
    if (grade) grade.textContent = `GRADE: ${gradeStr}`;

    const intercepts = state.campaign.totalIntercepts || 0;
    const misses     = state.campaign.totalMissiles   || 0;
    const objLine    = state.currentMission && state.currentMission.objective
      ? `<br>OBJECTIVE (${state.currentMission.objective.target}): ${objectiveMet ? '<span style="color:#00cc44">COMPLETE</span>' : '<span style="color:#ff4444">FAILED</span>'}`
      : '';
    if (stats) stats.innerHTML = `
      ASSET INTEGRITY: ${state.asset.hp}%<br>
      THREATS NEUTRALISED: ${intercepts}<br>
      MISSILES EXPENDED: ${misses}${objLine}<br>
      ${state.batteryDestroyed ? '<span style="color:#ff4444">BATTERY DESTROYED</span><br>' : ''}
    `;

    const btn = document.getElementById('btn-result-continue');
    if (btn) btn.onclick = () => { onResultContinue && onResultContinue('campaign'); };
    const retry = document.getElementById('btn-result-retry');
    if (retry) retry.onclick = () => { onResultContinue && onResultContinue('retry'); };
  }

  // ── In-game control bar ──

  function showMapControls() {
    els.ctrlBar.classList.remove('hidden');
    els.ctrlBar.innerHTML = `
      <button class="ctrl-btn" id="ctrl-engage">ENGAGE \u25b6</button>
      <button class="ctrl-btn" id="ctrl-reposition">REPOSITION</button>
    `;
    document.getElementById('ctrl-engage').onclick     = () => { onBriefingDeploy && onBriefingDeploy(); };
    document.getElementById('ctrl-reposition').onclick = () => { onReposition && onReposition(); };
  }

  function showRadarControls(state) {
    els.ctrlBar.classList.remove('hidden');
    const survOn  = state.radar.surveillance.on;
    const tgtOn   = state.radar.targeting.on;
    const survLabel = survOn ? 'SURV ON [Q]' : 'SURV OFF [Q]';
    const tgtLabel  = tgtOn  ? 'TGT ON [R]'  : 'TGT OFF [R]';
    const optUsed = state.opticalTrack && state.opticalTrack.usedThisWave;
    els.ctrlBar.innerHTML = `
      <button class="ctrl-btn ${survOn ? 'active' : ''}" id="ctrl-surv">${survLabel}</button>
      <button class="ctrl-btn ${tgtOn ? 'active warn' : ''}" id="ctrl-tgt">${tgtLabel}</button>
      <button class="ctrl-btn" id="ctrl-map">[M] MAP</button>
      <button class="ctrl-btn ${opticalMode ? 'warn' : ''} ${optUsed ? 'danger' : ''}" id="ctrl-optical">[O] TV TRACK${optUsed ? ' USED' : ''}</button>
    `;
    document.getElementById('ctrl-surv').onclick = () => { onSurveillanceToggle && onSurveillanceToggle(); };
    document.getElementById('ctrl-tgt').onclick  = () => { onTargetingToggle && onTargetingToggle(); };
    document.getElementById('ctrl-map').onclick  = () => { onReposition && onReposition(); };
    const optBtn = document.getElementById('ctrl-optical');
    if (optBtn) optBtn.onclick = () => {
      if (!optUsed) {
        opticalMode = !opticalMode;
        _refreshOpticalBtn();
      }
    };
  }

  function _refreshOpticalBtn() {
    const btn = document.getElementById('ctrl-optical');
    if (!btn) return;
    const optUsed = state.opticalTrack && state.opticalTrack.usedThisWave;
    btn.classList.toggle('warn', opticalMode && !optUsed);
    btn.textContent = opticalMode && !optUsed ? '[O] TV: ARM' : (optUsed ? '[O] TV USED' : '[O] TV TRACK');
  }

  function hideControls() {
    els.ctrlBar.classList.add('hidden');
    els.ctrlBar.innerHTML = '';
  }

  // ── Tutorial ──

  function showTutorial(text) {
    if (!els.tutorial) return;
    els.tutorial.textContent = text;
    els.tutorial.classList.remove('hidden');
  }
  function hideTutorial() {
    if (!els.tutorial) return;
    els.tutorial.classList.add('hidden');
  }

  // ── Keyboard input ──

  function _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (!state) return;
      const k = e.key.toLowerCase();
      if (k === 'q' && state.mode === 'RADAR') {
        e.preventDefault();
        onSurveillanceToggle && onSurveillanceToggle();
      }
      if (k === 'r' && state.mode === 'RADAR') {
        e.preventDefault();
        onTargetingToggle && onTargetingToggle();
      }
      if (k === 'm' && state.mode === 'RADAR') {
        e.preventDefault();
        onReposition && onReposition();
      }
      if (k === 'o' && state.mode === 'RADAR') {
        e.preventDefault();
        if (state.opticalTrack && !state.opticalTrack.usedThisWave) {
          opticalMode = !opticalMode;
          _refreshOpticalBtn();
        }
      }
      if (k === ' ' && state.mode === 'MAP') {
        e.preventDefault();
        onBriefingDeploy && onBriefingDeploy();
      }
    });
  }

  // ── Radar canvas mouse input ──

  function _bindRadarCanvas() {
    const c = els.radarCanvas;
    c.addEventListener('contextmenu', e => { e.preventDefault(); });

    c.addEventListener('mousedown', e => {
      if (state.mode !== 'RADAR') return;
      Audio.resume();
      const rect = c.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (720 / rect.width);
      const my = (e.clientY - rect.top)  * (720 / rect.height);

      if (e.button === 1) { e.preventDefault(); return; }

      // Optical track mode — can fire on surveillance contacts
      if (opticalMode && state.opticalTrack && !state.opticalTrack.usedThisWave) {
        const target = _findClosestBlip(mx, my, true); // allow surveillance-only contacts
        if (target) {
          Missiles.fireOpticalTrack(state, target.id);
          opticalMode = false;
          _refreshOpticalBtn();
          showRadarControls(state);
        }
        return;
      }

      // Normal fire
      const target = _findClosestBlip(mx, my, false);
      if (!target) return;

      if (e.button === 2) {
        Missiles.fireMissile(state, target.id, 'LARGE');
      } else {
        Missiles.fireMissile(state, target.id, 'SMALL');
      }
    });

    // Touch events
    c.addEventListener('touchstart', e => {
      e.preventDefault();
      touchStartTime = performance.now();
    }, { passive: false });

    c.addEventListener('touchend', e => {
      e.preventDefault();
      if (state.mode !== 'RADAR') return;
      Audio.resume();
      const duration = performance.now() - touchStartTime;
      const touch = e.changedTouches[0];
      const rect  = c.getBoundingClientRect();
      const mx = (touch.clientX - rect.left) * (720 / rect.width);
      const my = (touch.clientY - rect.top)  * (720 / rect.height);

      if (opticalMode && state.opticalTrack && !state.opticalTrack.usedThisWave) {
        const target = _findClosestBlip(mx, my, true);
        if (target) {
          Missiles.fireOpticalTrack(state, target.id);
          opticalMode = false;
          _refreshOpticalBtn();
          showRadarControls(state);
        }
        return;
      }

      const target = _findClosestBlip(mx, my, false);
      if (!target) return;
      if (duration >= 300) {
        Missiles.fireMissile(state, target.id, 'LARGE');
      } else {
        Missiles.fireMissile(state, target.id, 'SMALL');
      }
    }, { passive: false });
  }

  function _findClosestBlip(mx, my, allowSurveillanceOnly) {
    // In optical mode, can target surveillance contacts (no targeting radar needed)
    if (!allowSurveillanceOnly && !state.radar.targeting.on) return null;

    const CLICK_HIT_RADIUS = 24;
    const tgtRange  = MapModule.getRadarRange(state);
    const survRange = tgtRange * 3.0;
    const scopeRange = state.radar.surveillance.on ? survRange : tgtRange;
    let closest = null;
    let closestDist = Infinity;

    for (const t of state.threats) {
      if (t.class === 'HUNTER') continue;

      if (allowSurveillanceOnly) {
        // For optical track: need to be visible on surveillance radar
        if (!state.radar.surveillance.on) continue;
        const effSurvRange = Radar._getEffectiveRange(survRange, t, true);
        const survPos = Radar.worldToRadar(t, state.battery, effSurvRange);
        if (!survPos.inRange) continue;
        const alpha = Radar.blipAlpha(t.timeSinceSurvSweep !== undefined ? t.timeSinceSurvSweep : Infinity);
        if (alpha < 0.05) continue;
      } else {
        // Normal targeting: must be in targeting range
        const effTgtRange = Radar._getEffectiveRange(tgtRange, t, false);
        const tgtPos = Radar.worldToRadar(t, state.battery, effTgtRange);
        if (!tgtPos.inRange) continue;
        if (Radar.blipAlpha(t.timeSinceSweep) < 0.05) continue;
      }

      const scopePos = Radar.worldToRadar(t, state.battery, scopeRange);
      const dx = scopePos.scopeX - mx;
      const dy = scopePos.scopeY - my;
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (d < CLICK_HIT_RADIUS && d < closestDist) {
        closest = t;
        closestDist = d;
      }
    }
    return closest;
  }

  // ── Map click input (via Leaflet) ──

  function _bindMapClicks() {
    MapModule.onMapClick((gx, gy) => {
      if (state.mode !== 'MAP') return;
      Audio.resume();
      onMapTileClick && onMapTileClick(gx, gy);
    });
  }

  // ── Helpers ──

  function _hideAll() {
    ['campaignMap','briefing','interWave','result'].forEach(k => {
      if (els[k]) els[k].classList.add('hidden');
    });
    hideControls();
    hideTutorial();
  }

  function hideOverlays() { _hideAll(); }

  function getOpticalMode() { return opticalMode; }
  function resetModes()     { opticalMode = false; }

  return {
    init,
    showCampaignMap, showBriefing,
    bindBriefingDeploy, showMapControls, showRadarControls,
    hideControls, hideOverlays, showInterWave, showResult,
    showTutorial, hideTutorial,
    getOpticalMode, resetModes,
  };
})();

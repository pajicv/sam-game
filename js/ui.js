/* ── ui.js — overlays, HUD, input routing, faction theming ── */
'use strict';

const UI = (() => {
  // DOM element references
  let els = {};
  let state = null;
  let onFactionSelected   = null;
  let onMissionSelected   = null;
  let onBriefingDeploy    = null;
  let onRadarToggle       = null;
  let onSurveillanceToggle = null;
  let onTargetingToggle   = null;
  let onReposition        = null;
  let onFireSmall         = null;
  let onFireLarge         = null;
  let onFireSalvo         = null;
  let onIFFUplink         = null;
  let onMapTileClick      = null;
  let onInterWaveContinue = null;
  let onResultContinue    = null;
  let onTutorialDismiss   = null;

  // Hover tracking for map mode
  let hoverGridX = -1, hoverGridY = -1;
  let touchStartTime = 0;
  let salvoMode = false;
  let iffMode   = false;

  function init(gameState, callbacks) {
    state = gameState;
    Object.assign({
      onFactionSelected, onMissionSelected, onBriefingDeploy,
      onRadarToggle, onReposition, onFireSmall, onFireLarge,
      onFireSalvo, onIFFUplink, onMapTileClick,
      onInterWaveContinue, onResultContinue, onTutorialDismiss,
    }, callbacks);
    onFactionSelected    = callbacks.onFactionSelected;
    onMissionSelected    = callbacks.onMissionSelected;
    onBriefingDeploy     = callbacks.onBriefingDeploy;
    onRadarToggle        = callbacks.onRadarToggle;
    onSurveillanceToggle = callbacks.onSurveillanceToggle;
    onTargetingToggle    = callbacks.onTargetingToggle;
    onReposition         = callbacks.onReposition;
    onFireSmall         = callbacks.onFireSmall;
    onFireLarge         = callbacks.onFireLarge;
    onFireSalvo         = callbacks.onFireSalvo;
    onIFFUplink         = callbacks.onIFFUplink;
    onMapTileClick      = callbacks.onMapTileClick;
    onInterWaveContinue = callbacks.onInterWaveContinue;
    onResultContinue    = callbacks.onResultContinue;

    els = {
      factionSelect:  document.getElementById('overlay-faction-select'),
      campaignMap:    document.getElementById('overlay-campaign-map'),
      briefing:       document.getElementById('overlay-briefing'),
      interWave:      document.getElementById('overlay-inter-wave'),
      result:         document.getElementById('overlay-result'),
      ctrlBar:        document.getElementById('ctrl-bar'),
      tutorial:       document.getElementById('tutorial'),
      radarCanvas:    document.getElementById('radar-canvas'),
      mapCanvas:      document.getElementById('map-canvas'),
    };

    _bindFactionSelect();
    _bindKeyboard();
    _bindRadarCanvas();
    _bindMapCanvas();
  }

  // ── Faction select ──

  function _bindFactionSelect() {
    const northBtn = document.getElementById('btn-north');
    const southBtn = document.getElementById('btn-south');
    if (northBtn) northBtn.addEventListener('click', () => { Audio.resume(); onFactionSelected && onFactionSelected('NORTH'); });
    if (southBtn) southBtn.addEventListener('click', () => { Audio.resume(); onFactionSelected && onFactionSelected('SOUTH'); });
  }

  // ── Campaign map ──

  function showCampaignMap(faction, missions, progress) {
    _hideAll();
    els.campaignMap.classList.remove('hidden');
    _applyFactionTheme(faction);

    const grid = document.getElementById('campaign-grid');
    grid.innerHTML = '';

    const label = document.getElementById('campaign-faction-label');
    if (label) label.textContent = faction === 'NORTH' ? 'Northern Coalition' : 'Southern Alliance';

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
        <span class="mstars">${completed ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (unlocked ? '—' : '🔒')}</span>
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
      body.innerHTML = `
        <p>${mission.briefing}</p>
        <div id="briefing-threats">
          <strong>EXPECTED THREATS:</strong><br>
          ${mission.threats.map(t => `• ${t}`).join('<br>')}
        </div>
        <ul>
          <li>Position battery on map, then press <strong>ENGAGE</strong></li>
          <li>LEFT-CLICK blip → fire small missile (SM)</li>
          <li>RIGHT-CLICK blip → fire large missile (LG)</li>
          <li>[Q] surveillance radar · [R] targeting radar · [M] map · [S] salvo (N) · [I] IFF (S)</li>
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
      lines.innerHTML = '<strong>INTEL — NEXT WAVE:</strong><br>' +
        Object.entries(types).map(([t, c]) => `• ${c}× ${t}`).join('<br>');
    } else if (lines) {
      lines.innerHTML = '<strong>FINAL WAVE CLEARED</strong>';
    }

    const btn = document.getElementById('btn-inter-wave-continue');
    if (btn) btn.onclick = () => { onInterWaveContinue && onInterWaveContinue(); };
  }

  // ── Mission result ──

  function showResult(state, missions) {
    _hideAll();
    els.result.classList.remove('hidden');

    const success = !state.batteryDestroyed && state.asset.hp > 0;
    const title   = document.getElementById('result-title');
    const grade   = document.getElementById('result-grade');
    const big     = document.getElementById('score-big');
    const stats   = document.getElementById('result-stats');

    if (title) title.textContent = success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    const total = state.campaign.score;
    if (big) big.textContent = total.toLocaleString();

    let gradeStr = 'F';
    if (total >= 3000) gradeStr = 'S';
    else if (total >= 2000) gradeStr = 'A';
    else if (total >= 1200) gradeStr = 'B';
    else if (total >= 600)  gradeStr = 'C';
    else if (total >= 200)  gradeStr = 'D';
    if (grade) grade.textContent = `GRADE: ${gradeStr}`;

    const intercepts = state.campaign.totalIntercepts || 0;
    const misses     = state.campaign.totalMissiles   || 0;
    if (stats) stats.innerHTML = `
      ASSET INTEGRITY: ${state.asset.hp}%<br>
      THREATS NEUTRALISED: ${intercepts}<br>
      MISSILES EXPENDED: ${misses}<br>
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
      <button class="ctrl-btn" id="ctrl-engage">ENGAGE ▶</button>
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
    els.ctrlBar.innerHTML = `
      <button class="ctrl-btn ${survOn ? 'active' : ''}" id="ctrl-surv">${survLabel}</button>
      <button class="ctrl-btn ${tgtOn ? 'active warn' : ''}" id="ctrl-tgt">${tgtLabel}</button>
      <button class="ctrl-btn" id="ctrl-map">[M] MAP</button>
      ${state.faction === 'NORTH' ? '<button class="ctrl-btn" id="ctrl-salvo">[S] SALVO</button>' : ''}
      ${state.faction === 'SOUTH' ? '<button class="ctrl-btn" id="ctrl-iff">[I] IFF</button>' : ''}
    `;
    document.getElementById('ctrl-surv').onclick = () => { onSurveillanceToggle && onSurveillanceToggle(); };
    document.getElementById('ctrl-tgt').onclick  = () => { onTargetingToggle && onTargetingToggle(); };
    document.getElementById('ctrl-map').onclick  = () => { onReposition && onReposition(); };
    const salvo = document.getElementById('ctrl-salvo');
    if (salvo) salvo.onclick = () => { salvoMode = !salvoMode; _refreshSalvoBtn(); };
    const iff = document.getElementById('ctrl-iff');
    if (iff) iff.onclick = () => { iffMode = !iffMode; _refreshIFFBtn(); };
  }

  function _refreshSalvoBtn() {
    const btn = document.getElementById('ctrl-salvo');
    if (!btn) return;
    btn.classList.toggle('warn', salvoMode);
    btn.textContent = salvoMode ? '[S] SALVO: ARM' : '[S] SALVO';
  }
  function _refreshIFFBtn() {
    const btn = document.getElementById('ctrl-iff');
    if (!btn) return;
    btn.classList.toggle('warn', iffMode);
    btn.textContent = iffMode ? '[I] IFF: SELECT' : '[I] IFF';
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
      if (k === 's' && state.mode === 'RADAR' && state.faction === 'NORTH') {
        e.preventDefault();
        salvoMode = !salvoMode;
        _refreshSalvoBtn();
      }
      if (k === 'i' && state.mode === 'RADAR' && state.faction === 'SOUTH') {
        e.preventDefault();
        iffMode = !iffMode;
        _refreshIFFBtn();
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

      // Find closest blip
      const target = _findClosestBlip(mx, my);
      if (!target) return;

      if (e.button === 1) { e.preventDefault(); return; } // middle click noop

      if (iffMode && state.faction === 'SOUTH') {
        Missiles.useIFFUplink(state, target.id);
        iffMode = false;
        _refreshIFFBtn();
        return;
      }

      if (e.button === 2 || salvoMode) {
        if (salvoMode && state.faction === 'NORTH') {
          Missiles.fireSalvo(state, target.id);
        } else {
          Missiles.fireMissile(state, target.id, 'LARGE');
        }
      } else {
        Missiles.fireMissile(state, target.id, 'SMALL');
      }
    });

    // Touch events for mobile
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
      const target = _findClosestBlip(mx, my);
      if (!target) return;
      if (duration >= 300) {
        Missiles.fireMissile(state, target.id, 'LARGE');
      } else {
        Missiles.fireMissile(state, target.id, 'SMALL');
      }
    }, { passive: false });
  }

  function _findClosestBlip(mx, my) {
    // Can only fire on targets within targeting radar range when targeting is active
    if (!state.radar.targeting.on) return null;

    const CLICK_HIT_RADIUS = 24;
    const tgtRange  = MapModule.getRadarRange(state);
    const survRange = tgtRange * 2.0; // SURV_RANGE_MULT
    const scopeRange = state.radar.surveillance.on ? survRange : tgtRange;
    let closest = null;
    let closestDist = Infinity;

    for (const t of state.threats) {
      if (t.class === 'HUNTER') continue; // can't shoot hunters directly
      // Must be in targeting range (not just surveillance range)
      const tgtPos = Radar.worldToRadar(t, state.battery, tgtRange);
      if (!tgtPos.inRange) continue;
      if (Radar.blipAlpha(t.timeSinceSweep) < 0.05) continue;
      // Get scope position for click matching
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

  // ── Map canvas mouse input ──

  function _bindMapCanvas() {
    const c = els.mapCanvas;

    c.addEventListener('mousemove', e => {
      if (state.mode !== 'MAP') return;
      const rect = c.getBoundingClientRect();
      // canvas px → world units (×2 because WORLD_SIZE = 2 × CANVAS_SIZE)
      const wx = (e.clientX - rect.left) * (MapModule.CANVAS_SIZE / rect.width) * 2;
      const wy = (e.clientY - rect.top)  * (MapModule.CANVAS_SIZE / rect.height) * 2;
      const g  = MapModule.worldToGrid(wx, wy);
      if (g.gx !== hoverGridX || g.gy !== hoverGridY) {
        hoverGridX = g.gx;
        hoverGridY = g.gy;
        MapModule.markDirty();
      }
    });

    c.addEventListener('click', e => {
      if (state.mode !== 'MAP') return;
      Audio.resume();
      const rect = c.getBoundingClientRect();
      const wx = (e.clientX - rect.left) * (MapModule.CANVAS_SIZE / rect.width) * 2;
      const wy = (e.clientY - rect.top)  * (MapModule.CANVAS_SIZE / rect.height) * 2;
      const g  = MapModule.worldToGrid(wx, wy);
      onMapTileClick && onMapTileClick(g.gx, g.gy);
    });

    c.addEventListener('touchend', e => {
      if (state.mode !== 'MAP') return;
      Audio.resume();
      const touch = e.changedTouches[0];
      const rect  = c.getBoundingClientRect();
      const wx = (touch.clientX - rect.left) * (MapModule.CANVAS_SIZE / rect.width) * 2;
      const wy = (touch.clientY - rect.top)  * (MapModule.CANVAS_SIZE / rect.height) * 2;
      const g  = MapModule.worldToGrid(wx, wy);
      onMapTileClick && onMapTileClick(g.gx, g.gy);
    });
  }

  // ── Helpers ──

  function _hideAll() {
    ['factionSelect','campaignMap','briefing','interWave','result'].forEach(k => {
      if (els[k]) els[k].classList.add('hidden');
    });
    hideControls();
    hideTutorial();
  }

  function showFactionSelect() {
    _hideAll();
    els.factionSelect.classList.remove('hidden');
  }

  function hideOverlays() { _hideAll(); }

  function _applyFactionTheme(faction) {
    document.documentElement.dataset.faction = faction === 'SOUTH' ? 'south' : '';
  }

  function applyFactionTheme(faction) { _applyFactionTheme(faction); }

  function getSalvoMode()  { return salvoMode; }
  function getIFFMode()    { return iffMode;   }
  function resetModes()    { salvoMode = false; iffMode = false; }

  return {
    init,
    showFactionSelect, showCampaignMap, showBriefing,
    bindBriefingDeploy, showMapControls, showRadarControls,
    hideControls, hideOverlays, showInterWave, showResult,
    showTutorial, hideTutorial,
    applyFactionTheme,
    getSalvoMode, getIFFMode, resetModes,
  };
})();

/* ── yu-game.js — Yugoslavia campaign GameState, main loop, mode FSM ── */
'use strict';

// ── GameState (S-125 Neva defaults) ──
const state = {
  mode: 'CAMPAIGN_MAP',  // CAMPAIGN_MAP | BRIEFING | MAP | TRANSITION | RADAR | INTER_WAVE | RESULT
  faction: 'YUGOSLAVIA',

  battery: { gridX: 7, gridY: 7, worldX: 720, worldY: 720 },

  radar: {
    surveillance: { on: false, sweepAngle: -Math.PI / 2 },
    targeting:    { on: false, sweepAngle: -Math.PI / 2, emitTimer: 0 },
  },
  heat:  { value: 0 },

  // S-125 Neva: 4 SM / 4 LG
  missiles: { small: 4, large: 4, smallMax: 4, largeMax: 4 },

  // Optical track — Yugoslavia special ability
  opticalTrack: { available: true, usedThisWave: false },

  threats:        [],
  activeMissiles: [],
  hunters:        [],
  falseBlips:     [],

  wave: {
    current:          0,
    total:            6,
    spawnQueue:       [],
    spawnDelay:       2.0,
    spawnTimer:       0,
    active:           false,
    currentWaveScore: 0,
  },

  asset:    { hp: 100 },
  campaign: {
    missionIndex:    0,
    score:           0,
    waveScores:      [],
    totalIntercepts: 0,
    totalMissiles:   0,
    progress:        [],
  },

  currentMission: null,
  objectiveKills: 0,  // Track kills for mission objectives

  batteryDestroyed:   false,
  missionComplete:    false,
  waveJustCompleted:  false,

  jammerSpawnTimer: 0,
  dt:   0,
  time: 0,

  shake: { x: 0, y: 0, timer: 0 },
  tutorial: { shown: false },
};

const MAP_HEAT_DRAIN = -8.0;

// ── Canvas refs ──
let mapCanvas   = null;
let radarCanvas = null;

// ── Loop state ──
let lastTime = 0;

// ── Init ──

function init() {
  mapCanvas   = document.getElementById('map-canvas');
  radarCanvas = document.getElementById('radar-canvas');

  MapModule.init(mapCanvas);
  Radar.init(radarCanvas);
  Audio.init();

  UI.init(state, {
    onMissionSelected:      onMissionSelected,
    onBriefingDeploy:       onBriefingDeploy,
    onSurveillanceToggle:   onSurveillanceToggle,
    onTargetingToggle:      onTargetingToggle,
    onReposition:           onReposition,
    onMapTileClick:         onMapTileClick,
    onInterWaveContinue:    onInterWaveContinue,
    onResultContinue:       onResultContinue,
  });

  // Init progress for 6 missions
  const missions = Campaign.getMissions();
  state.campaign.progress = missions.map(() => ({ completed: false, stars: 0 }));

  // Show campaign map directly (no faction select)
  UI.showCampaignMap(missions, state.campaign.progress);

  requestAnimationFrame(gameLoop);
}

// ── Main loop ──

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  state.dt   = dt;
  state.time += dt;

  if (state.mode === 'RADAR') {
    update(dt);
  } else if (state.mode === 'MAP') {
    updateHeat(dt);
  }

  render();
  checkStateTransitions();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  Radar.updateSweep(state);
  Threats.updateThreats(state);
  Threats.updateEmission(state);
  Threats.updateJammer(state);
  Missiles.updateMissiles(state);
  Threats.cleanupRemoved(state);
  Threats.updateWave(state);
  updateHeat(dt);
  updateShake(dt);
}

function updateHeat(dt) {
  if (state.mode === 'RADAR') {
    const eff = MapModule.getTerrainEffects(state.battery.gridX, state.battery.gridY);
    const survOn = state.radar.surveillance.on;
    const tgtOn  = state.radar.targeting.on;
    let rate;
    if (survOn || tgtOn) {
      rate = 0;
      if (survOn) rate += eff.heatOn * 0.15;
      if (tgtOn)  rate += eff.heatOn * 0.4;
    } else {
      rate = eff.heatOff;
    }
    state.heat.value = Math.min(100, state.heat.value + rate * dt);
    if (state.heat.value >= 100) {
      triggerForcedReposition();
    }
  } else if (state.mode === 'MAP') {
    state.heat.value = Math.max(0, state.heat.value + MAP_HEAT_DRAIN * dt);
  }
}

function updateShake(dt) {
  if (state.shake.timer > 0) {
    state.shake.timer -= dt;
    state.shake.x = (Math.random() - 0.5) * 6;
    state.shake.y = (Math.random() - 0.5) * 6;
  } else {
    state.shake.x = 0;
    state.shake.y = 0;
  }
}

function render() {
  if (state.shake.timer > 0) {
    radarCanvas.style.transform = `translate(${state.shake.x}px, ${state.shake.y}px)`;
  } else {
    radarCanvas.style.transform = '';
  }

  if (!['CAMPAIGN_MAP'].includes(state.mode)) {
    MapModule.render(state);
  }
  if (state.mode === 'RADAR') {
    Radar.render(state);
  } else {
    const ctx = radarCanvas.getContext('2d');
    ctx.clearRect(0, 0, 720, 720);
  }
}

function checkStateTransitions() {
  if (state.batteryDestroyed && state.mode === 'RADAR') {
    state.shake = { x: 0, y: 0, timer: 0.5 };
    setMode('RESULT');
    return;
  }
  if (state.asset.hp <= 0 && state.mode === 'RADAR') {
    state.shake = { x: 0, y: 0, timer: 0.4 };
    setMode('RESULT');
    return;
  }
  if (state.waveJustCompleted && state.mode === 'RADAR') {
    state.waveJustCompleted = false;
    setMode('INTER_WAVE');
    return;
  }
  if (state.missionComplete && state.mode === 'RADAR') {
    state.missionComplete = false;
    setMode('RESULT');
    return;
  }
}

// ── Mode FSM ──

function setMode(newMode) {
  const oldMode = state.mode;
  state.mode = newMode;

  if (oldMode === 'RADAR') {
    state.radar.surveillance.on = false;
    state.radar.targeting.on    = false;
    Audio.stopHunterWarning();
    Audio.stopJammerTone();
  }

  switch (newMode) {
    case 'MAP':
      UI.hideOverlays();
      radarCanvas.style.pointerEvents = 'none';
      MapModule.markDirty();
      UI.showMapControls();
      _showMapTutorial();
      break;

    case 'RADAR':
      UI.hideOverlays();
      radarCanvas.style.pointerEvents = 'auto';
      state.radar.surveillance.sweepAngle = -Math.PI / 2;
      state.radar.targeting.sweepAngle    = -Math.PI / 2;
      MapModule.markDirty();
      UI.showRadarControls(state);
      UI.hideTutorial();
      _showRadarTutorial();
      break;

    case 'INTER_WAVE': {
      UI.hideControls();
      const missions = Campaign.getMissions();
      const mission  = missions[state.campaign.missionIndex];
      const nextWaveDef = mission.waves[state.wave.current + 1] || null;
      UI.showInterWave(state, nextWaveDef);
      break;
    }

    case 'RESULT':
      UI.hideControls();
      Audio.stopHunterWarning();
      Audio.stopJammerTone();
      _saveProgress();
      UI.showResult(state);
      break;

    case 'CAMPAIGN_MAP': {
      UI.hideControls();
      const missionsList = Campaign.getMissions();
      UI.showCampaignMap(missionsList, state.campaign.progress);
      break;
    }
  }
}

// ── Event handlers ──

function onMissionSelected(missionIndex) {
  state.campaign.missionIndex = missionIndex;
  const missions = Campaign.getMissions();
  state.currentMission = missions[missionIndex];

  Audio.resume();
  Audio.playModeSwitch();
  setMode('BRIEFING');

  // Load map with geographic overlay
  const mapGrid = Campaign.getMap(state.currentMission.mapKey);
  const geoOverlay = Campaign.getGeoOverlay(state.currentMission.mapKey);
  if (mapGrid) MapModule.loadMap(mapGrid, geoOverlay);

  UI.showBriefing(state.currentMission);
  UI.bindBriefingDeploy();
}

function onBriefingDeploy() {
  if (state.mode === 'BRIEFING') {
    _initMission();
    Audio.playModeSwitch();
    setMode('MAP');
  } else if (state.mode === 'MAP') {
    _startRadarMode();
  }
}

function _initMission() {
  state.missiles.small    = 4;
  state.missiles.large    = 4;
  state.missiles.smallMax = 4;
  state.missiles.largeMax = 4;
  state.asset.hp          = 100;
  state.heat.value        = 0;
  state.threats           = [];
  state.activeMissiles    = [];
  state.falseBlips        = [];
  state.wave.current      = 0;
  state.wave.active       = false;
  state.wave.spawnQueue   = [];
  state.wave.currentWaveScore = 0;
  state.campaign.score    = 0;
  state.campaign.waveScores   = [];
  state.campaign.totalIntercepts = 0;
  state.campaign.totalMissiles   = 0;
  state.batteryDestroyed  = false;
  state.missionComplete   = false;
  state.waveJustCompleted = false;
  state.objectiveKills    = 0;
  state.opticalTrack.usedThisWave = false;
  state.radar.surveillance.on         = false;
  state.radar.surveillance.sweepAngle = -Math.PI / 2;
  state.radar.targeting.on            = false;
  state.radar.targeting.sweepAngle    = -Math.PI / 2;
  state.radar.targeting.emitTimer     = 0;

  setBatteryPosition(7, 7);
}

function _startRadarMode() {
  const terrain = MapModule.getTerrain(state.battery.gridX, state.battery.gridY);
  if (terrain === 'airfield') {
    Threats.resupplyDepot(state);
  }
  Audio.playModeSwitch();
  setMode('RADAR');

  if (!state.wave.active && state.wave.current < state.wave.total) {
    Threats.startWave(state);
  }
}

function onSurveillanceToggle() {
  if (state.mode !== 'RADAR') return;
  state.radar.surveillance.on = !state.radar.surveillance.on;
  UI.showRadarControls(state);
  Audio.playModeSwitch();
  MapModule.markDirty();
}

function onTargetingToggle() {
  if (state.mode !== 'RADAR') return;
  state.radar.targeting.on = !state.radar.targeting.on;
  if (!state.radar.targeting.on) {
    state.radar.targeting.emitTimer = 0;
  }
  UI.showRadarControls(state);
  Audio.playModeSwitch();
  MapModule.markDirty();
}

function onReposition() {
  if (state.mode !== 'RADAR' && state.mode !== 'MAP') return;
  Audio.playModeSwitch();
  setMode('MAP');
  MapModule.markDirty();
}

function triggerForcedReposition() {
  state.heat.value = 100;
  state.shake = { x: 0, y: 0, timer: 0.3 };
  onReposition();
}

function onMapTileClick(gx, gy) {
  if (state.mode !== 'MAP') return;
  // Prevent placement on river tiles
  const terrain = MapModule.getTerrain(gx, gy);
  if (terrain === 'river') return;
  setBatteryPosition(gx, gy);
}

function setBatteryPosition(gx, gy) {
  const clamped = {
    gx: Math.max(0, Math.min(MapModule.GRID_SIZE - 1, gx)),
    gy: Math.max(0, Math.min(MapModule.GRID_SIZE - 1, gy)),
  };
  const world = MapModule.gridToWorld(clamped.gx, clamped.gy);
  state.battery.gridX  = clamped.gx;
  state.battery.gridY  = clamped.gy;
  state.battery.worldX = world.x;
  state.battery.worldY = world.y;
  MapModule.markDirty();
}

function onInterWaveContinue() {
  state.wave.current++;
  state.wave.currentWaveScore = 0;
  state.opticalTrack.usedThisWave = false;

  // S-125 resupply: +1 SM, +1 LG
  state.missiles.small = Math.min(state.missiles.smallMax, state.missiles.small + 1);
  state.missiles.large = Math.min(state.missiles.largeMax, state.missiles.large + 1);

  Audio.playModeSwitch();
  setMode('MAP');
}

function onResultContinue(action) {
  if (action === 'retry') {
    const idx = state.campaign.missionIndex;
    const missions = Campaign.getMissions();
    state.currentMission = missions[idx];
    const mapGrid = Campaign.getMap(state.currentMission.mapKey);
    const geoOverlay = Campaign.getGeoOverlay(state.currentMission.mapKey);
    if (mapGrid) MapModule.loadMap(mapGrid, geoOverlay);
    _initMission();
    UI.showBriefing(state.currentMission);
    UI.bindBriefingDeploy();
    state.mode = 'BRIEFING';
  } else {
    setMode('CAMPAIGN_MAP');
  }
}

function _saveProgress() {
  const idx = state.campaign.missionIndex;
  const success = !state.batteryDestroyed && state.asset.hp > 0;

  // Check mission objective
  let objectiveMet = true;
  if (state.currentMission && state.currentMission.objective) {
    const obj = state.currentMission.objective;
    const kills = state.objectiveKills || 0;
    objectiveMet = kills >= obj.count;
  }

  const fullSuccess = success && objectiveMet;

  let stars = 0;
  if (fullSuccess) {
    stars = 1;
    if (state.asset.hp >= 60) stars = 2;
    if (state.asset.hp >= 90 && state.campaign.score >= 1500) stars = 3;
  }
  const prev = state.campaign.progress[idx] || {};
  state.campaign.progress[idx] = {
    completed: fullSuccess || prev.completed,
    stars:     Math.max(stars, prev.stars || 0),
  };
}

// ── Tutorial helpers ──

function _showMapTutorial() {
  const terrain = MapModule.getTerrain(state.battery.gridX, state.battery.gridY);
  const hint = terrain === 'airfield'
    ? 'AIRFIELD \u2014 resupply on engagement. Click tile to reposition. SPACE to engage.'
    : 'Click a tile to reposition battery. SPACE or [ENGAGE] to go to radar.';
  UI.showTutorial(hint);
  setTimeout(() => UI.hideTutorial(), 5000);
}

function _showRadarTutorial() {
  if (state.wave.current > 0) return;
  UI.showTutorial('[Q] surv  |  [R] target (2s HARM!)  |  [O] optical  |  CLICK blip to fire  |  [M] map');
  setTimeout(() => UI.hideTutorial(), 8000);
}

// ── Boot ──
window.addEventListener('DOMContentLoaded', init);

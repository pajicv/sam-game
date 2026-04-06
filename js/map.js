/* ── map.js — terrain grid, tile renderer, coverage preview ── */
'use strict';

const MapModule = (() => {
  const TILE_SIZE    = 96;  // world units per tile (logical space)
  const TILE_SIZE_PX = 48;  // canvas pixels per tile (render space)
  const GRID_SIZE    = 15;
  const WORLD_SIZE   = TILE_SIZE    * GRID_SIZE; // 1440 world units
  const CANVAS_SIZE  = TILE_SIZE_PX * GRID_SIZE; // 720 canvas pixels

  const TERRAIN_COLORS = {
    open:    '#B89A6A',
    savanna: '#8DA05A',
    jungle:  '#2A5225',
    ridge:   '#7A6545',
    ruins:   '#5E5E5E',
    depot:   '#3E6E4A',
    river:   '#6B8FA8',
  };

  const TERRAIN_BORDER = {
    open:    '#9A7D52',
    savanna: '#6E7D40',
    jungle:  '#1E3D1A',
    ridge:   '#5A4A2E',
    ruins:   '#444',
    depot:   '#2A5234',
    river:   '#4A6E88',
  };

  const TERRAIN_LABEL = {
    open:    'OPEN',
    savanna: 'SAVANNA',
    jungle:  'JUNGLE',
    ridge:   'RIDGE',
    ruins:   'RUINS',
    depot:   'DEPOT',
    river:   'RIVER',
  };

  const TERRAIN_EFFECTS = {
    open:    { radarMod:1.00, heatOn:5.0, heatOff:2.0 },
    savanna: { radarMod:0.95, heatOn:4.0, heatOff:1.5 },
    jungle:  { radarMod:0.70, heatOn:1.5, heatOff:0.5 },
    ridge:   { radarMod:1.30, heatOn:3.5, heatOff:1.5 },
    ruins:   { radarMod:0.85, heatOn:2.5, heatOff:1.0 },
    depot:   { radarMod:0.90, heatOn:3.0, heatOff:1.5 },
    river:   { radarMod:1.00, heatOn:5.0, heatOff:2.0 },
  };

  const BASE_RADAR_RANGE = 700; // world units (2× tile size doubled)

  let mapGrid = null; // 2D array [row][col] of terrain strings
  let mapDirty = true;
  let canvas = null;
  let ctx = null;

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    ctx = canvas.getContext('2d');
  }

  function loadMap(gridData) {
    mapGrid = gridData;
    mapDirty = true;
  }

  function getTerrain(gx, gy) {
    if (!mapGrid) return 'open';
    const row = mapGrid[Math.max(0, Math.min(GRID_SIZE - 1, gy))];
    if (!row) return 'open';
    return row[Math.max(0, Math.min(GRID_SIZE - 1, gx))] || 'open';
  }

  function getTerrainEffects(gx, gy) {
    return TERRAIN_EFFECTS[getTerrain(gx, gy)];
  }

  function getRadarRange(state) {
    const eff     = getTerrainEffects(state.battery.gridX, state.battery.gridY);
    const facMod  = state.faction === 'NORTH' ? 0.85 : 1.20;
    return BASE_RADAR_RANGE * eff.radarMod * facMod;
  }

  function gridToWorld(gx, gy) {
    return {
      x: gx * TILE_SIZE + TILE_SIZE / 2,
      y: gy * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  // canvas pixel click → world unit position
  function canvasToWorld(cx, cy) {
    return { x: cx * 2, y: cy * 2 };
  }

  // world unit → canvas pixel (for rendering)
  function worldToCanvas(wx, wy) {
    return { x: wx * 0.5, y: wy * 0.5 };
  }

  function worldToGrid(wx, wy) {
    return {
      gx: Math.floor(wx / TILE_SIZE),
      gy: Math.floor(wy / TILE_SIZE),
    };
  }

  function markDirty() { mapDirty = true; }

  function render(state) {
    if (!mapDirty) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw terrain tiles (pixel coords use TILE_SIZE_PX)
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const terrain = getTerrain(gx, gy);
        const x = gx * TILE_SIZE_PX;
        const y = gy * TILE_SIZE_PX;

        ctx.fillStyle = TERRAIN_COLORS[terrain];
        ctx.fillRect(x, y, TILE_SIZE_PX, TILE_SIZE_PX);

        // Subtle texture stripes for some terrain types
        if (terrain === 'jungle') {
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          for (let s = 0; s < TILE_SIZE_PX; s += 6) {
            ctx.fillRect(x + s, y, 3, TILE_SIZE_PX);
          }
        }
        if (terrain === 'ridge') {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          for (let s = 0; s < TILE_SIZE_PX; s += 4) {
            ctx.fillRect(x, y + s, TILE_SIZE_PX, 2);
          }
        }

        // Border
        ctx.strokeStyle = TERRAIN_BORDER[terrain];
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE_PX - 1, TILE_SIZE_PX - 1);
      }
    }

    // Depot icon indicator
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const terrain = getTerrain(gx, gy);
        if (terrain === 'depot') {
          ctx.fillStyle = 'rgba(100,200,120,0.4)';
          ctx.font = '10px Courier New';
          ctx.textAlign = 'center';
          ctx.fillText('D', gx * TILE_SIZE_PX + TILE_SIZE_PX / 2, gy * TILE_SIZE_PX + TILE_SIZE_PX / 2 + 4);
        }
      }
    }

    // In MAP mode: draw radar coverage preview and battery icon
    if (state.mode === 'MAP' || state.mode === 'TRANSITION' || state.mode === 'BRIEFING') {
      // Convert world units → canvas pixels for rendering
      const bx = state.battery.worldX * 0.5;
      const by = state.battery.worldY * 0.5;
      const tgtRangePx  = getRadarRange(state) * 0.5;
      const survRangePx = tgtRangePx * 2.0;

      // Surveillance coverage circle (outer, dimmer)
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#5a8a5a';
      ctx.beginPath();
      ctx.arc(bx, by, survRangePx, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#5a8a5a';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(bx, by, survRangePx, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Targeting coverage circle (inner, brighter)
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(bx, by, tgtRangePx, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(bx, by, tgtRangePx, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Battery icon
      _drawBatteryIcon(ctx, bx, by, state);

      // Terrain label for current tile
      const terrain = getTerrain(state.battery.gridX, state.battery.gridY);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ccc';
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`[${TERRAIN_LABEL[terrain]}]`, 6, CANVAS_SIZE - 8);
      ctx.restore();
    }

    // In RADAR mode: dim map to 30%
    if (state.mode === 'RADAR') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

      // Faint battery dot (world → canvas px)
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(state.battery.worldX * 0.5, state.battery.worldY * 0.5, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    mapDirty = false;
  }

  function _drawBatteryIcon(ctx, bx, by, state) {
    const color = state.faction === 'NORTH' ? '#D4A017' : '#2E86AB';
    const size = 10;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth = 2;

    // Cross-hair style icon
    ctx.beginPath();
    ctx.moveTo(bx - size, by);
    ctx.lineTo(bx + size, by);
    ctx.moveTo(bx, by - size);
    ctx.lineTo(bx, by + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, 2 * Math.PI);
    ctx.fill();

    // Label
    ctx.font = '9px Courier New';
    ctx.textAlign = 'left';
    ctx.globalAlpha = 0.8;
    const label = state.faction === 'NORTH' ? 'SAM' : 'HQ-22';
    ctx.fillText(label, bx + 12, by - 4);
    ctx.restore();
  }

  // Highlight a grid cell on hover
  function highlightCell(gx, gy, color = 'rgba(255,255,255,0.15)') {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(gx * TILE_SIZE_PX, gy * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
    ctx.restore();
  }

  return {
    init, loadMap, render, markDirty,
    getTerrain, getTerrainEffects, getRadarRange,
    gridToWorld, worldToGrid, canvasToWorld, worldToCanvas,
    highlightCell,
    TILE_SIZE, TILE_SIZE_PX, GRID_SIZE, CANVAS_SIZE, WORLD_SIZE,
    TERRAIN_COLORS, TERRAIN_LABEL,
    BASE_RADAR_RANGE,
  };
})();

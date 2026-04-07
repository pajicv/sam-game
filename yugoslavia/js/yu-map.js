/* ── yu-map.js — procedural Belgrade terrain renderer + 15×15 grid ── */
'use strict';

const MapModule = (() => {
  const TILE_SIZE    = 96;
  const TILE_SIZE_PX = 48;
  const GRID_SIZE    = 15;
  const WORLD_SIZE   = TILE_SIZE    * GRID_SIZE;
  const CANVAS_SIZE  = TILE_SIZE_PX * GRID_SIZE;

  // Yugoslavia-specific terrain colors (dark military/tactical palette)
  const TERRAIN_COLORS = {
    open:     '#6a7a5a',
    plains:   '#7a8a5a',
    forest:   '#1e3e1a',
    ridge:    '#5a4a32',
    urban:    '#4a4a50',
    airfield: '#3a5a3a',
    river:    '#1a3a5a',
  };

  const TERRAIN_BORDER = {
    open:     '#5a6a4a',
    plains:   '#6a7a4a',
    forest:   '#142e10',
    ridge:    '#4a3a22',
    urban:    '#3a3a40',
    airfield: '#2a4a2a',
    river:    '#0a2a4a',
  };

  const TERRAIN_LABEL = {
    open:     'OPEN',
    plains:   'PLAINS',
    forest:   'FOREST',
    ridge:    'RIDGE',
    urban:    'URBAN',
    airfield: 'AIRFIELD',
    river:    'RIVER',
  };

  const TERRAIN_EFFECTS = {
    open:     { radarMod:1.00, heatOn:5.0, heatOff:2.0 },
    plains:   { radarMod:1.10, heatOn:6.0, heatOff:2.5 },
    forest:   { radarMod:0.75, heatOn:1.5, heatOff:0.5 },
    ridge:    { radarMod:1.30, heatOn:3.5, heatOff:1.5 },
    urban:    { radarMod:0.80, heatOn:2.0, heatOff:1.0 },
    airfield: { radarMod:0.90, heatOn:3.0, heatOff:1.5 },
    river:    { radarMod:1.00, heatOn:5.0, heatOff:2.0 },
  };

  const BASE_RADAR_RANGE = 700;

  let mapGrid = null;
  let geoOverlay = null;
  let mapDirty = true;
  let canvas = null;
  let ctx = null;
  let bgCanvas = null; // offscreen canvas for cached geographic background

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    ctx = canvas.getContext('2d');
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = CANVAS_SIZE;
    bgCanvas.height = CANVAS_SIZE;
  }

  function loadMap(gridData, overlay) {
    mapGrid = gridData;
    geoOverlay = overlay || null;
    _renderBackground();
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
    const eff = getTerrainEffects(state.battery.gridX, state.battery.gridY);
    // Yugoslavia faction modifier = 1.0 (no bonus, no penalty)
    return BASE_RADAR_RANGE * eff.radarMod;
  }

  function gridToWorld(gx, gy) {
    return {
      x: gx * TILE_SIZE + TILE_SIZE / 2,
      y: gy * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  function canvasToWorld(cx, cy) {
    return { x: cx * 2, y: cy * 2 };
  }

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

  // ── Render cached geographic background to offscreen canvas ──
  function _renderBackground() {
    const bg = bgCanvas.getContext('2d');
    bg.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 1. Draw terrain tiles
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const terrain = getTerrain(gx, gy);
        const x = gx * TILE_SIZE_PX;
        const y = gy * TILE_SIZE_PX;

        bg.fillStyle = TERRAIN_COLORS[terrain] || TERRAIN_COLORS.open;
        bg.fillRect(x, y, TILE_SIZE_PX, TILE_SIZE_PX);

        // Texture overlays
        if (terrain === 'forest') {
          bg.fillStyle = 'rgba(0,0,0,0.15)';
          for (let s = 0; s < TILE_SIZE_PX; s += 5) {
            bg.fillRect(x + s, y, 2, TILE_SIZE_PX);
          }
          // Occasional tree dot
          bg.fillStyle = 'rgba(0,40,0,0.3)';
          for (let i = 0; i < 3; i++) {
            const tx = x + 8 + (i * 14) + (gy % 2) * 6;
            const ty = y + 10 + (gx % 3) * 12;
            bg.beginPath();
            bg.arc(tx, ty, 3, 0, 2 * Math.PI);
            bg.fill();
          }
        }
        if (terrain === 'ridge') {
          bg.fillStyle = 'rgba(255,255,255,0.06)';
          for (let s = 0; s < TILE_SIZE_PX; s += 4) {
            bg.fillRect(x, y + s, TILE_SIZE_PX, 1);
          }
          // Contour lines
          bg.strokeStyle = 'rgba(120,100,70,0.2)';
          bg.lineWidth = 0.5;
          bg.beginPath();
          bg.arc(x + TILE_SIZE_PX/2, y + TILE_SIZE_PX/2, 16, 0, 2 * Math.PI);
          bg.stroke();
        }
        if (terrain === 'urban') {
          // Grid-like pattern for city blocks
          bg.strokeStyle = 'rgba(120,120,130,0.15)';
          bg.lineWidth = 0.5;
          for (let s = 0; s < TILE_SIZE_PX; s += 8) {
            bg.beginPath(); bg.moveTo(x + s, y); bg.lineTo(x + s, y + TILE_SIZE_PX); bg.stroke();
            bg.beginPath(); bg.moveTo(x, y + s); bg.lineTo(x + TILE_SIZE_PX, y + s); bg.stroke();
          }
          // Occasional building block
          bg.fillStyle = 'rgba(80,80,90,0.3)';
          if ((gx + gy) % 3 === 0) {
            bg.fillRect(x + 6, y + 6, 12, 10);
            bg.fillRect(x + 26, y + 20, 14, 12);
          }
        }
        if (terrain === 'river') {
          // Water ripple effect
          bg.fillStyle = 'rgba(30,70,110,0.15)';
          for (let s = 0; s < TILE_SIZE_PX; s += 6) {
            bg.fillRect(x, y + s, TILE_SIZE_PX, 2);
          }
        }
        if (terrain === 'airfield') {
          bg.fillStyle = 'rgba(100,200,120,0.15)';
          bg.font = '9px Courier New';
          bg.textAlign = 'center';
          bg.fillText('AB', x + TILE_SIZE_PX / 2, y + TILE_SIZE_PX / 2 + 3);
          // Runway markings
          bg.strokeStyle = 'rgba(200,200,200,0.15)';
          bg.lineWidth = 2;
          bg.setLineDash([4, 4]);
          bg.beginPath();
          bg.moveTo(x + 8, y + TILE_SIZE_PX / 2);
          bg.lineTo(x + TILE_SIZE_PX - 8, y + TILE_SIZE_PX / 2);
          bg.stroke();
          bg.setLineDash([]);
        }

        // Tile border (very subtle)
        bg.strokeStyle = TERRAIN_BORDER[terrain] || '#333';
        bg.lineWidth = 0.3;
        bg.strokeRect(x + 0.5, y + 0.5, TILE_SIZE_PX - 1, TILE_SIZE_PX - 1);
      }
    }

    // 2. Geographic overlay: rivers
    if (geoOverlay && geoOverlay.rivers) {
      for (const river of geoOverlay.rivers) {
        if (river.points.length < 2) continue;
        bg.save();
        bg.strokeStyle = river.color || '#1a3a5a';
        bg.lineWidth = river.width || 12;
        bg.lineCap = 'round';
        bg.lineJoin = 'round';
        bg.globalAlpha = 0.6;
        bg.beginPath();
        bg.moveTo(river.points[0][0], river.points[0][1]);
        for (let i = 1; i < river.points.length; i++) {
          bg.lineTo(river.points[i][0], river.points[i][1]);
        }
        bg.stroke();

        // River bank glow
        bg.strokeStyle = 'rgba(30,80,130,0.15)';
        bg.lineWidth = (river.width || 12) + 8;
        bg.beginPath();
        bg.moveTo(river.points[0][0], river.points[0][1]);
        for (let i = 1; i < river.points.length; i++) {
          bg.lineTo(river.points[i][0], river.points[i][1]);
        }
        bg.stroke();
        bg.restore();
      }
    }

    // 3. Geographic overlay: region polygons
    if (geoOverlay && geoOverlay.regions) {
      for (const region of geoOverlay.regions) {
        if (!region.polygon || region.polygon.length < 3) continue;
        bg.save();
        bg.fillStyle = region.fill || 'rgba(100,100,100,0.1)';
        bg.beginPath();
        bg.moveTo(region.polygon[0][0], region.polygon[0][1]);
        for (let i = 1; i < region.polygon.length; i++) {
          bg.lineTo(region.polygon[i][0], region.polygon[i][1]);
        }
        bg.closePath();
        bg.fill();
        bg.restore();
      }
    }

    // 4. Geographic overlay: labels
    if (geoOverlay && geoOverlay.labels) {
      for (const label of geoOverlay.labels) {
        bg.save();
        bg.font = `${label.size || 10}px Courier New`;
        bg.fillStyle = label.color || 'rgba(200,200,200,0.2)';
        bg.textAlign = 'center';
        bg.textBaseline = 'middle';
        bg.fillText(label.text, label.x, label.y);
        bg.restore();
      }
    }

    // 5. Subtle coordinate grid overlay
    bg.save();
    bg.strokeStyle = 'rgba(100,200,100,0.04)';
    bg.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const p = i * TILE_SIZE_PX;
      bg.beginPath(); bg.moveTo(p, 0); bg.lineTo(p, CANVAS_SIZE); bg.stroke();
      bg.beginPath(); bg.moveTo(0, p); bg.lineTo(CANVAS_SIZE, p); bg.stroke();
    }
    bg.restore();
  }

  function render(state) {
    if (!mapDirty) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Blit cached background
    ctx.drawImage(bgCanvas, 0, 0);

    // In MAP mode: draw radar coverage preview and battery icon
    if (state.mode === 'MAP' || state.mode === 'TRANSITION' || state.mode === 'BRIEFING') {
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

      // Terrain label
      const terrain = getTerrain(state.battery.gridX, state.battery.gridY);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ccc';
      ctx.font = '10px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(`[${TERRAIN_LABEL[terrain]}]`, 6, CANVAS_SIZE - 8);
      ctx.restore();
    }

    // In RADAR mode: dim map
    if (state.mode === 'RADAR') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

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
    const color = '#C41E3A'; // Serbian red
    const size = 10;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth = 2;

    // Cross-hair
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
    ctx.fillText('S-125', bx + 12, by - 4);
    ctx.restore();
  }

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

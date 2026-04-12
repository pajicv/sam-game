/* ── yu-map.js — Leaflet + OSM real-world map (Srem region) ── */
'use strict';

const MapModule = (() => {
  const TILE_SIZE    = 96;
  const TILE_SIZE_PX = 48;
  const GRID_SIZE    = 15;
  const WORLD_SIZE   = TILE_SIZE * GRID_SIZE;   // 1440
  const CANVAS_SIZE  = TILE_SIZE_PX * GRID_SIZE; // 720

  // ── Terrain tables (game mechanics) ──
  const TERRAIN_COLORS = {
    open:'#6a7a5a', plains:'#7a8a5a', forest:'#1e3e1a',
    ridge:'#5a4a32', urban:'#4a4a50', airfield:'#3a5a3a', river:'#1a3a5a',
  };
  const TERRAIN_LABEL = {
    open:'OPEN', plains:'PLAINS', forest:'FOREST', ridge:'RIDGE',
    urban:'URBAN', airfield:'AIRFIELD', river:'RIVER',
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

  // ── Geo bounds: Srem area (default) ──
  // NW corner → world (0,0), SE corner → world (1440,1440)
  const DEFAULT_BOUNDS = {
    north: 44.92, south: 44.64,
    west: 19.88, east: 20.28,
  };

  // ── State ──
  let mapGrid = null;
  let mapDirty = true;
  let leafletMap = null;
  let mapDiv = null;
  let bounds = DEFAULT_BOUNDS;

  // Leaflet layers
  let batteryMarker = null;
  let survCircle = null;
  let tgtCircle = null;
  let gridOverlay = null;
  let clickCallback = null;

  // ══════════════════════════════════════════════════
  //  COORDINATE CONVERSION
  // ══════════════════════════════════════════════════

  function worldToLatLng(wx, wy) {
    // wx: 0 → west, WORLD_SIZE → east
    // wy: 0 → north, WORLD_SIZE → south (screen Y = down = south)
    const lng = bounds.west + (wx / WORLD_SIZE) * (bounds.east - bounds.west);
    const lat = bounds.north - (wy / WORLD_SIZE) * (bounds.north - bounds.south);
    return [lat, lng];
  }

  function latLngToWorld(lat, lng) {
    const wx = ((lng - bounds.west) / (bounds.east - bounds.west)) * WORLD_SIZE;
    const wy = ((bounds.north - lat) / (bounds.north - bounds.south)) * WORLD_SIZE;
    return { x: wx, y: wy };
  }

  // World units → approximate meters (for Leaflet circle radius)
  function worldUnitsToMeters(units) {
    // At ~44.78°N: 1° lat ≈ 111km, our WORLD_SIZE covers ~0.28° lat
    const mapHeightMeters = (bounds.north - bounds.south) * 111000;
    return (units / WORLD_SIZE) * mapHeightMeters;
  }

  // ══════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════

  function init(divId) {
    mapDiv = document.getElementById(divId);

    leafletMap = L.map(mapDiv, {
      center: [44.78, 20.08],
      zoom: 13,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '',
    }).addTo(leafletMap);

    // Click handler for battery placement
    leafletMap.on('click', _onMapClick);
    leafletMap.on('touchend', _onMapTouch);

    // Create overlay layers (empty initially)
    batteryMarker = null;
    survCircle = null;
    tgtCircle = null;
  }

  function _onMapClick(e) {
    if (!clickCallback) return;
    const world = latLngToWorld(e.latlng.lat, e.latlng.lng);
    const g = worldToGrid(world.x, world.y);
    clickCallback(g.gx, g.gy);
  }

  function _onMapTouch(e) {
    // Leaflet touchend doesn't always give latlng, handle via click
  }

  function onMapClick(cb) {
    clickCallback = cb;
  }

  // ══════════════════════════════════════════════════
  //  LOAD MAP
  // ══════════════════════════════════════════════════

  function loadMap(gridData, missionData) {
    mapGrid = gridData;

    // Clear old overlays
    if (batteryMarker) { leafletMap.removeLayer(batteryMarker); batteryMarker = null; }
    if (survCircle)    { leafletMap.removeLayer(survCircle); survCircle = null; }
    if (tgtCircle)     { leafletMap.removeLayer(tgtCircle); tgtCircle = null; }
    if (gridOverlay)   { leafletMap.removeLayer(gridOverlay); gridOverlay = null; }

    // Set map view to mission center
    if (missionData && missionData.center) {
      leafletMap.setView(missionData.center, missionData.zoom || 13, { animate: false });
      // Update bounds based on current map view
      const b = leafletMap.getBounds();
      bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        west: b.getWest(),
        east: b.getEast(),
      };
    }

    mapDirty = true;
  }

  // ══════════════════════════════════════════════════
  //  TERRAIN (unchanged game mechanics)
  // ══════════════════════════════════════════════════

  function getTerrain(gx, gy) {
    if (!mapGrid) return 'open';
    const row = mapGrid[Math.max(0, Math.min(GRID_SIZE - 1, gy))];
    if (!row) return 'open';
    return row[Math.max(0, Math.min(GRID_SIZE - 1, gx))] || 'open';
  }

  function getTerrainEffects(gx, gy) { return TERRAIN_EFFECTS[getTerrain(gx, gy)]; }

  function getRadarRange(state) {
    const eff = getTerrainEffects(state.battery.gridX, state.battery.gridY);
    return BASE_RADAR_RANGE * eff.radarMod;
  }

  // ══════════════════════════════════════════════════
  //  COORDINATE FUNCTIONS (same interface)
  // ══════════════════════════════════════════════════

  function gridToWorld(gx, gy) {
    return { x: gx * TILE_SIZE + TILE_SIZE / 2, y: gy * TILE_SIZE + TILE_SIZE / 2 };
  }

  function canvasToWorld(cx, cy) { return { x: cx * 2, y: cy * 2 }; }
  function worldToCanvas(wx, wy) { return { x: wx * 0.5, y: wy * 0.5 }; }

  function worldToGrid(wx, wy) {
    return {
      gx: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(wx / TILE_SIZE))),
      gy: Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(wy / TILE_SIZE))),
    };
  }

  function markDirty() { mapDirty = true; }

  // ══════════════════════════════════════════════════
  //  RENDER (update Leaflet overlays)
  // ══════════════════════════════════════════════════

  function render(state) {
    if (!mapDirty || !leafletMap) return;

    // Toggle radar-mode dim
    if (state.mode === 'RADAR') {
      mapDiv.classList.add('radar-mode');
    } else {
      mapDiv.classList.remove('radar-mode');
    }

    // MAP/BRIEFING mode: show battery + coverage
    if (state.mode === 'MAP' || state.mode === 'TRANSITION' || state.mode === 'BRIEFING') {
      const ll = worldToLatLng(state.battery.worldX, state.battery.worldY);

      // Battery marker
      if (!batteryMarker) {
        const icon = L.divIcon({
          className: 'battery-marker',
          html: `<div class="battery-icon">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <line x1="4" y1="14" x2="24" y2="14" stroke="#C41E3A" stroke-width="2"/>
              <line x1="14" y1="4" x2="14" y2="24" stroke="#C41E3A" stroke-width="2"/>
              <circle cx="14" cy="14" r="7" stroke="#C41E3A" stroke-width="1.5" fill="none"/>
              <circle cx="14" cy="14" r="2.5" fill="#C41E3A"/>
            </svg>
            <span class="battery-label">S-125</span>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        batteryMarker = L.marker(ll, { icon, interactive: false }).addTo(leafletMap);
      } else {
        batteryMarker.setLatLng(ll);
      }

      // Coverage circles
      const tgtRangeM  = worldUnitsToMeters(getRadarRange(state));
      const survRangeM = tgtRangeM * 3.0;

      if (!survCircle) {
        survCircle = L.circle(ll, {
          radius: survRangeM,
          color: '#5a8a5a', weight: 1, dashArray: '6,4',
          fillColor: '#5a8a5a', fillOpacity: 0.04,
          interactive: false,
        }).addTo(leafletMap);
      } else {
        survCircle.setLatLng(ll);
        survCircle.setRadius(survRangeM);
      }

      if (!tgtCircle) {
        tgtCircle = L.circle(ll, {
          radius: tgtRangeM,
          color: '#00ff00', weight: 1, dashArray: '6,4',
          fillColor: '#00ff00', fillOpacity: 0.06,
          interactive: false,
        }).addTo(leafletMap);
      } else {
        tgtCircle.setLatLng(ll);
        tgtCircle.setRadius(tgtRangeM);
      }
    }

    // RADAR mode: hide overlays (map is dimmed by CSS)
    if (state.mode === 'RADAR') {
      if (batteryMarker) { leafletMap.removeLayer(batteryMarker); batteryMarker = null; }
      if (survCircle)    { leafletMap.removeLayer(survCircle); survCircle = null; }
      if (tgtCircle)     { leafletMap.removeLayer(tgtCircle); tgtCircle = null; }
    }

    mapDirty = false;
  }

  function highlightCell(gx, gy, color) {
    // No-op for Leaflet version (could add rectangle overlay later)
  }

  // ══════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════

  return {
    init, loadMap, render, markDirty,
    getTerrain, getTerrainEffects, getRadarRange,
    gridToWorld, worldToGrid, canvasToWorld, worldToCanvas,
    worldToLatLng, latLngToWorld, onMapClick,
    highlightCell,
    TILE_SIZE, TILE_SIZE_PX, GRID_SIZE, CANVAS_SIZE, WORLD_SIZE,
    TERRAIN_COLORS, TERRAIN_LABEL,
    BASE_RADAR_RANGE,
  };
})();

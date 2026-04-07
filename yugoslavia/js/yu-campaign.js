/* ── yu-campaign.js — NATO threat roster, 6 Yugoslav missions, Belgrade maps ── */
'use strict';

const Campaign = (() => {

  // ── Tile key (expanded for Yugoslav geography) ──
  const TILE_KEY = {
    'O': 'open',    'P': 'plains',  'F': 'forest',
    'R': 'ridge',   'U': 'urban',   'A': 'airfield',
    'V': 'river',
  };

  // ── Hand-authored 15×15 maps (each row = 15 chars) ──
  // Terrain types: P=plains, U=urban, F=forest, R=ridge, V=river, A=airfield, O=open

  const MAPS = {
    // Mission 1: Vojvodina plains — flat farmland, Danube to south
    YU1: [
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPOPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPOPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPOPPPAPP',
      'PPPPPPPPPPPAAAP',
      'PPPPPPPPPPOPPPP',
      'PPPPPPPPPPPPPPP',
      'PPOPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'VVVVVVVVVVVVVVV',
      'VVVVVVVVVVVVVVV',
      'OOOOPPPPPOOOOOP',
    ].map(r => r.slice(0, 15)),

    // Mission 2: Belgrade suburbs — urban sprawl, Sava/Danube confluence
    YU2: [
      'PPPPPPPPVVVPPPP',
      'PPPPPPPVVVVPPPP',
      'PPPPPPVVVVVPPPP',
      'PPPPPVVVVVVPPPP',
      'FFPPVVVVVPPPPPP',
      'FFFPPVVUUUUPPPP',
      'FFFFPPUUUUUUPPP',
      'FFFFPUUUUUUUPPP',
      'FFFPPUUUUUUPPPP',
      'FFPPPUUUUUPPPPP',
      'FPPPPPUUPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPFFPPPPP',
      'PPPPPPPPFFFPPPP',
      'PPPPPPPFFFFFFFF',
    ].map(r => r.slice(0, 15)),

    // Mission 3: Serbian ridge — hilly terrain south of Belgrade
    YU3: [
      'PPPPPPPPFFPPPPP',
      'PPPPPPPFFFPPPPP',
      'PPPPPPFFFFRPPPP',
      'PPPPFFFFFFRRPPP',
      'PPPFFFFFFRRRPPP',
      'PPFFFFFFRRRRPPP',
      'PPFFFFFRRRRPPPP',
      'PPFFFFFRRRRPPPP',
      'PPFFFFFFRRRRPPP',
      'PPPFFFFFFRRRPPP',
      'PPPPFFFFFRRPPPP',
      'PPPPPFFFFRPPPPP',
      'PPPPPPFFFPPPPPP',
      'PPPPPPPFFPPPPPP',
      'PPPPPPPPFPPPPPP',
    ].map(r => r.slice(0, 15)),

    // Mission 4: Kosovo plains — flat open, river crossing
    YU4: [
      'OOOOPPPPOOOOOOO',
      'OOOOPPPPPOOOOOP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPOPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'VVVVVVVVVVVVVVV',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPOPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'PPPPOPPPPPPPPPP',
      'PPPPPPPPPPPPPPP',
      'OOOOPPPPPOOOOOP',
    ].map(r => r.slice(0, 15)),

    // Mission 5: Mixed terrain — Budjanovci area (historical F-117 shootdown)
    YU5: [
      'PPPPPPPPPPPPPPP',
      'PPPPPPFFPPPPPPP',
      'PPPPPFFFPPPPPPP',
      'PPPPFFFFPPPPPPP',
      'PPPPFFFPPPPPPPP',
      'PPPPFFPPPPPPPPP',
      'PPPPFPPPPPPPPPP',
      'PPPPPPPPRRPPPPP',
      'PPPPPPPRRRRPPPP',
      'PPPPPPPRRRRRPPP',
      'PPPPPPPRRRRPPPP',
      'PPPPPPPPRRPPPPP',
      'PPPPPPPPPPPPPPP',
      'AAPPPPPPPPPPPPF',
      'AAPPPPPPPPPPFFF',
    ].map(r => r.slice(0, 15)),

    // Mission 6: Mountain stronghold — ridge-heavy with forest
    YU6: [
      'RRRRRRFFFFRRRRF',
      'RRRRRFFFFFFRRRR',
      'RRRRFFFFFFFFRRR',
      'RRRFFFFFFFFFFRR',
      'RRFFFFFFFFFFFPF',
      'RFFFFFPPFFFPPPP',
      'RFFFFPPPPFPPPPP',
      'RFFFPPPPPPPPPPF',
      'RRFFPPPPPPPPPFF',
      'RRRFPPPPPPPFFFF',
      'RRRRPPPPPPPFFFF',
      'RRRRRPPPPPFFFFF',
      'RRRRRPPPPFFFFFR',
      'RRRRRRPPFFFFFFR',
      'RRRRRRRFFFFFFFR',
    ].map(r => r.slice(0, 15)),
  };

  // ── Geographic overlay data per map (rivers, cities, labels) ──
  // Coordinates in canvas pixels (0-720). Rendered as procedural geographic features.
  const GEO_OVERLAYS = {
    YU1: {
      name: 'VOJVODINA',
      rivers: [
        // Danube — horizontal band across rows 12-13
        { points: [[0,576],[100,578],[200,582],[360,586],[500,584],[620,580],[720,576]], width: 18, color: '#1a3a5a' },
      ],
      labels: [
        { text: 'VOJVODINA', x: 360, y: 120, size: 14, color: 'rgba(200,200,200,0.15)' },
        { text: 'DUNAV', x: 360, y: 570, size: 9, color: 'rgba(120,160,200,0.4)' },
        { text: 'BATAJNICA AB', x: 620, y: 310, size: 8, color: 'rgba(200,200,200,0.3)' },
      ],
      regions: [],
    },
    YU2: {
      name: 'BEOGRAD',
      rivers: [
        // Danube from NE flowing through
        { points: [[500,0],[480,48],[460,96],[440,144],[420,192],[420,240],[430,288],[440,300]], width: 22, color: '#1a3a5a' },
        // Sava from W joining Danube
        { points: [[0,192],[80,200],[160,210],[240,220],[320,235],[380,250],[420,260],[440,280],[440,300]], width: 16, color: '#1a3a5a' },
      ],
      labels: [
        { text: 'BEOGRAD', x: 380, y: 340, size: 13, color: 'rgba(255,255,255,0.2)' },
        { text: 'DUNAV', x: 490, y: 120, size: 8, color: 'rgba(120,160,200,0.4)' },
        { text: 'SAVA', x: 200, y: 200, size: 8, color: 'rgba(120,160,200,0.4)' },
        { text: 'AVALA', x: 340, y: 620, size: 8, color: 'rgba(200,200,200,0.25)' },
      ],
      regions: [
        // Urban glow
        { polygon: [[300,260],[420,260],[450,320],[440,380],[380,400],[300,380],[280,320]], fill: 'rgba(100,100,120,0.08)' },
      ],
    },
    YU3: {
      name: 'ŠUMADIJA',
      rivers: [],
      labels: [
        { text: 'ŠUMADIJA RIDGE', x: 360, y: 80, size: 12, color: 'rgba(200,200,200,0.15)' },
        { text: 'RUDNIK', x: 300, y: 360, size: 9, color: 'rgba(200,200,200,0.25)' },
        { text: 'AVALA', x: 160, y: 200, size: 8, color: 'rgba(200,200,200,0.2)' },
      ],
      regions: [],
    },
    YU4: {
      name: 'KOSOVO',
      rivers: [
        // Sitnica river — horizontal band
        { points: [[0,336],[100,340],[200,338],[360,342],[500,340],[620,336],[720,338]], width: 14, color: '#1a3a5a' },
      ],
      labels: [
        { text: 'KOSOVO POLJE', x: 360, y: 200, size: 12, color: 'rgba(200,200,200,0.15)' },
        { text: 'SITNICA', x: 360, y: 330, size: 8, color: 'rgba(120,160,200,0.4)' },
        { text: 'PRIŠTINA', x: 520, y: 460, size: 9, color: 'rgba(200,200,200,0.2)' },
      ],
      regions: [],
    },
    YU5: {
      name: 'BUDJANOVCI',
      rivers: [],
      labels: [
        { text: 'BUDJANOVCI', x: 360, y: 300, size: 12, color: 'rgba(200,200,200,0.15)' },
        { text: '250. RAKETNA BRIGADA', x: 360, y: 330, size: 8, color: 'rgba(196,30,58,0.25)' },
        { text: 'SREM', x: 200, y: 160, size: 9, color: 'rgba(200,200,200,0.2)' },
        { text: 'AB BATAJNICA', x: 60, y: 648, size: 8, color: 'rgba(200,200,200,0.3)' },
      ],
      regions: [],
    },
    YU6: {
      name: 'MOUNTAIN REDOUBT',
      rivers: [],
      labels: [
        { text: 'DINARIC ALPS', x: 120, y: 120, size: 11, color: 'rgba(200,200,200,0.15)' },
        { text: 'TARA', x: 300, y: 300, size: 9, color: 'rgba(200,200,200,0.2)' },
        { text: 'ZLATIBOR', x: 480, y: 500, size: 9, color: 'rgba(200,200,200,0.2)' },
      ],
      regions: [],
    },
  };

  // ── NATO Aircraft data ──
  const AIRCRAFT = {
    'F-16C':   { class:'STRIKE',  speed:16,  blipSize:4,   blinkRate:0,   special:'hunter_capable' },
    'F-15E':   { class:'STRIKE',  speed:15,  blipSize:4.5, blinkRate:0,   special:'hunter_capable', maneuvering:true },
    'F/A-18C': { class:'STRIKE',  speed:15,  blipSize:4,   blinkRate:0,   special:'hunter_capable', maneuvering:true },
    'A-10A':   { class:'STRIKE',  speed:8,   blipSize:5,   blinkRate:0,   special:null, lowAltitude:true, hp:2 },
    'EA-6B':   { class:'JAMMER',  speed:10,  blipSize:6,   blinkRate:0,   special:'jammer' },
    'F-117A':  { class:'STEALTH', speed:12,  blipSize:0.8, blinkRate:8,   special:null, stealth:true, stealthProfile:'f117' },
    'B-2A':    { class:'STEALTH', speed:10,  blipSize:1.2, blinkRate:0,   special:null, stealth:true, stealthProfile:'b2' },
    'B-52H':   { class:'DRIFTER', speed:6,   blipSize:8,   blinkRate:0.3, special:'cruise_launcher' },
    'BGM-109': { class:'CRUISE',  speed:14,  blipSize:1.5, blinkRate:0,   special:null, lowAltitude:true },
    'AGM-88':  { class:'HUNTER',  speed:120, blipSize:1.5, blinkRate:6,   special:null },
  };

  // ── 6 Yugoslav missions ──
  const MISSIONS = [
    {
      id: 'YU1', name: 'First Night', mapKey: 'YU1',
      briefing: 'March 24, 1999. NATO has begun air operations. F-16C fighters are approaching from the north over Vojvodina. This is your first engagement — learn your dual radar system. Surveillance radar [Q] is passive-safe. Targeting radar [R] emits and will draw HARM missiles after 2 seconds.',
      threats: ['F-16C (STRIKE)', 'F/A-18C (STRIKE)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'F-16C', count:2, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:2, edge:'N' }, { type:'F-16C', count:1, edge:'W' }] },
        { spawnDelay:3.5, threats:[{ type:'F-16C', count:2, edge:'N' }, { type:'F/A-18C', count:2, edge:'E' }] },
        { spawnDelay:3.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'F/A-18C', count:2, edge:'W' }] },
        { spawnDelay:2.5, threats:[{ type:'F-15E', count:2, edge:'N' }, { type:'F-16C', count:2, edge:'E' }] },
        { spawnDelay:2.0, threats:[{ type:'F-15E', count:3, edge:'N' }, { type:'F/A-18C', count:3, edge:'W' }] },
      ],
      assetName: 'Vojvodina Depot',
    },
    {
      id: 'YU2', name: 'Jammer Approach', mapKey: 'YU2',
      briefing: 'NATO is deploying EA-6B Prowler electronic warfare aircraft to jam your targeting radar. When jammed, your scope fills with false contacts. Use surveillance radar to distinguish real threats. The jammer must be within targeting range to affect you — position wisely.',
      threats: ['F-16C (STRIKE)', 'EA-6B (JAMMER)', 'F-15E (MANEUVERING)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'F-16C', count:3, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:2, edge:'N' }, { type:'EA-6B', count:1, edge:'E' }] },
        { spawnDelay:3.5, threats:[{ type:'F-15E', count:2, edge:'N' }, { type:'EA-6B', count:1, edge:'W' }] },
        { spawnDelay:3.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'F/A-18C', count:2, edge:'E' }, { type:'EA-6B', count:1, edge:'N' }] },
        { spawnDelay:2.5, threats:[{ type:'F-15E', count:3, edge:'W' }, { type:'EA-6B', count:2, edge:'N' }] },
        { spawnDelay:2.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'F-15E', count:2, edge:'W' }, { type:'EA-6B', count:2, edge:'E' }] },
      ],
      assetName: 'Belgrade Sector',
    },
    {
      id: 'YU3', name: 'Stealth Night', mapKey: 'YU3',
      briefing: 'Intelligence reports F-117A Nighthawk stealth aircraft entering your sector. These are nearly invisible on targeting radar — only detectable at 35% normal range. Your P-18 surveillance radar operates on VHF band and can detect them at 55% range. Press [O] to use optical tracking — fire one missile without radar emission. 37% hit chance, but generates zero signature.',
      threats: ['F-117A (STEALTH)', 'F-16C (STRIKE)', 'F-15E (HARM-CAPABLE)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'F-16C', count:2, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'F-15E', count:1, edge:'W' }] },
        { spawnDelay:4.0, threats:[{ type:'F-117A', count:1, edge:'N' }, { type:'F-16C', count:2, edge:'E' }] },
        { spawnDelay:3.0, threats:[{ type:'F-117A', count:1, edge:'W' }, { type:'F-15E', count:2, edge:'N' }, { type:'F-16C', count:2, edge:'E' }] },
        { spawnDelay:2.5, threats:[{ type:'F-117A', count:2, edge:'N' }, { type:'F-16C', count:3, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'F-117A', count:2, edge:'N' }, { type:'F-15E', count:3, edge:'E' }, { type:'EA-6B', count:1, edge:'N' }] },
      ],
      assetName: 'Ridge Command',
    },
    {
      id: 'YU4', name: 'HARM Alley', mapKey: 'YU4',
      briefing: 'Kosovo Polje. Open plains with no concealment. Every F-16C and F-15E carries AGM-88 HARM anti-radiation missiles. Your S-125 emission threshold is only 2 seconds — HARMs will launch almost immediately. Flash your targeting radar for single-shot engagements, then go dark. Emission discipline is survival.',
      threats: ['F-16C (HARM)', 'F-15E (HARM)', 'A-10A (TANKY)'],
      waves: [
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:3, edge:'N' }] },
        { spawnDelay:3.5, threats:[{ type:'F-16C', count:2, edge:'N' }, { type:'F-15E', count:2, edge:'E' }] },
        { spawnDelay:3.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'A-10A', count:2, edge:'W' }] },
        { spawnDelay:2.5, threats:[{ type:'F-15E', count:3, edge:'N' }, { type:'F-16C', count:3, edge:'E' }, { type:'A-10A', count:1, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'F-16C', count:4, edge:'N' }, { type:'F-15E', count:3, edge:'W' }] },
        { spawnDelay:1.5, threats:[{ type:'F-15E', count:4, edge:'N' }, { type:'F-16C', count:4, edge:'E' }, { type:'A-10A', count:2, edge:'S' }] },
      ],
      assetName: 'Kosovo Garrison',
    },
    {
      id: 'YU5', name: 'March 27', mapKey: 'YU5',
      briefing: 'Historical reconstruction. Colonel Zoltan Dani and the 250th Air Defence Missile Brigade. An F-117A Nighthawk is inbound. You must shoot down at least one F-117 to complete this mission. Use optical tracking — the P-18 VHF radar will give you a faint return. Wait for close range. One shot, one chance to make history.',
      threats: ['F-117A (STEALTH)', 'F-16C (ESCORT)', 'EA-6B (JAMMER)'],
      objective: { type: 'kill_type', target: 'F-117A', count: 1 },
      waves: [
        { spawnDelay:5.0, threats:[{ type:'F-16C', count:2, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'EA-6B', count:1, edge:'E' }] },
        { spawnDelay:4.0, threats:[{ type:'F-117A', count:1, edge:'N' }, { type:'F-16C', count:2, edge:'W' }] },
        { spawnDelay:3.0, threats:[{ type:'F-117A', count:2, edge:'N' }, { type:'F-15E', count:2, edge:'E' }] },
        { spawnDelay:2.5, threats:[{ type:'F-117A', count:2, edge:'W' }, { type:'F-16C', count:3, edge:'N' }, { type:'EA-6B', count:1, edge:'E' }] },
        { spawnDelay:2.0, threats:[{ type:'F-117A', count:3, edge:'N' }, { type:'F-15E', count:3, edge:'W' }, { type:'EA-6B', count:2, edge:'E' }] },
      ],
      assetName: '250th Brigade HQ',
    },
    {
      id: 'YU6', name: 'Final Siege', mapKey: 'YU6',
      briefing: 'NATO has launched a maximum effort strike. B-52H bombers are firing BGM-109 Tomahawk cruise missiles from standoff range. B-2A Spirit bombers approach from high altitude. F-117As still hunt in the dark. EA-6B Prowlers jam your scope. Every system and every round counts. The mountains are your last refuge — use the terrain.',
      threats: ['B-2A (STEALTH)', 'F-117A (STEALTH)', 'B-52H (TOMAHAWK)', 'EA-6B (JAMMER)', 'F-16C (STRIKE)'],
      waves: [
        { spawnDelay:4.0, threats:[{ type:'F-16C', count:3, edge:'N' }, { type:'F-16C', count:2, edge:'W' }] },
        { spawnDelay:3.5, threats:[{ type:'B-52H', count:1, edge:'N' }, { type:'F-16C', count:3, edge:'E' }, { type:'EA-6B', count:1, edge:'N' }] },
        { spawnDelay:3.0, threats:[{ type:'F-117A', count:2, edge:'N' }, { type:'F-15E', count:3, edge:'W' }] },
        { spawnDelay:2.5, threats:[{ type:'B-2A', count:1, edge:'N' }, { type:'B-52H', count:1, edge:'E' }, { type:'EA-6B', count:1, edge:'W' }, { type:'F-16C', count:2, edge:'N' }] },
        { spawnDelay:2.0, threats:[{ type:'F-117A', count:2, edge:'W' }, { type:'B-52H', count:1, edge:'N' }, { type:'F-15E', count:3, edge:'E' }, { type:'EA-6B', count:2, edge:'N' }] },
        { spawnDelay:1.5, threats:[{ type:'B-2A', count:1, edge:'N' }, { type:'F-117A', count:2, edge:'W' }, { type:'B-52H', count:2, edge:'N' }, { type:'F-16C', count:4, edge:'E' }, { type:'EA-6B', count:2, edge:'W' }] },
      ],
      assetName: 'Mountain Command',
    },
  ];

  function getMissions() {
    return MISSIONS;
  }

  function getAircraftData() {
    return AIRCRAFT;
  }

  function getMap(mapKey) {
    const rows = MAPS[mapKey];
    if (!rows) return null;
    return rows.map(row => {
      const arr = [];
      for (let i = 0; i < 15; i++) arr.push(TILE_KEY[row[i]] || 'open');
      return arr;
    });
  }

  function getGeoOverlay(mapKey) {
    return GEO_OVERLAYS[mapKey] || null;
  }

  return { getMissions, getAircraftData, getMap, getGeoOverlay, TILE_KEY };
})();

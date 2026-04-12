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

  // ── Mission map data (center coords for Leaflet view) ──
  // All missions set in Srem region. Terrain grids define game mechanics.
  // Zoom 12 shows ~50km across — enough for 3:1 surv:tgt ratio to fit on screen
  const MISSION_MAP_DATA = {
    YU1: { center: [44.82, 20.10], zoom: 12 },  // northern Srem, Danube visible
    YU2: { center: [44.78, 20.18], zoom: 12 },  // eastern Srem, urban belt
    YU3: { center: [44.85, 19.95], zoom: 12 },  // northwest, Fruška Gora edge
    YU4: { center: [44.75, 20.05], zoom: 12 },  // central open plains
    YU5: { center: [44.78, 20.08], zoom: 12 },  // Buđanovci (historical)
    YU6: { center: [44.78, 20.08], zoom: 12 },  // full area
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
      briefing: 'March 24, 1999. NATO has begun air operations. F-16C fighters are approaching from the north over Vojvodina. This is your first engagement — learn your dual radar system. Surveillance radar [Q] is passive-safe. Targeting radar [R] emits and will draw HARM missiles after 10 seconds of continuous emission.',
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
      briefing: 'Intelligence reports F-117A Nighthawk stealth aircraft entering your sector. These are nearly invisible on targeting radar — only detectable at 35% normal range. Your P-18 surveillance radar operates on VHF band and can detect them at 55% range. Press [O] to use TV camera track — fire one missile with optronic guidance (no radar emission). 50% hit chance within 25km, generates zero signature.',
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
      briefing: 'Kosovo Polje. Open plains with no concealment. Every F-16C and F-15E carries AGM-88 HARM anti-radiation missiles. Keep targeting radar emissions under 10 seconds or HARMs will launch. Use short bursts — engage, fire, go dark. The S-125 is more resistant to ECM than older systems, but HARM remains lethal.',
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
      briefing: 'Historical reconstruction. Colonel Zoltan Dani and the 250th Air Defence Missile Brigade. An F-117A Nighthawk is inbound. You must shoot down at least one F-117 to complete this mission. Use TV camera track [O] — the P-18 VHF radar will give you a faint return. Wait for close range. One shot, one chance to make history.',
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
    return MISSION_MAP_DATA[mapKey] || null;
  }

  return { getMissions, getAircraftData, getMap, getGeoOverlay, TILE_KEY };
})();

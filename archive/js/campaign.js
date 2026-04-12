/* ── campaign.js — mission data, wave configs, hand-authored maps ── */
'use strict';

const Campaign = (() => {

  // ── Tile key ──
  const TILE_KEY = {
    'O': 'open', 'S': 'savanna', 'J': 'jungle',
    'R': 'ridge', 'U': 'ruins',  'D': 'depot', 'V': 'river',
  };

  // ── Hand-authored 15×15 maps (each string = one row, 15 chars) ──
  const MAPS = {
    N1: [
      'OOOOOSSSSSSOOOOO',
      'OOOOOSSSSSSOOOOS',
      'OOOOSSSSSSSSSSSS',
      'OOOSSSRRRRSSSOOS',
      'OOOSSRRRRRRSSOOO',
      'OOSSSRRRRRRSSOOS',
      'OOSSSSRRRRSSOOOS',
      'OOOSSSSSSSSSOOOO',
      'OOOOSSSSSSSSOOOO',
      'OOOOOSSJJSSSOOOS',
      'OOOOOSJJJJSSOOOS',
      'OOOOSJJJJJJSOOOO',
      'OOOOSJJJJJJSOOOO',
      'OOOOSSSJJSSSOOOS',
      'OOOOOOSSSSOOOOOO',
    ].map(r => r.slice(0, 15)),
    N2: [
      'VVVVVOOOOOOOOOO',
      'VVVVVOOOOOOSSOO',
      'VVVVVOOOOOSSSSO',
      'OOOOOOOOOOSSSSO',
      'OOOOOOOOJJSSOOS',
      'OOOOOOOJJJJSSSS',
      'OOOOOOJJJJJJSSS',
      'OOOORRRJJJJSSSS',
      'OOORRRRROJJSSSS',
      'OORRRRRROOJSSSO',
      'OORRRRROOOOSSSO',
      'OOORRROOOOSSSOO',
      'OOOOOOOOODDDOOO',
      'OOOOOOOODDDDOOO',
      'OOOOOOOOODDOOOO',
    ].map(r => r.slice(0, 15)),
    N3: [
      'JJJJJJJJJJJJJJJ',
      'JJJJJJJOOOOJJJJ',
      'JJJJJOOOOOOOJJJ',
      'JJJOOOOOOOOOJJJ',
      'JJOOOOSSSOOOJJJ',
      'JJOOSSSSSSOOOJJ',
      'JOOSSSRRSSOOOJJ',
      'JOOSSSRRSSOOOJJ',
      'JOOSSSSSSSOOOOJ',
      'JJOOOOSSSOOOOOJ',
      'JJJOOOOOOOOOOJJ',
      'JJJJJOOOOOJJJJJ',
      'JJJJJJJOJJJJJJJ',
      'JJJJJJJJJJJJJJJ',
      'JJJJJJJJJJJJJJJ',
    ].map(r => r.slice(0, 15)),
    S1: [
      'SSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSS',
      'SSOOOOOOOOOOSSS',
      'SSOOOOOOOOOOSSS',
      'SSOOORRROOOOSSS',
      'SSOORRRRROOOOSS',
      'SSOOURRRUUOOSSS',
      'SSOOUUURRUOOSSS',
      'SSOOURRRUUOOSSS',
      'SSOORRRRROOOOSS',
      'SSOOORRROOOOSSS',
      'SSOOOOOOOOOOSSS',
      'SSOOOOOOOOOOSSS',
      'SSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSS',
    ].map(r => r.slice(0, 15)),
    S2: [
      'OOOOOVVVVOOOOOO',
      'OOOOVVVVVOOOOOO',
      'OOOOVVVVVOOOOOO',
      'OOOOOOOOOOOODDD',
      'OOOOOOOOOOOODDD',
      'OOOOSSSSSOOOOOO',
      'OOOOSSSSSOOOOOO',
      'OOOOSSSSSOOOOOO',
      'OOOOOOOOOOOUUUU',
      'OOOOOOOOOOOUUUU',
      'OOOOORRRRROOOO',
      'OOOORRRRRROOOOO',
      'OOOORRRRROOOOO',
      'OOOOOOOOOOOOOOO',
      'OOOOOOOOOOOOOOO',
    ].map(r => r.slice(0, 15)),
    S3: [
      'RRRRROOOOOOORRR',
      'RRROOOOOOOOORRR',
      'RROOOOOOOOOORR',
      'ROOOOJJJOOOOORR',
      'ROOOJJJJJOOOORR',
      'OOOOJJJJJOOOOO',
      'OOOJJJJJJJOOOO',
      'OOOJJJJJJJOOOO',
      'OOOOJJJJJOOOOO',
      'ROOOJJJJJOOOOR',
      'RROOOOJJJOOORR',
      'RROOOOOOOOORRR',
      'RRROOOOOOOORRRR',
      'RRRROOOOOOORRR',
      'RRRRRROOORRRRR',
    ].map(r => r.slice(0, 15)),
  };

  // ── Aircraft data ──
  const AIRCRAFT_NORTH = {
    'F-16':   { class:'STRIKE',  speed:16,  blipSize:4,   blinkRate:0,   special:'hunter_capable' },
    'F/A-18': { class:'STRIKE',  speed:15,  blipSize:4,   blinkRate:0,   special:'hunter_capable', maneuvering:true },
    'EA-18G': { class:'JAMMER',  speed:10,  blipSize:6,   blinkRate:0,   special:'jammer' },
    'F-35':   { class:'STEALTH', speed:14,  blipSize:1.5, blinkRate:0,   special:null, stealth:true },
    'B-52':   { class:'DRIFTER', speed:6,   blipSize:8,   blinkRate:0.3, special:null },
    'MQ-9':   { class:'DRONE',   speed:4.5, blipSize:2,   blinkRate:0,   special:null },
    'AGM-88': { class:'HUNTER',  speed:120, blipSize:1.5, blinkRate:6,   special:null },
  };

  const AIRCRAFT_SOUTH = {
    'Su-34':      { class:'STRIKE',  speed:15,  blipSize:4,   blinkRate:0,   special:'hunter_capable', lowAltitude:true },
    'MiG-29':     { class:'STRIKE',  speed:18,  blipSize:4,   blinkRate:0,   special:'hunter_capable', maneuvering:true },
    'MiG-31':     { class:'FAST',    speed:27,  blipSize:4,   blinkRate:0,   special:null, highSpeed:true },
    'J-10':       { class:'STRIKE',  speed:16,  blipSize:4,   blinkRate:0,   special:'hunter_capable' },
    'Tu-160':     { class:'DRIFTER', speed:7.5, blipSize:9,   blinkRate:0.3, special:null },
    'Tu-95':      { class:'DRIFTER', speed:6,   blipSize:8,   blinkRate:0.3, special:null },
    'Su-24MP':    { class:'JAMMER',  speed:10,  blipSize:6,   blinkRate:0,   special:'jammer' },
    'J-16D':      { class:'JAMMER',  speed:12,  blipSize:6,   blinkRate:0,   special:'jammer' },
    'Shahed-136': { class:'DRONE',   speed:3.5, blipSize:1.5, blinkRate:0,   special:null },
    'WingLoong':  { class:'DRONE',   speed:4.5, blipSize:2,   blinkRate:0,   special:null },
    'Kh-31P':     { class:'HUNTER',  speed:112, blipSize:1.5, blinkRate:6,   special:null },
  };

  // ── Wave configs per mission ──
  // Each wave: { spawnDelay, threats:[{type, count, edge}] }
  const MISSIONS_NORTH = [
    {
      id: 'N1', name: 'Salient Overwatch', mapKey: 'N1',
      briefing: 'Intelligence indicates Southern Alliance strike package inbound from the north. Your Pantsir-S2 battery is the last line of defence for the forward depot. Classify and engage all contacts.',
      threats: ['F-16 (STRIKE)', 'MQ-9 (DRONE)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'F-16',  count:2, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16',  count:2, edge:'N' }, { type:'MQ-9', count:3, edge:'E' }] },
        { spawnDelay:3.5, threats:[{ type:'F-16',  count:3, edge:'N' }, { type:'F/A-18', count:1, edge:'W' }] },
        { spawnDelay:3.0, threats:[{ type:'F/A-18',count:2, edge:'N' }, { type:'MQ-9',  count:4, edge:'E' }, { type:'EA-18G', count:1, edge:'N' }] },
        { spawnDelay:2.5, threats:[{ type:'F-35',  count:2, edge:'N' }, { type:'F/A-18',count:2, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'F-35',  count:2, edge:'N' }, { type:'B-52',  count:1, edge:'N' }, { type:'MQ-9', count:4, edge:'E' }, { type:'EA-18G', count:1, edge:'W' }] },
      ],
      assetName: 'Forward Depot',
    },
    {
      id: 'N2', name: 'River Crossing', mapKey: 'N2',
      briefing: 'Southern Alliance is attempting a river crossing offensive. A mixed strike package is using the river valley for low-level ingress. HARM-equipped F-16s are expected. Use the ridgeline for radar cover.',
      threats: ['F-16 (HARM-capable)', 'EA-18G (JAMMER)', 'F-35 (STEALTH)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'MQ-9',  count:4, edge:'W' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16',  count:3, edge:'W' }, { type:'EA-18G', count:1, edge:'N' }] },
        { spawnDelay:3.5, threats:[{ type:'F/A-18',count:2, edge:'W' }, { type:'MQ-9',  count:4, edge:'S' }] },
        { spawnDelay:3.0, threats:[{ type:'F-35',  count:2, edge:'W' }, { type:'F-16',  count:2, edge:'N' }] },
        { spawnDelay:2.5, threats:[{ type:'B-52',  count:1, edge:'N' }, { type:'F/A-18',count:3, edge:'W' }, { type:'EA-18G',count:1, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'F-35',  count:3, edge:'W' }, { type:'F/A-18',count:3, edge:'N' }, { type:'EA-18G',count:2, edge:'W' }] },
      ],
      assetName: 'River Crossing Point',
    },
    {
      id: 'N3', name: 'Jungle Sanctuary', mapKey: 'N3',
      briefing: 'Deep jungle operations. Jungle terrain severely limits radar range but provides excellent heat concealment. Stealth aircraft confirmed in theatre. Conserve large missiles for confirmed contacts.',
      threats: ['F-35 (STEALTH)', 'F/A-18 (MANEUVERING)', 'B-52 (DRIFTER)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'MQ-9',  count:5, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'F-16',  count:3, edge:'E' }, { type:'F-35', count:1, edge:'N' }] },
        { spawnDelay:3.5, threats:[{ type:'F-35',  count:2, edge:'N' }, { type:'F/A-18', count:2, edge:'W' }] },
        { spawnDelay:3.0, threats:[{ type:'B-52',  count:1, edge:'N' }, { type:'EA-18G',count:1, edge:'E' }, { type:'MQ-9', count:3, edge:'S' }] },
        { spawnDelay:2.5, threats:[{ type:'F-35',  count:3, edge:'N' }, { type:'F/A-18',count:3, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'F-35',  count:3, edge:'N' }, { type:'B-52',  count:2, edge:'N' }, { type:'EA-18G',count:2, edge:'E' }, { type:'F/A-18',count:2, edge:'W' }] },
      ],
      assetName: 'Command Sanctuary',
    },
  ];

  const MISSIONS_SOUTH = [
    {
      id: 'S1', name: 'Steppe Defence', mapKey: 'S1',
      briefing: 'Northern Coalition Su-34s are inbound through the steppe corridor. Your HQ-22 battery has superior range but is detectable at distance. Use the IFF Uplink wisely — one use per wave.',
      threats: ['Su-34 (LOW-ALT)', 'MiG-29 (MANEUVERING)', 'Shahed-136 (DRONE)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'Shahed-136', count:4, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'Su-34',  count:2, edge:'N' }, { type:'Shahed-136', count:3, edge:'E' }] },
        { spawnDelay:3.5, threats:[{ type:'MiG-29', count:2, edge:'N' }, { type:'Su-34', count:2, edge:'W' }] },
        { spawnDelay:3.0, threats:[{ type:'Su-34',  count:3, edge:'N' }, { type:'Su-24MP',count:1, edge:'N' }, { type:'Shahed-136', count:4, edge:'E' }] },
        { spawnDelay:2.5, threats:[{ type:'MiG-31', count:2, edge:'N' }, { type:'MiG-29', count:2, edge:'W' }] },
        { spawnDelay:2.0, threats:[{ type:'Tu-160', count:1, edge:'N' }, { type:'MiG-31',count:2, edge:'N' }, { type:'Su-24MP',count:1, edge:'E' }, { type:'Shahed-136',count:5, edge:'S' }] },
      ],
      assetName: 'Steppe Command',
    },
    {
      id: 'S2', name: 'Industrial Corridor', mapKey: 'S2',
      briefing: 'A sustained air campaign targeting the industrial depot. Ruins provide radar shadow but also conceal approaching aircraft. J-16D jammers are expected in later waves. Your IFF Uplink is critical.',
      threats: ['Su-34 (HARM)', 'J-16D (JAMMER)', 'MiG-31 (FAST)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'WingLoong',  count:4, edge:'W' }] },
        { spawnDelay:4.0, threats:[{ type:'Su-34',  count:3, edge:'W' }, { type:'Shahed-136', count:3, edge:'N' }] },
        { spawnDelay:3.5, threats:[{ type:'MiG-29', count:2, edge:'W' }, { type:'J-16D', count:1, edge:'N' }] },
        { spawnDelay:3.0, threats:[{ type:'MiG-31', count:2, edge:'N' }, { type:'Su-34', count:2, edge:'W' }, { type:'J-16D', count:1, edge:'W' }] },
        { spawnDelay:2.5, threats:[{ type:'Tu-95',  count:1, edge:'N' }, { type:'MiG-31',count:3, edge:'N' }, { type:'J-16D',count:1, edge:'E' }] },
        { spawnDelay:2.0, threats:[{ type:'Tu-160', count:1, edge:'N' }, { type:'MiG-31',count:2, edge:'N' }, { type:'J-16D',count:2, edge:'W' }, { type:'Shahed-136',count:5, edge:'E' }] },
      ],
      assetName: 'Industrial Depot',
    },
    {
      id: 'S3', name: 'Highland Siege', mapKey: 'S3',
      briefing: 'Ridgeline positions give enhanced radar range but elevated heat signature. Northern Coalition knows your position. Expect early HARM launches. Reposition frequently or you will not survive.',
      threats: ['J-10 (HARM)', 'Tu-160 (DRIFTER)', 'Kh-31P (HUNTER)'],
      waves: [
        { spawnDelay:5.0, threats:[{ type:'J-10',  count:2, edge:'N' }] },
        { spawnDelay:4.0, threats:[{ type:'J-10',  count:3, edge:'N' }, { type:'WingLoong', count:3, edge:'E' }] },
        { spawnDelay:3.5, threats:[{ type:'Su-34', count:2, edge:'W' }, { type:'J-16D', count:1, edge:'N' }] },
        { spawnDelay:3.0, threats:[{ type:'MiG-31',count:2, edge:'N' }, { type:'J-10',  count:3, edge:'N' }, { type:'Su-24MP',count:1, edge:'E' }] },
        { spawnDelay:2.5, threats:[{ type:'Tu-160',count:1, edge:'N' }, { type:'MiG-29',count:3, edge:'W' }, { type:'J-16D',count:1, edge:'N' }] },
        { spawnDelay:2.0, threats:[{ type:'Tu-160',count:1, edge:'N' }, { type:'Tu-95', count:1, edge:'N' }, { type:'MiG-31',count:3, edge:'E' }, { type:'J-16D',count:2, edge:'N' }, { type:'Shahed-136',count:4, edge:'S' }] },
      ],
      assetName: 'Highland HQ',
    },
  ];

  function getMissions(faction) {
    return faction === 'NORTH' ? MISSIONS_NORTH : MISSIONS_SOUTH;
  }

  function getAircraftData(faction) {
    return faction === 'NORTH' ? AIRCRAFT_NORTH : AIRCRAFT_SOUTH;
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

  return { getMissions, getAircraftData, getMap, TILE_KEY };
})();

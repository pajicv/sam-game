/* ── yu-audio.js — Web Audio synthesizer + optical track sound ── */
'use strict';

const Audio = (() => {
  let ctx = null;
  let hunterWarningNode = null;
  let hunterWarningGain = null;
  let jammerNode = null;
  let jammerGain = null;
  let masterGain = null;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, duration, type = 'sine', volume = 0.3, startTime = 0) {
    if (!ctx) return;
    const t   = ctx.currentTime + startTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  function sweepTone(f0, f1, duration, type = 'sine', volume = 0.25) {
    if (!ctx) return;
    const t   = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  function noise(duration, cutoffStart = 2000, cutoffEnd = 200, volume = 0.25) {
    if (!ctx) return;
    const bufSize = Math.ceil(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain   = ctx.createGain();

    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffStart, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(cutoffEnd, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    src.start();
    src.stop(ctx.currentTime + duration + 0.01);
  }

  // ── Public sound effects ──

  function playRadarPing() {
    tone(1200, 0.05, 'sine', 0.18);
  }

  function playMissileLaunch() {
    if (!ctx) return;
    noise(0.08, 3000, 1000, 0.2);
    sweepTone(400, 200, 0.15, 'sawtooth', 0.15);
  }

  function playSalvo() {
    if (!ctx) return;
    playMissileLaunch();
    setTimeout(playMissileLaunch, 60);
  }

  function playExplosion() {
    noise(0.35, 2000, 180, 0.35);
  }

  function playInterceptConfirm() {
    tone(600, 0.06, 'sine', 0.2);
    tone(900, 0.06, 'sine', 0.2, 0.07);
  }

  function playMiss() {
    sweepTone(300, 100, 0.2, 'sine', 0.1);
  }

  function playIFFChirp() {
    tone(1000, 0.04, 'triangle', 0.18);
    tone(1200, 0.04, 'triangle', 0.18, 0.05);
    tone(1400, 0.04, 'triangle', 0.18, 0.10);
  }

  function playBlipClassify() {
    tone(600, 0.04, 'sine', 0.15);
    tone(900, 0.04, 'sine', 0.15, 0.05);
  }

  // Optical track — low-frequency "lens focusing" sweep
  function playOpticalTrack() {
    if (!ctx) return;
    sweepTone(200, 400, 0.3, 'sine', 0.15);
    tone(800, 0.04, 'triangle', 0.1, 0.35);
  }

  function startHunterWarning() {
    if (!ctx || hunterWarningNode) return;
    hunterWarningGain = ctx.createGain();
    hunterWarningGain.gain.value = 0.22;
    hunterWarningGain.connect(masterGain);

    hunterWarningNode = ctx.createOscillator();
    hunterWarningNode.type = 'square';
    hunterWarningNode.frequency.value = 800;
    hunterWarningNode.connect(hunterWarningGain);
    hunterWarningNode.start();

    const pulseInterval = setInterval(() => {
      if (!hunterWarningGain) { clearInterval(pulseInterval); return; }
      const now = ctx.currentTime;
      const v   = hunterWarningGain.gain.value > 0.1 ? 0 : 0.22;
      hunterWarningGain.gain.setValueAtTime(v, now);
    }, 125);

    hunterWarningNode._pulseInterval = pulseInterval;
  }

  function stopHunterWarning() {
    if (!hunterWarningNode) return;
    clearInterval(hunterWarningNode._pulseInterval);
    hunterWarningNode.stop();
    hunterWarningNode.disconnect();
    hunterWarningGain.disconnect();
    hunterWarningNode = null;
    hunterWarningGain = null;
  }

  function startJammerTone() {
    if (!ctx || jammerNode) return;
    jammerGain = ctx.createGain();
    jammerGain.gain.value = 0.08;
    jammerGain.connect(masterGain);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = 60;
    o2.type = 'sawtooth'; o2.frequency.value = 120;
    o1.connect(jammerGain);
    o2.connect(jammerGain);
    o1.start(); o2.start();
    jammerNode = { o1, o2 };
  }

  function stopJammerTone() {
    if (!jammerNode) return;
    jammerNode.o1.stop(); jammerNode.o2.stop();
    jammerNode.o1.disconnect(); jammerNode.o2.disconnect();
    jammerGain.disconnect();
    jammerNode = null;
    jammerGain = null;
  }

  function playAssetHit() {
    noise(0.6, 3000, 80, 0.4);
    tone(120, 0.5, 'sawtooth', 0.3, 0.05);
  }

  function playBatteryDestroyed() {
    noise(1.0, 4000, 40, 0.5);
    tone(80, 0.8, 'sawtooth', 0.4, 0.1);
  }

  function playModeSwitch() {
    tone(440, 0.06, 'square', 0.1);
  }

  return {
    init, resume,
    playRadarPing, playMissileLaunch, playSalvo,
    playExplosion, playInterceptConfirm, playMiss,
    playIFFChirp, playBlipClassify, playOpticalTrack,
    startHunterWarning, stopHunterWarning,
    startJammerTone, stopJammerTone,
    playAssetHit, playBatteryDestroyed, playModeSwitch,
  };
})();

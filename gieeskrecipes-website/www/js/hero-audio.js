/* ═══════════════════════════════════════════════════════════════
   GIEESK — Ambient Cuisine Soundscapes
   ───────────────────────────────────────────────────────────────
   Synthesised entirely with the Web Audio API — no audio files,
   no downloads. Each cuisine gets a layered ambience that
   cross-fades as you scroll.

   OFF by default. Browsers block autoplay, and unsolicited sound
   is hostile UX — the user must opt in via the toggle.
═══════════════════════════════════════════════════════════════ */
window.GieesKAudio = (function () {
  'use strict';

  var ctx = null, master = null, started = false, enabled = false;
  var layers = {};   // name → { gain, nodes[] }
  var current = null;

  /* ── Noise buffer (shared source for most textures) ──────────── */
  function noiseBuffer(seconds) {
    var len = ctx.sampleRate * seconds;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random()*2 - 1;
    return buf;
  }

  function noiseSource(buf) {
    var s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.start(0);
    return s;
  }

  /* ── Layer builders ──────────────────────────────────────────── */
  var BUILD = {
    // Low, warm room tone — market / indoor base for every scene
    market: function (nb) {
      var src = noiseSource(nb);
      var lp  = ctx.createBiquadFilter(); lp.type='lowpass';  lp.frequency.value=520; lp.Q.value=0.6;
      var hp  = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=90;
      // slow amplitude wander = distant crowd swell
      var mod = ctx.createOscillator(); mod.frequency.value = 0.07;
      var modG= ctx.createGain(); modG.gain.value = 0.28;
      var amp = ctx.createGain(); amp.gain.value = 0.55;
      mod.connect(modG); modG.connect(amp.gain); mod.start(0);
      src.connect(lp); lp.connect(hp); hp.connect(amp);
      return { out: amp, nodes:[src,mod] };
    },

    // Crackling fire — random filtered bursts over a low bed
    fire: function (nb) {
      var src = noiseSource(nb);
      var bp  = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1400; bp.Q.value=0.9;
      var bed = ctx.createGain(); bed.gain.value = 0.22;
      src.connect(bp); bp.connect(bed);

      // crackle: short filtered noise pops on a random schedule
      var crackG = ctx.createGain(); crackG.gain.value = 0.0;
      src.connect(crackG);
      var timer = setInterval(function(){
        if (!ctx || ctx.state !== 'running') return;
        var now = ctx.currentTime;
        crackG.gain.cancelScheduledValues(now);
        crackG.gain.setValueAtTime(0.0, now);
        crackG.gain.linearRampToValueAtTime(0.20 + Math.random()*0.28, now + 0.008);
        crackG.gain.exponentialRampToValueAtTime(0.001, now + 0.06 + Math.random()*0.10);
      }, 180);

      var hp = ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
      crackG.connect(hp);
      var out = ctx.createGain();
      bed.connect(out); hp.connect(out);
      return { out: out, nodes:[src], timers:[timer] };
    },

    // Ocean — slow surge of filtered noise
    ocean: function (nb) {
      var src = noiseSource(nb);
      var lp  = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=780; lp.Q.value=0.5;
      var amp = ctx.createGain(); amp.gain.value = 0.4;
      // two detuned LFOs = irregular, natural wave rhythm
      var l1 = ctx.createOscillator(); l1.frequency.value = 0.11;
      var l2 = ctx.createOscillator(); l2.frequency.value = 0.067;
      var g1 = ctx.createGain(); g1.gain.value = 0.26;
      var g2 = ctx.createGain(); g2.gain.value = 0.17;
      l1.connect(g1); g1.connect(amp.gain);
      l2.connect(g2); g2.connect(amp.gain);
      l1.start(0); l2.start(0);
      src.connect(lp); lp.connect(amp);
      return { out: amp, nodes:[src,l1,l2] };
    },

    // Café — soft mid-band murmur with gentle movement
    cafe: function (nb) {
      var src = noiseSource(nb);
      var bp  = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=700; bp.Q.value=0.45;
      var amp = ctx.createGain(); amp.gain.value = 0.34;
      var mod = ctx.createOscillator(); mod.frequency.value = 0.13;
      var mg  = ctx.createGain(); mg.gain.value = 0.14;
      mod.connect(mg); mg.connect(amp.gain); mod.start(0);
      src.connect(bp); bp.connect(amp);
      return { out: amp, nodes:[src,mod] };
    },

    // Wind — high airy noise, for Nordic / desert
    wind: function (nb) {
      var src = noiseSource(nb);
      var bp  = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1100; bp.Q.value=0.35;
      var amp = ctx.createGain(); amp.gain.value = 0.3;
      var mod = ctx.createOscillator(); mod.frequency.value = 0.05;
      var mg  = ctx.createGain(); mg.gain.value = 0.2;
      mod.connect(mg); mg.connect(amp.gain); mod.start(0);
      // sweep the filter for a breathing gust
      var sw = ctx.createOscillator(); sw.frequency.value = 0.031;
      var swg= ctx.createGain(); swg.gain.value = 420;
      sw.connect(swg); swg.connect(bp.frequency); sw.start(0);
      src.connect(bp); bp.connect(amp);
      return { out: amp, nodes:[src,mod,sw] };
    }
  };

  /* ── Cuisine → layer mix ─────────────────────────────────────── */
  var MIXES = {
    kenya   : { market:0.55, fire:0.30, wind:0.12 },
    ethiopia: { market:0.48, fire:0.34, cafe:0.14 },
    italy   : { cafe:0.55,   market:0.28, fire:0.14 },
    tanzania: { ocean:0.44,  market:0.34, wind:0.14 },
    japan   : { wind:0.40,   cafe:0.30,  ocean:0.20 },
    nordic  : { wind:0.62,   ocean:0.20 },
    seafood : { ocean:0.68,  wind:0.22 }
  };

  function init() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;                 // silent until faded in
    master.connect(ctx.destination);

    var nb = noiseBuffer(3);
    Object.keys(BUILD).forEach(function (name) {
      var L = BUILD[name](nb);
      var g = ctx.createGain(); g.gain.value = 0;
      L.out.connect(g); g.connect(master);
      layers[name] = { gain:g, nodes:L.nodes||[], timers:L.timers||[] };
    });
    started = true;
    return true;
  }

  function setMix(cuisine, blendTo, frac, dur) {
    if (!started || !enabled) return;
    var A = MIXES[cuisine] || {}, B = MIXES[blendTo] || A;
    var now = ctx.currentTime;
    dur = dur || 1.4;
    Object.keys(layers).forEach(function (name) {
      var target = (A[name]||0)*(1-frac) + (B[name]||0)*frac;
      var g = layers[name].gain;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(target, now + dur);
    });
  }

  function enable() {
    if (!init()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    enabled = true;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.18, now + 1.2);   // deliberately quiet
    return true;
  }

  function disable() {
    if (!started) { enabled = false; return; }
    enabled = false;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.6);
  }

  return {
    enable : enable,
    disable: disable,
    toggle : function(){ enabled ? disable() : enable(); return enabled; },
    setMix : setMix,
    isOn   : function(){ return enabled; },
    supported: function(){ return !!(window.AudioContext||window.webkitAudioContext); }
  };
})();

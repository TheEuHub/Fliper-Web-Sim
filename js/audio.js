/* Fliper Web Sim — audio: synthesized WebAudio cues. Off by default,
   unlocked on first gesture. No audio files, no network. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var ctx = null;
  var master = null;
  var enabled = !!FZ.storage.get('sound', false);
  var volume = FZ.storage.get('volume', 0.5);

  function ensure() {
    if (!enabled) return false;
    if (!ctx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
      } catch (e) { return false; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return true;
  }

  function tone(freq, dur, type, gain, delay) {
    if (!ensure()) return;
    try {
      var t0 = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain || 0.1), t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) {}
  }

  FZ.audio = {
    get enabled() { return enabled; },

    unlock: function () { ensure(); },

    setEnabled: function (v) {
      enabled = !!v;
      FZ.storage.set('sound', enabled);
      if (enabled) { ensure(); tone(880, 0.05, 'square', 0.09); }
      return enabled;
    },

    setVolume: function (v) {
      volume = FZ.util.clamp(v, 0.05, 1);
      FZ.storage.set('volume', volume);
      if (master) master.gain.value = volume;
      return volume;
    },

    getVolume: function () { return volume; },

    click: function () { tone(1500, 0.025, 'square', 0.06); },
    beep: function (f, d, g, delay) { tone(f || 660, d || 0.08, 'square', g || 0.09, delay || 0); },
    ok: function () { tone(660, 0.05, 'square', 0.09); tone(990, 0.07, 'square', 0.09, 0.05); },
    err: function () { tone(220, 0.12, 'sawtooth', 0.08); },
    boot: function () { tone(523, 0.07, 'triangle', 0.08); tone(659, 0.07, 'triangle', 0.08, 0.08); tone(784, 0.12, 'triangle', 0.08, 0.16); },
    alarm: function () {
      tone(1046, 0.09, 'square', 0.12);
      tone(784, 0.09, 'square', 0.12, 0.12);
      tone(1046, 0.09, 'square', 0.12, 0.24);
      tone(784, 0.09, 'square', 0.12, 0.36);
    }
  };
})();

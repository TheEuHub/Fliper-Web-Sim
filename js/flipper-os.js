/* Fliper Web Sim — flipper-os: JS re-implementation of the Flipper OS shell
   for a 128×64 monochrome LCD with orange backlight (#FF8200 on #1A0F00).
   All code and glyphs original. Stage 1: boot, home, pairing, link status.
   Flipper state lives HERE (single source of truth). The phone talks to it
   only through the RPC bus in link.js. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var BG = '#1A0F00';
  var FG = '#FF8200';

  /* ---------- hand-coded 5×7 bitmap font (original), rows top→bottom ---------- */
  var GLYPHS = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.#...'],
    ':': ['.....', '.....', '..#..', '.....', '.....', '..#..', '.....'],
    ';': ['.....', '.....', '..#..', '.....', '.....', '.##..', '.#...'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
    '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
    '\\': ['#....', '#....', '.#...', '..#..', '...#.', '....#', '....#'],
    '(': ['...#.', '..#..', '..#..', '..#..', '..#..', '..#..', '...#.'],
    ')': ['#....', '..#..', '..#..', '..#..', '..#..', '..#..', '#....'],
    '[': ['..###', '..#..', '..#..', '..#..', '..#..', '..#..', '..###'],
    ']': ['###..', '..#..', '..#..', '..#..', '..#..', '..#..', '###..'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
    '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
    '<': ['....#', '...#.', '..#..', '.#...', '..#..', '...#.', '....#'],
    '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
    '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
    '%': ['#...#', '#..#.', '...#.', '..#..', '.#...', '#..#.', '#...#'],
    '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
    '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
    '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..']
  };

  /* compile rows → 5 column bitmasks (bit r = row r) */
  var FONT = {};
  (function compile() {
    for (var ch in GLYPHS) {
      if (!Object.prototype.hasOwnProperty.call(GLYPHS, ch)) continue;
      var rows = GLYPHS[ch], cols = [0, 0, 0, 0, 0];
      for (var col = 0; col < 5; col++) {
        var bits = 0;
        for (var row = 0; row < 7; row++) if (rows[row].charAt(col) === '#') bits |= (1 << row);
        cols[col] = bits;
      }
      FONT[ch] = cols;
    }
  })();

  function textWidth(str, scale) {
    scale = scale || 1;
    return String(str).length * 6 * scale - scale;
  }

  function drawText(c, str, x, y, color, scale) {
    scale = scale || 1;
    str = String(str).toUpperCase(); /* font is uppercase-only */
    c.fillStyle = color || FG;
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str.charAt(i)] || FONT['?'];
      var px = x + i * 6 * scale;
      for (var col = 0; col < 5; col++) {
        var bits = g[col];
        if (!bits) continue;
        for (var row = 0; row < 7; row++) {
          if (bits & (1 << row)) c.fillRect(px + col * scale, y + row * scale, scale, scale);
        }
      }
    }
  }

  function drawTextC(c, str, y, color, scale) {
    scale = scale || 1;
    drawText(c, str, Math.round((128 - textWidth(str, scale)) / 2), y, color, scale);
  }

  function invBoxC(c, str, y, scale) {
    scale = scale || 1;
    var w = textWidth(str, scale);
    var x = Math.round((128 - w) / 2);
    c.fillStyle = FG;
    c.fillRect(x - 3, y - 2, w + 6, 7 * scale + 4);
    drawText(c, str, x, y, BG, scale);
  }

  var KEY_LABEL = { up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', ok: 'OK', back: 'BACK' };

  /* ---------- the OS object ---------- */
  var os = {
    screen: null,
    state: 'boot',       /* boot | home | scan | pair | waitconfirm | connected */
    t0: 0,
    scanT0: 0,
    pin: '',
    retryTimer: 0,
    lastKey: '-',
    name: 'Flipper Zero',
    battery: 87,
    firmware: '0.99.1-sim',
    signal: 0,
    connected: false,
    dirtyFlag: true,

    dirty: function () { this.dirtyFlag = true; if (this.screen) this.screen.markDirty(); },

    init: function (screen) {
      this.screen = screen;
      this.state = 'boot';
      this.t0 = FZ.util.now();
      this.dirtyFlag = true;
      var self = this;

      FZ.link.attach('flipper', {
        'link.scan': function (p, reply) {
          if (self.state === 'boot') self.state = 'home';
          self.state = 'scan';
          self.scanT0 = FZ.util.now();
          self.dirty();
          setTimeout(function () {
            reply(null, { devices: [{ id: 'fz-sim-1', name: self.name, rssi: -45 }] });
          }, 650);
        },
        'link.pair.request': function (p, reply) {
          if (self.connected) { reply('already connected', null); return; }
          self.pin = String(FZ.util.randInt(100000, 999999));
          self.state = 'pair';
          self.dirty();
          reply(null, { pin: self.pin, name: self.name });
        },
        'link.pair.abort': function (p, reply) {
          clearTimeout(self.retryTimer);
          if (self.state === 'pair' || self.state === 'waitconfirm') { self.state = 'home'; self.dirty(); }
          reply(null, { ok: true });
        },
        'link.disconnect': function (p, reply) {
          reply(null, { ok: true });
          if (self.connected) FZ.link.establish({ connected: false, name: self.name });
        },
        'link.status': function (p) {
          self.connected = !!p.connected;
          if (p.connected) {
            self.state = 'connected';
            clearTimeout(self.retryTimer);
          } else if (self.state !== 'boot') {
            self.state = 'home';
          }
          self.pin = '';
          self.dirty();
        },
        'link.signal': function (p) {
          self.signal = p.signal | 0;
          self.dirty();
        },
        'system.info': function (p, reply) {
          reply(null, {
            name: self.name,
            battery: self.battery,
            firmware: self.firmware,
            storage: { usedMB: 41.3, totalMB: 128 }
          });
        },
        'system.ping': function (p, reply) {
          reply(null, { t: (p && p.t) || 0 });
        }
      });

      FZ.audio.boot();
    },

    /* ---------- input from 3D buttons / keyboard ---------- */
    onKey: function (k) {
      if (this.state === 'boot') { this.state = 'home'; this.dirty(); return; }
      if (this.state === 'pair') {
        if (k === 'ok') {
          FZ.link.event('flipper', 'link.pair.confirm', { pin: this.pin });
          this.state = 'waitconfirm';
          this.dirty();
          var self = this;
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(function () {
            if (self.state === 'waitconfirm') {
              FZ.link.event('flipper', 'link.pair.retry', { pin: self.pin });
              self.state = 'pair';
              self.dirty();
            }
          }, 2500);
        } else if (k === 'back') {
          clearTimeout(this.retryTimer);
          FZ.link.event('flipper', 'link.pair.cancel', { pin: this.pin });
          this.state = 'home';
          this.dirty();
        }
        return;
      }
      this.lastKey = KEY_LABEL[k] || String(k).toUpperCase();
      this.dirty();
    },

    /* ---------- per-frame ---------- */
    tick: function (now) {
      if (this.state === 'boot') {
        this.dirtyFlag = true;
        if (now - this.t0 > 1300) { this.state = 'home'; this.dirtyFlag = true; }
      }
      if (this.state === 'scan') {
        this.dirtyFlag = true; /* animated dots */
        if (now - this.scanT0 > 6000) { this.state = 'home'; }
      }
      if (this.dirtyFlag) { this.draw(now); this.dirtyFlag = false; }
    },

    /* ---------- rendering (logical 128×64) ---------- */
    draw: function (now) {
      var s = this.screen;
      if (!s) return;
      var c = s.begin();
      c.fillStyle = BG;
      c.fillRect(0, 0, 128, 64);

      if (this.state === 'boot') {
        this.drawBoot(now);
      } else {
        this.drawStatus(c);
        switch (this.state) {
          case 'scan': this.drawScan(c, now); break;
          case 'pair': this.drawPair(c); break;
          case 'waitconfirm': this.drawWait(c); break;
          case 'connected': this.drawConnected(c); break;
          default: this.drawHome(c); break;
        }
      }

      /* faint pixel grid (drawn in device pixels) */
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = 'rgba(0,0,0,0.055)';
      var w = s.canvas.width, h = s.canvas.height, i;
      for (i = 1; i < w; i += 2) c.fillRect(i, 0, 1, h);
      for (i = 1; i < h; i += 2) c.fillRect(0, i, w, 1);

      s.markDirty();
    },

    drawBoot: function (now) {
      var s = this.screen, c = s.ctx;
      c.setTransform(s.scale, 0, 0, s.scale, 0, 0);
      var p = FZ.util.clamp((now - this.t0) / 1100, 0, 1);
      invBoxC(c, 'FLIPPER SIM', 14);
      drawTextC(c, 'FAN PROJECT', 30);
      /* progress bar */
      c.strokeStyle = FG;
      c.lineWidth = 1;
      c.strokeRect(4.5, 44.5, 119, 9);
      c.fillStyle = FG;
      c.fillRect(6, 46, Math.round(116 * p), 6);
      drawTextC(c, Math.round(p * 100) + '%', 56);
    },

    drawStatus: function (c) {
      /* battery: icon + percent */
      c.strokeStyle = FG;
      c.lineWidth = 1;
      c.strokeRect(2.5, 1.5, 13, 7);
      c.fillStyle = FG;
      c.fillRect(16, 3.5, 1, 3);
      var pct = this.battery / 100;
      c.fillRect(4, 3, Math.round(10 * pct), 5);
      drawText(c, String(this.battery), 19, 1);

      /* link bars (right) */
      var i, hgt, x;
      for (i = 0; i < 4; i++) {
        hgt = 2 + i * 2;
        x = 106 + i * 5;
        if (this.connected && i < this.signal) {
          c.fillStyle = FG;
          c.fillRect(x, 8 - hgt, 3, hgt);
        } else {
          c.strokeStyle = FG;
          c.lineWidth = 1;
          c.strokeRect(x + 0.5, 8.5 - hgt, 2, hgt - 1);
        }
      }
    },

    drawHome: function (c) {
      invBoxC(c, 'FLIPPER SIM', 14);
      drawTextC(c, 'KEY: ' + this.lastKey, 30);
      drawTextC(c, 'USE PHONE TO PAIR', 42);
      drawTextC(c, 'SIMULATION ONLY', 54);
    },

    drawScan: function (c, now) {
      invBoxC(c, 'BT SCANNING', 18);
      var dots = '.'.repeat(1 + (Math.floor(now / 250) % 3));
      drawTextC(c, 'SEARCH' + dots, 36);
      drawTextC(c, 'NO REAL RADIO', 50);
    },

    drawPair: function (c) {
      invBoxC(c, 'PAIRING', 12);
      drawTextC(c, 'PIN', 22);
      drawTextC(c, this.pin, 32, FG, 2);
      drawTextC(c, 'OK=PAIR', 50);
      drawTextC(c, 'BACK=CANCEL', 58 - 4);
    },

    drawWait: function (c) {
      invBoxC(c, 'CONFIRMING', 14);
      drawTextC(c, 'PIN ' + this.pin, 30);
      drawTextC(c, 'KEEP PHONE NEAR', 44);
      drawTextC(c, 'RETRY IN 2S', 56 - 4);
    },

    drawConnected: function (c) {
      invBoxC(c, 'CONNECTED', 12);
      var nm = this.name.toUpperCase();
      if (nm.length > 14) nm = nm.slice(0, 14);
      drawTextC(c, nm, 30);
      drawTextC(c, 'RPC SIM LINK', 44);
      drawTextC(c, 'ARCHIVE READY', 56);
    }
  };

  FZ.os = os;
})();

/* Fliper Web Sim — flipper-os: JS re-implementation of the Flipper OS shell
   for a 128×64 monochrome LCD with orange backlight (#FF8200 on #1A0F00).
   All code and glyphs original.
   Stage 1: boot, home, pairing, link status.
   Stage 3: main menu (OK from home/connected) with FILE MANAGER over the
   virtual SD card (js/flipper-fs.js): browse, view text/images, rename,
   delete, LCD screenshot capture, storage info.
   Stage 5: BAD USB is UI-only. It reads tiny original "REM/STRING/ENTER/
   DELAY" demo scripts from /ext/badusb and plays them back as text on the
   Flipper's own LCD — it never creates a real keyboard/HID device, never
   dispatches DOM events, and cannot type into this page or any other
   application. It is a screen animation, nothing else.
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

  /* ---------- file-manager helpers (Stage 3) ---------- */
  /* charset for the rename editor; '\b' is the delete-char sentinel,
     displayed as '<' (the font is uppercase-only and has no backspace
     glyph — drawText() uppercases everything anyway). */
  var CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789_-().'.split('').concat(['\b']);
  var ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789_-().'.split('');

  function dispChar(ch) { return ch === '\b' ? '<' : ch; }

  function cycle(arr, cur, delta) {
    var i = arr.indexOf(cur);
    if (i < 0) return arr[delta > 0 ? 0 : arr.length - 1];
    return arr[(i + delta + arr.length) % arr.length];
  }

  function drawTextR(c, str, xRight, y, color, scale) {
    drawText(c, str, xRight - textWidth(str, scale || 1), y, color, scale);
  }

  function fmtSize(n) {
    if (n < 1000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(1) + 'K';
    return (n / 1000000).toFixed(1) + 'M';
  }

  function trunc(s, max) {
    s = String(s);
    return s.length > max ? s.slice(0, max - 1) + '.' : s;
  }

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

    /* menu + file manager (Stage 3) */
    menuSel: 0,
    menuFrom: 'home',
    savedPath: '',
    savedT0: 0,
    findT0: -1e9,   /* Stage 4: find-my-Flipper flash start time */

    /* Bad USB (Stage 5, UI-only) */
    badusb: { list: [], sel: 0, scroll: 0 },
    run: null,      /* {name, steps[], idx, log[], mode, charIdx, t0, delayUntil, done} */
    fm: {
      path: '/ext', sel: 0, scroll: 0,
      viewPath: null, viewLines: [], viewScroll: 0, viewImg: null, viewIsImg: false,
      act: null,   /* {path, dir, from, sel} */
      ren: null,   /* {path, buf[], cur, ins, from} */
      del: null    /* {path, from} */
    },

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
          var used = 41.3 + (FZ.fs ? FZ.fs.usedMB() : 0);
          reply(null, {
            name: self.name,
            battery: self.battery,
            firmware: self.firmware,
            storage: { usedMB: Math.round(used * 10) / 10, totalMB: 128 }
          });
        },
        'system.ping': function (p, reply) {
          reply(null, { t: (p && p.t) || 0 });
        },

        /* ---------- Stage 4: phone Storage screen over RPC ---------- */
        'fs.list': function (p, reply) {
          if (!FZ.fs) { reply('fs unavailable', null); return; }
          var path = FZ.fs.normalize(p && p.path);
          reply(null, { path: path, entries: FZ.fs.list(path) });
        },
        'fs.read': function (p, reply) {
          if (!FZ.fs) { reply('fs unavailable', null); return; }
          var path = FZ.fs.normalize(p && p.path);
          var data = FZ.fs.read(path);
          if (data === null) { reply('not found', null); return; }
          reply(null, { path: path, data: data });
        },
        'fs.rename': function (p, reply) {
          if (!FZ.fs) { reply('fs unavailable', null); return; }
          var path = FZ.fs.rename(p && p.path, p && p.name);
          if (!path) { reply('rename failed', null); return; }
          reply(null, { path: path });
        },
        'fs.remove': function (p, reply) {
          if (!FZ.fs) { reply('fs unavailable', null); return; }
          var path = FZ.fs.remove(p && p.path);
          if (!path) { reply('remove failed', null); return; }
          reply(null, { path: path });
        },
        'fs.stats': function (p, reply) {
          if (!FZ.fs) { reply('fs unavailable', null); return; }
          reply(null, FZ.fs.stats());
        },

        /* ---------- Stage 4: find-my-Flipper ---------- */
        'find.flipper': function (p, reply) {
          self.findT0 = FZ.util.now();
          self.dirty();
          FZ.audio.alarm();
          reply(null, { ok: true });
        }
      });

      /* redraw the file UI if the SD card changes underneath it, and tell
         the phone so its Storage screen can refresh within ~1 s (Stage 4).
         Every mutation — whether it came from the on-device file manager or
         from a phone RPC handler above — flows through FZ.fs, so this one
         subscription is the single sync point for both UIs. */
      if (FZ.fs) {
        FZ.fs.subscribe(function (op) {
          var s = self.state;
          if (s === 'fm' || s === 'fmview' || s === 'fmact' ||
              s === 'fmren' || s === 'fmdel' || s === 'storage') self.dirty();
          FZ.link.event('flipper', 'fs.changed', { op: op });
        });
      }

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

      /* OK from home/connected opens the main menu (Stage 3) */
      if ((this.state === 'home' || this.state === 'connected') && k === 'ok') {
        this.menuFrom = this.state;
        this.menuSel = 0;
        this.state = 'menu';
        this.dirty();
        return;
      }

      switch (this.state) {
        case 'menu': this.keyMenu(k); break;
        case 'fm': this.keyFm(k); break;
        case 'fmview': this.keyFmView(k); break;
        case 'fmact': this.keyFmAct(k); break;
        case 'fmren': this.keyFmRen(k); break;
        case 'fmdel': this.keyFmDel(k); break;
        case 'fmsaved': this.state = 'menu'; this.menuSel = 0; break;
        case 'storage': if (k === 'back') { this.state = 'menu'; } break;
        case 'badusb': this.keyBadUsb(k); break;
        case 'badusbrun': this.keyBadUsbRun(k); break;
        default: break;
      }
      this.dirty();
    },

    /* ---------- menu / file-manager input (Stage 3) ---------- */
    keyMenu: function (k) {
      var N = 4;
      if (k === 'up') this.menuSel = (this.menuSel + N - 1) % N;
      else if (k === 'down') this.menuSel = (this.menuSel + 1) % N;
      else if (k === 'back') this.state = this.menuFrom;
      else if (k === 'ok') {
        if (this.menuSel === 0) { this.openFm('/ext'); this.state = 'fm'; }
        else if (this.menuSel === 1) this.capture();
        else if (this.menuSel === 2) this.state = 'storage';
        else this.openBadUsb();
      }
    },

    /* ---------- Bad USB: UI-only script playback (Stage 5) ---------- */
    openBadUsb: function () {
      var entries = FZ.fs ? FZ.fs.list('/ext/badusb') : [];
      this.badusb.list = entries.filter(function (e) { return !e.dir; });
      this.badusb.sel = 0;
      this.badusb.scroll = 0;
      this.state = 'badusb';
    },

    keyBadUsb: function (k) {
      var b = this.badusb, n = b.list.length;
      if (k === 'up') { if (b.sel > 0) b.sel--; }
      else if (k === 'down') { if (b.sel < n - 1) b.sel++; }
      else if (k === 'back') { this.state = 'menu'; this.menuSel = 3; }
      else if (k === 'ok') { if (b.list[b.sel]) this.startBadUsb(b.list[b.sel]); }
      if (b.sel < b.scroll) b.scroll = b.sel;
      if (b.sel > b.scroll + 5) b.scroll = b.sel - 5;
    },

    /* Parse a tiny original script format: one instruction per line.
         REM <text>      comment, shown but never "typed"
         STRING <text>   types the text out on the LCD, character by character
         ENTER           shows a return glyph and starts a new output line
         DELAY <ms>      pauses, showing a countdown
       Anything else is shown verbatim as a comment-like line. This is a
       screen animation only — no key events are ever dispatched anywhere. */
    parseBadUsb: function (text) {
      var lines = String(text).split('\n');
      var steps = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.replace(/^\s+/, '');
        if (!trimmed) continue;
        var sp = trimmed.indexOf(' ');
        var word = sp < 0 ? trimmed : trimmed.slice(0, sp);
        var rest = sp < 0 ? '' : trimmed.slice(sp + 1);
        var up = word.toUpperCase();
        if (up === 'REM') steps.push({ type: 'rem', text: rest });
        else if (up === 'STRING') steps.push({ type: 'string', text: rest });
        else if (up === 'ENTER') steps.push({ type: 'enter', text: '' });
        else if (up === 'DELAY') steps.push({ type: 'delay', ms: Math.max(0, parseInt(rest, 10) || 0) });
        else steps.push({ type: 'rem', text: trimmed });
      }
      return steps;
    },

    startBadUsb: function (entry) {
      var data = FZ.fs ? FZ.fs.read(entry.path) : null;
      var steps = this.parseBadUsb(data || '');
      this.run = {
        name: entry.name, steps: steps, idx: 0, log: [''], lineBase: '',
        mode: steps.length ? 'start' : 'done', done: !steps.length, charIdx: 0, t0: FZ.util.now()
      };
      this.state = 'badusbrun';
    },

    keyBadUsbRun: function (k) {
      var r = this.run;
      if (!r) { this.state = 'badusb'; return; }
      if (k === 'back') { this.state = 'badusb'; this.run = null; return; }
      if (k === 'ok' && !r.done) {
        /* OK always fast-forwards: finish whatever step is in progress
           instantly, regardless of its type */
        var step = r.steps[r.idx];
        if (step && step.type === 'string') r.charIdx = step.text.length;
        if (step) this.finishStep();
      }
    },

    finishStep: function () {
      var r = this.run;
      var step = r.steps[r.idx];
      if (step) {
        if (step.type === 'string') r.log[r.log.length - 1] = r.lineBase + step.text;
        else if (step.type === 'enter') r.log.push('');
        /* rem and delay produce no visible terminal text */
      }
      r.idx++;
      r.charIdx = 0;
      r.t0 = FZ.util.now();
      if (r.idx >= r.steps.length) { r.mode = 'done'; r.done = true; }
      else { r.mode = 'start'; r.lineBase = r.log[r.log.length - 1]; }
    },

    /* advances Bad USB playback; called from tick() every frame. This only
       mutates the Flipper's own screen state (r.log / dirty flag) — nothing
       here ever touches the DOM, the keyboard, or any other application. */
    tickBadUsb: function (now) {
      var r = this.run;
      if (!r || r.done) return;
      var step = r.steps[r.idx];
      if (!step) { r.mode = 'done'; r.done = true; return; }
      this.dirtyFlag = true;
      if (step.type === 'rem') {
        if (now - r.t0 > 650) this.finishStep();
      } else if (step.type === 'enter') {
        if (now - r.t0 > 200) this.finishStep();
      } else if (step.type === 'delay') {
        if (now - r.t0 > Math.max(150, step.ms)) this.finishStep();
      } else if (step.type === 'string') {
        var CPS = 28; /* simulated "typing" speed, chars/sec */
        var want = Math.min(step.text.length, Math.floor((now - r.t0) / (1000 / CPS)));
        r.charIdx = want;
        r.log[r.log.length - 1] = r.lineBase + step.text.slice(0, want);
        if (want >= step.text.length) this.finishStep();
      }
    },

    openFm: function (path) {
      this.fm.path = path;
      this.fm.sel = 0;
      this.fm.scroll = 0;
    },

    fmList: function () {
      return (FZ.fs ? FZ.fs.list(this.fm.path) : []);
    },

    fmClamp: function () {
      var f = this.fm;
      var n = this.fmList().length;
      if (f.sel >= n) f.sel = Math.max(0, n - 1);
      if (f.sel < 0) f.sel = 0;
      if (f.sel < f.scroll) f.scroll = f.sel;
      if (f.sel > f.scroll + 5) f.scroll = f.sel - 5;
      if (f.scroll < 0) f.scroll = 0;
      if (f.scroll > Math.max(0, n - 6)) f.scroll = Math.max(0, n - 6);
    },

    fmUp: function () {
      if (this.fm.path === '/ext' || this.fm.path === '/') return;
      var p = this.fm.path.split('/');
      p.pop();
      this.openFm(p.join('/') || '/ext');
    },

    keyFm: function (k) {
      var list = this.fmList();
      var n = list.length;
      if (k === 'up') { if (this.fm.sel > 0) this.fm.sel--; }
      else if (k === 'down') { if (this.fm.sel < n - 1) this.fm.sel++; }
      else if (k === 'ok') {
        var e = list[this.fm.sel];
        if (!e) return;
        if (e.dir) this.openFm(e.path);
        else this.openView(e.path);
      } else if (k === 'right') {
        var e2 = list[this.fm.sel];
        if (e2) {
          this.fm.act = { path: e2.path, dir: e2.dir, from: 'fm', sel: 0 };
          this.state = 'fmact';
        }
      } else if (k === 'left') {
        this.fmUp();
      } else if (k === 'back') {
        if (this.fm.path !== '/ext') this.fmUp();
        else { this.state = 'menu'; this.menuSel = 0; }
      }
      this.fmClamp();
    },

    openView: function (path) {
      var data = FZ.fs ? FZ.fs.read(path) : null;
      var f = this.fm;
      f.viewPath = path;
      f.viewScroll = 0;
      f.viewImg = null;
      f.viewIsImg = !!(data && String(data).indexOf('data:image/') === 0);
      f.viewLines = data === null ? ['(UNREADABLE)'] : String(data).split('\n');
      if (f.viewIsImg && typeof Image !== 'undefined') {
        var self = this;
        var img = new Image();
        img.onload = function () { self.fm.viewImg = img; self.dirty(); };
        img.src = String(data);
      }
      this.state = 'fmview';
    },

    keyFmView: function (k) {
      var f = this.fm;
      if (k === 'up' && !f.viewIsImg) {
        if (f.viewScroll > 0) f.viewScroll--;
      } else if (k === 'down' && !f.viewIsImg) {
        if (f.viewScroll < Math.max(0, f.viewLines.length - 6)) f.viewScroll++;
      } else if (k === 'ok') {
        f.act = { path: f.viewPath, dir: false, from: 'fmview', sel: 0 };
        this.state = 'fmact';
      } else if (k === 'back') {
        this.state = 'fm';
      }
    },

    keyFmAct: function (k) {
      var a = this.fm.act;
      if (!a) { this.state = 'fm'; return; }
      if (k === 'up') a.sel = (a.sel + 2) % 3;
      else if (k === 'down') a.sel = (a.sel + 1) % 3;
      else if (k === 'back') this.state = a.from;
      else if (k === 'ok') {
        if (a.sel === 0) this.startRen(a);
        else if (a.sel === 1) { this.fm.del = { path: a.path, from: a.from }; this.state = 'fmdel'; }
        else this.state = a.from;
      }
    },

    startRen: function (a) {
      /* The editor's charset is lowercase-only (a-z0-9_-().); names are
         lowercased on entry so the U/D cycle always starts from a known
         position. Display is uppercase regardless (font has no lowercase
         glyphs), so this is invisible on the LCD. */
      var name = a.path.split('/').pop().toLowerCase();
      this.fm.ren = { path: a.path, buf: name.split(''), cur: 0, ins: 'a', from: a.from };
      this.state = 'fmren';
    },

    keyFmRen: function (k) {
      var r = this.fm.ren;
      if (!r) { this.state = 'fm'; return; }
      if (k === 'left') { if (r.cur > 0) r.cur--; }
      else if (k === 'right') { if (r.cur < r.buf.length) r.cur++; }
      else if (k === 'up' || k === 'down') {
        var d = k === 'up' ? 1 : -1;
        if (r.cur < r.buf.length) r.buf[r.cur] = cycle(CHARSET, r.buf[r.cur], d);
        else r.ins = cycle(ALPHA, r.ins, d);
      } else if (k === 'back') {
        this.state = r.from;
      } else if (k === 'ok') {
        if (r.cur < r.buf.length) {
          if (r.buf[r.cur] === '\b') {
            r.buf.splice(r.cur, 1);
            if (r.cur > r.buf.length) r.cur = r.buf.length;
            FZ.audio.click();
          } else {
            this.commitRen();
          }
        } else {
          if (r.buf.length >= 18) { FZ.audio.err(); return; }
          r.buf.push(r.ins);
          r.cur = r.buf.length - 1;
          FZ.audio.click();
        }
      }
    },

    commitRen: function () {
      var r = this.fm.ren;
      var name = r.buf.join('');
      var newPath = FZ.fs ? FZ.fs.rename(r.path, name) : null;
      if (!newPath) { FZ.audio.err(); return; }
      FZ.audio.ok();
      if (r.from === 'fmview') {
        this.openView(newPath);
        this.state = 'fmview';
      } else {
        this.state = 'fm';
        var list = this.fmList();
        for (var i = 0; i < list.length; i++) {
          if (list[i].path === newPath) { this.fm.sel = i; break; }
        }
        this.fmClamp();
      }
    },

    keyFmDel: function (k) {
      var d = this.fm.del;
      if (!d) { this.state = 'fm'; return; }
      if (k === 'back') { this.state = d.from; return; }
      if (k === 'ok') {
        var ok = FZ.fs ? FZ.fs.remove(d.path) : null;
        this.state = d.from;
        if (!ok) FZ.audio.err();
        else FZ.audio.beep(330, 0.08, 0.08);
        if (d.from === 'fm') this.fmClamp();
      }
    },

    capture: function () {
      var s = this.screen;
      var url = '';
      try { url = s.canvas.toDataURL('image/png'); } catch (e) { url = ''; }
      if (!url) { FZ.audio.err(); this.state = 'menu'; return; }
      var d = new Date();
      var name = 'lcd-' + d.getFullYear() +
        FZ.util.pad2(d.getMonth() + 1) + FZ.util.pad2(d.getDate()) +
        '-' + FZ.util.pad2(d.getHours()) + FZ.util.pad2(d.getMinutes()) +
        FZ.util.pad2(d.getSeconds()) + '.png';
      var path = FZ.fs ? FZ.fs.write('/ext/screenshots/' + name, url) : null;
      if (!path) { FZ.audio.err(); this.state = 'menu'; return; }
      this.savedPath = path;
      this.savedT0 = FZ.util.now();
      this.state = 'fmsaved';
      FZ.audio.ok();
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
      if (this.state === 'fmsaved' && now - this.savedT0 > 2500) {
        this.state = 'menu';
        this.menuSel = 0;
        this.dirtyFlag = true;
      }
      if (now - this.findT0 < 3000) this.dirtyFlag = true; /* keep the find-me flash animating */
      if (this.state === 'badusbrun') this.tickBadUsb(now);
      if (this.dirtyFlag) { this.draw(now); this.dirtyFlag = false; }
    },

    /* ---------- rendering (logical 128×64) ---------- */
    draw: function (now) {
      var s = this.screen;
      if (!s) return;
      var c = s.begin();

      /* find-my-Flipper: a few seconds of inverted flashing LCD, overriding
         whatever screen is currently shown (Stage 4) */
      var findAge = now - this.findT0;
      if (findAge < 3000) {
        var on = Math.floor(findAge / 220) % 2 === 0;
        var txtColor = on ? BG : FG;
        c.fillStyle = on ? FG : BG;
        c.fillRect(0, 0, 128, 64);
        drawTextC(c, 'FIND MY', 20, txtColor, 2);
        drawTextC(c, 'FLIPPER', 38, txtColor, 2);
        drawTextC(c, 'HERE I AM', 56, txtColor);
        s.markDirty();
        return;
      }

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
          case 'menu': this.drawMenu(c); break;
          case 'fm': this.drawFm(c); break;
          case 'fmview': this.drawFmView(c); break;
          case 'fmact': this.drawFmAct(c); break;
          case 'fmren': this.drawFmRen(c); break;
          case 'fmdel': this.drawFmDel(c); break;
          case 'fmsaved': this.drawSaved(c); break;
          case 'storage': this.drawStorage(c); break;
          case 'badusb': this.drawBadUsb(c); break;
          case 'badusbrun': this.drawBadUsbRun(c); break;
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
      drawTextC(c, 'OK=MENU PHONE=PAIR', 42);
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
      drawTextC(c, 'OK=MENU  RPC SIM', 44);
      drawTextC(c, 'ARCHIVE READY', 56);
    },

    /* ---------- menu / file-manager rendering (Stage 3) ---------- */
    drawMenu: function (c) {
      invBoxC(c, 'MENU', 10);
      var items = ['FILE MANAGER', 'SCREENSHOT', 'STORAGE', 'BAD USB'];
      for (var i = 0; i < items.length; i++) {
        var y = 20 + i * 9;
        if (i === this.menuSel) {
          c.fillStyle = FG;
          c.fillRect(6, y - 2, 116, 10);
          drawText(c, items[i], 10, y, BG);
        } else {
          drawText(c, items[i], 10, y, FG);
        }
      }
      drawTextC(c, 'OK SELECT BACK HOME', 56);
    },

    drawFm: function (c) {
      var list = this.fmList();
      var n = list.length;
      var p = this.fm.path;
      drawText(c, trunc(p, 14), 4, 11);
      drawTextR(c, n ? (this.fm.sel + 1) + '/' + n : '-', 124, 11);
      if (!n) {
        drawTextC(c, 'EMPTY - BACK=UP', 36);
        return;
      }
      for (var i = 0; i < 6; i++) {
        var idx = this.fm.scroll + i;
        if (idx >= n) break;
        var e = list[idx];
        var y = 19 + i * 7;
        var nm = e.dir ? e.name + '/' : e.name;
        nm = trunc(nm, 15);
        var sz = e.dir ? '' : fmtSize(e.size);
        if (idx === this.fm.sel) {
          c.fillStyle = FG;
          c.fillRect(4, y - 1, 120, 8);
          drawText(c, nm, 6, y, BG);
          if (sz) drawTextR(c, sz, 122, y, BG);
        } else {
          drawText(c, nm, 6, y, FG);
          if (sz) drawTextR(c, sz, 122, y, FG);
        }
      }
    },

    drawFmView: function (c) {
      var f = this.fm;
      if (!f.viewPath) { drawTextC(c, 'NO FILE OPEN', 32); return; }
      drawText(c, trunc(f.viewPath.split('/').pop(), 18), 4, 11);
      if (f.viewIsImg) {
        drawTextR(c, 'IMG', 124, 11);
        if (f.viewImg) {
          var iw = f.viewImg.naturalWidth || 256;
          var ih = f.viewImg.naturalHeight || 128;
          var sc = Math.min(120 / iw, 42 / ih);
          var w = Math.max(1, Math.round(iw * sc));
          var h = Math.max(1, Math.round(ih * sc));
          try { c.drawImage(f.viewImg, Math.round((128 - w) / 2), 18, w, h); } catch (e) {}
        } else {
          drawTextC(c, 'LOADING...', 36);
        }
        return;
      }
      var lines = f.viewLines;
      for (var i = 0; i < 6; i++) {
        var li = f.viewScroll + i;
        if (li >= lines.length) break;
        drawText(c, trunc(lines[li], 21), 4, 19 + i * 7);
      }
    },

    drawFmAct: function (c) {
      invBoxC(c, 'ACTIONS', 12);
      var items = ['RENAME', 'DELETE', 'CANCEL'];
      var sel = this.fm.act ? this.fm.act.sel : 0;
      for (var i = 0; i < items.length; i++) {
        var y = 24 + i * 10;
        if (i === sel) {
          c.fillStyle = FG;
          c.fillRect(16, y - 2, 96, 10);
          drawText(c, items[i], 22, y, BG);
        } else {
          drawText(c, items[i], 22, y, FG);
        }
      }
      drawTextC(c, 'OK SELECT BACK=RET', 56);
    },

    drawFmRen: function (c) {
      var r = this.fm.ren;
      if (!r) return;
      invBoxC(c, 'RENAME', 12);
      drawText(c, 'NEW NAME:', 4, 24);
      var x = 4, i;
      for (i = 0; i < r.buf.length; i++) {
        var ch = dispChar(r.buf[i]);
        if (i === r.cur) {
          c.fillStyle = FG;
          c.fillRect(x - 1, 31, 7, 9);
          drawText(c, ch, x, 32, BG);
        } else {
          drawText(c, ch, x, 32, FG);
        }
        x += 6;
      }
      if (r.cur >= r.buf.length) {
        c.fillStyle = FG;
        c.fillRect(x - 1, 31, 7, 9);
        drawText(c, dispChar(r.ins), x, 32, BG);
      }
      drawText(c, 'L/R MOVE U/D CHAR', 4, 44);
      var hint;
      if (r.cur < r.buf.length && r.buf[r.cur] === '\b') hint = 'OK=DEL';
      else if (r.cur >= r.buf.length) hint = 'OK=INS';
      else hint = 'OK=SAVE';
      drawText(c, hint, 4, 52);
      drawTextR(c, 'CANCEL', 124, 52);
    },

    drawFmDel: function (c) {
      var d = this.fm.del;
      if (!d) return;
      invBoxC(c, 'DELETE?', 12);
      drawTextC(c, trunc(d.path.split('/').pop(), 20), 30);
      drawTextC(c, 'CANNOT BE UNDONE', 42);
      drawTextC(c, 'OK=YES BACK=NO', 56);
    },

    drawSaved: function (c) {
      invBoxC(c, 'SAVED TO SD', 14);
      drawTextC(c, trunc(this.savedPath.split('/').pop(), 20), 32);
      drawTextC(c, '/EXT/SCREENSHOTS', 44);
      drawTextC(c, 'OK=MENU', 56);
    },

    drawStorage: function (c) {
      invBoxC(c, 'STORAGE', 12);
      var used = 41.3 + (FZ.fs ? FZ.fs.usedMB() : 0);
      var st = FZ.fs ? FZ.fs.stats() : { files: 0, dirs: 0 };
      drawText(c, 'SD CARD (VIRTUAL)', 4, 26);
      drawText(c, 'USED ' + used.toFixed(1) + ' MB', 4, 36);
      drawText(c, 'FREE ' + Math.max(0, 128 - used).toFixed(1) + ' MB', 4, 46);
      drawText(c, 'FILES ' + st.files + ' DIRS ' + st.dirs, 4, 56);
    },

    /* ---------- Bad USB rendering (Stage 5, UI-only) ---------- */
    drawBadUsb: function (c) {
      var b = this.badusb;
      drawText(c, 'BAD USB', 4, 11);
      drawTextR(c, b.list.length ? (b.sel + 1) + '/' + b.list.length : '-', 124, 11);
      if (!b.list.length) {
        drawTextC(c, 'NO SCRIPTS FOUND', 32);
        drawTextC(c, 'ADD TO /EXT/BADUSB', 44);
        return;
      }
      for (var i = 0; i < 6; i++) {
        var idx = b.scroll + i;
        if (idx >= b.list.length) break;
        var e = b.list[idx];
        var y = 19 + i * 7;
        if (idx === b.sel) {
          c.fillStyle = FG;
          c.fillRect(4, y - 1, 120, 8);
          drawText(c, trunc(e.name, 20), 6, y, BG);
        } else {
          drawText(c, trunc(e.name, 20), 6, y, FG);
        }
      }
    },

    drawBadUsbRun: function (c) {
      var r = this.run;
      if (!r) { drawTextC(c, 'NO SCRIPT', 32); return; }
      drawText(c, trunc(r.name, 14), 4, 10);
      drawTextR(c, (Math.min(r.idx + 1, r.steps.length)) + '/' + r.steps.length, 124, 10);

      /* terminal-style output: last 3 lines (rows reserved below for the
         always-visible "simulated, no HID" disclaimer) */
      var lines = r.log;
      var start = Math.max(0, lines.length - 3);
      for (var i = 0; i < 3; i++) {
        var li = start + i;
        if (li >= lines.length) break;
        var text = lines[li];
        var cursor = (li === lines.length - 1 && !r.done && r.steps[r.idx] && r.steps[r.idx].type === 'string') ? '_' : '';
        drawText(c, trunc(text + cursor, 21), 4, 20 + i * 7);
      }

      drawText(c, 'SIMULATED-NO HID OUT', 4, 48);
      if (r.done) {
        drawTextC(c, 'DONE  BACK=EXIT', 56);
      } else {
        var step = r.steps[r.idx];
        var hint = step && step.type === 'delay' ? 'WAIT' : (step && step.type === 'rem' ? 'NOTE' : 'TYPING');
        drawText(c, hint, 4, 56);
        drawTextR(c, 'BACK=STOP', 124, 56);
      }
    }
  };

  FZ.os = os;
})();

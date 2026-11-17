/* Fliper Web Sim — phone-app: re-implementation of the Flipper companion
   app (original code). Dark theme, orange accent, system font stack.
   The phone NEVER reads Flipper state directly: it sends RPC requests
   through link.js and renders responses and events.
   Stage 4 adds a Storage screen (browse / view / rename / delete the
   virtual SD card entirely over fs.* RPC calls) kept in sync with the
   Flipper's own file manager via fs.changed push events, plus a
   Find My Flipper button that flashes the Flipper's LCD. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var W = 360, H = 760;
  var BG = '#101014';
  var CARD = '#17171C';
  var LINE = '#2A2A31';
  var FG = '#E8E8EC';
  var SUB = '#8A8A93';
  var ACCENT = '#FF8200';
  var DANGER = '#E06C6C';
  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function fmtBytes(n) {
    if (n < 1000) return n + ' B';
    if (n < 1000000) return (n / 1000).toFixed(1) + ' KB';
    return (n / 1000000).toFixed(1) + ' MB';
  }

  function centerText(c, str, y, font, color) {
    c.font = font;
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(str, W / 2, y);
    c.textAlign = 'left';
  }

  var ROW_H = 58, ROWS_PER_PAGE = 7;
  var KEYROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '_-().'];

  var phone = {
    screen: null,
    state: 'idle',        /* idle | scanning | devices | pin | waiting | connected
                              | storage | storage-view | storage-act | storage-ren | storage-del */
    off: false,
    pin: '',
    deviceName: 'Flipper Zero',
    devices: [],
    info: null,
    signal: 0,
    hits: [],
    hitsState: null,
    downX: 0, downY: 0, moved: false,
    volT0: -1e9,
    forceDraw: true,
    findT0: -1e9,
    findBusy: false,

    /* ---------- Stage 4: Storage screen state ---------- */
    st: {
      path: '/ext', entries: null, page: 0, loading: false, backTo: 'connected',
      view: null,        /* {path, data, isImg, img, lines, scroll} */
      act: null,         /* {path, dir, sel, from} */
      ren: null,         /* {path, buf, from} */
      del: null          /* {path, from} */
    },

    dirty: function () { if (this.screen) this.screen.markDirty(); },

    setState: function (s) {
      this.state = s;
      this.forceDraw = true;
      this.draw(FZ.util.now());
    },

    init: function (screen) {
      this.screen = screen;
      var self = this;

      FZ.link.attach('phone', {
        'link.status': function (p) {
          if (p.connected) {
            self.deviceName = p.name || self.deviceName;
            self.setState('connected');
            self.requestInfo();
          } else {
            self.pin = '';
            self.info = null;
            self.setState('idle');
          }
        },
        'link.signal': function (p) {
          self.signal = p.signal | 0;
          self.dirty();
        },
        'link.pair.confirm': function (p) {
          if ((self.state === 'pin' || self.state === 'waiting') && p.pin === self.pin) {
            FZ.link.establish({ connected: true, name: self.deviceName });
          }
        },
        'link.pair.cancel': function () {
          if (self.state === 'pin' || self.state === 'waiting') self.setState('devices');
        },
        'link.pair.retry': function () {
          if (self.state === 'waiting') self.setState('pin');
        },

        /* Stage 4: pushed whenever the virtual SD card changes anywhere
           (on-device file manager or a phone RPC) — refresh within ~1 s
           if the Storage screen is currently looking at affected data. */
        'fs.changed': function () {
          self.onFsChanged();
        }
      });

      this.forceDraw = true;
      this.draw(FZ.util.now());
    },

    /* ---------- Stage 4: Storage screen (over fs.* RPC) ---------- */
    onFsChanged: function () {
      var s = this.state;
      if (s === 'storage') this.loadList(this.st.path, true);
      else if (s === 'storage-view' && this.st.view) this.loadView(this.st.view.path, true);
    },

    openStorage: function () {
      this.st.backTo = 'connected';
      this.loadList('/ext', false);
      this.setState('storage');
    },

    loadList: function (path, silent) {
      var self = this;
      var st = this.st;
      if (!silent) { st.loading = true; st.entries = null; this.forceDraw = true; this.draw(FZ.util.now()); }
      FZ.link.request('phone', 'fs.list', { path: path }, function (err, payload) {
        st.loading = false;
        if (err) { if (!silent && FZ.toast) FZ.toast('Storage error: ' + err); return; }
        st.path = payload.path;
        st.entries = payload.entries;
        if (!silent) st.page = 0;
        self.dirty();
      });
    },

    openDir: function (path) {
      this.st.page = 0;
      this.loadList(path, false);
    },

    upDir: function () {
      var p = this.st.path;
      if (p === '/ext') { this.setState(this.st.backTo); return; }
      var parts = p.split('/');
      parts.pop();
      this.openDir(parts.join('/') || '/ext');
    },

    loadView: function (path, silent) {
      var self = this;
      var st = this.st;
      if (!silent) { st.view = { path: path, data: null, isImg: false, img: null, lines: [], scroll: 0 }; this.setState('storage-view'); }
      FZ.link.request('phone', 'fs.read', { path: path }, function (err, payload) {
        if (err) { if (FZ.toast) FZ.toast('Could not read file: ' + err); if (!silent) self.setState('storage'); return; }
        var isImg = payload.data.indexOf('data:image/') === 0;
        var v = { path: payload.path, data: payload.data, isImg: isImg, img: null, lines: isImg ? [] : payload.data.split('\n'), scroll: 0 };
        if (st.view && st.view.path === payload.path) v.scroll = st.view.scroll;
        st.view = v;
        if (isImg && typeof Image !== 'undefined') {
          var img = new Image();
          img.onload = function () { v.img = img; self.dirty(); };
          img.src = payload.data;
        }
        self.dirty();
      });
    },

    openAct: function (entry, from) {
      this.st.act = { path: entry.path, dir: entry.dir, sel: 0, from: from };
      this.setState('storage-act');
    },

    startRen: function () {
      var a = this.st.act;
      if (!a) return;
      var name = a.path.split('/').pop().toLowerCase();
      this.st.ren = { path: a.path, buf: name.split(''), from: a.from };
      this.setState('storage-ren');
    },

    commitRen: function () {
      var self = this;
      var r = this.st.ren;
      if (!r || !r.buf.length) { if (FZ.toast) FZ.toast('Name cannot be empty'); return; }
      FZ.link.request('phone', 'fs.rename', { path: r.path, name: r.buf.join('') }, function (err, payload) {
        if (err) { if (FZ.toast) FZ.toast('Rename failed: ' + err); return; }
        FZ.audio.ok();
        if (r.from === 'storage-view') { self.loadView(payload.path, false); }
        else { self.loadList(self.st.path, false); self.setState('storage'); }
      });
    },

    startDel: function () {
      var a = this.st.act;
      if (!a) return;
      this.st.del = { path: a.path, from: a.from };
      this.setState('storage-del');
    },

    commitDel: function () {
      var self = this;
      var d = this.st.del;
      if (!d) return;
      FZ.link.request('phone', 'fs.remove', { path: d.path }, function (err) {
        if (err) { if (FZ.toast) FZ.toast('Delete failed: ' + err); self.setState(d.from); return; }
        FZ.audio.beep(330, 0.08, 0.08);
        self.loadList(self.st.path, false);
        self.setState('storage');
      });
    },

    /* ---------- Stage 4: find my Flipper ---------- */
    findFlipper: function () {
      var self = this;
      if (this.findBusy) return;
      this.findBusy = true;
      FZ.link.request('phone', 'find.flipper', {}, function (err) {
        self.findBusy = false;
        if (err) { if (FZ.toast) FZ.toast('Find failed: ' + err); return; }
        self.findT0 = FZ.util.now();
        if (FZ.toast) FZ.toast('Flashing the Flipper screen…');
        self.forceDraw = true;
        self.draw(FZ.util.now());
      });
    },

    requestInfo: function () {
      var self = this;
      FZ.link.request('phone', 'system.info', {}, function (err, payload) {
        if (!err && payload) { self.info = payload; self.dirty(); }
      });
    },

    /* ---------- actions ---------- */
    scan: function () {
      var self = this;
      this.setState('scanning');
      FZ.link.request('phone', 'link.scan', {}, function (err, payload) {
        if (err) { self.setState('idle'); if (FZ.toast) FZ.toast('Scan failed: ' + err); return; }
        self.devices = (payload && payload.devices) || [];
        self.setState('devices');
      });
    },

    pairWith: function (dev) {
      var self = this;
      this.deviceName = dev.name;
      FZ.link.request('phone', 'link.pair.request', { id: dev.id }, function (err, payload) {
        if (err) { self.setState('devices'); if (FZ.toast) FZ.toast('Pairing failed: ' + err); return; }
        self.pin = payload.pin;
        self.setState('pin');
      });
    },

    confirmPair: function () {
      this.setState('waiting');
    },

    cancelPair: function () {
      var self = this;
      this.setState('devices');
      FZ.link.request('phone', 'link.pair.abort', {}, function () {});
    },

    disconnect: function () {
      FZ.link.request('phone', 'link.disconnect', {}, function (err) {
        if (err && FZ.link.get().connected) FZ.link.establish({ connected: false });
      });
    },

    /* ---------- side buttons ---------- */
    onSide: function (name) {
      if (name === 'power') {
        this.off = !this.off;
        this.forceDraw = true;
        this.draw(FZ.util.now());
        return;
      }
      if (name === 'vol_up') FZ.audio.setVolume(FZ.audio.getVolume() + 0.15);
      if (name === 'vol_down') FZ.audio.setVolume(FZ.audio.getVolume() - 0.15);
      this.volT0 = FZ.util.now();
      this.forceDraw = true;
      this.draw(FZ.util.now());
    },

    /* ---------- pointer pipeline (coords in canvas pixels) ---------- */
    pointer: function (type, x, y) {
      if (type === 'down') { this.downX = x; this.downY = y; this.moved = false; return; }
      if (type === 'move') {
        var dx = x - this.downX, dy = y - this.downY;
        if (dx * dx + dy * dy > 36) this.moved = true; /* 6 px threshold */
        return;
      }
      /* up */
      if (!this.moved) this.tap(x, y);
    },

    tap: function (x, y) {
      if (this.off) { this.off = false; this.forceDraw = true; this.draw(FZ.util.now()); return; }
      if (this.hitsState !== this.state) { this.forceDraw = true; this.draw(FZ.util.now()); }
      for (var i = this.hits.length - 1; i >= 0; i--) {
        var b = this.hits[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          FZ.audio.click();
          b.fn.call(this);
          return;
        }
      }
    },

    tick: function (now) {
      var anim = this.state === 'scanning' || this.state === 'waiting' || (now - this.volT0 < 1100);
      if (this.forceDraw || anim || this.screen.dirty) {
        this.draw(now);
        this.forceDraw = false;
      }
    },

    /* ---------- widgets ---------- */
    addButton: function (c, x, y, w, h, label, style, fn) {
      roundRect(c, x, y, w, h, 12);
      if (style === 'primary') {
        c.fillStyle = ACCENT;
        c.fill();
        c.fillStyle = '#1A0F00';
        c.font = '700 15px ' + FONT;
      } else if (style === 'danger') {
        c.fillStyle = BG;
        c.fill();
        c.strokeStyle = '#493030';
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = DANGER;
        c.font = '600 15px ' + FONT;
      } else {
        c.fillStyle = BG;
        c.fill();
        c.strokeStyle = LINE;
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = FG;
        c.font = '600 15px ' + FONT;
      }
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, x + w / 2, y + h / 2 + 1);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      this.hits.push({ x: x, y: y, w: w, h: h, fn: fn });
    },

    addRow: function (c, y, label, value, bar) {
      var x = 20, w = 320, h = 64;
      roundRect(c, x, y, w, h, 12);
      c.fillStyle = CARD;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = SUB;
      c.font = '500 12px ' + FONT;
      c.fillText(label, x + 16, y + 24);
      c.fillStyle = FG;
      c.font = '600 15px ' + FONT;
      c.fillText(value, x + 16, y + 46);
      if (bar !== undefined && bar !== null) {
        var bw = 110, bx = x + w - bw - 16, by = y + h / 2 - 4;
        roundRect(c, bx, by, bw, 8, 4);
        c.fillStyle = '#26262C';
        c.fill();
        var f = FZ.util.clamp(bar, 0, 1);
        if (f > 0) {
          roundRect(c, bx, by, Math.max(8, bw * f), 8, 4);
          c.fillStyle = ACCENT;
          c.fill();
        }
      }
    },

    addBars: function (c, x, y, level) {
      for (var i = 0; i < 4; i++) {
        var h = 4 + i * 3;
        var bx = x + i * 7;
        roundRect(c, bx, y + 14 - h, 4, h, 1);
        if (i < level) { c.fillStyle = ACCENT; c.fill(); }
        else { c.strokeStyle = '#3A3A42'; c.lineWidth = 1; c.stroke(); }
      }
    },

    /* ---------- drawing ---------- */
    draw: function (now) {
      var s = this.screen;
      if (!s) return;
      var c = s.begin();
      this.hits = [];

      if (this.off) {
        c.fillStyle = '#000000';
        c.fillRect(0, 0, W, H);
        this.hitsState = this.state;
        s.markDirty();
        return;
      }

      c.fillStyle = BG;
      c.fillRect(0, 0, W, H);

      /* header */
      c.fillStyle = FG;
      c.font = '700 20px ' + FONT;
      c.fillText('Companion', 20, 42);
      c.fillStyle = SUB;
      c.font = '500 11px ' + FONT;
      c.fillText('SIM', 130, 42);
      if (this.state === 'connected' || this.state.indexOf('storage') === 0) {
        roundRect(c, 214, 18, 126, 30, 15);
        c.strokeStyle = ACCENT;
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = ACCENT;
        c.font = '700 11px ' + FONT;
        c.fillText('CONNECTED', 228, 37);
        this.addBars(c, 306, 24, this.signal);
      }

      switch (this.state) {
        case 'scanning': this.drawScanning(c, now); break;
        case 'devices': this.drawDevices(c); break;
        case 'pin': this.drawPin(c); break;
        case 'waiting': this.drawWaiting(c, now); break;
        case 'connected': this.drawConnected(c); break;
        case 'storage': this.drawStorage(c); break;
        case 'storage-view': this.drawStorageView(c); break;
        case 'storage-act': this.drawStorageAct(c); break;
        case 'storage-ren': this.drawStorageRen(c); break;
        case 'storage-del': this.drawStorageDel(c); break;
        default: this.drawIdle(c); break;
      }

      /* volume overlay */
      if (now - this.volT0 < 1100) this.drawVolume(c);

      /* footnote */
      c.fillStyle = '#55555E';
      c.font = '500 11px ' + FONT;
      c.textAlign = 'center';
      c.fillText('Simulation only — no real Bluetooth', W / 2, H - 18);
      c.textAlign = 'left';

      this.hitsState = this.state;
      s.markDirty();
    },

    drawIdle: function (c) {
      /* original mini-device glyph */
      var gx = 140, gy = 150, gw = 80, gh = 150;
      roundRect(c, gx, gy, gw, gh, 12);
      c.strokeStyle = LINE;
      c.lineWidth = 2;
      c.stroke();
      roundRect(c, gx + 12, gy + 16, gw - 24, 40, 4);
      c.strokeStyle = '#3A2A12';
      c.stroke();
      c.fillStyle = 'rgba(255,130,0,0.35)';
      c.fillRect(gx + 16, gy + 20, gw - 32, 32);
      /* dpad dots */
      c.fillStyle = LINE;
      c.beginPath(); c.arc(gx + 30, gy + 92, 7, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(gx + 50, gy + 92, 7, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(gx + 40, gy + 112, 7, 0, Math.PI * 2); c.fill();

      centerText(c, 'No device connected', 360, '600 16px ' + FONT, FG);
      centerText(c, 'Flipper Zero simulator', 386, '500 13px ' + FONT, SUB);

      this.addButton(c, 40, 620, 280, 52, 'SCAN FOR DEVICES', 'primary', this.scan);
    },

    drawScanning: function (c, now) {
      var cx = W / 2, cy = 320;
      for (var i = 0; i < 3; i++) {
        var r = ((now * 0.06) + i * 70) % 210;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(255,130,0,' + (0.55 * (1 - r / 210)).toFixed(3) + ')';
        c.lineWidth = 2;
        c.stroke();
      }
      c.fillStyle = ACCENT;
      c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill();

      centerText(c, 'Scanning…', 440, '600 17px ' + FONT, FG);
      this.addButton(c, 110, 620, 140, 48, 'CANCEL', 'ghost', function () { this.setState('idle'); });
    },

    drawDevices: function (c) {
      c.fillStyle = SUB;
      c.font = '500 13px ' + FONT;
      c.fillText('Found devices', 20, 110);

      var self = this;
      for (var i = 0; i < this.devices.length; i++) {
        (function (dev) {
          var x = 20, y = 130, w = 320, h = 76;
          roundRect(c, x, y, w, h, 12);
          c.fillStyle = CARD;
          c.fill();
          c.strokeStyle = ACCENT;
          c.lineWidth = 1.5;
          c.stroke();
          c.fillStyle = FG;
          c.font = '600 16px ' + FONT;
          c.fillText(dev.name, x + 16, y + 32);
          c.fillStyle = SUB;
          c.font = '500 12px ' + FONT;
          c.fillText('RSSI ' + dev.rssi + ' dBm · ' + dev.id, x + 16, y + 54);
          c.fillStyle = ACCENT;
          c.font = '400 22px ' + FONT;
          c.fillText('›', x + w - 26, y + 46);
          self.hits.push({ x: x, y: y, w: w, h: h, fn: function () { this.pairWith(dev); } });
        })(this.devices[i]);
      }

      this.addButton(c, 20, 620, 120, 48, 'BACK', 'ghost', function () { this.setState('idle'); });
    },

    drawPin: function (c) {
      centerText(c, 'Enter PIN', 140, '700 19px ' + FONT, FG);
      centerText(c, 'Confirm this code matches your Flipper', 168, '500 13px ' + FONT, SUB);

      roundRect(c, 40, 200, 280, 96, 14);
      c.fillStyle = CARD;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = 1.5;
      c.stroke();

      c.fillStyle = ACCENT;
      c.font = '700 44px ' + MONO;
      c.textAlign = 'center';
      var digits = this.pin.split('');
      var dw = 26, gap = 16, total = digits.length * dw + (digits.length - 1) * gap;
      var sx = W / 2 - total / 2 + dw / 2;
      for (var i = 0; i < digits.length; i++) c.fillText(digits[i], sx + i * (dw + gap), 266);
      c.textAlign = 'left';

      this.addButton(c, 40, 460, 280, 52, 'PAIR', 'primary', this.confirmPair);
      centerText(c, 'Cancel', 560, '600 15px ' + FONT, SUB);
      this.hits.push({ x: 140, y: 536, w: 80, h: 36, fn: this.cancelPair });
      centerText(c, 'Then press OK on the Flipper', 640, '500 14px ' + FONT, '#C98A4B');
    },

    drawWaiting: function (c, now) {
      var cx = W / 2, cy = 300;
      for (var i = 0; i < 3; i++) {
        var phase = ((now * 0.004) - i * 0.33) % 1;
        if (phase < 0) phase += 1;
        c.globalAlpha = (0.25 + 0.75 * Math.sin(phase * Math.PI)).toFixed(3);
        c.fillStyle = ACCENT;
        c.beginPath();
        c.arc(cx - 30 + i * 30, cy, 8, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;

      centerText(c, 'Waiting for Flipper OK…', 390, '600 16px ' + FONT, FG);
      centerText(c, 'PIN ' + this.pin, 424, '600 15px ' + MONO, SUB);
      this.addButton(c, 110, 620, 140, 48, 'CANCEL', 'ghost', this.cancelPair);
    },

    drawConnected: function (c) {
      var info = this.info;
      this.addRow(c, 100, 'Device name', info ? info.name : this.deviceName, null);
      this.addRow(c, 176, 'Battery', info ? info.battery + '%' : '…', info ? info.battery / 100 : null);
      this.addRow(c, 252, 'Firmware', info ? info.firmware : '…', null);
      this.addRow(c, 328, 'Storage',
        info ? FZ.util.formatMB(info.storage.usedMB) + ' / ' + FZ.util.formatMB(info.storage.totalMB) : '…',
        info ? info.storage.usedMB / info.storage.totalMB : null);

      c.fillStyle = SUB;
      c.font = '500 12px ' + FONT;
      c.textAlign = 'center';
      c.fillText('Link: ' + (FZ.link.get().rtt !== null ? FZ.link.get().rtt + ' ms RTT · ' : '') +
                 'signal ' + this.signal + '/4 · RPC over simulated bus', W / 2, 430);
      c.textAlign = 'left';

      this.addButton(c, 40, 460, 280, 52, 'OPEN STORAGE', 'primary', this.openStorage);
      this.addButton(c, 40, 528, 280, 48, 'FIND MY FLIPPER', 'ghost', this.findFlipper);
      this.addButton(c, 40, 640, 280, 52, 'DISCONNECT', 'danger', this.disconnect);
    },

    /* ================= Stage 4: Storage screens ================= */
    drawStorage: function (c) {
      var st = this.st;
      this.addButton(c, 16, 92, 56, 36, '‹ UP', 'ghost', this.upDir);
      c.fillStyle = FG;
      c.font = '700 16px ' + FONT;
      c.fillText('Storage', 84, 118);
      c.fillStyle = SUB;
      c.font = '500 12px ' + FONT;
      var pathStr = st.path.length > 30 ? '…' + st.path.slice(-29) : st.path;
      c.fillText(pathStr, 16, 142);

      if (st.loading || !st.entries) {
        centerText(c, 'Loading…', 300, '500 15px ' + FONT, SUB);
        return;
      }
      if (!st.entries.length) {
        centerText(c, 'Empty folder', 300, '500 15px ' + FONT, SUB);
        return;
      }

      var totalPages = Math.max(1, Math.ceil(st.entries.length / ROWS_PER_PAGE));
      if (st.page >= totalPages) st.page = totalPages - 1;
      var start = st.page * ROWS_PER_PAGE;
      var self = this;
      var y0 = 160;
      for (var i = 0; i < ROWS_PER_PAGE; i++) {
        var idx = start + i;
        if (idx >= st.entries.length) break;
        (function (e, y) {
          var x = 16, w = 328, h = ROW_H - 8;
          roundRect(c, x, y, w, h, 10);
          c.fillStyle = CARD;
          c.fill();
          c.strokeStyle = LINE;
          c.lineWidth = 1;
          c.stroke();
          c.fillStyle = e.dir ? ACCENT : FG;
          c.font = '600 14px ' + FONT;
          var label = (e.dir ? '▸ ' : '') + (e.name.length > 20 ? e.name.slice(0, 19) + '…' : e.name);
          c.fillText(label, x + 14, y + h / 2 - 3);
          if (!e.dir) {
            c.fillStyle = SUB;
            c.font = '500 11px ' + FONT;
            c.fillText(fmtBytes(e.size), x + 14, y + h / 2 + 15);
          }
          /* row body opens / enters */
          self.hits.push({ x: x, y: y, w: w - 48, h: h, fn: function () { if (e.dir) this.openDir(e.path); else this.loadView(e.path, false); } });
          /* actions ("⋯") */
          c.fillStyle = SUB;
          c.font = '700 18px ' + FONT;
          c.fillText('⋯', x + w - 34, y + h / 2 + 5);
          self.hits.push({ x: x + w - 48, y: y, w: 48, h: h, fn: function () { this.openAct(e, 'storage'); } });
        })(st.entries[idx], y0 + i * ROW_H);
      }

      if (totalPages > 1) {
        c.fillStyle = SUB;
        c.font = '500 12px ' + FONT;
        c.textAlign = 'center';
        c.fillText('Page ' + (st.page + 1) + ' / ' + totalPages, W / 2, 690);
        c.textAlign = 'left';
        if (st.page > 0) this.addButton(c, 16, 700, 100, 40, '‹ PREV', 'ghost', function () { this.st.page--; this.forceDraw = true; });
        if (st.page < totalPages - 1) this.addButton(c, 244, 700, 100, 40, 'NEXT ›', 'ghost', function () { this.st.page++; this.forceDraw = true; });
      }
    },

    drawStorageView: function (c) {
      var v = this.st.view;
      if (!v) { this.setState('storage'); return; }
      this.addButton(c, 16, 92, 70, 36, '‹ BACK', 'ghost', function () { this.setState('storage'); });
      var name = v.path.split('/').pop();
      c.fillStyle = FG;
      c.font = '700 15px ' + FONT;
      c.fillText(name.length > 24 ? name.slice(0, 23) + '…' : name, 96, 116);

      var boxY = 140, boxH = 380;
      roundRect(c, 16, boxY, 328, boxH, 12);
      c.fillStyle = CARD;
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = 1;
      c.stroke();

      if (v.isImg) {
        if (v.img) {
          var iw = v.img.naturalWidth || 256, ih = v.img.naturalHeight || 128;
          var sc = Math.min(296 / iw, (boxH - 32) / ih);
          var w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
          try { c.drawImage(v.img, 16 + (328 - w) / 2, boxY + (boxH - h) / 2, w, h); } catch (e) {}
        } else {
          centerText(c, 'Loading image…', boxY + boxH / 2, '500 14px ' + FONT, SUB);
        }
      } else {
        c.fillStyle = FG;
        c.font = '13px ' + MONO;
        var visible = Math.floor((boxH - 32) / 20);
        for (var i = 0; i < visible; i++) {
          var li = v.scroll + i;
          if (li >= v.lines.length) break;
          var line = v.lines[li];
          c.fillText(line.length > 36 ? line.slice(0, 35) + '…' : line, 30, boxY + 26 + i * 20);
        }
        if (v.lines.length > visible) {
          if (v.scroll > 0) this.addButton(c, 16, boxY + boxH + 10, 100, 36, '▲ UP', 'ghost', function () { this.st.view.scroll = Math.max(0, this.st.view.scroll - visible); this.forceDraw = true; });
          if (v.scroll + visible < v.lines.length) this.addButton(c, 244, boxY + boxH + 10, 100, 36, '▼ DOWN', 'ghost', function () { this.st.view.scroll += visible; this.forceDraw = true; });
        }
      }

      this.addButton(c, 20, 580, 150, 48, 'RENAME', 'ghost', function () { this.openAct({ path: this.st.view.path, dir: false }, 'storage-view'); });
      this.addButton(c, 190, 580, 150, 48, 'DELETE', 'danger', function () { this.openAct({ path: this.st.view.path, dir: false }, 'storage-view'); this.startDel(); });
    },

    drawStorageAct: function (c) {
      var a = this.st.act;
      if (!a) { this.setState('storage'); return; }
      centerText(c, 'Actions', 140, '700 19px ' + FONT, FG);
      centerText(c, a.path.split('/').pop(), 166, '500 13px ' + FONT, SUB);
      this.addButton(c, 40, 220, 280, 56, 'RENAME', 'primary', this.startRen);
      this.addButton(c, 40, 288, 280, 56, 'DELETE', 'danger', this.startDel);
      this.addButton(c, 40, 356, 280, 52, 'CANCEL', 'ghost', function () { this.setState(this.st.act.from); });
    },

    drawStorageRen: function (c) {
      var r = this.st.ren;
      if (!r) { this.setState('storage'); return; }
      centerText(c, 'Rename', 110, '700 18px ' + FONT, FG);

      roundRect(c, 30, 134, 300, 50, 10);
      c.fillStyle = CARD;
      c.fill();
      c.strokeStyle = ACCENT;
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = FG;
      c.font = '600 16px ' + MONO;
      var shown = r.buf.join('') || ' ';
      c.fillText(shown.length > 26 ? '…' + shown.slice(-25) : shown, 44, 166);

      var self = this;
      var kx = 10, ky = 204, kw = (W - 20) / 10, kh = 42, gap = 4;
      for (var row = 0; row < KEYROWS.length; row++) {
        var keys = KEYROWS[row];
        var rowW = keys.length * kw;
        var rx = (W - rowW) / 2;
        for (var i = 0; i < keys.length; i++) {
          (function (ch, x, y) {
            roundRect(c, x, y, kw - gap, kh - gap, 6);
            c.fillStyle = CARD;
            c.fill();
            c.strokeStyle = LINE;
            c.lineWidth = 1;
            c.stroke();
            c.fillStyle = FG;
            c.font = '600 14px ' + FONT;
            c.textAlign = 'center';
            c.fillText(ch, x + (kw - gap) / 2, y + (kh - gap) / 2 + 5);
            c.textAlign = 'left';
            self.hits.push({
              x: x, y: y, w: kw - gap, h: kh - gap,
              fn: function () { if (this.st.ren.buf.length < 24) { this.st.ren.buf.push(ch); this.forceDraw = true; FZ.audio.click(); } }
            });
          })(keys.charAt(i), rx + i * kw, ky + row * kh);
        }
      }

      var belowY = ky + KEYROWS.length * kh + 10;
      this.addButton(c, 16, belowY, 100, 46, '⌫ DEL', 'ghost', function () { this.st.ren.buf.pop(); this.forceDraw = true; });
      this.addButton(c, 130, belowY, 100, 46, 'CANCEL', 'ghost', function () { this.setState(this.st.ren.from); });
      this.addButton(c, 244, belowY, 100, 46, 'SAVE', 'primary', this.commitRen);
    },

    drawStorageDel: function (c) {
      var d = this.st.del;
      if (!d) { this.setState('storage'); return; }
      centerText(c, 'Delete file?', 260, '700 20px ' + FONT, FG);
      centerText(c, d.path.split('/').pop(), 292, '500 14px ' + FONT, SUB);
      centerText(c, 'This cannot be undone.', 320, '500 13px ' + FONT, SUB);
      this.addButton(c, 40, 380, 280, 52, 'DELETE', 'danger', this.commitDel);
      this.addButton(c, 40, 448, 280, 52, 'CANCEL', 'ghost', function () { this.setState(this.st.del.from); });
    },

    drawVolume: function (c) {
      roundRect(c, 80, 540, 200, 64, 14);
      c.fillStyle = 'rgba(23,23,28,0.96)';
      c.fill();
      c.strokeStyle = LINE;
      c.lineWidth = 1;
      c.stroke();
      c.fillStyle = FG;
      c.font = '600 13px ' + FONT;
      c.fillText('Volume', 98, 578);
      var segs = 4, lit = Math.round(FZ.audio.getVolume() * segs);
      for (var i = 0; i < segs; i++) {
        roundRect(c, 170 + i * 24, 564, 18, 16, 4);
        c.fillStyle = i < lit ? ACCENT : '#26262C';
        c.fill();
      }
    }
  };

  FZ.phone = phone;
})();

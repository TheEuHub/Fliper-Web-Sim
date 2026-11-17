/* Original LCD shell, bitmap font and virtual device. No firmware code. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var BG = '#1A0F00';
  var FG = '#FF8200';

  /* ---------- hand-coded 5×7 bitmap font (original), rows top→bottom ---------- */
  var GLYPHS = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.#...'],
    ':': ['.....', '.....', '..#..', '.....', '.....', '..#..', '.....'],
    ';': ['.....', '.....', '..#..', '.....', '.....', '.##..', '.#...'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
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
      var rows = GLYPHS[ch],
        cols = [0, 0, 0, 0, 0];
      for (var col = 0; col < 5; col++) {
        var bits = 0;
        for (var row = 0; row < 7; row++) if (rows[row].charAt(col) === '#') bits |= 1 << row;
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

  var menuNames = [
    'Sub-GHz',
    '125 kHz RFID',
    'NFC',
    'Infrared',
    'GPIO',
    'iButton',
    'Bad USB',
    'U2F',
    'Apps',
    'Settings'
  ];
  var stack = [],
    page,
    changed = true,
    lastDraw = -Infinity,
    nextTick = 0,
    paired = false,
    signal = 0,
    pin = '',
    screen,
    bootEnd = 0;
  var settings,
    update = null,
    bootTimer,
    scanSerial = 0;
  function cleanSettings(v) {
    v = v || {};
    return {
      keySlot: /^SIM-[0-9A-F]{4}$/.test(v.keySlot) ? v.keySlot : 'SIM-7C2A',
      name:
        String(v.name || 'Flipper Zero')
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim()
          .slice(0, 18) || 'Flipper Zero',
      brightness: FZ.util.clamp(Number(v.brightness) || 100, 25, 100),
      firmware: v.firmware === '1.1.0-sim' ? '1.1.0-sim' : '1.0.0-sim'
    };
  }
  function dirty() {
    changed = true;
    if (FZ.scene) FZ.scene.wake();
  }
  function show(p, replace) {
    if (!replace && page) stack.push(page);
    page = p;
    dirty();
  }
  function home() {
    stack = [];
    page = { id: 'home' };
    dirty();
  }
  function back() {
    page = stack.pop() || { id: 'home' };
    dirty();
  }
  function boot() {
    stack = [];
    page = { id: 'boot' };
    bootEnd = FZ.util.now() + 870;
    FZ.audio.boot();
    dirty();
  }
  function list(id, title, get, select) {
    show({ id: id, title: title, rows: get, select: select, sel: 0 });
  }
  function note(title, lines) {
    show({ id: 'note', title: title, lines: lines });
  }
  function saveSettings() {
    FZ.storage.set('device', settings);
    if (paired) FZ.link.event('flipper', 'system.changed', info());
    dirty();
  }
  function info() {
    return {
      name: settings.name,
      battery: 87,
      firmware: settings.firmware,
      storage: storageInfo()
    };
  }
  function storageInfo() {
    var stats = FZ.fs.stats();
    return {
      usedMB: FZ.fs.usedMB(),
      bytes: FZ.fs.usedBytes(),
      totalMB: 128,
      files: stats.files,
      dirs: stats.dirs
    };
  }
  function rename(name) {
    name = String(name || '').trim();
    if (!/^[a-zA-Z0-9 _-]{1,18}$/.test(name))
      throw Error('Use 1–18 letters, digits, spaces, _ or -');
    settings.name = name;
    if (paired) FZ.link.rename(name);
    saveSettings();
    FZ.note('Device renamed to ' + name);
  }
  function editor(title, value, commit, max) {
    show({ id: 'editor', title: title, value: value, cursor: 0, commit: commit, max: max || 32 });
  }
  function settingsMenu() {
    list(
      'settings',
      'Settings',
      function () {
        return [
          'Device name',
          'Brightness: ' + settings.brightness + '%',
          'Sound: ' + (FZ.audio.enabled ? 'on' : 'off'),
          'About / firmware'
        ];
      },
      function (i) {
        if (!i) editor('Device name', settings.name, rename, 18);
        if (i === 1) {
          settings.brightness = settings.brightness >= 100 ? 25 : settings.brightness + 25;
          saveSettings();
        }
        if (i === 2) {
          FZ.audio.setEnabled(!FZ.audio.enabled);
          FZ.emit('sound');
        }
        if (i === 3)
          note('Device info', [
            'FLIPPER ZERO',
            'HW F7B9C6',
            'FW ' + settings.firmware,
            'JS SIMULATOR'
          ]);
      }
    );
  }
  function mainMenu() {
    list(
      'menu',
      'Main menu',
      function () {
        return menuNames;
      },
      function (i) {
        if (i === 9) settingsMenu();
        else if (i === 8) appsMenu();
        else FZ.tools.open(i);
      }
    );
  }
  function capture() {
    var path = '/ext/screenshots/lcd-' + Date.now() + '.png';
    FZ.fs.write(path, screen.canvas.toDataURL('image/png'));
    note('Screen saved', ['/EXT/SCREENSHOTS', 'LCD CAPTURE SAVED']);
  }
  function appsMenu() {
    list(
      'apps',
      'Applications',
      function () {
        return [
          'Archive',
          'File manager',
          'Clock',
          'Hex viewer',
          'Music player',
          'Screenshot',
          'Storage info'
        ];
      },
      function (i) {
        if (i === 0 || i === 1) browser('/ext', i === 0 ? 'Archive' : 'File manager');
        else if (i === 5) capture();
        else if (i === 6) {
          var v = storageInfo();
          note('Virtual SD', [
            v.bytes + ' BYTES USED',
            v.files + ' FILES',
            v.totalMB + ' MB CAPACITY'
          ]);
        } else FZ.mini.open(i);
      }
    );
  }
  function entries(p) {
    return FZ.fs.list(p.path);
  }
  function browser(path, title) {
    show({
      id: 'browser',
      title: title || path.split('/').pop(),
      path: path,
      sel: 0,
      rows: function () {
        return entries(this).map(function (e) {
          return (e.dir ? '+ ' : '  ') + e.name;
        });
      },
      select: function (i) {
        var e = entries(this)[i];
        if (e) {
          if (e.dir) browser(e.path);
          else reader(e.path);
        }
      }
    });
  }
  function reader(path) {
    var data = FZ.fs.read(path);
    if (data === null) {
      back();
      return;
    }
    var p = { id: 'reader', path: path, title: path.split('/').pop(), scroll: 0 };
    if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) {
      p.image = new Image();
      p.image.onload = dirty;
      p.image.src = data;
    } else
      p.lines = data.split('\n').flatMap(function (x) {
        return x.match(/.{1,20}/g) || [''];
      });
    show(p);
  }
  function actions(path) {
    list(
      'actions',
      'File actions',
      function () {
        return ['Rename', 'Delete', 'Cancel'];
      },
      function (i) {
        if (i === 0) {
          editor(
            'Rename file',
            path.split('/').pop(),
            function (name) {
              var dst = FZ.fs.rename(path, name);
              if (!dst) throw Error('Invalid or duplicate name');
              stack.forEach(function (q) {
                if (q.path === path) {
                  q.path = dst;
                  q.title = name;
                }
              });
            },
            64
          );
        } else if (i === 1)
          show({
            id: 'confirm',
            title: 'Delete file?',
            lines: [path.split('/').pop().slice(0, 20), 'OK: DELETE', 'BACK: KEEP'],
            accept: function () {
              FZ.fs.remove(path);
              while (page.id !== 'browser' && stack.length) back();
            }
          });
        else back();
      }
    );
  }
  function renderList(c, p) {
    var names = p.rows();
    p.sel = Math.min(p.sel, Math.max(0, names.length - 1));
    title(c, p.title);
    drawText(c, names.length ? p.sel + 1 + '/' + names.length : '0', 102, 2, BG);
    if (!names.length) {
      drawTextC(c, 'EMPTY FOLDER', 30);
      drawTextC(c, 'BACK TO RETURN', 52);
      return;
    }
    var start = Math.max(0, Math.min(p.sel - 1, names.length - 4));
    for (var j = 0; j < 4 && j + start < names.length; j++) {
      var idx = j + start,
        y = 15 + 12 * j;
      if (idx === p.sel) {
        c.fillStyle = FG;
        c.fillRect(2, y - 2, 124, 11);
      }
      drawText(
        c,
        ((idx === p.sel ? '> ' : '  ') + names[idx]).slice(0, 21),
        3,
        y,
        idx === p.sel ? BG : FG
      );
    }
  }
  function title(c, t) {
    c.fillStyle = FG;
    c.fillRect(0, 0, 128, 11);
    drawText(c, String(t).slice(0, 16), 3, 2, BG);
  }
  function bars(c, x, y, n, color) {
    c.fillStyle = color || FG;
    for (var i = 0; i < 4; i++) {
      var h = i < n ? 2 + i * 2 : 1;
      c.fillRect(x + i * 3, y - h, 2, h);
    }
  }
  function status(c) {
    if (paired) {
      c.fillStyle = FG;
      c.fillRect(2, 0, 69, 9);
      c.fillRect(1, 1, 71, 7);
      drawText(c, 'CONNECTED', 3, 1, BG);
      bars(c, 59, 8, signal, BG);
    } else {
      drawText(c, 'FLIPPER', 2, 1);
      bars(c, 46, 8, 0);
    }
    c.strokeStyle = FG;
    c.strokeRect(111.5, 1.5, 12, 6);
    c.fillStyle = FG;
    c.fillRect(113, 3, 8, 3);
    c.fillRect(124, 3, 2, 3);
    drawText(c, '87%', 91, 1);
  }
  // Integer scanline fills keep curves, moving flukes and fins on the LCD grid.
  function poly(c, pts, x, y, color) {
    c.fillStyle = color;
    var max = Math.max.apply(
      null,
      pts.map(function (p) {
        return p[1];
      })
    );
    for (var row = 0; row <= max; row++) {
      var cuts = [];
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var a = pts[i],
          b = pts[j];
        if ((a[1] <= row && b[1] > row) || (b[1] <= row && a[1] > row))
          cuts.push(a[0] + ((row - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      cuts.sort(function (a, b) {
        return a - b;
      });
      for (var n = 0; n < cuts.length; n += 2)
        c.fillRect(
          x + Math.round(cuts[n]),
          y + row,
          Math.max(1, Math.round(cuts[n + 1]) - Math.round(cuts[n])),
          1
        );
    }
  }
  function dolphin(c, phase) {
    var y = 14 + (phase === 1 ? -1 : 0),
      x = 4;
    poly(
      c,
      [
        [3, 29],
        [10, 27],
        [15, 27],
        [18, 21],
        [22, 15],
        [28, 11],
        [34, 9],
        [32, 3],
        [36, 4],
        [42, 9],
        [48, 9],
        [53, 11],
        [56, 15],
        [56, 17],
        [62, 17],
        [64, 19],
        [62, 22],
        [55, 23],
        [50, 26],
        [43, 26],
        [36, 24],
        [31, 26],
        [29, 32],
        [25, 35],
        [24, 30],
        [25, 26],
        [19, 28],
        [15, 32],
        [11, 32],
        [6, 36 - phase],
        [3, 35 - phase],
        [7, 31]
      ],
      x,
      y,
      BG
    );
    poly(
      c,
      [
        [16, 28],
        [23, 21],
        [30, 17],
        [38, 17],
        [41, 18],
        [33, 20],
        [28, 23],
        [24, 24]
      ],
      x,
      y,
      FG
    );
    c.fillStyle = FG;
    c.fillRect(x + 49, y + 14, 5, phase === 2 ? 1 : 4);
    c.fillStyle = BG;
    c.fillRect(x + 52, y + 15, 2, 2);
    c.fillStyle = FG;
    c.fillRect(x + 53, y + 20, 8, 1);
    c.fillRect(x + 50, y + 19, 4, 1);
    c.fillStyle = BG;
    [
      [3, 10],
      [6, 8],
      [10, 14],
      [63, 8],
      [60, 6]
    ].forEach(function (p) {
      c.fillRect(x + p[0], y + p[1] - phase, 1, 1);
    });
  }
  function homeArt(c, now) {
    status(c);
    c.fillStyle = FG;
    c.fillRect(0, 11, 128, 43);
    dolphin(c, FZ.flags.reducedMotion ? 0 : Math.floor(now / 620) % 3);
    drawText(c, 'FLIPPER', 77, 21, BG);
    drawText(c, 'ZERO', 77, 31, BG);
    c.fillStyle = BG;
    c.fillRect(77, 42, 24, 1);
    drawText(c, 'OK MENU', 1, 57);
    drawText(c, 'V ARCHIVE', 73, 57);
  }
  function draw(now) {
    var c = screen.begin();
    c.fillStyle = BG;
    c.fillRect(0, 0, 128, 64);
    var p = page;
    if (now - os.findT0 < 2600) {
      var inv = FZ.flags.reducedMotion || Math.floor(now / 460) % 2 === 0;
      c.fillStyle = inv ? FG : BG;
      c.fillRect(0, 0, 128, 64);
      drawTextC(c, 'HERE I AM', 20, inv ? BG : FG, 2);
      drawTextC(c, 'FIND MY FLIPPER', 46, inv ? BG : FG);
    } else if (p.id === 'home') homeArt(c, now);
    else if (p.id === 'boot') {
      invBoxC(c, 'FLIPPER LAB', 13);
      drawTextC(c, 'STARTING OS', 32);
      c.fillStyle = FG;
      c.fillRect(11, 49, Math.round(106 * FZ.util.clamp(1 - (bootEnd - now) / 870, 0, 1)), 4);
    } else if (p.id === 'pair') {
      title(c, 'Pairing code');
      drawTextC(c, pin, 21, FG, 2);
      drawTextC(c, 'MATCH ON PHONE', 43);
      drawTextC(c, 'OK PAIR / BACK EXIT', 56);
    } else if (p.id === 'update') {
      title(c, 'System update');
      drawTextC(c, update.stage, 22);
      c.strokeStyle = FG;
      c.strokeRect(7.5, 38.5, 113, 8);
      c.fillStyle = FG;
      c.fillRect(9, 40, Math.round((110 * update.percent) / 100), 5);
      drawTextC(c, update.percent + '%', 52);
    } else if (p.rows) renderList(c, p);
    else if (p.id === 'editor') {
      title(c, p.title);
      var offset = Math.max(0, p.cursor - 17);
      drawText(c, p.value.slice(offset, offset + 19) + '_', 4, 23);
      c.fillStyle = FG;
      c.fillRect(4 + (p.cursor - offset) * 6, 32, 5, 1);
      drawText(c, 'L/R MOVE  U/D EDIT', 3, 43);
      drawText(c, 'TYPE NAME / OK SAVE', 3, 55);
    } else if (p.id === 'reader') {
      title(c, p.title);
      if (p.image && p.image.complete) c.drawImage(p.image, 18, 12, 92, 46);
      else if (p.lines)
        for (var j = 0; j < 5; j++) drawText(c, p.lines[p.scroll + j] || '', 2, 14 + j * 10);
    } else if (p.draw) p.draw(c, now);
    else {
      title(c, p.title);
      (p.lines || []).slice(0, 4).forEach(function (v, i) {
        drawText(c, String(v).slice(0, 21), 3, 16 + i * 11);
      });
    }
    if (os.testPattern) {
      c.fillStyle = FG;
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = BG;
      for (var u = 0; u < 16; u++)
        for (var v = 0; v < 8; v++) if ((u + v) % 2) c.fillRect(u * 8, v * 8, 8, 8);
      c.fillStyle = FG;
      c.fillRect(4, 18, 120, 27);
      drawText(c, 'L', 6, 27, BG);
      drawTextC(c, '128X64', 26, BG, 2);
      drawText(c, 'R', 117, 27, BG);
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = 'rgba(26,15,0,.07)';
    for (var x = 1; x < screen.canvas.width; x += screen.scale)
      c.fillRect(x, 0, 1, screen.canvas.height);
    for (var y = 1; y < screen.canvas.height; y += screen.scale)
      c.fillRect(0, y, screen.canvas.width, 1);
    if (settings.brightness < 100) {
      c.fillStyle = 'rgba(18,10,0,' + (100 - settings.brightness) / 135 + ')';
      c.fillRect(0, 0, screen.canvas.width, screen.canvas.height);
    }
    screen.markDirty();
  }
  function onKey(k) {
    var p = page;
    if (!p) return;
    dirty();
    if (p.id === 'update') return;
    if (p.id === 'boot') {
      home();
      return;
    }
    if (p.id === 'pair') {
      if (k === 'ok') acceptPin(pin);
      else if (k === 'back') {
        pin = '';
        FZ.link.event('flipper', 'link.pair.cancel', {});
        home();
      }
      return;
    }
    if (k === 'back') {
      if (p.id !== 'home') back();
      return;
    }
    if (p.id === 'home') {
      if (k === 'ok') mainMenu();
      if (k === 'down') browser('/ext', 'Archive');
      if (k === 'right') settingsMenu();
      if (k === 'left') appsMenu();
      return;
    }
    if (p.id === 'editor') {
      var abc = ' abcdefghijklmnopqrstuvwxyz0123456789_-.';
      if (k === 'ok') {
        try {
          p.commit(p.value.trim());
          back();
          if (page.id === 'actions') back();
        } catch (e) {
          FZ.toast(e.message);
        }
        return;
      }
      if (k === 'left' || k === 'right')
        p.cursor = FZ.util.clamp(
          p.cursor + (k === 'left' ? -1 : 1),
          0,
          Math.min(p.max - 1, p.value.length)
        );
      else if (k === 'up' || k === 'down') {
        var v = abc.indexOf((p.value[p.cursor] || ' ').toLowerCase());
        p.value =
          p.value.slice(0, p.cursor) +
          abc[(v + abc.length + (k === 'up' ? 1 : -1)) % abc.length] +
          p.value.slice(p.cursor + 1);
      }
      return;
    }
    if (p.rows) {
      var n = p.rows().length;
      if (p.id === 'browser' && k === 'right' && n) {
        actions(entries(p)[p.sel].path);
        return;
      }
      if (!n) return;
      if (k === 'up' || k === 'down') p.sel = (p.sel + n + (k === 'up' ? -1 : 1)) % n;
      if (k === 'ok') p.select(p.sel);
      return;
    }
    if (p.key) p.key(k);
    else if (p.id === 'confirm' && k === 'ok') p.accept();
    else if (p.id === 'reader') {
      if (k === 'right') actions(p.path);
      else
        p.scroll = FZ.util.clamp(
          p.scroll + (k === 'down' ? 1 : k === 'up' ? -1 : 0),
          0,
          Math.max(0, (p.lines || []).length - 5)
        );
    } else if (k === 'ok') back();
  }
  function acceptPin(value) {
    if (!pin || pin !== value || page.id !== 'pair') return false;
    pin = '';
    FZ.link.establish({ connected: true, name: settings.name });
    return true;
  }
  function tick(now) {
    if (!page) return;
    if (os.findT0 > -1e8 && now - os.findT0 >= 2600) {
      os.findT0 = -1e9;
      changed = true;
    }
    if (page.id === 'boot' && now >= bootEnd) home();
    if (page.tick) page.tick(now);
    var anim =
      page.id === 'boot' ||
      (page.id === 'home' && !FZ.flags.reducedMotion) ||
      !!page.animation ||
      now - os.findT0 < 2850;
    if ((changed || (anim && now >= nextTick)) && now - lastDraw >= 33.34) {
      draw(now);
      changed = false;
      lastDraw = now;
      nextTick = now + (page.id === 'home' ? 600 : page.interval || 90);
    }
  }
  function rpc() {
    FZ.link.attach('flipper', {
      'link.scan': function (p, reply) {
        var serial = ++scanSerial;
        setTimeout(function () {
          reply(null, {
            devices:
              serial === scanSerial ? [{ id: 'fz-sim-01', name: settings.name, rssi: -46 }] : []
          });
        }, 780);
      },
      'link.pair.request': function (p, reply) {
        if (paired || p.id !== 'fz-sim-01') return reply('Device unavailable');
        home();
        pin = String(FZ.util.randInt(100000, 999999));
        show({ id: 'pair' });
        reply(null, { pin: pin, name: settings.name });
      },
      'link.pair.accept': function (p, reply) {
        var ok = acceptPin(p.pin);
        reply(ok ? null : 'PIN expired', { ok: ok });
      },
      'link.pair.abort': function (p, reply) {
        pin = '';
        scanSerial++;
        if (page.id === 'pair') home();
        reply(null, {});
      },
      'link.disconnect': function (p, reply) {
        FZ.link.establish({ connected: false });
        reply(null, {});
      },
      'link.status': function (p, reply) {
        if (reply) return reply(null, { connected: paired, signal: signal });
        paired = !!p.connected;
        signal = p.signal;
        pin = '';
        if (!update) home();
      },
      'link.signal': function (p) {
        signal = p.signal;
        if (paired) dirty();
      },
      'system.ping': function (p, r) {
        r(null, { echo: p.t });
      },
      'system.info': function (p, r) {
        r(null, info());
      },
      'system.rename': function (p, r) {
        try {
          rename(p.name);
          r(null, info());
        } catch (e) {
          r(e.message);
        }
      },
      'app.find': function (p, r) {
        os.findT0 = FZ.util.now();
        FZ.audio.alarm();
        dirty();
        r(null, { duration: 2600 });
      },
      'firmware.update.start': function (p, r) {
        try {
          r(null, os.startUpdate());
        } catch (e) {
          r(e.message);
        }
      },
      'firmware.update.progress': function (p, r) {
        r(null, update);
      },
      'storage.info': function (p, r) {
        r(null, storageInfo());
      },
      'storage.list': function (p, r) {
        var n = FZ.fs.stat(p.path);
        if (!n || !n.dir) return r('Folder not found');
        r(null, { path: n.path, entries: FZ.fs.list(n.path) });
      },
      'storage.read': function (p, r) {
        var d = FZ.fs.read(p.path);
        r(d === null ? 'File not found' : null, { path: p.path, data: d });
      },
      'storage.delete': function (p, r) {
        var ok = FZ.fs.remove(p.path);
        r(ok ? null : 'Cannot delete', { path: p.path });
      },
      'storage.rename': function (p, r) {
        var dst = FZ.fs.rename(p.path, p.name);
        r(dst ? null : 'Invalid or duplicate name', { path: dst });
      }
    });
  }
  var os = (FZ.os = {
    init: function (s) {
      screen = this.screen = s;
      settings = cleanSettings(FZ.storage.get('device', {}));
      rpc();
      boot();
      FZ.fs.subscribe(function (op) {
        if (paired)
          FZ.link.event('flipper', 'storage.changed', { op: op.op, path: op.path, to: op.to });
        if (page && page.path && !FZ.fs.exists(page.path)) {
          while (page.path && !FZ.fs.exists(page.path) && stack.length) back();
        }
        dirty();
      });
    },
    nextWake: function (now) {
      if (changed) return Math.max(1, 34 - (now - lastDraw));
      if (!page) return 100;
      if (
        page.id === 'boot' ||
        page.animation ||
        (page.id === 'home' && !FZ.flags.reducedMotion) ||
        now - os.findT0 < 2600
      )
        return Math.max(1, nextTick - now);
      return 60000;
    },
    tick: tick,
    onKey: onKey,
    dirty: dirty,
    home: home,
    rename: rename,
    findT0: -1e9,
    get state() {
      return page && page.id;
    },
    get pin() {
      return pin;
    },
    get name() {
      return settings.name;
    },
    get connected() {
      return paired;
    },
    get selection() {
      return page.sel;
    },
    get currentPath() {
      return page.path;
    },
    get settings() {
      return Object.assign({}, settings);
    },
    restore: function (v) {
      settings = cleanSettings(v);
      if (paired) FZ.link.rename(settings.name);
      saveSettings();
      home();
    },
    type: function (key) {
      if (!page || page.id !== 'editor') return false;
      if (key === 'Backspace') {
        page.value = page.value.slice(0, -1);
      } else if (/^[a-zA-Z0-9 _().-]$/.test(key)) {
        if (!page.typed) {
          page.value = '';
          page.typed = true;
        }
        page.value = (page.value + key).slice(0, page.max);
      } else return false;
      page.cursor = Math.min(page.value.length, page.max - 1);
      dirty();
      return true;
    },
    ui: {
      show: show,
      back: back,
      list: list,
      note: note,
      browser: browser,
      dirty: dirty,
      reader: reader,
      title: title,
      text: drawText,
      center: drawTextC,
      box: invBoxC,
      fg: FG,
      bg: BG
    },
    keySlot: function (value) {
      if (/^SIM-[0-9A-F]{4}$/.test(value)) {
        settings.keySlot = value;
        saveSettings();
      }
      return settings.keySlot;
    },
    startUpdate: function () {
      if (update) return update;
      if (settings.firmware === '1.1.0-sim') throw Error('Already up to date');
      update = { stage: 'Checking', percent: 0 };
      stack = [];
      show({ id: 'update' }, true);
      var start = Date.now();
      var stages = ['Checking', 'Downloading', 'Uploading', 'Rebooting'];
      clearInterval(bootTimer);
      bootTimer = setInterval(function () {
        var pc = Math.min(100, Math.floor((Date.now() - start) / 48));
        update = { stage: stages[Math.min(3, Math.floor(pc / 25))], percent: pc };
        dirty();
        if (paired) FZ.link.event('flipper', 'firmware.update.progress', update);
        if (pc === 100) {
          clearInterval(bootTimer);
          settings.firmware = '1.1.0-sim';
          saveSettings();
          update = null;
          boot();
          FZ.note('Simulated firmware updated');
        }
      }, 180);
      return update;
    },
    get update() {
      return update;
    },
    cancelUpdate: function () {
      clearInterval(bootTimer);
      update = null;
    }
  });
})(window.FZ);

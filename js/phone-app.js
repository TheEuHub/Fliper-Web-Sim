/* Companion: a canvas client of the simulated RPC bus. No filesystem/device references. */
(function (FZ) {
  'use strict';
  var sans = '-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
    mono = 'ui-monospace,Menlo,Consolas,monospace';
  var ink = '#f3f2ed',
    muted = '#a1a09d',
    line = '#343434',
    card = '#202122',
    amber = '#ff901f',
    bg = '#141516';
  var sc,
    c,
    needs = true,
    last = -Infinity,
    next = 0,
    epoch = 0,
    seq = 0,
    startY = 0,
    scroll0 = 0,
    scroll = 0,
    maxScroll = 0,
    hits = [],
    viewToken = 0;
  var infoSeq = 0,
    info = null,
    entries = [],
    path = '/ext',
    archive = false,
    file = null,
    renameTarget = null,
    draft = '',
    notice = '',
    progress = null,
    volumeUntil = 0,
    clockMinute = -1,
    findUntil = 0;
  function dirty() {
    needs = true;
    if (FZ.scene) FZ.scene.wake();
  }
  function publish() {
    FZ.emit('phone', phone.state);
    dirty();
  }
  function state(s) {
    phone.state = s;
    scroll = maxScroll = 0;
    notice = '';
    viewToken++;
    publish();
  }
  function err(e) {
    notice = String(e.message || e);
    if (FZ.toast) FZ.toast(notice);
    dirty();
  }
  function rpc(cmd, p) {
    return FZ.link.rpc(cmd, p);
  }
  function text(s, x, y, size, color, weight, align, font) {
    c.fillStyle = color || ink;
    c.font = (weight || 500) + ' ' + size + 'px ' + (font || sans);
    c.textAlign = align || 'left';
    c.textBaseline = 'alphabetic';
    c.fillText(String(s), x, y);
    c.textAlign = 'left';
  }
  function box(x, y, w, h, r, fill, stroke) {
    c.beginPath();
    r = Math.min(r, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 1.4;
      c.stroke();
    }
  }
  function stroke(points, col, width) {
    c.beginPath();
    points.forEach(function (p, i) {
      if (i) c.lineTo(p[0], p[1]);
      else c.moveTo(p[0], p[1]);
    });
    c.strokeStyle = col;
    c.lineWidth = width || 2;
    c.stroke();
  }
  function hit(x, y, w, h, fn, label) {
    hits.push({ x: x, y: y, w: w, h: h, fn: fn, label: label });
  }
  function button(x, y, w, h, label, primary, fn) {
    box(x, y, w, h, 10, primary ? amber : card, primary ? null : line);
    text(label, x + w / 2, y + h / 2 + 6, 17, primary ? '#211407' : ink, 650, 'center');
    hit(x, y, w, h, fn, label);
  }
  function icon(kind, x, y, size, col) {
    c.save();
    c.translate(x, y);
    c.scale(size / 24, size / 24);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    var d = col || ink;
    if (kind === 'device') {
      stroke(
        [
          [2, 14],
          [5, 7],
          [19, 7],
          [22, 11],
          [22, 17],
          [4, 17],
          [2, 14]
        ],
        d,
        1.6
      );
      box(6, 9, 7, 5, 1, null, d);
      box(15, 9, 4, 4, 2, null, d);
    } else if (kind === 'archive') {
      box(3, 5, 18, 4, 1, null, d);
      stroke(
        [
          [5, 10],
          [5, 20],
          [19, 20],
          [19, 10]
        ],
        d
      );
      stroke(
        [
          [10, 13],
          [14, 13]
        ],
        d
      );
    } else if (kind === 'folder') {
      stroke(
        [
          [2, 7],
          [2, 19],
          [22, 19],
          [22, 8],
          [12, 8],
          [10, 5],
          [3, 5],
          [2, 7]
        ],
        d,
        1.6
      );
    } else if (kind === 'signal') {
      for (var i = 0; i < 4; i++) {
        c.fillStyle = d;
        c.fillRect(2 + 5 * i, 18 - 3 * i, 3, 3 + 3 * i);
      }
    } else if (kind === 'bt')
      stroke(
        [
          [6, 7],
          [17, 17],
          [12, 21],
          [12, 3],
          [17, 7],
          [6, 17]
        ],
        d,
        2
      );
    else if (kind === 'logo') {
      stroke(
        [
          [1, 13],
          [7, 13],
          [10, 5],
          [14, 20],
          [17, 10],
          [23, 10]
        ],
        d,
        2.8
      );
    }
    c.restore();
  }
  function chrome(now) {
    var date = new Date();
    text(
      FZ.util.pad2(date.getHours()) + ':' + FZ.util.pad2(date.getMinutes()),
      23,
      27,
      15,
      ink,
      650
    );
    icon('signal', 277, 12, 16, ink);
    box(301, 16, 22, 9, 2, null, ink);
    box(303, 18, 16, 5, 1, ink);
    c.fillStyle = ink;
    c.fillRect(324, 18, 2, 5);
    box(20, 53, 29, 29, 8, amber);
    icon('logo', 24, 57, 21, '#22150b');
    text('Companion', 58, 77, 25, ink, 700);
    if (FZ.link.get().connected) {
      box(224, 55, 116, 26, 13, '#232d23');
      text('Connected', 235, 73, 13, '#b9d5b2', 650);
      for (var i = 0; i < 4; i++) {
        c.fillStyle = i < phone.signal ? '#a8c9a1' : '#4a5149';
        c.fillRect(313 + i * 4, 73 - (i + 1) * 3, 2, (i + 1) * 3);
      }
    } else {
      c.fillStyle = '#686967';
      c.beginPath();
      c.arc(329, 66, 3, 0, Math.PI * 2);
      c.fill();
    }
    stroke(
      [
        [20, 100],
        [340, 100]
      ],
      line,
      1
    );
  }
  function nav() {
    var conn = FZ.link.get().connected,
      active =
        phone.state === 'storage' || phone.state === 'reader' || phone.state === 'actions'
          ? archive
            ? 1
            : 2
          : 0;
    c.fillStyle = bg;
    c.fillRect(0, 670, 360, 90);
    stroke(
      [
        [16, 670],
        [344, 670]
      ],
      line,
      1
    );
    ['Device', 'Archive', 'Files'].forEach(function (s, i) {
      var col = i === active ? amber : conn ? '#a6a7a3' : '#666868';
      icon(['device', 'archive', 'folder'][i], 50 + i * 120, 682, 22, col);
      text(s, 60 + i * 120, 723, 12, col, 600, 'center');
      hit(
        i * 120,
        672,
        120,
        59,
        function () {
          if (!conn) {
            if (i && FZ.toast) FZ.toast('Pair a device to browse its virtual SD card');
            return;
          }
          if (!i) state('connected');
          else openStorage(i === 1);
        },
        s
      );
    });
    box(135, 745, 90, 4, 2, '#b0b1af');
  }
  function radioGraphic(y, scanning, now) {
    var x = 180;
    var g = c.createRadialGradient(x, y, 0, x, y, 135);
    g.addColorStop(0, '#3f2c1d');
    g.addColorStop(0.55, '#29221d');
    g.addColorStop(1, bg);
    c.fillStyle = g;
    c.fillRect(38, y - 135, 284, 270);
    for (var i = 0; i < 3; i++) {
      var r = 45 + i * 32 + (scanning && !FZ.flags.reducedMotion ? (now / 60) % 16 : 0);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.strokeStyle = i === 0 ? '#654629' : i === 1 ? '#49382b' : '#392e25';
      c.lineWidth = 1.4;
      c.stroke();
    }
    [
      [-90, -62],
      [56, -51],
      [92, 60]
    ].forEach(function (d) {
      box(x + d[0] - 2, y + d[1] - 2, 4, 4, 2, '#ad743e');
    });
    c.save();
    c.translate(x, y);
    c.rotate(-0.17);
    c.lineJoin = 'round';
    stroke(
      [
        [-55, 4],
        [-43, -17],
        [-36, -21],
        [39, -21],
        [53, -7],
        [53, 14],
        [48, 19],
        [-46, 19],
        [-55, 10],
        [-55, 4]
      ],
      amber,
      2.5
    );
    box(-32, -12, 42, 23, 3, '#4b321c', amber);
    box(17, -12, 18, 18, 9, null, amber);
    box(23, -6, 5, 5, 2, amber);
    box(39, 5, 5, 5, 2, null, amber);
    c.restore();
  }
  function addHeading(kicker, title) {
    text(kicker.toUpperCase(), 22, 132, 12, muted, 600, 'left', mono);
    text(title, 20, 172, 30, ink, 700);
  }
  function idle(now) {
    text('DEVICE CONNECTION', 22, 133, 12, muted, 600, 'left', mono);
    radioGraphic(287, false, now);
    text('Pair your Flipper', 180, 459, 34, ink, 700, 'center');
    text('Connect to a device on your desk.', 180, 488, 16, muted, 450, 'center');
    button(22, 562, 316, 54, 'Scan for devices', true, scan);
  }
  function discovery(now) {
    addHeading('Device discovery', phone.state === 'scanning' ? 'Scanning…' : 'Nearby devices');
    if (phone.state === 'scanning') {
      radioGraphic(337, true, now);
      text('Looking on the local bus…', 180, 510, 17, muted, 500, 'center');
    } else {
      phone.devices.forEach(function (dev, i) {
        var y = 214 + i * 78;
        box(20, y, 320, 68, 10, card, line);
        icon('device', 32, y + 17, 31, amber);
        text(dev.name, 76, y + 28, 20, ink, 650);
        text('VIRTUAL FLIPPER ZERO', 76, y + 50, 12, muted, 500, 'left', mono);
        text('›', 311, y + 39, 26, amber);
        hit(
          20,
          y,
          320,
          68,
          function () {
            pairWith(dev);
          },
          dev.name
        );
      });
    }
    button(20, 588, 320, 48, 'Cancel', false, cancel);
  }
  function pairing() {
    addHeading('Pairing request', 'Verify the PIN');
    text('Check that both screens match.', 22, 211, 16, muted);
    box(20, 261, 320, 106, 12, '#2b241d', '#55402e');
    text(phone.pin, 180, 331, 46, amber, 650, 'center', mono);
    button(20, 451, 320, 54, 'Confirm pairing', true, confirmPair);
    button(20, 519, 320, 47, 'Cancel', false, cancel);
  }
  function dashboard() {
    addHeading('Device dashboard', info ? info.name : phone.deviceName);
    var rows = [
      ['Battery', info ? info.battery + '%' : '…'],
      ['Firmware', info ? info.firmware : '…'],
      ['Virtual SD', info ? Math.ceil(info.storage.bytes / 1024) + ' KB / 128 MB' : '…']
    ];
    box(20, 196, 320, 172, 12, card, line);
    rows.forEach(function (r, i) {
      var y = 230 + i * 46;
      text(r[0], 36, y, 15, muted);
      text(r[1], 324, y, 16, ink, 600, 'right');
    });
    box(36, 338, 288, 5, 2, '#3a3b38');
    if (info) box(36, 338, Math.max(2, (288 * info.storage.usedMB) / 128), 5, 1, amber);
    button(
      20,
      391,
      320,
      48,
      Date.now() < findUntil ? 'Locating device…' : 'Find my Flipper',
      true,
      find
    );
    button(20, 451, 320, 44, 'Firmware update', false, openFirmware);
    button(20, 506, 320, 44, 'Rename device', false, function () {
      openRename(null, info ? info.name : phone.deviceName);
    });
    button(20, 589, 320, 44, 'Disconnect', false, disconnect);
  }
  function listPage() {
    addHeading(
      archive ? 'Device archive' : 'File browser',
      path === '/ext' ? (archive ? 'Categories' : 'Virtual SD') : path.split('/').pop()
    );
    text(path, 22, 200, 14, muted, 500, 'left', mono);
    var list = entries || [];
    if (!entries) text('Loading…', 22, 271, 17, muted);
    else if (!list.length) text('This folder is empty.', 22, 271, 17, muted);
    maxScroll = Math.max(0, list.length * 55 - 349);
    scroll = FZ.util.clamp(scroll, 0, maxScroll);
    c.save();
    c.beginPath();
    c.rect(16, 220, 328, 350);
    c.clip();
    list.forEach(function (e, i) {
      var y = 222 + i * 55 - scroll;
      if (y > 568 || y < 168) return;
      icon(e.dir ? 'folder' : 'archive', 23, y + 13, 21, e.dir ? amber : muted);
      text(e.name.slice(0, 26), 55, y + 30, 16, ink, 550);
      text(e.dir ? '›' : '···', 321, y + 31, 20, muted, 650, 'center');
      stroke(
        [
          [22, y + 51],
          [338, y + 51]
        ],
        line,
        1
      );
      var top = Math.max(220, y),
        h = Math.max(0, Math.min(570, y + 52) - top);
      hit(
        18,
        top,
        280,
        h,
        function () {
          if (e.dir) loadList(e.path);
          else read(e.path);
        },
        e.name
      );
      hit(
        301,
        top,
        38,
        h,
        function () {
          file = e;
          state('actions');
        },
        'Actions: ' + e.name
      );
    });
    c.restore();
    if (maxScroll) {
      box(343, 220 + (scroll / maxScroll) * 220, 2, 130, 1, '#555652');
    }
    button(20, 593, 320, 44, path === '/ext' ? 'Dashboard' : 'Up one folder', false, function () {
      up();
    });
  }
  function filePage() {
    var f = file;
    if (!f) return;
    addHeading('File preview', f.path.split('/').pop().slice(0, 20));
    if (f.img) {
      if (f.img.complete) c.drawImage(f.img, 20, 218, 320, 160);
    } else {
      var lines = f.lines || [];
      maxScroll = Math.max(0, lines.length * 23 - 318);
      scroll = FZ.util.clamp(scroll, 0, maxScroll);
      c.save();
      c.beginPath();
      c.rect(20, 211, 320, 320);
      c.clip();
      lines.forEach(function (s, i) {
        var y = 231 + i * 23 - scroll;
        if (y > 197 && y < 552) text(s, 21, y, 15, ink, 450, 'left', mono);
      });
      c.restore();
    }
    button(20, 546, 320, 43, 'File actions', false, function () {
      state('actions');
    });
    button(20, 602, 320, 42, 'Back to folder', false, function () {
      loadList(path);
    });
  }
  function actions() {
    addHeading('File actions', (file.name || file.path.split('/').pop()).slice(0, 20));
    button(20, 244, 320, 48, 'Rename', true, function () {
      openRename(file.path, file.path.split('/').pop());
    });
    button(20, 309, 320, 48, 'Delete', false, function () {
      state('delete');
    });
    button(20, 584, 320, 44, 'Back', false, function () {
      loadList(path);
    });
  }
  function removeFile() {
    var target = file.path;
    rpc('storage.delete', { path: target })
      .then(function () {
        if (!FZ.link.get().connected) return;
        FZ.note('Removed ' + target.split('/').pop());
        loadList(path);
      })
      .catch(err);
  }
  function openRename(target, name) {
    renameTarget = target;
    draft = name;
    state('rename');
  }
  function commitRename() {
    var target = renameTarget,
      name = draft.trim();
    if (!name) return err(Error('Enter a name'));
    rpc(target ? 'storage.rename' : 'system.rename', { path: target, name: name })
      .then(function () {
        if (!FZ.link.get().connected) return;
        if (target) loadList(path);
        else {
          state('connected');
          requestInfo();
        }
      })
      .catch(err);
  }
  function renameView() {
    addHeading('Text editor', renameTarget ? 'Rename file' : 'Device name');
    box(20, 209, 320, 61, 8, card, line);
    text(draft.slice(-27) + '_', 32, 247, 19, amber, 500, 'left', mono);
    ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '_- .'].forEach(function (row, i) {
      var y = 296 + i * 44,
        w = 31,
        x = (360 - row.length * w) / 2;
      row.split('').forEach(function (ch, j) {
        box(x + j * w, y, w - 3, 36, 5, card);
        text(ch === ' ' ? '␣' : ch, x + j * w + 14, y + 24, 16, ink, 500, 'center');
        hit(
          x + j * w,
          y,
          w,
          39,
          function () {
            phone.type(ch);
          },
          ch
        );
      });
    });
    button(20, 526, 104, 43, 'Backspace', false, function () {
      phone.type('Backspace');
    });
    button(134, 526, 206, 43, 'Save name', true, commitRename);
    button(20, 595, 320, 41, 'Cancel', false, function () {
      if (renameTarget) loadList(path);
      else state('connected');
    });
  }
  function firmwareView() {
    addHeading('Firmware wizard', 'System update');
    var cur = info && info.firmware,
      done = cur === '1.1.0-sim';
    text('Installed: ' + (cur || '…'), 22, 215, 16, muted);
    text('Local release: 1.1.0-sim', 22, 244, 16, muted);
    if (progress) {
      box(20, 286, 320, 118, 12, card, line);
      text(progress.stage, 36, 326, 21, ink, 650);
      text(progress.percent + '%', 323, 326, 17, amber, 600, 'right');
      box(36, 357, 286, 5, 2, '#383936');
      box(36, 357, Math.max(2, (286 * progress.percent) / 100), 5, 2, amber);
    } else {
      text(
        done ? 'Your device is up to date.' : 'A simulated release is available.',
        22,
        318,
        17,
        ink
      );
      if (!done) button(20, 389, 320, 50, 'Install local update', true, startFirmware);
    }
    button(20, 588, 320, 46, 'Dashboard', false, function () {
      state('connected');
      requestInfo();
    });
  }
  function draw(now) {
    if (!sc) return;
    c = sc.begin();
    hits.length = 0;
    c.fillStyle = phone.off ? '#050505' : bg;
    c.fillRect(0, 0, 360, 760);
    if (!phone.off) {
      chrome(now);
      switch (phone.state) {
        case 'idle':
          idle(now);
          break;
        case 'scanning':
        case 'devices':
          discovery(now);
          break;
        case 'pin':
          pairing();
          break;
        case 'connected':
          dashboard();
          break;
        case 'storage':
          listPage();
          break;
        case 'reader':
          filePage();
          break;
        case 'actions':
          actions();
          break;
        case 'delete':
          addHeading('Confirm deletion', 'Delete this item?');
          text((file.name || file.path.split('/').pop()).slice(0, 25), 22, 225, 18, ink);
          text('This cannot be undone.', 22, 264, 15, muted);
          button(20, 341, 320, 50, 'Delete from SD', true, removeFile);
          button(20, 404, 320, 46, 'Keep item', false, function () {
            state('actions');
          });
          break;
        case 'rename':
          renameView();
          break;
        case 'firmware':
          firmwareView();
          break;
      }
      nav();
      if (notice) {
        box(15, 639, 330, 27, 5, '#483624');
        text(notice.slice(0, 38), 26, 657, 13, '#ffcea3');
      }
      if (volumeUntil > now) {
        box(80, 101, 200, 36, 8, card, line);
        text(
          'Volume ' + Math.round(FZ.audio.getVolume() * 100) + '%',
          180,
          124,
          16,
          ink,
          600,
          'center'
        );
      }
    }
    sc.markDirty();
    needs = false;
    last = now;
  }
  function requestInfo() {
    var e = epoch,
      serial = ++infoSeq;
    return rpc('system.info')
      .then(function (v) {
        if (e !== epoch || serial !== infoSeq || !FZ.link.get().connected) return;
        info = v;
        phone.deviceName = v.name;
        publish();
      })
      .catch(err);
  }
  function scan() {
    phone.off = false;
    var token = ++seq;
    state('scanning');
    FZ.note('Scanning the local bus');
    return rpc('link.scan')
      .then(function (v) {
        if (seq !== token || phone.state !== 'scanning') return;
        phone.devices = v.devices;
        state('devices');
        FZ.note('Virtual Flipper discovered');
      })
      .catch(function (e) {
        if (seq === token) {
          state('idle');
          err(e);
        }
      });
  }
  function pairWith(dev) {
    if (!dev) return;
    var token = ++seq;
    return rpc('link.pair.request', { id: dev.id })
      .then(function (v) {
        if (seq !== token) return;
        phone.pin = v.pin;
        phone.deviceName = v.name;
        state('pin');
        FZ.note('Pairing code issued');
      })
      .catch(err);
  }
  function confirmPair() {
    if (phone.state !== 'pin') return;
    return rpc('link.pair.accept', { pin: phone.pin }).catch(err);
  }
  function cancel() {
    seq++;
    phone.pin = '';
    state('idle');
    rpc('link.pair.abort').catch(err);
  }
  function disconnect() {
    return rpc('link.disconnect').catch(function () {
      FZ.link.establish({ connected: false });
    });
  }
  function loadList(p, silent) {
    if (!silent) {
      entries = null;
      state('storage');
    }
    path = p;
    var t = ++viewToken;
    return rpc('storage.list', { path: p })
      .then(function (v) {
        if (t !== viewToken || phone.state !== 'storage') return;
        entries = v.entries.filter(function (e) {
          return !(archive && p === '/ext' && !e.dir);
        });
        dirty();
      })
      .catch(function (e) {
        if (t !== viewToken) return;
        if (silent && p !== '/ext') return loadList('/ext');
        entries = [];
        err(e);
      });
  }
  function openStorage(a) {
    archive = !!a;
    return loadList('/ext');
  }
  function up() {
    if (path === '/ext') state('connected');
    else loadList(path.slice(0, path.lastIndexOf('/')) || '/ext');
  }
  function read(p) {
    var t = ++viewToken;
    return rpc('storage.read', { path: p })
      .then(function (v) {
        if (t !== viewToken) return;
        file = { path: p, name: p.split('/').pop(), lines: [] };
        if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.data)) {
          file.img = new Image();
          file.img.onload = dirty;
          file.img.src = v.data;
        } else
          file.lines = v.data.split('\n').flatMap(function (s) {
            return s.match(/.{1,32}/g) || [''];
          });
        state('reader');
      })
      .catch(err);
  }
  function find() {
    return rpc('app.find')
      .then(function () {
        findUntil = Date.now() + 2600;
        dirty();
        FZ.note('Locating Flipper Zero');
      })
      .catch(err);
  }
  function openFirmware() {
    state('firmware');
    requestInfo();
    rpc('firmware.update.progress')
      .then(function (v) {
        progress = v;
        dirty();
      })
      .catch(err);
  }
  function startFirmware() {
    return rpc('firmware.update.start')
      .then(function (v) {
        progress = v;
        dirty();
      })
      .catch(err);
  }
  var phone = (FZ.phone = {
    state: 'idle',
    off: false,
    pin: '',
    signal: 0,
    devices: [],
    deviceName: 'Flipper Zero',
    moved: false,
    init: function (screen) {
      sc = this.screen = screen;
      FZ.link.attach('phone', {
        'link.status': function (v) {
          epoch++;
          seq++;
          phone.pin = '';
          info = null;
          progress = null;
          if (v.connected) {
            phone.deviceName = v.name;
            phone.signal = v.signal;
            state('connected');
            requestInfo();
            FZ.note('Device link established');
          } else {
            state('idle');
            FZ.note('Device link closed');
          }
        },
        'link.signal': function (v) {
          phone.signal = v.signal;
          if (v.connected) dirty();
        },
        'link.pair.cancel': function () {
          state('idle');
        },
        'system.changed': function () {
          if (FZ.link.get().connected) requestInfo();
        },
        'storage.changed': function (v) {
          requestInfo();
          if (phone.state === 'storage') loadList(path, true);
          else if (
            file &&
            file.path === v.path &&
            ['reader', 'actions', 'delete', 'rename'].indexOf(phone.state) >= 0
          )
            loadList(path);
        },
        'firmware.update.progress': function (v) {
          progress = v.percent >= 100 ? null : v;
          if (!progress) requestInfo();
          dirty();
        }
      });
      publish();
    },
    tick: function (now) {
      var minute = Math.floor(Date.now() / 60000);
      if (minute !== clockMinute) {
        clockMinute = minute;
        needs = true;
      }
      if (volumeUntil && now > volumeUntil) {
        volumeUntil = 0;
        needs = true;
      }
      if (findUntil && Date.now() > findUntil) {
        findUntil = 0;
        needs = true;
      }
      var anim = !this.off && this.state === 'scanning' && !FZ.flags.reducedMotion;
      if ((needs || (anim && now > next)) && now - last >= 33.34) {
        draw(now);
        next = now + 100;
      }
    },
    nextWake: function (now) {
      var delay = 60000 - (Date.now() % 60000);
      if (needs) return Math.max(1, 34 - (now - last));
      if (!this.off && this.state === 'scanning' && !FZ.flags.reducedMotion)
        delay = Math.min(delay, next - now);
      if (volumeUntil) delay = Math.min(delay, volumeUntil - now + 1);
      if (findUntil) delay = Math.min(delay, findUntil - Date.now() + 1);
      return Math.max(1, delay);
    },
    pointer: function (type, x, y) {
      if (type === 'down') {
        this.moved = false;
        startY = y;
        scroll0 = scroll;
      } else if (type === 'move') {
        this.moved = true;
        scroll = FZ.util.clamp(scroll0 + startY - y, 0, maxScroll);
        dirty();
      } else if (!this.moved) this.tap(x, y);
    },
    tap: function (x, y) {
      if (this.off) {
        this.onSide('power');
        return;
      }
      if (needs) draw(FZ.util.now());
      for (var i = hits.length - 1; i >= 0; i--) {
        var h = hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
          FZ.audio.click();
          h.fn();
          break;
        }
      }
    },
    onSide: function (k) {
      if (k === 'power') {
        this.off = !this.off;
        FZ.note(this.off ? 'Phone display asleep' : 'Phone display awake');
      } else {
        FZ.audio.setVolume(FZ.audio.getVolume() + (k === 'vol_up' ? 0.1 : -0.1));
        volumeUntil = FZ.util.now() + 1000;
      }
      publish();
    },
    type: function (k) {
      if (this.state !== 'rename' || this.off) return false;
      if (k === 'Backspace') draft = draft.slice(0, -1);
      else if (/^[a-zA-Z0-9 _.-]$/.test(k)) draft = (draft + k).slice(0, renameTarget ? 64 : 18);
      else if (k === 'Enter') commitRename();
      else return false;
      dirty();
      return true;
    },
    dashboard: function () {
      state('connected');
      requestInfo();
    },
    scan: scan,
    pairWith: pairWith,
    confirmPair: confirmPair,
    cancelPair: cancel,
    disconnect: disconnect,
    openStorage: openStorage,
    loadList: loadList,
    read: read,
    findFlipper: find,
    openFirmware: openFirmware,
    get info() {
      return info;
    },
    get entries() {
      return entries;
    },
    get path() {
      return path;
    },
    get hits() {
      return hits;
    },
    get scroll() {
      return scroll;
    },
    get progress() {
      return progress;
    }
  });
})(window.FZ);

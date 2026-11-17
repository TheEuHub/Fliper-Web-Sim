/* Fliper Web Sim — flipper-fs: virtual SD card for the simulated Flipper.
   Single source of truth for ALL file data on both devices (the phone
   reaches it only through RPC in Stage 4 — never directly).

   - Paths are POSIX-style absolute strings; the card root is "/", all
     mutable content lives under "/ext" (Flipper convention).
   - Nodes are plain objects {dir, children?, data?, mtime?} so the whole
     tree serialises with JSON into localStorage key fz.v1.fs (via
     FZ.storage — try/catch with in-memory fallback).
   - Content is plain text or data-URL strings (LCD screenshots). No
     binaries, no network, no real SD card.
   - Every mutation produces an op record {op, path, to?, data?, mtime}
     and notifies subscribers with (op, source) where source is 'local'
     or 'remote'. Stage 4 ships these ops over the link bus so rename /
     capture / delete propagate to the other UI within ~1 s; apply(op,
     'remote') replays them without echo. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var STORAGE_KEY = 'fs';       /* → fz.v1.fs */
  var MUT_ROOT = '/ext';        /* mutations must stay under this path */
  var root = null;
  var loaded = false;
  var subs = [];

  /* ---------- tree helpers ---------- */
  function makeNode(dir) {
    var n = { dir: !!dir, mtime: Date.now() };
    if (dir) n.children = {};
    else n.data = '';
    return n;
  }

  function normalize(p) {
    p = String(p === null || p === undefined ? '' : p);
    if (!p) return '/';
    if (p.charAt(0) !== '/') p = MUT_ROOT + '/' + p;
    var parts = p.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (!seg || seg === '.') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return '/' + out.join('/');
  }

  function underExt(np) {
    return np === MUT_ROOT || np.indexOf(MUT_ROOT + '/') === 0;
  }

  function resolve(p) {
    if (!root) return null;
    var parts = normalize(p).split('/');
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (!cur.dir || !cur.children) return null;
      cur = cur.children[parts[i]];
      if (!cur) return null;
    }
    return cur;
  }

  function resolveParent(p) {
    var np = normalize(p);
    var idx = np.lastIndexOf('/');
    var parentPath = idx <= 0 ? '/' : np.slice(0, idx);
    var name = np.slice(idx + 1);
    var parent = resolve(parentPath);
    if (!parent || !parent.dir || !name || name === '.' || name === '..') return null;
    return { parent: parent, name: name, path: np, parentPath: parentPath };
  }

  function joinPath(parentPath, name) {
    return parentPath === '/' ? '/' + name : parentPath + '/' + name;
  }

  /* ---------- persistence / events ---------- */
  function persist() {
    try { FZ.storage.set(STORAGE_KEY, { v: 1, root: root }); } catch (e) {}
  }

  function emit(op, source) {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](op, source || 'local'); } catch (e) {}
    }
  }

  function commit(op, source) {
    persist();
    emit(op, source);
  }

  function load() {
    var raw = null;
    try { raw = FZ.storage.get(STORAGE_KEY, null); } catch (e) { raw = null; }
    if (raw && raw.v === 1 && raw.root && raw.root.dir && raw.root.children) {
      root = raw.root;
      return;
    }
    root = seed();
    persist();
  }

  /* ---------- seed (all content original / invented) ---------- */
  function seed() {
    var r = makeNode(true);
    var ext = makeNode(true);
    r.children.ext = ext;

    function dir(parent, name) {
      var n = makeNode(true);
      parent.children[name] = n;
      return n;
    }
    function file(parent, name, lines) {
      var n = makeNode(false);
      n.data = lines.join('\n');
      parent.children[name] = n;
      return n;
    }

    file(ext, 'README.txt', [
      'VIRTUAL SD CARD',
      'FLIPPER WEB SIM',
      '',
      'Files live in your',
      'browser localStorage',
      'under key fz.v1.fs.',
      '',
      'No real hardware.',
      'Radio operations are',
      'simulated; no RF.',
      '',
      'MENU (press OK):',
      '- FILE MANAGER: view,',
      '  rename, delete files',
      '- SCREENSHOT: saves',
      '  the LCD image to',
      '  /ext/screenshots',
      '- STORAGE: space used'
    ]);

    var apps = dir(ext, 'apps');
    var games = dir(apps, 'games');
    file(games, 'tictactoe.fap', [
      'PLACEHOLDER APP FILE',
      '(simulated; not a',
      'real application)',
      '',
      'No executable code',
      'lives here. This file',
      'exists so the file',
      'manager has something',
      'to open and rename.'
    ]);

    var sub = dir(ext, 'subghz');
    file(sub, 'demo_433.sub', [
      'Simulated sub-GHz',
      'demo (invented data,',
      'not a real capture)',
      '',
      'freq: 433920000 Hz',
      'mod: OOK',
      'preset: demo',
      'note: fan sim only'
    ]);

    var nfc = dir(ext, 'nfc');
    file(nfc, 'demo.nfc', [
      'Simulated NFC record',
      '(invented data)',
      '',
      'uid: 04a1b2c3d4e5',
      'type: iso14443-a',
      'data: 01020304',
      'note: fan sim only'
    ]);

    dir(ext, 'ibtn'); /* empty on purpose — shows the EMPTY folder path */

    var dol = dir(ext, 'dolphin');
    file(dol, 'level.txt', [
      'Dolphin level: 42',
      'XP: 1200 / 2000',
      '(stats invented)'
    ]);

    dir(ext, 'screenshots'); /* captures land here */

    var badusb = dir(ext, 'badusb');
    file(badusb, 'demo_hello.txt', [
      'REM Flipper Web Sim demo',
      'REM This never touches your OS',
      'STRING Hello from Flipper Sim',
      'ENTER',
      'DELAY 500',
      'STRING Simulated BadUSB only',
      'ENTER',
      'REM End of demo'
    ]);
    file(badusb, 'demo_note.txt', [
      'REM Simulated keyboard demo',
      'STRING This is a simulated',
      'ENTER',
      'STRING BadUSB playback',
      'ENTER',
      'DELAY 300',
      'REM No keys leave this page'
    ]);

    return r;
  }

  /* ---------- walks ---------- */
  function walk(node, path, fn) {
    fn(path, node);
    if (!node.dir || !node.children) return;
    for (var k in node.children) {
      if (Object.prototype.hasOwnProperty.call(node.children, k)) {
        walk(node.children[k], joinPath(path, k), fn);
      }
    }
  }

  /* ---------- raw mutations (no persist/emit) ---------- */
  function mkdirp(np) {
    if (!root) return false;
    if (np === '/') return true;
    var parts = np.split('/');
    var cur = root;
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (!cur.dir) return false;
      var next = cur.children[parts[i]];
      if (!next) {
        next = makeNode(true);
        cur.children[parts[i]] = next;
      } else if (!next.dir) {
        return false;
      }
      cur = next;
    }
    return true;
  }

  function mutWrite(np, data) {
    if (!underExt(np) || np === MUT_ROOT) return null;
    var idx = np.lastIndexOf('/');
    var parentPath = np.slice(0, idx) || '/';
    if (!mkdirp(parentPath)) return null;
    var parent = resolve(parentPath);
    var name = np.slice(idx + 1);
    if (!parent || !name) return null;
    var existing = parent.children[name];
    if (existing && existing.dir) return null;
    var n = existing || makeNode(false);
    n.dir = false;
    n.children = undefined;
    n.data = String(data);
    n.mtime = Date.now();
    parent.children[name] = n;
    return np;
  }

  function mutMkdir(np) {
    if (!underExt(np) || np === MUT_ROOT) return null;
    var existing = resolve(np);
    if (existing) return existing.dir ? np : null;
    if (!mkdirp(np)) return null;
    return np;
  }

  function mutRemove(np) {
    if (np === '/' || np === MUT_ROOT || !underExt(np)) return null;
    var rp = resolveParent(np);
    if (!rp || !Object.prototype.hasOwnProperty.call(rp.parent.children, rp.name)) return null;
    delete rp.parent.children[rp.name];
    return np;
  }

  function mutMove(from, to) {
    if (!underExt(from) || !underExt(to) || from === MUT_ROOT || to === MUT_ROOT) return null;
    if (from === to) return to;
    var rf = resolveParent(from);
    var rt = resolveParent(to);
    if (!rf || !rt) return null;
    if (!Object.prototype.hasOwnProperty.call(rf.parent.children, rf.name)) return null;
    if (Object.prototype.hasOwnProperty.call(rt.parent.children, rt.name)) return null;
    /* forbid moving a directory into its own subtree */
    if (rf.parent.children[rf.name].dir) {
      var pre = to === rf.path ? '' : rf.path + '/';
      if (to === rf.path || to.indexOf(pre) === 0) return null;
    }
    rt.parent.children[rt.name] = rf.parent.children[rf.name];
    delete rf.parent.children[rf.name];
    rt.parent.children[rt.name].mtime = Date.now();
    return to;
  }

  /* ---------- public API ---------- */
  FZ.fs = {
    init: function () {
      if (loaded) return this;
      load();
      loaded = true;
      return this;
    },

    reset: function () {
      root = seed();
      loaded = true;
      persist();
      emit({ op: 'reset', path: '/' }, 'local');
      return this;
    },

    normalize: normalize,

    resolve: function (p) { return resolve(p); },

    exists: function (p) { return !!resolve(p); },

    stat: function (p) {
      var np = normalize(p);
      var n = resolve(np);
      if (!n) return null;
      var name = np === '/' ? '/' : np.slice(np.lastIndexOf('/') + 1);
      return {
        name: name,
        path: np,
        dir: !!n.dir,
        size: n.dir ? 0 : String(n.data || '').length,
        mtime: n.mtime || 0
      };
    },

    list: function (p) {
      var n = resolve(p);
      if (!n || !n.dir) return [];
      var np = normalize(p);
      var base = np === '/' ? '' : np;
      var out = [];
      for (var k in n.children) {
        if (!Object.prototype.hasOwnProperty.call(n.children, k)) continue;
        var c = n.children[k];
        out.push({
          name: k,
          path: base + '/' + k,
          dir: !!c.dir,
          size: c.dir ? 0 : String(c.data || '').length,
          mtime: c.mtime || 0
        });
      }
      out.sort(function (a, b) {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return out;
    },

    read: function (p) {
      var n = resolve(p);
      if (!n || n.dir) return null;
      return String(n.data || '');
    },

    write: function (p, data) {
      FZ.fs.init();
      var np = normalize(p);
      var path = mutWrite(np, data);
      if (!path) return null;
      var st = FZ.fs.stat(path);
      commit({ op: 'write', path: path, data: String(data), mtime: st ? st.mtime : Date.now() }, 'local');
      return path;
    },

    mkdir: function (p) {
      FZ.fs.init();
      var np = normalize(p);
      var existed = !!resolve(np);
      var path = mutMkdir(np);
      if (!path) return null;
      if (!existed) commit({ op: 'mkdir', path: path, mtime: Date.now() }, 'local');
      return path;
    },

    remove: function (p) {
      FZ.fs.init();
      var np = normalize(p);
      var path = mutRemove(np);
      if (!path) return null;
      commit({ op: 'remove', path: path }, 'local');
      return path;
    },

    rename: function (p, newName) {
      FZ.fs.init();
      var rp = resolveParent(p);
      if (!rp || !Object.prototype.hasOwnProperty.call(rp.parent.children, rp.name)) return null;
      newName = String(newName === null || newName === undefined ? '' : newName);
      if (!newName || newName === '.' || newName === '..' ||
          newName.indexOf('/') >= 0 || newName.length > 64) return null;
      if (newName === rp.name) return rp.path;
      var to = joinPath(rp.parentPath, newName);
      var path = mutMove(rp.path, to);
      if (!path) return null;
      var st = FZ.fs.stat(path);
      commit({ op: 'move', path: rp.path, to: path, mtime: st ? st.mtime : Date.now() }, 'local');
      return path;
    },

    usedBytes: function () {
      FZ.fs.init();
      var bytes = 0;
      walk(root, '/', function (path, node) {
        if (node.dir) bytes += 32;               /* directory entry */
        else bytes += String(node.data || '').length;
      });
      return bytes;
    },

    usedMB: function () {
      return FZ.fs.usedBytes() / 1048576;
    },

    stats: function () {
      FZ.fs.init();
      var files = 0, dirs = 0;
      walk(root, '/', function (path, node) {
        if (node.dir) dirs++; else files++;
      });
      return { files: files, dirs: dirs };
    },

    /* Replay an op produced elsewhere (Stage 4: over the link bus).
       source defaults to 'remote' so listeners can avoid echoing. */
    apply: function (op, source) {
      if (!op || !op.op || op.op === 'reset') return false;
      FZ.fs.init();
      var path = null;
      if (op.op === 'write') path = mutWrite(normalize(op.path), op.data);
      else if (op.op === 'mkdir') path = mutMkdir(normalize(op.path));
      else if (op.op === 'remove') path = mutRemove(normalize(op.path));
      else if (op.op === 'move') path = mutMove(normalize(op.path), normalize(op.to));
      if (!path) return false;
      commit(op, source || 'remote');
      return true;
    },

    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      subs.push(fn);
      return function () {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    }
  };

  FZ.fs.init(); /* auto-init: storage (core.js) is already loaded */
})();

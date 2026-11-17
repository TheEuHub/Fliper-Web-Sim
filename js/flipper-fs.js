/* Fliper Web Sim — flipper-fs: virtual SD card for the simulated Flipper.
   Single source of truth for ALL file data on both devices (the phone
   reaches it only through RPC in the companion — never directly).

   - Paths are POSIX-style absolute strings; the card root is "/", all
     mutable content lives under "/ext" (Flipper convention).
   - Nodes are plain objects {dir, children?, data?, mtime?} so the whole
     tree serialises with JSON into localStorage key fz.v1.fs (via
     FZ.storage — try/catch with in-memory fallback).
   - Content is plain text or data-URL strings (LCD screenshots). No
     binaries, no network, no real SD card.
   - Every mutation produces an op record {op, path, to?, data?, mtime}
     and notifies subscribers with (op, source) where source is 'local'
     or 'remote'. The OS ships these ops over the link bus so rename /
     capture / delete propagate to the other UI within ~1 s. There is only one SD tree. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var STORAGE_KEY = 'fs'; /* → fz.v1.fs */
  var MUT_ROOT = '/ext'; /* mutations must stay under this path */
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
      if (seg === '__proto__' || seg === 'constructor' || seg === 'prototype') return '/invalid';
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        out.pop();
        continue;
      }
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
      if (!Object.prototype.hasOwnProperty.call(cur.children, parts[i])) return null;
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
    try {
      FZ.storage.set(STORAGE_KEY, { v: 1, root: root });
    } catch (e) {}
  }

  function emit(op, source) {
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](op, source || 'local');
      } catch (e) {}
    }
  }

  function commit(op, source) {
    persist();
    emit(op, source);
  }

  function load() {
    var raw = null;
    try {
      raw = FZ.storage.get(STORAGE_KEY, null);
    } catch (e) {
      raw = null;
    }
    if (raw && raw.v === 1 && raw.root && raw.root.dir && raw.root.children) {
      try {
        FZ.fs.validate(raw.root);
        root = raw.root;
        return;
      } catch (e) {}
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

    [
      'subghz',
      'lfrfid',
      'nfc',
      'infrared',
      'gpio',
      'ibutton',
      'badusb',
      'u2f',
      'screenshots'
    ].forEach(function (k) {
      dir(ext, k);
    });
    file(ext, 'welcome.txt', [
      'FLIPPER LAB / FIELD NOTES',
      'This is a virtual card.',
      'Press OK for tools.',
      'Down from home: Archive.',
      'Radio operations are simulated; no real RF.'
    ]);
    file(ext.children.badusb, 'hello.txt', [
      'A note from the lab',
      'Hello, little dolphin.',
      'This is an LCD animation.',
      'No keys leave this screen.'
    ]);
    file(ext.children.badusb, 'journal.txt', [
      'FIELD JOURNAL',
      'Desk check: complete',
      'Link check: standby',
      'End of entry.'
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
      var next = Object.prototype.hasOwnProperty.call(cur.children, parts[i])
        ? cur.children[parts[i]]
        : null;
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
    var existing = Object.prototype.hasOwnProperty.call(parent.children, name)
      ? parent.children[name]
      : null;
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

    snapshot: function () {
      return JSON.parse(JSON.stringify(root));
    },
    validate: function (tree) {
      var count = 0,
        bytes = 0;
      function visit(n, depth) {
        if (
          !n ||
          typeof n !== 'object' ||
          typeof n.dir !== 'boolean' ||
          ++count > 4096 ||
          depth > 24
        )
          throw Error('Invalid SD tree');
        if (n.dir) {
          if (!n.children || typeof n.children !== 'object' || Array.isArray(n.children))
            throw Error('Invalid folder');
          Object.keys(n.children).forEach(function (k) {
            if (
              !k ||
              k.length > 64 ||
              /[\/\x00-\x1f]/.test(k) ||
              ['.', '..', '__proto__', 'constructor', 'prototype'].indexOf(k) >= 0
            )
              throw Error('Invalid filename');
            visit(n.children[k], depth + 1);
          });
        } else if (typeof n.data !== 'string' || (bytes += n.data.length) > 3000000)
          throw Error('Invalid or oversized file data');
      }
      visit(tree, 0);
      if (
        !tree.dir ||
        Object.keys(tree.children).length !== 1 ||
        !tree.children.ext ||
        !tree.children.ext.dir
      )
        throw Error('Expected /ext root');
      return true;
    },
    restore: function (tree) {
      this.validate(tree);
      root = JSON.parse(JSON.stringify(tree));
      loaded = true;
      persist();
      emit({ op: 'restore', path: '/ext' }, 'local');
    },
    reset: function () {
      root = seed();
      loaded = true;
      persist();
      emit({ op: 'reset', path: '/' }, 'local');
      return this;
    },

    normalize: normalize,

    resolve: function (p) {
      return resolve(p);
    },

    exists: function (p) {
      return !!resolve(p);
    },

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
      commit(
        { op: 'write', path: path, data: String(data), mtime: st ? st.mtime : Date.now() },
        'local'
      );
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
      if (
        !newName ||
        newName === '.' ||
        newName === '..' ||
        ['constructor', '__proto__', 'prototype'].indexOf(newName) >= 0 ||
        newName.indexOf('/') >= 0 ||
        newName.length > 64
      )
        return null;
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
        if (node.dir) bytes += 32; /* directory entry */
        else bytes += String(node.data || '').length;
      });
      return bytes;
    },

    usedMB: function () {
      return FZ.fs.usedBytes() / 1048576;
    },

    stats: function () {
      FZ.fs.init();
      var files = 0,
        dirs = 0;
      walk(root, '/', function (path, node) {
        if (node.dir) dirs++;
        else files++;
      });
      return { files: files, dirs: dirs };
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

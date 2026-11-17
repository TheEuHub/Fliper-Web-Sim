/* Fliper Web Sim — models: registry of 3D models per device.
   Built-ins:
     flipper.placeholder — clearly-labelled plain block (S1 stand-in)
     phone.procedural    — generic black rounded rectangle, no brand
   Stage 2 (this file) adds the OFFICIAL Flipper body pipeline:
     models/flipper-model.js (generated, GPL-3.0) embeds the official
     binary STL as base64; buildFlipperOfficial() decodes it, welds and
     smooth-shades it, applies the desk transform and attaches the
     calibrated screen/button hit proxies. No loaders, no XHR, no network.
   Manifest schema (shared with calibration mode):
     manifest = {
       unit:'mm',
       screen:   {position:[x,y,z], size:[w,h], rotation:[rx,ry,rz]},
       buttons:  {name: {position:[x,y,z], axis:[x,y,z], travel:mm,
                         mode:'slide'|'tilt', tiltAxis?:[x,y,z], tiltAngle?:rad}}
     }
   Geometry rule: built.group origin sits on the desk (y=0 = bottom face),
   +Z points toward the camera.
   Screen orientation differs per model (matches the real devices):
     placeholder / phone — content top points to -Z (portrait-style)
     official Flipper    — content top points to +X, canvas width runs
                           along Z (the real device is used lengthwise:
                           128px axis ∥ 37mm window, near-square pixels). */
(function () {
  'use strict';
  var FZ = window.FZ;

  /* ---------- helpers ---------- */
  function roundedShape(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  /* Extruded rounded body. Shape x = device width (world X),
     shape y = device length (world -Z after rotateX). Bevel: caps keep the
     full outline, walls inset by bevelSize; total height = depth + 2*bt. */
  function bodyMesh(w, l, h, r, bt, mat) {
    bt = bt || 0.5;
    var shape = roundedShape(w, l, r);
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.1, h - 2 * bt),
      bevelEnabled: true,
      bevelThickness: bt,
      bevelSize: bt * 0.9,
      bevelSegments: 2,
      curveSegments: 6,
      steps: 1
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bt, 0); /* y ∈ [0, h] */
    var mesh = new THREE.Mesh(geo, mat);
    mesh.userData.kind = 'body';
    return mesh;
  }

  function screenQuad(w, h) {
    var geo = new THREE.PlaneGeometry(w, h);
    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.rotation.x = -Math.PI/2; /* local X → +X (device width axis is local Y… see header) */
    mesh.userData.screen = null;    /* filled by caller */
    return mesh;
  }

  function boxPart(name, sx, sy, sz, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.userData.part = name;
    return mesh;
  }

  function cylPart(name, r, h, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat);
    mesh.position.set(x, y, z);
    mesh.userData.part = name;
    return mesh;
  }

  function materials() {
    return {
      body: new THREE.MeshStandardMaterial({ color: 0x0E0E10, roughness: 0.45, metalness: 0.08 }),
      button: new THREE.MeshStandardMaterial({ color: 0xF2F2F2, roughness: 0.5, metalness: 0.0 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6, metalness: 0.0 })
    };
  }

  /* ---------- Flipper placeholder (NOT the official model) ---------- */
  function buildFlipperPlaceholder() {
    var W = 40, L = 100, H = 25, R = 8, BT = 0.5;
    var m = materials();
    var group = new THREE.Group();

    var body = bodyMesh(W, L, H, R, BT, m.body);
    group.add(body);

    /* screen: 128×64 logical → 28 × 14 mm, near the -Z (top) end */
    var scr = screenQuad(28, 14);
    scr.position.set(0, H + 0.08, -30);
    scr.userData.screen = 'flipper';
    group.add(scr);

    /* D-pad cross (4 arms) as a tilt group; OK in the middle; Back to the right */
    var dpad = new THREE.Group();
    dpad.position.set(0, 0, 5);
    group.add(dpad);

    var armW = 6, armL = 8, off = 7.2;
    var btnY = 26.6, frY = 25.4;
    var arms = [
      ['dpad_up', armW, armL, 0, -off],
      ['dpad_down', armW, armL, 0, off],
      ['dpad_left', armL, armW, -off, 0],
      ['dpad_right', armL, armW, off, 0]
    ];
    var parts = {};
    for (var i = 0; i < arms.length; i++) {
      var a = arms[i];
      var fr = new THREE.Mesh(new THREE.BoxGeometry(a[1] + 1.4, 0.8, a[2] + 1.4), m.frame);
      fr.position.set(a[3], frY, a[4]);
      dpad.add(fr);
      var bt = boxPart(a[0], a[1], 2.4, a[2], a[3], btnY, a[4], m.button);
      dpad.add(bt);
      parts[a[0]] = bt;
    }

    var ok = cylPart('ok', 3.2, 2.4, 0, btnY, 5, m.button);
    var okFr = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.8, 20), m.frame);
    okFr.position.set(0, frY, 5);
    group.add(okFr, ok);
    parts.ok = ok;

    var back = cylPart('back', 3.4, 2.4, 15, btnY, 5, m.button);
    var backFr = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.8, 20), m.frame);
    backFr.position.set(15, frY, 5);
    group.add(backFr, back);
    parts.back = back;

    var manifest = {
      unit: 'mm',
      screen: { position: [0, H + 0.08, -30], size: [28, 14], rotation: [-Math.PI / 2, 0, 0] },
      buttons: {
        dpad_up:    { position: [0, btnY, -2.2],  axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [-1, 0, 0], tiltAngle: 0.10 },
        dpad_down:  { position: [0, btnY, 12.2],  axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [1, 0, 0],  tiltAngle: 0.10 },
        dpad_left:  { position: [-7.2, btnY, 5],  axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [0, 0, 1],  tiltAngle: 0.10 },
        dpad_right: { position: [7.2, btnY, 5],   axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [0, 0, -1], tiltAngle: 0.10 },
        ok:         { position: [0, btnY, 5],     axis: [0, -1, 0], travel: 0.6, mode: 'slide' },
        back:       { position: [15, btnY, 5],    axis: [0, -1, 0], travel: 0.6, mode: 'slide' }
      }
    };

    return {
      id: 'flipper.placeholder',
      group: group,
      parts: parts,
      tiltGroups: { dpad: dpad },
      screen: scr,
      manifest: manifest,
      dims: { w: W, l: L, h: H },
      tilt: 0.045
    };
  }

  /* ---------- procedural phone ---------- */
  function buildPhoneProcedural() {
    var W = 72, L = 146, H = 8, R = 10, BT = 0.4;
    var m = materials();
    var group = new THREE.Group();

    var body = bodyMesh(W, L, H, R, BT, m.body);
    group.add(body);

    /* screen: canvas 360×760 → 64 × 135.11 mm */
    var sw = 64, sh = sw * 760 / 360;
    var scr = screenQuad(sw, sh);
    scr.position.set(0, H + 0.08, 0);
    scr.userData.screen = 'phone';
    group.add(scr);

    /* white side buttons on the +X edge */
    var bx = 36.4, by = 4;
    var power = boxPart('power', 1.4, 2.2, 8, bx, by, -26, m.button);
    var volUp = boxPart('vol_up', 1.4, 2.2, 6, bx, by, -13, m.button);
    var volDn = boxPart('vol_down', 1.4, 2.2, 6, bx, by, -4, m.button);
    group.add(power, volUp, volDn);

    var manifest = {
      unit: 'mm',
      screen: { position: [0, H + 0.08, 0], size: [sw, sh], rotation: [-Math.PI / 2, 0, 0] },
      buttons: {
        power:    { position: [bx, by, -26], axis: [-1, 0, 0], travel: 0.5, mode: 'slide' },
        vol_up:   { position: [bx, by, -13], axis: [-1, 0, 0], travel: 0.5, mode: 'slide' },
        vol_down: { position: [bx, by, -4],  axis: [-1, 0, 0], travel: 0.5, mode: 'slide' }
      }
    };

    return {
      id: 'phone.procedural',
      group: group,
      parts: { power: power, vol_up: volUp, vol_down: volDn },
      tiltGroups: {},
      screen: scr,
      manifest: manifest,
      dims: { w: W, l: L, h: H },
      tilt: 0.03
    };
  }

  /* ======================================================================
     OFFICIAL FLIPPER ZERO BODY (Stage 2)
     Mesh frame (STL, mm): X = width 40.09, Y = length 100.30 (nose y=-24),
     Z = thickness 25.60, front face (screen side) at z≈+2.10.
     Desk transform: rotateY(π) then rotateX(π/2) then translate —
       local = (-x + TX, z + TY, y + TZ)
     which puts the face up (+Y), nose toward -Z, and the UI content-top
     toward +X with the 128px canvas axis along Z (see SOURCES.md for the
     full measurement table and orientation derivation).
     ====================================================================== */
  var OFF = {
    tx: -13.55,      /* lx = -x + tx  */
    ty: 23.0001,     /* ly =  z + ty  (bottom face → y=0) */
    tz: -26.1441,    /* lz =  y + tz  (length centred on 0) */
    face: 25.1,      /* front-face plane in local y (2.10 + ty) */
    /* calibrated feature centres in MESH frame (see models/SOURCES.md) */
    screen: { x: -17.5, y: 19.5, w: 18, l: 36 },   /* window 22×37, quad 18×36 (2:1) */
    dpad:   { x: -17.5, y: 51.4, r: 10.25 },
    ok:     { r: 3.0 },
    back:   { x: -10.25, y: 65.5, r: 3.5 },
    armR: 6.7,        /* arm centre radius inside the d-pad disc */
    armLen: 6.2, armWide: 5.4, armThick: 0.9,
    proxyY: 0.75      /* arm centre height above the dpad group origin (face) */
  };

  function meshToLocal(x, y, z) {
    return [-x + OFF.tx, z + OFF.ty, y + OFF.tz];
  }

  var stlCache = {};

  /* Decode embedded binary STL → welded, smooth-shaded, desk-transformed
     Float32Arrays (cached per source id; arrays are read-only afterwards). */
  function stlData(src) {
    if (stlCache[src.id]) return stlCache[src.id];

    var b64 = src.b64str || (src.b64str = src.b64.join(''));
    var bin = atob(b64);
    var n = bin.length;
    var bytes = new Uint8Array(n);
    for (var i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
    var dv = new DataView(bytes.buffer);
    var tris = dv.getUint32(80, true);
    if (tris !== src.tris) throw new Error('STL triangle count mismatch');

    /* positions only (face normals recomputed; attr byte ignored) */
    var pos = new Float32Array(tris * 9);
    var off = 84;
    for (var t = 0; t < tris; t++) {
      off += 12; /* skip stored normal */
      for (var k = 0; k < 9; k++) { pos[t * 9 + k] = dv.getFloat32(off, true); off += 4; }
      off += 2;  /* attribute byte count */
    }

    var nrm = smoothNormals(pos, tris);

    /* apply desk transform in place (positions translate, normals only rotate) */
    for (var i2 = 0; i2 < pos.length; i2 += 3) {
      var x = pos[i2], y = pos[i2 + 1], z = pos[i2 + 2];
      pos[i2] = -x + OFF.tx;
      pos[i2 + 1] = z + OFF.ty;
      pos[i2 + 2] = y + OFF.tz;
      var nx = nrm[i2], ny = nrm[i2 + 1], nz = nrm[i2 + 2];
      nrm[i2] = -nx;
      nrm[i2 + 1] = nz;
      nrm[i2 + 2] = ny;
    }

    stlCache[src.id] = { pos: pos, nrm: nrm, tris: tris };
    return stlCache[src.id];
  }

  /* Angle-threshold smooth shading: weld vertices by position (0.001 mm
     grid), then average face normals across edges sharper-filtered than
     35° — fillets read smooth, machined edges stay crisp. Non-indexed
     output (per face-corner normals) so hard edges can differ per face. */
  function smoothNormals(pos, tris) {
    var out = new Float32Array(tris * 9);
    var fn = new Float32Array(tris * 3);
    var f, i, c;

    for (f = 0; f < tris; f++) {
      i = f * 9;
      var ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
      var bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5];
      var cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
      var ux = bx - ax, uy = by - ay, uz = bz - az;
      var vx = cx - ax, vy = cy - ay, vz = cz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      fn[f * 3] = nx / len; fn[f * 3 + 1] = ny / len; fn[f * 3 + 2] = nz / len;
    }

    /* numeric weld key: quantised coords packed exactly into a double */
    function vkey(x, y, z) {
      return ((Math.round(x * 1000) + 40000) * 200000 + (Math.round(y * 1000) + 30000)) * 60000 +
             (Math.round(z * 1000) + 30000);
    }
    var adj = new Map();
    for (f = 0; f < tris; f++) {
      for (c = 0; c < 3; c++) {
        i = f * 9 + c * 3;
        var k = vkey(pos[i], pos[i + 1], pos[i + 2]);
        var arr = adj.get(k);
        if (!arr) { arr = []; adj.set(k, arr); }
        arr.push(f);
      }
    }

    var COS = Math.cos(35 * Math.PI / 180);
    for (f = 0; f < tris; f++) {
      var fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2];
      for (c = 0; c < 3; c++) {
        i = f * 9 + c * 3;
        var list = adj.get(vkey(pos[i], pos[i + 1], pos[i + 2]));
        var sx = 0, sy = 0, sz = 0;
        for (var j = 0; j < list.length; j++) {
          var g = list[j];
          var d = fx * fn[g * 3] + fy * fn[g * 3 + 1] + fz * fn[g * 3 + 2];
          if (d >= COS) { sx += fn[g * 3]; sy += fn[g * 3 + 1]; sz += fn[g * 3 + 2]; }
        }
        var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        out[i] = sx / sl; out[i + 1] = sy / sl; out[i + 2] = sz / sl;
      }
    }
    return out;
  }

  /* Invisible hit-proxy material: opacity 0 at rest (the official mesh
     keeps its exact look), flashes orange while its button is pressed —
     scene.js ramps material.opacity via userData.flash. */
  function proxyMat() {
    var m = new THREE.MeshBasicMaterial({
      color: 0xFF9A40, transparent: true, opacity: 0, depthWrite: false
    });
    if (!m.userData) m.userData = {};
    m.userData.flash = true;
    return m;
  }

  function buildFlipperOfficial(src) {
    var data = stlData(src);
    var group = new THREE.Group();

    /* body: fresh BufferGeometry wrapping the cached arrays (safe to
       dispose — the Float32Arrays stay owned by stlCache) */
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.nrm, 3));
    var body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x141418, roughness: 0.5, metalness: 0.08
    }));
    body.userData.kind = 'body';
    group.add(body);

    /* screen quad: 36 (canvas width, 128px) along Z × 18 (64px) along X,
       2:1 exact, centred in the 22×37 window; content top → +X */
    var scrGeo = new THREE.PlaneGeometry(OFF.screen.l, OFF.screen.w);
    scrGeo.rotateZ(-Math.PI / 2);
    scrGeo.rotateX(-Math.PI / 2);
    var sc = meshToLocal(OFF.screen.x, OFF.screen.y, 0); /* [lx, ly, lz] */
    scrGeo.translate(sc[0], OFF.face + 0.08, sc[2]);
    var scr = new THREE.Mesh(scrGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scr.userData.screen = 'flipper';
    group.add(scr);

    var parts = {};

    /* d-pad: 4 arm proxies in a tilt group hinged at the disc centre */
    var dc = meshToLocal(OFF.dpad.x, OFF.dpad.y, 0);
    var dpad = new THREE.Group();
    dpad.position.set(dc[0], OFF.face, dc[2]);
    group.add(dpad);

    var R = OFF.armR, Y = OFF.proxyY, L2 = OFF.armLen, W2 = OFF.armWide, T2 = OFF.armThick;
    var arms = [
      ['dpad_up',    L2, T2, W2,  R, Y, 0],
      ['dpad_down',  L2, T2, W2, -R, Y, 0],
      ['dpad_left',  W2, T2, L2, 0, Y, -R],
      ['dpad_right', W2, T2, L2, 0, Y,  R]
    ];
    for (var i = 0; i < arms.length; i++) {
      var a = arms[i];
      var arm = new THREE.Mesh(new THREE.BoxGeometry(a[1], a[2], a[3]), proxyMat());
      arm.position.set(a[4], a[5], a[6]);
      arm.userData.part = a[0];
      dpad.add(arm);
      parts[a[0]] = arm;
    }

    /* OK (centre of the d-pad, not in the tilt group) + Back */
    var ok = new THREE.Mesh(new THREE.CylinderGeometry(OFF.ok.r, OFF.ok.r, 0.9, 20), proxyMat());
    ok.position.set(dc[0], OFF.face + 0.8, dc[2]);
    ok.userData.part = 'ok';
    group.add(ok);
    parts.ok = ok;

    var bc = meshToLocal(OFF.back.x, OFF.back.y, 0);
    var back = new THREE.Mesh(new THREE.CylinderGeometry(OFF.back.r, OFF.back.r, 0.9, 20), proxyMat());
    back.position.set(bc[0], OFF.face + 0.8, bc[2]);
    back.userData.part = 'back';
    group.add(back);
    parts.back = back;

    var okPos = [dc[0], OFF.face + 0.8, dc[2]];
    var backPos = [bc[0], OFF.face + 0.8, bc[2]];
    var manifest = {
      unit: 'mm',
      screen: { position: [sc[0], OFF.face + 0.08, sc[2]], size: [OFF.screen.w, OFF.screen.l], rotation: [0, 0, 0] },
      buttons: {
        /* tilt arms: positions are absolute group-local; axis = press
           direction (Y × pressDir gives the tilt axis, cf. placeholder) */
        dpad_up:    { position: [dc[0] + R, OFF.face + Y, dc[2]],     axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [0, 0, -1], tiltAngle: 0.10 },
        dpad_down:  { position: [dc[0] - R, OFF.face + Y, dc[2]],     axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [0, 0,  1], tiltAngle: 0.10 },
        dpad_left:  { position: [dc[0], OFF.face + Y, dc[2] - R],     axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [-1, 0, 0], tiltAngle: 0.10 },
        dpad_right: { position: [dc[0], OFF.face + Y, dc[2] + R],     axis: [0, -1, 0], travel: 0.5, mode: 'tilt', tiltAxis: [ 1, 0, 0], tiltAngle: 0.10 },
        ok:         { position: okPos,   axis: [0, -1, 0], travel: 0.6, mode: 'slide' },
        back:       { position: backPos, axis: [0, -1, 0], travel: 0.6, mode: 'slide' }
      }
    };

    return {
      id: 'flipper-official',
      group: group,
      parts: parts,
      tiltGroups: { dpad: dpad },
      screen: scr,
      manifest: manifest,
      dims: { w: 40.09, l: 100.30, h: 25.60 },
      tilt: 0.045,
      triCount: data.tris   /* exposed for FZ.selfTest()'s 150k budget check */
    };
  }

  /* ---------- registry ---------- */
  function externalList(type) {
    var out = [];
    var FM = window.FZ_MODELS;
    if (FM && FM[type] && FM[type].length) {
      for (var i = 0; i < FM[type].length; i++) out.push(FM[type][i]);
    }
    return out;
  }

  FZ.models = {
    list: function (type) {
      var out = externalList(type);
      if (type === 'flipper') {
        out.push({ id: 'flipper.placeholder', label: 'Placeholder block (S1 stand-in)' });
      } else {
        out.push({ id: 'phone.procedural', label: 'Procedural (generic)' });
      }
      return out;
    },

    defaultId: function (type) {
      var stored = FZ.storage.get('model.' + type, null);
      var list = this.list(type);
      if (stored) {
        for (var i = 0; i < list.length; i++) if (list[i].id === stored) return stored;
      }
      return list[0].id;
    },

    build: function (id) {
      var FM = window.FZ_MODELS;
      /* Stage 2: official body from embedded base64 (models/flipper-model.js) */
      if (id === 'flipper-official' && FM && FM.sources && FM.sources['flipper-official']) {
        return buildFlipperOfficial(FM.sources['flipper-official']);
      }
      /* extension hook: external builders from models/library.js */
      if (FM && FM.builders && FM.builders[id]) return FM.builders[id]();
      if (id === 'phone.procedural') return buildPhoneProcedural();
      return buildFlipperPlaceholder();
    }
  };
})();

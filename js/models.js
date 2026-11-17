/* Local mesh builders: 1 world unit = 1 mm. No runtime parsers or loaders. */
(function () {
  'use strict';
  var FZ = window.FZ;

  /* ---------- helpers ---------- */
  function roundedShape(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2,
      y = -h / 2;
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
    mesh.rotation.x = -Math.PI / 2; /* local X → +X (device width axis is local Y… see header) */
    mesh.userData.screen = null; /* filled by caller */
    return mesh;
  }

  function boxPart(name, sx, sy, sz, x, y, z, mat) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    mesh.userData.part = name;
    return mesh;
  }

  function materials() {
    var m = {
      body: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.45, metalness: 0.08 }),
      button: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.0 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.6, metalness: 0.0 })
    };
    m.body.color.convertSRGBToLinear();
    m.button.color.convertSRGBToLinear();
    m.frame.color.convertSRGBToLinear();
    return m;
  }

  /* ---------- procedural phone ---------- */
  function buildPhoneProcedural(id) {
    var compact = id === 'phone.compact';
    var W = compact ? 60 : 68,
      L = compact ? 128 : 146,
      H = 8,
      R = 10,
      BT = 0.4;
    var m = materials();
    var group = new THREE.Group();

    var body = bodyMesh(W, L, H, R, BT, m.body);
    group.add(body);

    /* screen: canvas 360×760 → 64 × 135.11 mm */
    var sw = compact ? 57 : 65,
      sh = (sw * 760) / 360;
    // Rounded screen corners. ShapeGeometry's stock UVs are world units;
    // assign real normalized UVs so taps and the texture share one mapping.
    var surface = new THREE.ShapeGeometry(roundedShape(sw, sh, 6), 10);
    var pos = surface.attributes.position,
      uv = surface.attributes.uv;
    for (var i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, pos.getY(i) / sh + 0.5);
    var scr = new THREE.Mesh(surface, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scr.rotation.x = -Math.PI / 2;
    scr.position.set(0, H + 0.08, 0);
    scr.userData.screen = 'phone';
    group.add(scr);

    /* White clickers on the exposed side rail. */
    var bx = -W / 2 - 0.65,
      by = 4.9;
    var power = boxPart('power', 1.4, 2.2, 8, bx, by, -26, m.button);
    var volUp = boxPart('vol_up', 1.4, 2.2, 6, bx, by, -13, m.button);
    var volDn = boxPart('vol_down', 1.4, 2.2, 6, bx, by, -4, m.button);
    group.add(power, volUp, volDn);
    // Fixed, invisible side-rail targets include the depressed position.
    // The outer shell still occludes the far rail when viewed from behind.
    var hitMat = new THREE.MeshBasicMaterial({ visible: false });
    [power, volUp, volDn].forEach(function (button, i) {
      var hit = boxPart(
        button.userData.part,
        2.8,
        3.5,
        i ? 8 : 10,
        bx,
        by,
        button.position.z,
        hitMat
      );
      group.add(hit);
    });

    var speaker = new THREE.Mesh(new THREE.ShapeGeometry(roundedShape(8, 0.8, 0.38), 5), m.frame);
    speaker.rotation.x = -Math.PI / 2;
    speaker.position.set(0, H + 0.06, -L / 2 + 1.8);
    group.add(speaker);
    var manifest = {
      unit: 'mm',
      screen: { position: [0, H + 0.08, 0], size: [sw, sh], rotation: [-Math.PI / 2, 0, 0] },
      buttons: {
        power: { position: [bx, by, -26], axis: [1, 0, 0], travel: 0.5, mode: 'slide' },
        vol_up: { position: [bx, by, -13], axis: [1, 0, 0], travel: 0.5, mode: 'slide' },
        vol_down: { position: [bx, by, -4], axis: [1, 0, 0], travel: 0.5, mode: 'slide' }
      }
    };

    return {
      id: id,
      group: group,
      parts: { power: power, vol_up: volUp, vol_down: volDn },
      tiltGroups: {},
      screen: scr,
      manifest: manifest,
      dims: { w: W, l: L, h: H },
      tilt: 0.03
    };
  }

  var buffers;
  function decode(text, Type) {
    var bin = atob(text),
      bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  }
  function official(id) {
    var src = FZ.meshes['flipper-official'],
      group = new THREE.Group(),
      tilt = new THREE.Group(),
      parts = {},
      m = materials();
    if (!buffers)
      buffers = {
        pos: new THREE.BufferAttribute(decode(src.pos, Float32Array), 3),
        idx: decode(src.idx, src.indexBits === 16 ? Uint16Array : Uint32Array)
      };
    m.body.flatShading = m.button.flatShading = true;
    m.body.metalness = 0.12;
    var man = FZ.manifest.get('flipper-official', src.manifest),
      base = src.manifest;
    tilt.position.fromArray(man.buttons.ok.position);
    group.add(tilt);
    var colors = {
      body: 0x414549,
      dpad_up: 0xe98631,
      dpad_down: 0xebbe41,
      dpad_left: 0x62a6a6,
      dpad_right: 0x7c97d9,
      ok: 0xd785aa,
      back: 0x95ae69
    };
    src.parts.forEach(function (p) {
      var geo = new THREE.BufferGeometry(),
        k = p.name;
      geo.setAttribute('position', buffers.pos);
      geo.setIndex(new THREE.BufferAttribute(buffers.idx.subarray(p.start, p.start + p.count), 1));
      var mat =
        id === 'flipper-parts'
          ? new THREE.MeshStandardMaterial({ color: colors[k], flatShading: true, roughness: 0.5 })
          : k === 'body'
            ? m.body
            : m.button;
      if (id === 'flipper-parts') mat.color.convertSRGBToLinear();
      if (p.count > p.surfaceCount) {
        geo.addGroup(0, p.surfaceCount, 0);
        geo.addGroup(p.surfaceCount, p.count - p.surfaceCount, 1);
        mat = [mat, m.frame];
      }
      var mesh = new THREE.Mesh(geo, mat);
      if (k === 'body') {
        group.add(mesh);
        return;
      }
      var pivot = new THREE.Group();
      parts[k] = pivot;
      pivot.userData.part = k;
      mesh.position.fromArray(base.buttons[k].position).multiplyScalar(-1);
      pivot.add(mesh);
      pivot.position.fromArray(man.buttons[k].position);
      if (k.indexOf('dpad_') === 0) {
        pivot.position.sub(tilt.position);
        tilt.add(pivot);
      } else group.add(pivot);
    });
    var scr = screenQuad(1, 1);
    scr.userData.screen = 'flipper';
    group.add(scr);
    function apply() {
      var s = man.screen;
      scr.position.fromArray(s.position);
      scr.scale.set(s.size[0], s.size[1], 1);
      scr.rotation.set(s.rotation[0], s.rotation[1], s.rotation[2]);
      tilt.position.fromArray(man.buttons.ok.position);
      Object.keys(parts).forEach(function (k) {
        parts[k].position.fromArray(man.buttons[k].position);
        if (k.indexOf('dpad_') === 0) parts[k].position.sub(tilt.position);
      });
    }
    apply();
    return {
      id: id,
      group: group,
      parts: parts,
      tiltGroups: { dpad: tilt },
      screen: scr,
      manifest: man,
      apply: apply,
      dims: { w: src.dimensions[0], l: src.dimensions[2], h: src.dimensions[1] },
      tilt: 0.018,
      triCount: src.triangles
    };
  }
  FZ.models = {
    list: function (type) {
      return FZ.library[type];
    },
    defaultId: function (type) {
      var id = FZ.storage.get('model.' + type, null);
      return this.list(type).some(function (e) {
        return e.id === id;
      })
        ? id
        : this.list(type)[0].id;
    },
    build: function (id) {
      if (id.indexOf('phone.') === 0) return buildPhoneProcedural(id);
      return official(id);
    }
  };
})();

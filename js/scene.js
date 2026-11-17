/* Fliper Web Sim — scene: Three.js r128 desk scene.
   1 unit = 1 mm. Dark desk, low-key lighting, baked contact shadows,
   screens as light sources, thin RF beam when linked.
   Controls: orbit (desk), lift+free-rotate (device), wheel/pinch zoom,
   double-click/tap reset, layout presets, idle breathing until touched. */
(function () {
  'use strict';
  var FZ = window.FZ;
  var U = FZ.util;

  /* ---------- module state ---------- */
  var canvasEl, renderer, scene, camera, raycaster, ndc;
  var ready = false,
    dirty = true;
  var rig;
  var screens = null; /* {flipper: Screen, phone: Screen} — canvas textures for the quads */
  var mounts = {};
  var beamGroup,
    beamLine,
    packets = [];
  var camState = { az: 0.78, pol: 0.98, rad: 310, tx: -8, ty: 16, tz: 0 };
  var camTween = null;
  var layout = 'both',
    portrait = false;
  var touched = false,
    breathPhase = 0;
  var pressAnims = [];
  var releaseAnims = [];
  var ptrs = {};
  var gesture = null;
  var lastTap = { t: -1e9, x: 0, y: 0 };
  var lastSignalT = -Infinity,
    distanceMM = 0;
  var keyLight, rimLight;
  var MOUNT_TYPES = ['flipper', 'phone'];

  /* shared assets */
  var SHADOW_TEX, POOL_TEX, GLOW_TEX, FLAT_GEO;

  /* per-frame temps (no allocations in the loop) */
  var T = {
    v1: null,
    v2: null,
    v3: null,
    v4: null,
    q1: null,
    q2: null,
    q3: null,
    axU: null,
    axR: null
  };

  function allocTemps() {
    T.v1 = new THREE.Vector3();
    T.v2 = new THREE.Vector3();
    T.v3 = new THREE.Vector3();
    T.v4 = new THREE.Vector3();
    T.q1 = new THREE.Quaternion();
    T.q2 = new THREE.Quaternion();
    T.q3 = new THREE.Quaternion();
    T.axU = new THREE.Vector3();
    T.axR = new THREE.Vector3();
  }

  var UP = null;

  /* ---------- textures ---------- */
  function radialTexture(inner, outer, size) {
    size = size || 128;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var x = cv.getContext('2d');
    var g = x.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2 - 2);
    g.addColorStop(0, inner);
    if (inner.indexOf('rgba(0,0,0') === 0) g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  }

  function deskTexture() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    var c = cv.getContext('2d');
    c.fillStyle = '#17151A';
    c.fillRect(0, 0, 512, 512);
    var img = c.getImageData(0, 0, 512, 512),
      seed = 17;
    for (var i = 0; i < img.data.length; i += 4) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      var d = (seed >>> 29) - 3;
      img.data[i] += d;
      img.data[i + 1] += d;
      img.data[i + 2] += d;
    }
    c.putImageData(img, 0, 0);
    // Engraved measurement grid: 10 mm cells, a registration cross every 50 mm.
    for (var j = 0; j < 5; j++) {
      var p = (j * 512) / 5;
      c.fillStyle = j ? 'rgba(206,207,212,.062)' : 'rgba(206,207,212,.11)';
      c.fillRect(p, 0, 1.7, 512);
      c.fillRect(0, p, 512, 1.7);
    }
    c.fillStyle = 'rgba(196,198,202,.22)';
    [0, 512].forEach(function (x) {
      [0, 512].forEach(function (y) {
        c.fillRect(x - 6, y - 1, 12, 2);
        c.fillRect(x - 1, y - 6, 2, 12);
      });
    });
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  // Fit the actual rest boxes in perspective, including the near corners of
  // the phone. Keep enough room for the projected labels and zoom controls.
  // All fitting allocations are on a resize/layout gesture, never in frame().
  function presets() {
    var focus = layout !== 'both',
      isF = layout === 'flipper';
    var p = {
      az: focus
        ? (portrait ? (isF ? -0.24 : -0.17) : mounts[layout].baseYaw) + (isF ? 0.09 : 0)
        : portrait
          ? 0.04
          : -0.19,
      pol: focus ? (isF ? 0.43 : 0.23) : portrait ? 0.46 : 0.84,
      rad: 0,
      tx: 0,
      ty: 0,
      tz: 0
    };
    var dir = new THREE.Vector3(
      Math.sin(p.pol) * Math.sin(p.az),
      Math.cos(p.pol),
      Math.sin(p.pol) * Math.cos(p.az)
    );
    var right = new THREE.Vector3(Math.cos(p.az), 0, -Math.sin(p.az)),
      up = dir.clone().cross(right);
    var pts = [],
      target = new THREE.Vector3(),
      angle = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    (focus ? [layout] : MOUNT_TYPES).forEach(function (type) {
      var m = mounts[type],
        d = m.built.dims;
      [-1, 1].forEach(function (x) {
        [-1, 1].forEach(function (z) {
          [0, d.h].forEach(function (y) {
            var v = new THREE.Vector3((x * d.w) / 2, y, (z * d.l) / 2).applyQuaternion(
              m.visual.quaternion
            );
            v.y += m.restY;
            v.applyQuaternion(m.restQ).add(m.root.position);
            pts.push(v);
            target.add(v);
          });
        });
      });
    });
    target.multiplyScalar(1 / pts.length);
    var w = canvasEl.clientWidth || 1,
      h = canvasEl.clientHeight || 1;
    var marginX = Math.min(w * 0.07, 30),
      top = Math.min(h * 0.14, focus ? 20 : portrait ? 52 : 25),
      bottom = Math.min(h * 0.13, focus ? 32 : portrait ? 46 : 24);
    var ax = 1 - (2 * marginX) / w,
      ay = 1 - (top + bottom) / h;
    for (var i = 0; i < 3; i++) {
      var rad = 30;
      pts.forEach(function (v) {
        var r = v.clone().sub(target),
          z = r.dot(dir);
        rad = Math.max(
          rad,
          z + Math.abs(r.dot(right)) / (ax * angle * camera.aspect),
          z + Math.abs(r.dot(up)) / (ay * angle)
        );
      });
      var loX = Infinity,
        hiX = -Infinity,
        loY = Infinity,
        hiY = -Infinity;
      pts.forEach(function (v) {
        var r = v.clone().sub(target),
          d = rad - r.dot(dir),
          x = r.dot(right) / d,
          y = r.dot(up) / d;
        loX = Math.min(loX, x);
        hiX = Math.max(hiX, x);
        loY = Math.min(loY, y);
        hiY = Math.max(hiY, y);
      });
      target
        .addScaledVector(right, (rad * (loX + hiX)) / 2)
        .addScaledVector(up, (rad * (loY + hiY)) / 2);
      p.rad = rad;
    }
    target.addScaledVector(up, ((top - bottom) * angle * p.rad) / h);
    p.tx = target.x;
    p.ty = target.y;
    p.tz = target.z;
    return p;
  }

  function applyCamera() {
    var s = camState;
    camera.position.set(
      s.tx + s.rad * Math.sin(s.pol) * Math.sin(s.az),
      s.ty + s.rad * Math.cos(s.pol),
      s.tz + s.rad * Math.sin(s.pol) * Math.cos(s.az)
    );
    camera.lookAt(s.tx, s.ty, s.tz);
  }

  function tweenTo(p, durMs) {
    if (FZ.flags.reducedMotion) durMs = 0;
    if (durMs <= 0) {
      camState.az = p.az;
      camState.pol = p.pol;
      camState.rad = p.rad;
      camState.tx = p.tx;
      camState.ty = p.ty;
      camState.tz = p.tz;
      camTween = null;
      applyCamera();
      dirty = true;
      wake();
      return;
    }
    wake();
    camTween = {
      t0: U.now(),
      dur: durMs,
      from: {
        az: camState.az,
        pol: camState.pol,
        rad: camState.rad,
        tx: camState.tx,
        ty: camState.ty,
        tz: camState.tz
      },
      to: { az: p.az, pol: p.pol, rad: p.rad, tx: p.tx, ty: p.ty, tz: p.tz }
    };
  }

  function updateCamTween(now) {
    if (!camTween) return false;
    var t = U.clamp((now - camTween.t0) / camTween.dur, 0, 1);
    var k = U.easeInOutCubic(t);
    camState.az = U.lerp(camTween.from.az, camTween.to.az, k);
    camState.pol = U.lerp(camTween.from.pol, camTween.to.pol, k);
    camState.rad = U.lerp(camTween.from.rad, camTween.to.rad, k);
    camState.tx = U.lerp(camTween.from.tx, camTween.to.tx, k);
    camState.ty = U.lerp(camTween.from.ty, camTween.to.ty, k);
    camState.tz = U.lerp(camTween.from.tz, camTween.to.tz, k);
    applyCamera();
    if (t >= 1) camTween = null;
    return true;
  }

  /* ---------- device mounting ---------- */
  function updateYaw(mount) {
    var yaw = portrait ? (mount.type === 'flipper' ? -0.24 : -0.17) : mount.baseYaw;
    mount.restQ = mount.restQ || new THREE.Quaternion();
    mount.restQ.setFromEuler(new THREE.Euler(0, yaw, 0));
    if (!mount.dragging) mount.spinner.quaternion.copy(mount.restQ);
    var flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    mount.shadow.quaternion.copy(mount.restQ).multiply(flat);
    mount.pool.quaternion.copy(mount.restQ).multiply(flat);
  }

  function mountDevice(type, built) {
    var isF = type === 'flipper';
    var mount = {
      type: type,
      built: built,
      baseYaw: isF ? -0.53 : -0.49,
      lifting: false,
      dragging: false
    };

    mount.root = new THREE.Object3D();
    mount.root.position.set(isF ? -54 : 52, 0, isF ? 16 : -9);
    rig.add(mount.root);

    mount.spinner = new THREE.Object3D();
    mount.root.add(mount.spinner);

    mount.visual = built.group;
    mount.restY = (built.dims.l / 2) * Math.sin(built.tilt || 0);
    mount.visual.position.y = mount.restY;
    mount.visual.rotation.x = built.tilt || 0;
    mount.spinner.add(mount.visual);

    /* baked radial contact shadow (no shadow maps) */
    mount.shadow = new THREE.Mesh(
      FLAT_GEO,
      new THREE.MeshBasicMaterial({
        map: SHADOW_TEX,
        transparent: true,
        depthWrite: false,
        opacity: 0.85
      })
    );
    mount.shadow.position.set(isF ? 3 : 1.5, 0.35, isF ? 5 : 2);
    mount.shadow.renderOrder = 2;
    mount.shadow.scale.set(built.dims.w * 1.68, built.dims.l * 1.64, 1);
    mount.shadowBase = { w: built.dims.w * 1.68, l: built.dims.l * 1.64 };
    mount.root.add(mount.shadow);

    /* faint orange light pool from the screen */
    mount.pool = new THREE.Mesh(
      FLAT_GEO,
      new THREE.MeshBasicMaterial({
        map: POOL_TEX,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.065
      })
    );
    mount.pool.position.y = 0.25;
    mount.pool.renderOrder = 1;
    mount.pool.scale.set(built.dims.w + 110, built.dims.l + 110, 1);
    mount.root.add(mount.pool);

    /* glow halo over the screen (moves with the device) */
    var sp = built.manifest.screen.position,
      ss = built.manifest.screen.size;
    mount.glow = new THREE.Mesh(
      FLAT_GEO,
      new THREE.MeshBasicMaterial({
        map: GLOW_TEX,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.55
      })
    );
    mount.glow.position.set(sp[0], sp[1] + 0.6, sp[2]);
    mount.glow.rotation.x = -Math.PI / 2;
    mount.glow.scale.set(ss[0] * 1.9, ss[1] * 2.2, 1);
    mount.glow.material.opacity = isF ? 0.05 : 0.009;
    mount.glow.renderOrder = 4;
    mount.glow.userData.noRay = true;
    mount.visual.add(mount.glow);

    mount.parts = built.parts;
    mount.tiltGroups = built.tiltGroups || {};
    mount.screenMesh = built.screen;

    /* bind the live canvas texture to the screen quad */
    var scr = screens && screens[type];
    if (scr) {
      scr.texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      mount.screenMesh.material.dispose();
      mount.screenMesh.material = new THREE.MeshStandardMaterial({
        color: 0,
        emissive: 0xffffff,
        emissiveMap: scr.texture,
        emissiveIntensity: 1,
        roughness: 1,
        metalness: 1
      });
      mount.screenMesh.material.needsUpdate = true;
    }

    updateYaw(mount);
    return mount;
  }

  function disposeTree(root) {
    root.traverse(function (o) {
      if (o.geometry && o.geometry !== FLAT_GEO) o.geometry.dispose(); /* FLAT_GEO is shared */
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < ms.length; i++) ms[i].dispose();
      }
    });
  }

  /* ---------- picking ---------- */
  function setRay(e) {
    /* ensure fresh matrices even if a pick happens before the first render */
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    var r = canvasEl.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  function pick(e) {
    if (!mounts.flipper || !mounts.phone) return null;
    setRay(e);
    var hits = raycaster.intersectObjects([mounts.flipper.visual, mounts.phone.visual], true);
    var h = null,
      i;
    for (i = 0; i < hits.length; i++) {
      if (!hits[i].object.userData.noRay) {
        h = hits[i];
        break;
      }
    }
    if (!h) return null;

    var obj = h.object,
      m = null,
      o = obj;
    while (o) {
      if (o === mounts.flipper.visual) {
        m = mounts.flipper;
        break;
      }
      if (o === mounts.phone.visual) {
        m = mounts.phone;
        break;
      }
      o = o.parent;
    }
    if (!m) return null;

    var part = null,
      p = obj;
    while (p && p !== m.visual) {
      if (p.userData && p.userData.part) {
        part = p.userData.part;
        break;
      }
      p = p.parent;
    }
    var screen = (obj.userData && obj.userData.screen) || null;
    return { mount: m, part: part, screen: screen, uv: h.uv };
  }

  function screenCoords(p, e) {
    /* hit UV → phone canvas pixels */
    var x, y;
    if (p && p.uv) {
      x = p.uv.x * 360;
      y = (1 - p.uv.y) * 760;
    } else {
      x = 180;
      y = 380;
    }
    return { x: x, y: y };
  }

  /* ---------- button press animations ---------- */
  function flashPart(type, key) {
    var m = mounts[type];
    if (!m) return;
    var name = key;
    if (
      type === 'flipper' &&
      (key === 'up' || key === 'down' || key === 'left' || key === 'right')
    ) {
      name = 'dpad_' + key;
    }
    var node = m.parts[name];
    var man = m.built.manifest.buttons[name];
    if (!node || !man) return;
    wake();

    var i;
    if (man.mode === 'tilt') {
      for (i = pressAnims.length - 1; i >= 0; i--) {
        if (pressAnims[i].mount === m && pressAnims[i].mode === 'tilt') pressAnims.splice(i, 1);
      }
      m.tiltGroups.dpad.quaternion.identity();
      var arm = new THREE.Vector3().fromArray(man.position).sub(m.tiltGroups.dpad.position);
      var av = arm.clone().cross(new THREE.Vector3().fromArray(man.axis)).normalize();
      pressAnims.push({
        mount: m,
        mode: 'tilt',
        group: m.tiltGroups.dpad,
        axisV: av,
        angle: Math.atan2(man.travel, arm.length()),
        t0: null
      });
    } else {
      for (i = pressAnims.length - 1; i >= 0; i--) {
        if (pressAnims[i].node === node) {
          node.position.set(pressAnims[i].bx, pressAnims[i].baseY, pressAnims[i].bz);
          pressAnims.splice(i, 1);
        }
      }
      pressAnims.push({
        mount: m,
        mode: 'slide',
        node: node,
        bx: node.position.x,
        baseY: node.position.y,
        bz: node.position.z,
        dx: man.axis[0] * man.travel,
        dy: man.axis[1] * man.travel,
        dz: man.axis[2] * man.travel,
        t0: null
      });
    }
    // Apply the downstroke immediately; even a slow first GPU frame must
    // show the press before the spring returns it to the rest pose.
    var a = pressAnims[pressAnims.length - 1];
    if (a.mode === 'slide') a.node.position.set(a.bx + a.dx, a.baseY + a.dy, a.bz + a.dz);
    else a.group.quaternion.setFromAxisAngle(a.axisV, a.angle);
    dirty = true;
  }

  function updatePress(now) {
    var active = false;
    for (var i = pressAnims.length - 1; i >= 0; i--) {
      var a = pressAnims[i];
      if (a.t0 === null) a.t0 = now;
      var el = now - a.t0;
      if (el >= 280) {
        if (a.mode === 'slide') a.node.position.set(a.bx, a.baseY, a.bz);
        else a.group.quaternion.identity();
        dirty = true;
        pressAnims.splice(i, 1);
        continue;
      }
      active = true;
      var k = smooth(pressK(a, el));

      if (a.mode === 'slide') {
        a.node.position.set(a.bx + a.dx * k, a.baseY + a.dy * k, a.bz + a.dz * k);
      } else {
        a.group.quaternion.setFromAxisAngle(a.axisV, a.angle * k);
      }
    }
    return active;
  }

  function pressK(a, el) {
    if (el < 90) return 1;
    return 1 - (el - 90) / 190;
  }

  function smooth(t) {
    t = U.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* ---------- lift / rotate / release / breathing ---------- */
  function startLift(mount) {
    /* cancel any in-flight release so the two don't fight */
    for (var i = releaseAnims.length - 1; i >= 0; i--) {
      if (releaseAnims[i].mount === mount) releaseAnims.splice(i, 1);
    }
    mount.lifting = true;
    mount.dragging = true;
  }

  function applyLiftDelta(mount, dx, dy) {
    camera.updateMatrixWorld();
    var e = camera.matrixWorld.elements;
    T.axR.set(e[0], e[1], e[2]).normalize(); /* camera right */
    T.axU.set(e[4], e[5], e[6]).normalize(); /* camera up */
    var k = 0.0075;
    T.q1.setFromAxisAngle(T.axU, dx * k);
    T.q2.setFromAxisAngle(T.axR, dy * k);
    T.q1.multiply(T.q2); /* world delta W */
    /* root has no rotation → premultiply directly */
    mount.spinner.quaternion.premultiply(T.q1);
    dirty = true;
    wake();
  }

  function startRelease(mount, now) {
    mount.lifting = false;
    mount.dragging = false;
    if (FZ.flags.reducedMotion) {
      mount.spinner.quaternion.copy(mount.restQ);
      mount.visual.position.y = mount.restY;
      mount.shadow.scale.set(mount.shadowBase.w, mount.shadowBase.l, 1);
      mount.shadow.material.opacity = 0.85;
      dirty = true;
      return;
    }
    releaseAnims.push({
      mount: mount,
      t0: now,
      dur: 600,
      q0: mount.spinner.quaternion.clone(),
      y0: mount.visual.position.y
    });
  }

  function breathe(now) {
    if (touched || FZ.flags.reducedMotion) return 0;
    return Math.sin(now * 0.00125 + breathPhase) * 0.45;
  }

  function updateLifts(now) {
    var anim = false;
    var br = breathe(now);
    var i;

    for (i = 0; i < MOUNT_TYPES.length; i++) {
      var m = mounts[MOUNT_TYPES[i]];
      if (!m) continue;
      if (m.lifting) {
        var target = m.restY + 8;
        var y = m.visual.position.y;
        var ny = y + (target - y) * 0.25;
        if (Math.abs(target - ny) > 0.01) anim = true;
        m.visual.position.y = ny;
      } else if (!hasRelease(m)) {
        var want = m.restY + br;
        if (Math.abs(m.visual.position.y - want) > 0.005) {
          m.visual.position.y = want;
          if (!touched) anim = true;
          else dirty = true;
        } else if (!touched && !FZ.flags.reducedMotion) {
          anim = true; /* keep breathing alive */
        }
      }

      /* shadow responds to lift height */
      var norm = U.clamp((m.visual.position.y - m.restY) / 8, 0, 1);
      m.shadow.scale.set(m.shadowBase.w * (1 - 0.12 * norm), m.shadowBase.l * (1 - 0.12 * norm), 1);
      m.shadow.material.opacity = 0.85 * (1 - 0.35 * norm);
    }

    for (i = releaseAnims.length - 1; i >= 0; i--) {
      var r = releaseAnims[i];
      var t = U.clamp((now - r.t0) / r.dur, 0, 1);
      var k = U.easeInOutCubic(t);
      r.mount.spinner.quaternion.copy(r.q0).slerp(r.mount.restQ, k);
      r.mount.visual.position.y = U.lerp(r.y0, r.mount.restY + br, k);
      anim = true;
      if (t >= 1) releaseAnims.splice(i, 1);
    }
    // A freely rotating long device can swing below its pivot. Support its
    // oriented bounds above the desk without clamping the rotation axes.
    for (i = 0; i < 2; i++) {
      var dev = mounts[MOUNT_TYPES[i]],
        d = dev.built.dims;
      if (dev.lifting || hasRelease(dev)) {
        T.q3.copy(dev.spinner.quaternion).multiply(dev.visual.quaternion);
        var q = T.q3;
        T.v3
          .set(0, d.h / 2, 0)
          .applyQuaternion(dev.visual.quaternion)
          .add(dev.visual.position)
          .applyQuaternion(dev.spinner.quaternion);
        var radiusY =
          (Math.abs(2 * (q.x * q.y + q.z * q.w)) * d.w +
            Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * d.h +
            Math.abs(2 * (q.y * q.z - q.x * q.w)) * d.l) /
          2;
        dev.spinner.position.y = Math.max(0, radiusY - T.v3.y);
      } else dev.spinner.position.y = 0;
    }
    var shake = FZ.os && now - FZ.os.findT0 < 2600 && !FZ.flags.reducedMotion;
    if (shake || mounts.flipper.spinner.position.x) {
      mounts.flipper.spinner.position.x = shake ? Math.sin(now * 0.052) * 1.4 : 0;
      anim = true;
    }
    return anim;
  }

  function hasRelease(m) {
    for (var i = 0; i < releaseAnims.length; i++) if (releaseAnims[i].mount === m) return true;
    return false;
  }

  /* ---------- beam ---------- */
  function buildBeam() {
    beamGroup = new THREE.Object3D();
    beamGroup.visible = false;

    beamLine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb060,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    beamLine.renderOrder = 5;
    beamGroup.add(beamLine);

    var pgeo = new THREE.PlaneGeometry(1.65, 1.65);
    for (var i = 0; i < 3; i++) {
      var p = new THREE.Mesh(
        pgeo,
        new THREE.MeshBasicMaterial({
          color: 0xffd9a8,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      p.renderOrder = 6;
      beamGroup.add(p);
      packets.push(p);
    }
    rig.add(beamGroup);
  }

  function updateBeam(now) {
    var st = FZ.link.get();
    var show = !!st.connected && !!mounts.flipper && !!mounts.phone;
    if (beamGroup.visible !== show) {
      beamGroup.visible = show;
      dirty = true;
      if (show) FZ.audio.beep(1320, 0.05, 0.05);
    }
    if (!show) return false;

    rig.updateMatrixWorld();
    // Link the facing chassis edges, not the middle of either live display.
    var f = mounts.flipper,
      p = mounts.phone,
      fd = f.built.dims,
      pd = p.built.dims;
    var a = f.visual.localToWorld(
      T.v1.set(portrait ? 0 : fd.w * 0.48, fd.h * 0.53, portrait ? fd.l * 0.49 : -fd.l * 0.22)
    );
    var b = p.visual.localToWorld(
      T.v2.set(portrait ? 0 : -pd.w * 0.5, pd.h * 0.55, portrait ? -pd.l * 0.49 : 0)
    );
    rig.worldToLocal(a);
    rig.worldToLocal(b);

    T.v3.subVectors(b, a);
    var len = T.v3.length();
    if (len < 1) return false;
    T.v4.copy(T.v3).multiplyScalar(1 / len); /* unit dir in rig space */

    beamLine.position.copy(a).addScaledVector(T.v4, len * 0.5);
    beamLine.scale.set(1, len, 1);
    T.q1.setFromUnitVectors(UP, T.v4);
    beamLine.quaternion.copy(T.q1);

    /* packets travel along the beam; billboard toward camera (rig space) */
    T.q2.copy(rig.quaternion).invert().multiply(camera.quaternion);
    var anim = !FZ.flags.reducedMotion;
    for (var i = 0; i < packets.length; i++) {
      var t = anim ? (now * 0.00045 + i / packets.length) % 1 : (i + 0.5) / packets.length;
      packets[i].position.copy(a).addScaledVector(T.v4, t * len);
      packets[i].quaternion.copy(T.q2);
    }
    return anim;
  }

  /* ---------- signal from 3D distance ---------- */
  function updateSignal(now) {
    if (now - lastSignalT < 120 && !dirty && !gesture && !releaseAnims.length) return;
    lastSignalT = now;
    if (!mounts.flipper || !mounts.phone) return;
    var a = mounts.flipper.screenMesh.getWorldPosition(T.v1);
    var b = mounts.phone.screenMesh.getWorldPosition(T.v2);
    var d = (distanceMM = a.distanceTo(b));
    var bars = d < 129 ? 4 : d < 145 ? 3 : d < 159 ? 2 : d < 194 ? 1 : 0;
    FZ.link.setSignal(bars);
  }

  /* ---------- pointer input ---------- */
  function onDown(e) {
    if (!ready) return;
    wake();
    try {
      canvasEl.setPointerCapture(e.pointerId);
    } catch (err) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    FZ.audio.unlock();
    touched = true;

    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      /* second finger down: abandon any lift, switch to pinch */
      if (gesture && gesture.pick && gesture.pick.mount && gesture.pick.mount.lifting) {
        startRelease(gesture.pick.mount, U.now());
      }
      var p0 = ptrs[ids[0]],
        p1 = ptrs[ids[1]];
      gesture = {
        mode: 'pinch',
        d0: Math.max(20, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
        r0: camState.rad
      };
      camTween = null;
      return;
    }
    if (ids.length > 2) return;

    var pk = pick(e);
    gesture = {
      mode: 'none',
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      moved: false,
      pick: pk
    };

    if (pk && pk.screen === 'phone') {
      gesture.mode = 'screen';
      var sc = screenCoords(pk, e);
      gesture.cx0 = sc.x;
      gesture.cy0 = sc.y;
      FZ.phone.pointer('down', sc.x, sc.y);
    } else if (pk && pk.part) {
      gesture.mode = 'part';
      /* Commit a click on release; dragging a button only lifts the device. */
    } else if (pk) {
      gesture.mode = 'liftMaybe';
    } else {
      gesture.mode = 'orbit';
      camTween = null;
    }
  }

  function onMove(e) {
    if (!ready) return;
    if (ptrs[e.pointerId]) {
      ptrs[e.pointerId].x = e.clientX;
      ptrs[e.pointerId].y = e.clientY;
    }
    if (!gesture) return;
    wake();

    if (gesture.mode === 'pinch') {
      var ids = Object.keys(ptrs);
      if (ids.length < 2) return;
      var p0 = ptrs[ids[0]],
        p1 = ptrs[ids[1]];
      var d = Math.max(20, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      camState.rad = U.clamp((gesture.r0 * gesture.d0) / d, 65, 900);
      applyCamera();
      dirty = true;
      wake();
      return;
    }

    if (e.pointerId !== gesture.id) return;
    var dx = e.clientX - gesture.lx,
      dy = e.clientY - gesture.ly;
    gesture.lx = e.clientX;
    gesture.ly = e.clientY;
    var tx = e.clientX - gesture.startX,
      ty = e.clientY - gesture.startY;
    var dist = Math.hypot(tx, ty);
    if (dist > 6) gesture.moved = true;

    switch (gesture.mode) {
      case 'orbit':
        camState.az -= dx * 0.006;
        camState.pol = U.clamp(camState.pol - dy * 0.006, 0.35, 1.45);
        applyCamera();
        dirty = true;
        break;

      case 'screen':
        if (gesture.moved) {
          var uvHit = pick(e);
          if (uvHit && uvHit.screen === 'phone') {
            var sc = screenCoords(uvHit, e);
            FZ.phone.pointer('move', sc.x, sc.y);
          }
        }
        break;

      case 'part':
      case 'liftMaybe':
        if (dist > 6 && gesture.pick) {
          startLift(gesture.pick.mount);
          gesture.mode = 'lift';
          applyLiftDelta(gesture.pick.mount, dx, dy);
        }
        break;

      case 'lift':
        if (gesture.pick) applyLiftDelta(gesture.pick.mount, dx, dy);
        break;
    }
  }

  function onUp(e) {
    if (!ready) return;
    delete ptrs[e.pointerId];
    if (!gesture) return;
    wake();

    if (gesture.mode === 'pinch') {
      var ids = Object.keys(ptrs);
      if (ids.length === 1) {
        var id = ids[0];
        gesture = {
          mode: 'orbit',
          id: Number(id),
          lx: ptrs[id].x,
          ly: ptrs[id].y,
          startX: ptrs[id].x,
          startY: ptrs[id].y,
          moved: false,
          pick: null
        };
      } else if (ids.length === 0) gesture = null;
      return;
    }

    if (e.pointerId !== gesture.id) return;
    var tx = e.clientX - gesture.startX,
      ty = e.clientY - gesture.startY;
    var dist = Math.hypot(tx, ty);

    if (gesture.mode === 'screen') {
      var sc;
      var hit = pick(e);
      if (hit && hit.screen === 'phone' && e.type !== 'pointercancel') {
        sc = screenCoords(hit, e);
        if (gesture.moved) FZ.phone.moved = true;
        FZ.phone.pointer('up', sc.x, sc.y);
      }
    } else if (gesture.mode === 'part' && !gesture.moved && e.type !== 'pointercancel') {
      FZ.input.fromPart(gesture.pick.mount.type, gesture.pick.part);
    } else if (gesture.mode === 'lift') {
      startRelease(gesture.pick.mount, U.now());
      if (dist < 6) maybeDoubleTap(e);
    } else if (gesture.mode === 'liftMaybe' && dist < 6) {
      maybeDoubleTap(e);
    } else if (gesture.mode === 'orbit' && dist < 6) {
      maybeDoubleTap(e);
    }

    gesture = null;
  }

  function maybeDoubleTap(e) {
    var t = U.now();
    if (
      t - lastTap.t < 320 &&
      Math.abs(e.clientX - lastTap.x) < 44 &&
      Math.abs(e.clientY - lastTap.y) < 44
    ) {
      lastTap.t = -1e9;
      tweenTo(presets(), 600);
    } else {
      lastTap.t = t;
      lastTap.x = e.clientX;
      lastTap.y = e.clientY;
    }
  }

  function onWheel(e) {
    if (!ready) return;
    e.preventDefault();
    camTween = null;
    var dy = U.clamp(e.deltaY, -160, 160);
    camState.rad = U.clamp(camState.rad * Math.exp(dy * 0.0016), 65, 900);
    applyCamera();
    wake();
    dirty = true;
  }

  /* ---------- resize / portrait ---------- */
  function pixelRatio() {
    var cap = FZ.flags.mobile ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function onResize() {
    if (!ready) return;
    var w = canvasEl.clientWidth,
      h = canvasEl.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    portrait = w / h < 0.98;
    for (var i = 0; i < 2; i++) {
      var type = MOUNT_TYPES[i],
        m = mounts[type],
        f = i === 0;
      m.root.position.set(
        portrait ? (f ? -4 : 3) : f ? -64 : 62,
        0,
        portrait ? (f ? -87 : 36) : f ? 30 : -16
      );
      updateYaw(m);
    }
    var p = presets();
    defaultRad = p.rad;
    tweenTo(p, 0);
    dirty = true;
    wake();
  }

  var scheduled = 0,
    heartbeat = 0;
  function wake() {
    if (!ready || scheduled || document.hidden) return;
    clearTimeout(heartbeat);
    scheduled = requestAnimationFrame(frame);
  }
  function frame(now) {
    scheduled = 0;
    if (!ready || document.hidden) return;
    var anim = false;

    if (updateCamTween(now)) anim = true;
    if (updateLifts(now)) anim = true;
    if (updatePress(now)) anim = true;
    if (updateBeam(now)) anim = true;
    updateSignal(now);

    if (FZ.phone) {
      mounts.phone.glow.visible = mounts.phone.pool.visible = !FZ.phone.off;
    }
    if (FZ.os) {
      var age = now - FZ.os.findT0;
      mounts.flipper.pool.material.opacity = age < 2600 ? 0.12 : 0.065;
    }
    if (FZ.os && FZ.os.tick) FZ.os.tick(now);
    if (FZ.phone && FZ.phone.tick) FZ.phone.tick(now);
    var tex = FZ.screenList.update(now);

    if (anim || tex || dirty) {
      dirty = false;
      renderer.render(scene, camera);
      updateOverlays();
    }
    if (anim || FZ.screenList.pending()) wake();
    else if (!scheduled)
      heartbeat = setTimeout(
        wake,
        Math.max(1, Math.min(FZ.os.nextWake(now), FZ.phone.nextWake(now)))
      );
  }

  // The inspector labels are projections, not fixed fake annotations.
  var axisAz = NaN,
    axisPol = NaN;
  var lastPixels = [NaN, NaN, NaN, NaN],
    tagEls = [],
    axisEls = [],
    scaleEl,
    zoomEl,
    trisEl,
    lastTris = -1,
    zoomPct = -1,
    defaultRad = 0,
    lastScale = -1;
  function updateOverlays() {
    var w = canvasEl.clientWidth,
      h = canvasEl.clientHeight;
    for (var i = 0; i < 2; i++) {
      var m = mounts[MOUNT_TYPES[i]],
        el = tagEls[i];
      if (!el) continue;
      T.v3.set(
        i && !portrait ? 24 : i ? 0 : -12,
        m.built.dims.h + 1,
        -m.built.dims.l * (i && !portrait ? 0.27 : 0.44)
      );
      m.visual.localToWorld(T.v3);
      T.v3.project(camera);
      var x = Math.round(((T.v3.x + 1) * w) / 2),
        y = Math.round(((1 - T.v3.y) * h) / 2);
      if (x !== lastPixels[i * 2] || y !== lastPixels[i * 2 + 1]) {
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        lastPixels[i * 2] = x;
        lastPixels[i * 2 + 1] = y;
      }
      el.hidden = layout !== 'both' || x < 55 || x > w - 50 || y < 55 || y > h - 20;
    }
    if (zoomEl) {
      var pct = Math.round((defaultRad / camState.rad) * 100);
      if (zoomPct !== pct) {
        zoomPct = pct;
        zoomEl.textContent = pct + '%';
      }
    }
    if (trisEl && lastTris !== renderer.info.render.triangles) {
      lastTris = renderer.info.render.triangles;
      trisEl.textContent = lastTris.toLocaleString('en-US') + ' triangles';
    }
    if (scaleEl) {
      T.v3.set(camState.tx, 0, camState.tz).project(camera);
      T.v4.set(camState.tx + 20, 0, camState.tz).project(camera);
      var scale = Math.round((Math.abs(T.v4.x - T.v3.x) * w) / 2);
      if (scale !== lastScale) {
        scaleEl.style.width = scale + 'px';
        lastScale = scale;
      }
    }
    if (axisEls.length && (axisAz !== camState.az || axisPol !== camState.pol)) {
      axisAz = camState.az;
      axisPol = camState.pol;
      T.q3.copy(camera.quaternion).invert();
      for (var j = 0; j < 3; j++) {
        T.v3.set(j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0).applyQuaternion(T.q3);
        axisEls[j].setAttribute('x2', 22 + T.v3.x * 18);
        axisEls[j].setAttribute('y2', 24 - T.v3.y * 18);
      }
    }
  }

  /* ---------- public API ---------- */
  FZ.scene = {
    init: function (opts) {
      canvasEl = opts.canvas;
      screens = { flipper: opts.flipper.screen, phone: opts.phone.screen };
      allocTemps();
      UP = new THREE.Vector3(0, 1, 0);

      var glOptions = {
        alpha: false,
        antialias: !FZ.flags.mobile,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance'
      };
      var context =
        canvasEl.getContext('webgl2', glOptions) || canvasEl.getContext('webgl', glOptions);
      if (!context) throw Error('No WebGL context was available.');
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        context: context,
        antialias: glOptions.antialias,
        alpha: false
      });
      /* Linear studio lighting; authored screen and desk textures are sRGB. */
      renderer.setClearColor(0x17151a, 1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.physicallyCorrectLights = true;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 1, 4000);
      raycaster = new THREE.Raycaster();
      ndc = new THREE.Vector2();

      /* low-key lighting: soft key + cool rim, no shadow maps */
      keyLight = new THREE.DirectionalLight(0xfff3e4, 2.35);
      keyLight.position.set(-125, 200, 95);
      rimLight = new THREE.DirectionalLight(0xd5deee, 1.55);
      rimLight.position.set(100, 130, -180);
      scene.add(keyLight, rimLight, new THREE.AmbientLight(0xc2c4ca, 0.44));

      /* desk with generated grain (no image files) */
      var desk = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshLambertMaterial({ map: deskTexture() })
      );
      desk.rotation.x = -Math.PI / 2;
      scene.add(desk);

      SHADOW_TEX = radialTexture('rgba(0,0,0,0.96)', 'rgba(0,0,0,0)');
      POOL_TEX = radialTexture('rgba(255,130,0,0.30)', 'rgba(255,130,0,0)');
      GLOW_TEX = radialTexture('rgba(255,150,40,0.55)', 'rgba(255,130,0,0)');
      FLAT_GEO = new THREE.PlaneGeometry(1, 1);

      rig = new THREE.Object3D();
      scene.add(rig);

      mounts.flipper = mountDevice('flipper', opts.flipper.built);
      mounts.phone = mountDevice('phone', opts.phone.built);
      buildBeam();

      /* initial camera */
      var p = presets();
      camState.az = p.az;
      camState.pol = p.pol;
      camState.rad = p.rad;
      camState.tx = p.tx;
      camState.ty = p.ty;
      camState.tz = p.tz;
      applyCamera();

      tagEls = [document.getElementById('label-flipper'), document.getElementById('label-phone')];
      scaleEl = document.getElementById('ruler');
      axisEls = document.querySelectorAll('#axes line');
      zoomEl = document.getElementById('zoom-value');
      trisEl = document.getElementById('scene-tris');
      window.addEventListener('resize', onResize);
      if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvasEl);
      document.addEventListener('visibilitychange', wake);
      canvasEl.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      canvasEl.addEventListener('wheel', onWheel, { passive: false });
      canvasEl.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
      });

      FZ.link.subscribe(function () {
        dirty = true;
        wake();
      });

      ready = true; /* must precede onResize — it sizes the renderer */
      onResize();
      dirty = true;
      wake();
    },

    setLayout: function (name) {
      layout = name;
      FZ.storage.set('layout', name);
      var p = presets();
      defaultRad = p.rad;
      tweenTo(p, 600);
    },

    getLayout: function () {
      return layout;
    },
    isPortrait: function () {
      return portrait;
    },

    setDevice: function (type, built) {
      var old = mounts[type];
      if (old) {
        rig.remove(old.root);
        disposeTree(old.root);
      }
      mounts[type] = mountDevice(type, built);
      onResize();
      dirty = true;
    },

    flashPart: flashPart,
    interact: function () {
      touched = true;
      wake();
    },
    wake: wake,
    markDirty: function () {
      dirty = true;
      wake();
    },
    zoom: function (factor) {
      camTween = null;
      camState.rad = U.clamp(camState.rad * factor, 65, 900);
      applyCamera();
      dirty = true;
      wake();
    },
    info: function () {
      return {
        ready: ready,
        triangles: renderer.info.render.triangles,
        frame: renderer.info.render.frame,
        radius: camState.rad,
        azimuth: camState.az,
        elevation: camState.pol,
        animating: !!camTween || !!releaseAnims.length || !!pressAnims.length,
        dragging: !!gesture && gesture.mode,
        signalDistance: distanceMM,
        beam: beamGroup.visible
      };
    },
    device: function (type) {
      return mounts[type].built;
    },
    project: function (type, point) {
      var m = mounts[type];
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      T.v4.fromArray(point);
      m.visual.localToWorld(T.v4);
      T.v4.project(camera);
      var r = canvasEl.getBoundingClientRect();
      return { x: r.left + ((T.v4.x + 1) * r.width) / 2, y: r.top + ((1 - T.v4.y) * r.height) / 2 };
    },
    resetView: function () {
      tweenTo(presets(), 600);
    },

    /* CSS pixel picking for inspection and interaction verification. */
    pickAt: function (cx, cy) {
      if (!ready) return null;
      return pick({ clientX: cx, clientY: cy });
    }
  };
})();

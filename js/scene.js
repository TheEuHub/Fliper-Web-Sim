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
  var ready = false, dirty = true;
  var rig;
  var screens = null; /* {flipper: Screen, phone: Screen} — canvas textures for the quads */
  var mounts = {};
  var beamGroup, beamLine, packets = [];
  var camState = { az: 0.78, pol: 0.98, rad: 310, tx: -8, ty: 16, tz: 0 };
  var camTween = null;
  var layout = 'both', portrait = false;
  var touched = false, breathPhase = 0;
  var pressAnims = [];
  var releaseAnims = [];
  var ptrs = {};
  var gesture = null;
  var lastTap = { t: -1e9, x: 0, y: 0 };
  var lastSignalT = 0;
  var keyLight, rimLight;
  var MOUNT_TYPES = ['flipper', 'phone'];

  /* shared assets */
  var SHADOW_TEX, POOL_TEX, GLOW_TEX, FLAT_GEO;

  /* per-frame temps (no allocations in the loop) */
  var T = {
    v1: null, v2: null, v3: null, v4: null,
    q1: null, q2: null, q3: null,
    axU: null, axR: null
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
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  }

  function deskTexture() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var x = cv.getContext('2d');
    x.fillStyle = '#17151A';
    x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 9000; i++) {
      var a = 0.015 + Math.random() * 0.04;
      x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + (a * 0.45) + ')';
      x.fillRect((Math.random() * 256) | 0, (Math.random() * 256) | 0, 1, 1);
    }
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(9, 7);
    return t;
  }

  /* ---------- layout ---------- */
  function presets() {
    if (layout === 'flipper') {
      return portrait
        ? { az: 0.35, pol: 0.95, rad: 200, tx: 0, ty: 14, tz: -70 }
        : { az: 0.70, pol: 0.92, rad: 180, tx: -70, ty: 14, tz: 0 };
    }
    if (layout === 'phone') {
      return portrait
        ? { az: -0.25, pol: 0.95, rad: 210, tx: 0, ty: 10, tz: 50 }
        : { az: 0.95, pol: 0.92, rad: 200, tx: 50, ty: 8, tz: 0 };
    }
    return portrait
      ? { az: 0.12, pol: 1.02, rad: 370, tx: 0, ty: 14, tz: -10 }
      : { az: 0.78, pol: 0.98, rad: 310, tx: -8, ty: 16, tz: 0 };
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
      camState.az = p.az; camState.pol = p.pol; camState.rad = p.rad;
      camState.tx = p.tx; camState.ty = p.ty; camState.tz = p.tz;
      camTween = null;
      applyCamera();
      dirty = true;
      return;
    }
    camTween = {
      t0: U.now(), dur: durMs,
      from: { az: camState.az, pol: camState.pol, rad: camState.rad, tx: camState.tx, ty: camState.ty, tz: camState.tz },
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
  function yawQuat(yaw) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  }

  function updateYaw(mount) {
    var yaw = mount.baseYaw + (portrait ? Math.PI / 2 : 0);
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
      baseYaw: isF ? -0.13 : 0.10,
      lifting: false,
      dragging: false
    };

    mount.root = new THREE.Object3D();
    mount.root.position.set(isF ? -70 : 50, 0, 0);
    rig.add(mount.root);

    mount.spinner = new THREE.Object3D();
    mount.root.add(mount.spinner);

    mount.visual = built.group;
    mount.restY = (built.dims.l / 2) * Math.sin(built.tilt || 0);
    mount.visual.position.y = mount.restY;
    mount.visual.rotation.x = built.tilt || 0;
    mount.spinner.add(mount.visual);

    /* baked radial contact shadow (no shadow maps) */
    mount.shadow = new THREE.Mesh(FLAT_GEO, new THREE.MeshBasicMaterial({
      map: SHADOW_TEX, transparent: true, depthWrite: false, opacity: 0.85
    }));
    mount.shadow.position.y = 0.35;
    mount.shadow.renderOrder = 2;
    mount.shadow.scale.set(built.dims.w + 24, built.dims.l + 24, 1);
    mount.shadowBase = { w: built.dims.w + 24, l: built.dims.l + 24 };
    mount.root.add(mount.shadow);

    /* faint orange light pool from the screen */
    mount.pool = new THREE.Mesh(FLAT_GEO, new THREE.MeshBasicMaterial({
      map: POOL_TEX, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.5
    }));
    mount.pool.position.y = 0.25;
    mount.pool.renderOrder = 1;
    mount.pool.scale.set(built.dims.w + 110, built.dims.l + 110, 1);
    mount.root.add(mount.pool);

    /* glow halo over the screen (moves with the device) */
    var sp = built.manifest.screen.position, ss = built.manifest.screen.size;
    mount.glow = new THREE.Mesh(FLAT_GEO, new THREE.MeshBasicMaterial({
      map: GLOW_TEX, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.55
    }));
    mount.glow.position.set(sp[0], sp[1] + 0.6, sp[2]);
    mount.glow.rotation.x = -Math.PI / 2;
    mount.glow.scale.set(ss[0] * 1.9, ss[1] * 2.2, 1);
    mount.glow.material.opacity = 0.4;
    mount.glow.renderOrder = 4;
    mount.glow.userData.noRay = true;
    mount.visual.add(mount.glow);

    mount.parts = built.parts;
    mount.tiltGroups = built.tiltGroups || {};
    mount.screenMesh = built.screen;

    /* bind the live canvas texture to the screen quad */
    var scr = screens && screens[type];
    if (scr) {
      mount.screenMesh.material.map = scr.texture;
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
    var h = null, i;
    for (i = 0; i < hits.length; i++) {
      if (!hits[i].object.userData.noRay) { h = hits[i]; break; }
    }
    if (!h) return null;

    var obj = h.object, m = null, o = obj;
    while (o) {
      if (o === mounts.flipper.visual) { m = mounts.flipper; break; }
      if (o === mounts.phone.visual) { m = mounts.phone; break; }
      o = o.parent;
    }
    if (!m) return null;

    var part = null, p = obj;
    while (p && p !== m.visual) {
      if (p.userData && p.userData.part) { part = p.userData.part; break; }
      p = p.parent;
    }
    var screen = (obj.userData && obj.userData.screen) || null;
    return { mount: m, part: part, screen: screen, uv: h.uv };
  }

  function screenCoords(p, e) {
    /* hit UV → phone canvas pixels */
    var r = canvasEl.getBoundingClientRect();
    var x, y;
    if (p && p.uv) { x = p.uv.x * 360; y = (1 - p.uv.y) * 760; }
    else { x = 180; y = 380; }
    return { x: x, y: y, scale: 360 / r.width };
  }

  /* ---------- button press animations ---------- */
  function flashPart(type, key) {
    var m = mounts[type];
    if (!m) return;
    var name = key;
    if (type === 'flipper' && (key === 'up' || key === 'down' || key === 'left' || key === 'right')) {
      name = 'dpad_' + key;
    }
    var node = m.parts[name];
    var man = m.built.manifest.buttons[name];
    if (!node || !man) return;

    var i;
    if (man.mode === 'tilt') {
      for (i = pressAnims.length - 1; i >= 0; i--) {
        if (pressAnims[i].mount === m && pressAnims[i].mode === 'tilt') pressAnims.splice(i, 1);
      }
      m.tiltGroups.dpad.quaternion.identity();
      var av = new THREE.Vector3(man.tiltAxis[0], man.tiltAxis[1], man.tiltAxis[2]).normalize();
      pressAnims.push({
        mount: m, mode: 'tilt', group: m.tiltGroups.dpad, glow: node,
        axisV: av, angle: man.tiltAngle, t0: U.now()
      });
    } else {
      for (i = pressAnims.length - 1; i >= 0; i--) {
        if (pressAnims[i].node === node) { node.position.y = pressAnims[i].baseY; pressAnims.splice(i, 1); }
      }
      pressAnims.push({
        mount: m, mode: 'slide', node: node, glow: node,
        bx: node.position.x, baseY: node.position.y, bz: node.position.z,
        dy: man.axis[1] * man.travel,
        t0: U.now()
      });
    }
  }

  function updatePress(now) {
    var active = false;
    for (var i = pressAnims.length - 1; i >= 0; i--) {
      var a = pressAnims[i];
      var el = now - a.t0;
      if (el >= 280) {
        if (a.mode === 'slide') a.node.position.set(a.bx, a.baseY, a.bz);
        else a.group.quaternion.identity();
        setFlash(a.glow, 0);
        pressAnims.splice(i, 1);
        continue;
      }
      active = true;
      var k = smooth(pressK(a, el));
      setFlash(a.glow, 0.55 * k);
      if (a.mode === 'slide') {
        a.node.position.set(a.bx, a.baseY + a.dy * k, a.bz);
      } else {
        a.group.quaternion.setFromAxisAngle(a.axisV, a.angle * k);
      }
    }
    return active;
  }

  function pressK(a, el) {
    if (el < 90) return el / 90;
    return 1 - (el - 90) / 190;
  }

  function smooth(t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  /* invisible hit proxies (official model) flash orange while pressed */
  function setFlash(node, v) {
    if (!node || !node.material || !node.material.userData || !node.material.userData.flash) return;
    node.material.opacity = v;
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
    T.axR.set(e[0], e[1], e[2]).normalize();   /* camera right */
    T.axU.set(e[4], e[5], e[6]).normalize();   /* camera up */
    var k = 0.0075;
    T.q1.setFromAxisAngle(T.axU, dx * k);
    T.q2.setFromAxisAngle(T.axR, dy * k);
    T.q1.multiply(T.q2);                        /* world delta W */
    /* root has no rotation → premultiply directly */
    mount.spinner.quaternion.premultiply(T.q1);
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
      mount: mount, t0: now, dur: 600,
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
        } else if (!touched) {
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
      new THREE.CylinderGeometry(0.4, 0.4, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xFFB060, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    beamLine.renderOrder = 5;
    beamGroup.add(beamLine);

    var pgeo = new THREE.PlaneGeometry(2.2, 2.2);
    for (var i = 0; i < 3; i++) {
      var p = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({
        color: 0xFFD9A8, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
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
    var a = mounts.flipper.screenMesh.getWorldPosition(T.v1);
    var b = mounts.phone.screenMesh.getWorldPosition(T.v2);
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
      var t = anim ? ((now * 0.00045) + i / packets.length) % 1 : (i + 0.5) / packets.length;
      packets[i].position.copy(a).addScaledVector(T.v4, t * len);
      packets[i].quaternion.copy(T.q2);
    }
    return anim;
  }

  /* ---------- signal from 3D distance ---------- */
  function updateSignal(now) {
    if (now - lastSignalT < 500) return;
    lastSignalT = now;
    if (!mounts.flipper || !mounts.phone) return;
    var a = mounts.flipper.screenMesh.getWorldPosition(T.v1);
    var b = mounts.phone.screenMesh.getWorldPosition(T.v2);
    var d = a.distanceTo(b);
    var bars = d < 170 ? 4 : d < 240 ? 3 : d < 340 ? 2 : d < 460 ? 1 : 0;
    FZ.link.setSignal(bars);
  }

  /* ---------- pointer input ---------- */
  function onDown(e) {
    if (!ready) return;
    try { canvasEl.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    FZ.audio.unlock();
    touched = true;

    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      /* second finger down: abandon any lift, switch to pinch */
      if (gesture && gesture.pick && gesture.pick.mount && gesture.pick.mount.lifting) {
        startRelease(gesture.pick.mount, U.now());
      }
      var p0 = ptrs[ids[0]], p1 = ptrs[ids[1]];
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
      mode: 'none', id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      lx: e.clientX, ly: e.clientY,
      moved: false, pick: pk
    };

    if (pk && pk.screen === 'phone') {
      gesture.mode = 'screen';
      var sc = screenCoords(pk, e);
      gesture.cx0 = sc.x; gesture.cy0 = sc.y; gesture.scale = sc.scale;
      FZ.phone.pointer('down', sc.x, sc.y);
    } else if (pk && pk.part) {
      gesture.mode = 'part';
      FZ.input.fromPart(pk.mount.type, pk.part);
    } else if (pk) {
      gesture.mode = 'liftMaybe';
    } else {
      gesture.mode = 'orbit';
      camTween = null;
    }
  }

  function onMove(e) {
    if (!ready) return;
    if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
    if (!gesture) return;

    if (gesture.mode === 'pinch') {
      var ids = Object.keys(ptrs);
      if (ids.length < 2) return;
      var p0 = ptrs[ids[0]], p1 = ptrs[ids[1]];
      var d = Math.max(20, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      camState.rad = U.clamp(gesture.r0 * gesture.d0 / d, 120, 700);
      dirty = true;
      return;
    }

    if (e.pointerId !== gesture.id) return;
    var dx = e.clientX - gesture.lx, dy = e.clientY - gesture.ly;
    gesture.lx = e.clientX; gesture.ly = e.clientY;
    var tx = e.clientX - gesture.startX, ty = e.clientY - gesture.startY;
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
          FZ.phone.pointer('move', gesture.cx0 + tx * gesture.scale, gesture.cy0 + ty * gesture.scale);
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

    if (gesture.mode === 'pinch') {
      var ids = Object.keys(ptrs);
      if (ids.length === 1) {
        var id = ids[0];
        gesture = {
          mode: 'orbit', id: id,
          lx: ptrs[id].x, ly: ptrs[id].y,
          startX: ptrs[id].x, startY: ptrs[id].y, moved: false, pick: null
        };
      } else if (ids.length === 0) gesture = null;
      return;
    }

    if (e.pointerId !== gesture.id) return;
    var tx = e.clientX - gesture.startX, ty = e.clientY - gesture.startY;
    var dist = Math.hypot(tx, ty);

    if (gesture.mode === 'screen') {
      var sc = { x: gesture.cx0 + tx * gesture.scale, y: gesture.cy0 + ty * gesture.scale };
      FZ.phone.pointer('up', sc.x, sc.y);
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
    if (t - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 44 && Math.abs(e.clientY - lastTap.y) < 44) {
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
    camState.rad = U.clamp(camState.rad * Math.exp(dy * 0.0016), 120, 700);
    dirty = true;
  }

  /* ---------- resize / portrait ---------- */
  function pixelRatio() {
    var cap = FZ.flags.mobile ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  function onResize() {
    if (!ready) return;
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    var wantPortrait = (w / h) < 0.85;
    if (wantPortrait !== portrait) {
      portrait = wantPortrait;
      rig.rotation.y = portrait ? -Math.PI / 2 : 0;
      var types = ['flipper', 'phone'];
      for (var i = 0; i < types.length; i++) if (mounts[types[i]]) updateYaw(mounts[types[i]]);
      tweenTo(presets(), 500);
    }
    dirty = true;
  }

  /* ---------- frame loop ---------- */
  function frame(now) {
    if (!ready) return;
    requestAnimationFrame(frame);
    var anim = false;

    if (updateCamTween(now)) anim = true;
    if (updateLifts(now)) anim = true;
    if (updatePress(now)) anim = true;
    if (updateBeam(now)) anim = true;
    updateSignal(now);

    if (FZ.os && FZ.os.tick) FZ.os.tick(now);
    if (FZ.phone && FZ.phone.tick) FZ.phone.tick(now);
    var tex = FZ.screenList.update(now);

    if (anim || tex || dirty) {
      dirty = false;
      renderer.render(scene, camera);
    }
  }

  /* ---------- public API ---------- */
  FZ.scene = {
    init: function (opts) {
      canvasEl = opts.canvas;
      screens = { flipper: opts.flipper.screen, phone: opts.phone.screen };
      allocTemps();
      UP = new THREE.Vector3(0, 1, 0);

      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        antialias: !FZ.flags.mobile,
        alpha: false,
        powerPreference: 'high-performance'
      });
      /* default LinearEncoding: authored colors (LCD #FF8200 etc) render as-is */
      renderer.setClearColor(0x0B0B0D, 1);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
      raycaster = new THREE.Raycaster();
      ndc = new THREE.Vector2();

      /* low-key lighting: soft key + cool rim, no shadow maps */
      keyLight = new THREE.DirectionalLight(0xFFF2E4, 0.9);
      keyLight.position.set(140, 220, 90);
      rimLight = new THREE.DirectionalLight(0x9FB4FF, 0.35);
      rimLight.position.set(-160, 120, -180);
      scene.add(keyLight, rimLight, new THREE.AmbientLight(0x2A2A33, 0.55));

      /* desk with generated grain (no image files) */
      var desk = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 800),
        new THREE.MeshStandardMaterial({ map: deskTexture(), roughness: 0.96, metalness: 0 })
      );
      desk.rotation.x = -Math.PI / 2;
      scene.add(desk);

      SHADOW_TEX = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
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
      camState.az = p.az; camState.pol = p.pol; camState.rad = p.rad;
      camState.tx = p.tx; camState.ty = p.ty; camState.tz = p.tz;
      applyCamera();

      window.addEventListener('resize', onResize);
      canvasEl.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      canvasEl.addEventListener('wheel', onWheel, { passive: false });
      canvasEl.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

      FZ.link.subscribe(function () { dirty = true; });

      ready = true;   /* must precede onResize — it sizes the renderer */
      onResize();
      dirty = true;
      requestAnimationFrame(frame);
    },

    setLayout: function (name) {
      layout = name;
      FZ.storage.set('layout', name);
      tweenTo(presets(), 700);
    },

    getLayout: function () { return layout; },
    isPortrait: function () { return portrait; },

    setDevice: function (type, built) {
      var old = mounts[type];
      if (old) { rig.remove(old.root); disposeTree(old.root); }
      mounts[type] = mountDevice(type, built);
      if (portrait) updateYaw(mounts[type]);
      dirty = true;
    },

    flashPart: flashPart,
    markDirty: function () { dirty = true; },
    resetView: function () { tweenTo(presets(), 600); },

    /* Side-effect-free pick at CSS pixel coords (used by calibration in S2
       and FZ.selfTest in S6). Returns {mount, part, screen, uv} or null. */
    pickAt: function (cx, cy) {
      if (!ready) return null;
      return pick({ clientX: cx, clientY: cy });
    }
  };
})();

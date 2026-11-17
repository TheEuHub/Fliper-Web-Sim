/* Optional QA, not a runtime dependency. See README for the temporary runner. */
'use strict';
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const output = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'flipper-lab-qa'));
const url = pathToFileURL(path.join(root, 'index.html')).href;
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fz-sd-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [],
  errors = [],
  remote = [],
  resources = new Set();
let browser, p;
function ok(label, detail) {
  checks.push(label);
  console.log('PASS', label, detail || '');
}
const ready = () =>
  p.waitForFunction(() => window.FZ?.scene?.info().ready && FZ.os.state === 'home');
async function stable() {
  await p.waitForFunction(() => !FZ.scene.info().animating);
  await sleep(60);
}
async function layout(s) {
  await p.click('[data-layout="' + s + '"]');
  await stable();
}
async function screenPoint(x, y) {
  return p.evaluate(
    (x, y) => {
      const s = FZ.scene.device('phone').manifest.screen;
      return FZ.scene.project('phone', [
        s.position[0] + (x / 360 - 0.5) * s.size[0],
        s.position[1],
        s.position[2] + (y / 760 - 0.5) * s.size[1]
      ]);
    },
    x,
    y
  );
}
async function phoneTap(label) {
  await p.waitForFunction(
    (label) => FZ.phone.hits.some((h) => h.label === label && h.h > 0),
    {},
    label
  );
  const h = await p.evaluate((l) => {
      const h = FZ.phone.hits.find((h) => h.label === l && h.h > 0);
      return [h.x + h.w / 2, h.y + h.h / 2];
    }, label),
    pnt = await screenPoint(...h);
  assert.equal(
    await p.evaluate((v) => FZ.scene.pickAt(v.x, v.y)?.screen, pnt),
    'phone',
    'UV hit: ' + label
  );
  await p.mouse.click(pnt.x, pnt.y);
}
async function part(type, name, touch = false) {
  const v = await p.evaluate(
    (t, k) => {
      let m = FZ.scene.device(t).manifest.buttons[k],
        pos = m.position.slice();
      if (t === 'phone') pos[0] -= 0.69;
      return FZ.scene.project(t, pos);
    },
    type,
    name
  );
  assert.equal(
    await p.evaluate((v) => FZ.scene.pickAt(v.x, v.y)?.part, v),
    name,
    'raycast: ' + name
  );
  if (touch) await p.touchscreen.tap(v.x, v.y);
  else await p.mouse.click(v.x, v.y);
}
async function observePart(key) {
  await p.evaluate((k) => {
    const d = FZ.scene.device('flipper'),
      tilt = k.startsWith('dpad'),
      base = d.parts[k].position.clone(),
      deadline = performance.now() + 1800;
    window.qaMotion = false;
    function sample() {
      if (
        (tilt
          ? Math.abs(d.tiltGroups.dpad.quaternion.w - 1)
          : d.parts[k].position.distanceTo(base)) > 0.00005
      )
        window.qaMotion = true;
      else if (performance.now() < deadline) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, key);
  await part('flipper', key);
  await p.waitForFunction(() => window.qaMotion);
  await stable();
}
async function shot(file, selector) {
  const opts = { path: path.join(output, file), type: 'jpeg', quality: 92 };
  if (selector) {
    await (await p.$(selector)).screenshot(opts);
  } else await p.screenshot(opts);
}
async function saveCanvas(name, side) {
  const bin = await p.evaluate(
    (side) => FZ[side].screen.canvas.toDataURL('image/png').split(',')[1],
    side
  );
  fs.writeFileSync(path.join(output, name), Buffer.from(bin, 'base64'));
}
async function reset() {
  await p.click('#btn-storage');
  await p.click('#btn-reset');
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('#confirm-action')]);
  await ready();
}
async function displayState() {
  if (!p || p.isClosed()) return;
  console.error(
    'State:',
    await p
      .evaluate(() => ({
        os: FZ.os.state,
        phone: FZ.phone.state,
        path: FZ.phone.path,
        hits: FZ.phone.hits.map((h) => h.label),
        view: FZ.scene.info()
      }))
      .catch(() => null)
  );
  await p.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
}
(async () => {
  const args = ['--disable-dev-shm-usage'];
  if (process.env.FZ_SOFTWARE_GL)
    args.push(
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist'
    );
  if (process.env.FZ_NO_SANDBOX)
    args.push('--no-sandbox', '--disable-setuid-sandbox', '--no-zygote');
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN,
    args,
    headless: true,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
  });
  p = await browser.newPage();
  p.setDefaultTimeout(8500);
  await p.setOfflineMode(true);
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  p.on('request', (r) => {
    let u = r.url();
    if (!/^(file:|data:|blob:)/.test(u)) remote.push(u);
    else if (u.startsWith('file:')) resources.add(u.split('?')[0]);
  });
  await p.goto(url);
  await ready();
  await stable();
  assert.equal(await p.evaluate(() => THREE.REVISION), '128');
  assert.equal(await p.$eval('#btn-sound', (n) => n.getAttribute('aria-pressed')), 'false');
  await shot('desk.jpg');
  await saveCanvas('flipper-lcd.png', 'os');
  const tris = await p.evaluate(() => FZ.scene.info().triangles);
  ok('Offline file URL boot, official mesh, local screens', tris + ' scene triangles');
  await p.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });
  await stable();
  await p.click('#btn-help');
  await p.keyboard.press('Escape');
  assert(await p.$eval('#modal', (n) => n.hidden));
  await p.click('#btn-debug');
  await p.click('#dbg-ping');
  await p.waitForFunction(() => FZ.link.get().rtt > 0);
  await p.select('#dbg-loss', '0.1');
  assert.equal(await p.evaluate(() => FZ.link.get().loss), 0.1);
  await p.select('#dbg-loss', '0');
  await p.keyboard.press('Escape');
  ok('Help, debug ping, packet-loss toggle');
  await observePart('ok');
  assert.equal(await p.evaluate(() => FZ.os.state), 'menu');
  await observePart('dpad_down');
  assert.equal(await p.evaluate(() => FZ.os.selection), 1);
  await observePart('dpad_up');
  assert.equal(await p.evaluate(() => FZ.os.selection), 0);
  await observePart('back');
  assert.equal(await p.evaluate(() => FZ.os.state), 'home');
  await observePart('dpad_right');
  assert.equal(await p.evaluate(() => FZ.os.state), 'settings');
  await part('flipper', 'back');
  await stable();
  await observePart('dpad_left');
  assert.equal(await p.evaluate(() => FZ.os.state), 'apps');
  await part('flipper', 'back');
  ok('All six raycast controls drive the OS and physically tilt/depress');
  const desk = await p.$eval('#gl', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + 18, y: r.top + r.height * 0.5 };
  });
  let before = await p.evaluate(() => FZ.scene.info());
  await p.mouse.move(desk.x, desk.y);
  await p.mouse.down();
  await p.mouse.move(desk.x + 46, desk.y + 9, { steps: 4 });
  await p.mouse.up();
  assert.notEqual(await p.evaluate(() => FZ.scene.info().azimuth), before.azimuth);
  await p.mouse.wheel({ deltaY: 95 });
  await p.waitForFunction((r) => Math.abs(FZ.scene.info().radius - r) > 1, {}, before.radius);
  await p.mouse.click(desk.x, desk.y);
  await p.mouse.click(desk.x, desk.y);
  await stable();
  assert(Math.abs((await p.evaluate(() => FZ.scene.info().radius)) - before.radius) < 0.01);
  ok('Desk orbit, wheel zoom, double-click reset');
  let bodyPoint = await p.evaluate(() => FZ.scene.project('flipper', [-33, 25, 6]));
  await p.mouse.move(bodyPoint.x, bodyPoint.y);
  await p.mouse.down();
  await p.mouse.move(bodyPoint.x + 44, bodyPoint.y - 16, { steps: 5 });
  await p.waitForFunction(() => FZ.scene.info().dragging === 'lift');
  await sleep(110);
  await p.mouse.up();
  await stable();
  let restored = await p.evaluate(() => FZ.scene.project('flipper', [-33, 25, 6]));
  assert(Math.hypot(restored.x - bodyPoint.x, restored.y - bodyPoint.y) < 1);
  ok('Body lift, free rotation and eased return');
  await part('phone', 'power');
  assert(await p.evaluate(() => FZ.phone.off));
  await stable();
  await part('phone', 'power');
  assert(!(await p.evaluate(() => FZ.phone.off)));
  await part('phone', 'vol_up');
  assert(await p.evaluate(() => FZ.audio.getVolume() > 0.5));
  await part('phone', 'vol_down');
  ok('3D power/sleep/wake and both volume clickers');
  let t = Date.now();
  await phoneTap('Scan for devices');
  await phoneTap('Flipper Zero');
  await p.waitForFunction(() => FZ.phone.state === 'pin' && FZ.os.state === 'pair');
  assert(await p.evaluate(() => /^\d{6}$/.test(FZ.phone.pin) && FZ.phone.pin === FZ.os.pin));
  await phoneTap('Confirm pairing');
  await p.waitForFunction(() => FZ.phone.info && FZ.scene.info().beam);
  const pairMs = Date.now() - t;
  ok('Phone UV tap → scan → pick → matching PIN → connected beam', pairMs + ' ms');
  await shot('connected.jpg');
  await saveCanvas('phone-dashboard.png', 'phone');
  await layout('phone');
  await phoneTap('Archive');
  await p.waitForFunction(() => FZ.phone.entries?.length > 0);
  let from = await screenPoint(170, 535),
    to = await screenPoint(170, 241);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y, { steps: 7 });
  await p.mouse.up();
  assert(await p.evaluate(() => FZ.phone.scroll > 0));
  await phoneTap('subghz');
  await p.waitForFunction(() => FZ.phone.path === '/ext/subghz' && FZ.phone.entries?.length === 0);
  ok('Archive categories and UV drag-scroll (not an accidental tap)');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => FZ.os.state === 'result');
  t = Date.now();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => FZ.phone.entries?.length === 1, { polling: 25 });
  const saveMs = Date.now() - t;
  assert(saveMs < 1000);
  const saved = await p.evaluate(() => FZ.phone.entries[0].name);
  ok('Keyboard Sub-GHz capture saved on Flipper → phone Archive', saveMs + ' ms');
  await p.evaluate(() => FZ.os.home());
  await p.keyboard.press('ArrowRight');
  await p.keyboard.press('Enter');
  await p.keyboard.type('Echo Lab');
  t = Date.now();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => FZ.phone.info?.name === 'Echo Lab', { polling: 25 });
  const renameMs = Date.now() - t;
  assert(renameMs < 1000);
  ok('Flipper Settings rename → phone', renameMs + ' ms');
  await phoneTap('Actions: ' + saved);
  await phoneTap('Rename');
  for (let i = 0; i < saved.length; i++) await p.keyboard.press('Backspace');
  await p.keyboard.type('fieldlog.sub');
  await phoneTap('Save name');
  await p.waitForFunction(
    () =>
      FZ.fs.exists('/ext/subghz/fieldlog.sub') &&
      FZ.phone.entries?.some((e) => e.name === 'fieldlog.sub')
  );
  await p.evaluate(() => {
    FZ.os.home();
    FZ.os.ui.browser('/ext/subghz');
  });
  await phoneTap('Actions: fieldlog.sub');
  await phoneTap('Delete');
  await phoneTap('Delete from SD');
  await p.waitForFunction(
    () =>
      !FZ.fs.exists('/ext/subghz/fieldlog.sub') &&
      FZ.os.currentPath === '/ext/subghz' &&
      FZ.phone.entries?.length === 0
  );
  ok('Phone rename and confirmed delete → open Flipper file manager');
  await phoneTap('Device');
  await p.click('#btn-sound');
  await p.evaluate(() => {
    let alarm = FZ.audio.alarm;
    FZ.audio.alarm = function () {
      window.qaAlarm = true;
      alarm();
    };
  });
  await phoneTap('Find my Flipper');
  await p.waitForFunction(() => window.qaAlarm);
  const find = await p.evaluate(async () => {
    let shades = new Set(),
      shake = false,
      start = performance.now();
    while (performance.now() - start < 1750) {
      shades.add(FZ.os.screen.ctx.getImageData(0, 0, 1, 1).data[0]);
      if (Math.abs(FZ.scene.device('flipper').group.parent.position.x) > 0.1) shake = true;
      await new Promise((r) => setTimeout(r, 65));
    }
    return [shades.size, shake];
  });
  assert(find[0] > 1 && find[1], 'Find outputs: ' + JSON.stringify(find));
  ok('Find My Flipper: LCD flash, synthesized alarm invocation, 3D shake');
  await phoneTap('Firmware update');
  await phoneTap('Install local update');
  await p.waitForFunction(() => FZ.os.state === 'update');
  const phases = await p.evaluate(async () => {
    let seen = new Set(),
      start = Date.now();
    while (Date.now() - start < 7600) {
      if (FZ.os.update) seen.add(FZ.os.update.stage);
      if (FZ.os.state === 'boot') seen.add('Boot');
      if (FZ.phone.info?.firmware === '1.1.0-sim' && FZ.os.state === 'home') break;
      await new Promise((r) => setTimeout(r, 60));
    }
    return Array.from(seen);
  });
  assert(
    ['Checking', 'Downloading', 'Uploading', 'Rebooting', 'Boot'].every((s) => phases.includes(s))
  );
  assert.equal(await p.evaluate(() => FZ.phone.info.firmware), '1.1.0-sim');
  ok('Four firmware phases, Flipper reboot, updated RPC dashboard');
  const tools = await p.evaluate(() => {
    const folders = ['subghz', 'lfrfid', 'nfc', 'infrared', 'gpio', 'ibutton', 'badusb', 'u2f'];
    return folders.map((folder, i) => {
      let n = FZ.fs.list('/ext/' + folder).length;
      FZ.os.home();
      const key = (k) => FZ.os.onKey(k);
      key('ok');
      for (let j = 0; j < i; j++) key('down');
      key('ok');
      key('ok');
      if ([0, 1, 2, 5].includes(i)) FZ.os.tick(performance.now() + 1300);
      if ([1, 2, 3, 6, 7].includes(i)) key('ok');
      if (i === 5) key('right');
      if (i === 3 || i === 4) {
        key('right');
        key('ok');
        key('down');
      } else if (i === 6) {
        for (let k = 0; k < 5; k++) key('ok');
      } else key('ok');
      return FZ.os.state === 'note' && FZ.fs.list('/ext/' + folder).length > n;
    });
  });
  assert(tools.every(Boolean));
  ok('All eight toy instruments produce saved records');
  const apps = await p.evaluate(() => {
    FZ.os.home();
    FZ.mini.open(2);
    let a = FZ.os.state;
    FZ.os.onKey('ok');
    FZ.os.home();
    FZ.mini.open(3);
    FZ.os.onKey('ok');
    FZ.os.onKey('ok');
    let b = FZ.os.state;
    FZ.os.home();
    FZ.mini.open(4);
    FZ.os.onKey('right');
    FZ.os.onKey('ok');
    let m = FZ.os.state;
    FZ.os.home();
    return [a, b, m];
  });
  assert.deepEqual(apps, ['clock', 'hex', 'music']);
  ok('Clock, file hex viewer, music transport');
  await layout('both');
  const perf = await p.evaluate(async () => {
    let n = FZ.scene.info().frame,
      t = performance.now();
    await new Promise((r) => setTimeout(r, 1250));
    return Math.round(((FZ.scene.info().frame - n) * 1000) / (performance.now() - t));
  });
  await p.evaluate(() => FZ.phone.disconnect());
  await p.waitForFunction(() => !FZ.scene.info().beam);
  let self = await p.evaluate(() => FZ.selfTest());
  assert.equal(self.fail, 0);
  ok('Built-in selfTest', self.pass + ' PASS / ' + self.fail + ' FAIL');
  await p.evaluate(() => {
    FZ.fs.write('/ext/nfc/keep.nfc', 'SIM / PAPER CARD');
    localStorage.setItem('qa.unrelated', 'keep');
  });
  await p.reload();
  await ready();
  assert(
    await p.evaluate(
      () =>
        FZ.os.name === 'Echo Lab' &&
        FZ.fs.read('/ext/nfc/keep.nfc') === 'SIM / PAPER CARD' &&
        !FZ.link.get().connected
    )
  );
  ok('Saved files and settings persist; pairing is session-only');
  const client = await p.createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: temp });
  await p.click('#btn-storage');
  await p.click('#btn-export');
  const backupFile = path.join(temp, 'flipper-lab-backup.json');
  for (let i = 0; i < 30 && !fs.existsSync(backupFile); i++) await sleep(60);
  assert.equal(JSON.parse(fs.readFileSync(backupFile)).device.name, 'Echo Lab');
  await p.keyboard.press('Escape');
  await reset();
  assert(
    await p.evaluate(
      () =>
        FZ.os.name === 'Flipper Zero' &&
        !FZ.fs.exists('/ext/nfc/keep.nfc') &&
        localStorage.getItem('qa.unrelated') === 'keep'
    )
  );
  await p.click('#btn-storage');
  await (await p.$('#import-file')).uploadFile(backupFile);
  await p.waitForSelector('#confirm-action');
  await p.click('#confirm-action');
  assert(await p.evaluate(() => FZ.fs.exists('/ext/nfc/keep.nfc') && FZ.os.name === 'Echo Lab'));
  ok('Actual JSON export/import and scoped Reset storage');
  await p.goto(url + '?calibrate');
  await ready();
  await p.click('#btn-models');
  await p.select('#model-flipper', 'flipper-parts');
  await p.select('#model-phone', 'phone.compact');
  await p.keyboard.press('Escape');
  assert.equal(await p.evaluate(() => FZ.scene.device('phone').id), 'phone.compact');
  await layout('flipper');
  await p.click('#lcd-pattern');
  await sleep(150);
  await shot('parts-and-lcd.jpg', '#stage');
  let savedX = await p.evaluate(() => {
    let s = document.querySelector('input[type=range]');
    s.value = (+s.value + 0.5).toFixed(2);
    s.dispatchEvent(new Event('input'));
    return FZ.scene.device('flipper').screen.position.x;
  });
  await p.reload();
  await ready();
  assert.equal(await p.evaluate(() => FZ.scene.device('flipper').screen.position.x), savedX);
  ok('Live model switching, calibrated 2:1 test pattern, manifest autosave');
  await p.goto(url);
  await ready();
  await reset();
  await p.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  await p.reload();
  await ready();
  assert(
    await p.evaluate(
      () => FZ.scene.isPortrait() && Math.abs(gl.width / gl.clientWidth - 1.5) < 0.01
    )
  );
  await shot('mobile.jpg');
  const d = await p.$eval('#gl', (e) => {
    let r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 40 };
  });
  const touch = (kind, pts) =>
    client.send('Input.dispatchTouchEvent', {
      type: kind,
      touchPoints: pts.map((s, i) => ({
        x: s[0],
        y: s[1],
        id: i + 1,
        radiusX: 2,
        radiusY: 2,
        force: 1
      }))
    });
  before = await p.evaluate(() => FZ.scene.info().radius);
  await touch('touchStart', [
    [d.x - 38, d.y],
    [d.x + 38, d.y]
  ]);
  await touch('touchMove', [
    [d.x - 66, d.y],
    [d.x + 66, d.y]
  ]);
  await touch('touchEnd', []);
  await p.waitForFunction((r) => FZ.scene.info().radius < r * 0.85, {}, before);
  await p.touchscreen.tap(d.x - 120, d.y);
  await p.touchscreen.tap(d.x - 120, d.y);
  await stable();
  assert(Math.abs((await p.evaluate(() => FZ.scene.info().radius)) - before) < 0.01);
  await part('flipper', 'ok', true);
  assert.equal(await p.evaluate(() => FZ.os.state), 'menu');
  await p.tap('#mobile-link');
  await p.tap('#pair-action');
  await p.waitForFunction(() => FZ.phone.state === 'devices');
  await p.tap('#pair-action');
  await p.waitForFunction(() => FZ.phone.state === 'pin');
  await p.tap('#pair-action');
  await p.waitForFunction(() => FZ.link.get().connected);
  ok('Portrait framing, 1.5× DPR cap, real touch pinch/double-tap, 3D tap, inspector pairing');
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await p.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Storage is unavailable');
      }
    });
  });
  await p.reload();
  await ready();
  assert(
    await p.evaluate(() => {
      FZ.storage.set('probe', 'ok');
      return !FZ.storage.persistent && FZ.storage.get('probe') === 'ok' && FZ.flags.reducedMotion;
    })
  );
  await p.evaluate(() => {
    FZ.os.home();
    FZ.os.onKey('ok');
  });
  await sleep(450);
  let idle = await p.evaluate(() => FZ.scene.info().frame);
  await sleep(500);
  assert.equal(await p.evaluate(() => FZ.scene.info().frame), idle);
  ok('Blocked storage → memory; reduced-motion static menu produces zero idle renders');
  await p.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (k, ...args) {
      return k.startsWith('webgl') ? null : get.call(this, k, ...args);
    };
  });
  await p.reload();
  await p.waitForSelector('#missing:not([hidden])');
  assert.equal(await p.$eval('#missing-title', (n) => n.textContent), 'WebGL unavailable');
  ok('Graceful full-screen WebGL fallback');
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  ok('Zero console/page errors and zero network requests (network emulation offline)');
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        checks: checks.length,
        tris,
        pairMs,
        saveMs,
        renameMs,
        activeFps: perf,
        staticIdleRenders: 0,
        localFileResources: resources.size,
        networkRequests: remote.length,
        consoleErrors: errors.length
      },
      null,
      2
    )
  );
})()
  .catch(async (e) => {
    console.error('FAIL', e);
    console.error('Browser errors', errors);
    await displayState();
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

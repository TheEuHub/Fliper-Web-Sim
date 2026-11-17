/* A real scratch-file sync round trip. No network; always cleans up in finally. */
(function (FZ) {
  'use strict';
  var running = false;
  FZ.selfTest = async function () {
    if (running) throw Error('Self-test already running');
    if (FZ.os.update || ['pin', 'scanning'].includes(FZ.phone.state))
      throw Error('Finish pairing or updating before the self-test');
    running = true;
    var checks = [],
      connected = FZ.link.get().connected,
      loss = FZ.link.get().loss,
      path = '/ext/subghz/selftest-' + Date.now() + '.sub',
      old = FZ.os.name;
    function check(name, ok, detail) {
      checks.push({ name: name, pass: !!ok });
      console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
    }
    function wait(ms) {
      return new Promise(function (r) {
        setTimeout(r, ms);
      });
    }
    async function until(test, ms) {
      var end = Date.now() + ms;
      while (!test() && Date.now() < end) await wait(35);
      return !!test();
    }
    try {
      FZ.link.setLoss(0);
      check('Local Three.js r128 and WebGL', THREE.REVISION === '128' && FZ.scene.info().ready);
      var m = FZ.scene.device('flipper');
      check(
        'Original facets and six moving button parts',
        m.triCount === 43386 && Object.keys(m.parts).length === 6
      );
      check(
        'All resources local',
        performance.getEntriesByType('resource').every(function (r) {
          var u = new URL(r.name);
          return u.protocol === 'file:' || u.protocol === 'data:' || u.origin === location.origin;
        })
      );
      var t = Date.now(),
        ping = await FZ.link.rpc('system.ping', { t: t });
      check('RPC request + response', ping.echo === t, Date.now() - t + ' ms');
      if (!connected) {
        await FZ.phone.scan();
        await FZ.phone.pairWith(FZ.phone.devices[0]);
        check('Matching six-digit PIN', /^\d{6}$/.test(FZ.os.pin) && FZ.os.pin === FZ.phone.pin);
        await FZ.phone.confirmPair();
      }
      await FZ.phone.loadList('/ext/subghz');
      FZ.fs.write(path, 'A synthetic sample');
      check(
        'SD → phone archive, within 1 s',
        await until(function () {
          return (
            FZ.phone.entries &&
            FZ.phone.entries.some(function (e) {
              return e.path === path;
            })
          );
        }, 1000)
      );
      var data = await FZ.link.rpc('storage.read', { path: path });
      check('Read over link', data.data === 'A synthetic sample');
      FZ.os.rename('Lab test');
      check(
        'Flipper rename → phone, within 1 s',
        await until(function () {
          return FZ.phone.info && FZ.phone.info.name === 'Lab test';
        }, 1000)
      );
      await FZ.link.rpc('storage.delete', { path: path });
      check('Phone delete → SD', !FZ.fs.exists(path));
      check('Virtual card validation', FZ.fs.validate(FZ.fs.snapshot()));
    } catch (e) {
      check('Unexpected error', false, e.message);
    } finally {
      if (FZ.fs.exists(path)) FZ.fs.remove(path);
      if (FZ.os.name !== old) FZ.os.rename(old);
      if (!connected && FZ.link.get().connected) await FZ.phone.disconnect();
      else if (connected) FZ.phone.dashboard();
      FZ.link.setLoss(loss);
      running = false;
    }
    var pass = checks.filter(function (v) {
      return v.pass;
    }).length;
    console.log('Self-test: ' + pass + ' PASS, ' + (checks.length - pass) + ' FAIL');
    return { pass: pass, fail: checks.length - pass, checks: checks };
  };
})(window.FZ);

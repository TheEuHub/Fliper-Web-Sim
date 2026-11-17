/* Calibration is a local overlay. Never modify the embedded default manifest. */
(function (FZ) {
  'use strict';
  function vector(v, n) {
    return Array.isArray(v) && v.length === n && v.every(Number.isFinite);
  }
  FZ.manifest = {
    get: function (id, defaults) {
      var m = FZ.storage.get('manifest.' + id, null);
      if (
        m &&
        m.screen &&
        m.buttons &&
        vector(m.screen.position, 3) &&
        vector(m.screen.size, 2) &&
        m.screen.size.every(function (v) {
          return v > 0;
        }) &&
        vector(m.screen.rotation, 3) &&
        Object.keys(defaults.buttons).every(function (k) {
          var b = m.buttons[k];
          return (
            b &&
            b.mode === defaults.buttons[k].mode &&
            vector(b.position, 3) &&
            vector(b.axis, 3) &&
            Number.isFinite(b.travel)
          );
        })
      )
        return m;
      return JSON.parse(JSON.stringify(defaults));
    },
    save: function (id, m) {
      FZ.storage.set('manifest.' + id, m);
    }
  };
})(window.FZ);

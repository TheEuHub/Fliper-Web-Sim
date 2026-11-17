/* Fliper Web Sim — Screen: a 2D canvas + dirty flag + texture flush
   capped at 30 fps. Textures only upload when dirty. */
(function () {
  'use strict';
  var FZ = window.FZ;
  var list = [];
  var MIN_FLUSH_MS = 33; /* 30 fps cap */

  function Screen(opts) {
    this.logicalW = opts.logicalW;
    this.logicalH = opts.logicalH;
    this.scale = opts.scale || 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, Math.round(this.logicalW * this.scale));
    this.canvas.height = Math.max(1, Math.round(this.logicalH * this.scale));
    this.ctx = this.canvas.getContext('2d');
    this.dirty = true;
    this.lastFlush = -1e9;

    var tex = new THREE.CanvasTexture(this.canvas);
    tex.generateMipmaps = false;
    if (opts.nearest) {
      tex.minFilter = THREE.NearestFilter;
      tex.magFilter = THREE.NearestFilter;
    } else {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.texture = tex;
    list.push(this);
  }

  Screen.prototype.markDirty = function () { this.dirty = true; };

  /* Reset transform to logical units and clear. Returns the ctx. */
  Screen.prototype.begin = function () {
    var c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.clearRect(0, 0, this.logicalW, this.logicalH);
    return c;
  };

  /* Upload to GPU at most every 33 ms. Returns true if flushed. */
  Screen.prototype.flush = function (now) {
    if (this.dirty && (now - this.lastFlush) >= MIN_FLUSH_MS) {
      this.texture.needsUpdate = true;
      this.dirty = false;
      this.lastFlush = now;
      return true;
    }
    return false;
  };

  FZ.Screen = Screen;
  FZ.screenList = {
    update: function (now) {
      var any = false;
      for (var i = 0; i < list.length; i++) if (list[i].flush(now)) any = true;
      return any;
    }
  };
})();

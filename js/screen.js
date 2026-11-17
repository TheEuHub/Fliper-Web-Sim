/* Fliper Web Sim — Screen: a 2D canvas + dirty flag + texture flush
   capped at 30 fps. Textures only upload when dirty. */
(function () {
  'use strict';
  var FZ = window.FZ;
  var list = [];
  var MIN_FLUSH_MS = 1000 / 30; /* 30 fps cap */

  function Screen(opts) {
    this.logicalW = opts.logicalW;
    this.logicalH = opts.logicalH;
    this.scale = opts.scale || 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, Math.round(this.logicalW * this.scale));
    this.canvas.height = Math.max(1, Math.round(this.logicalH * this.scale));
    // Power-of-two backing stores also support filtered minification on WebGL 1.
    if (!opts.nearest) {
      this.canvas.width = 512;
      this.canvas.height = 1024;
    }
    this.scaleX = this.canvas.width / this.logicalW;
    this.scaleY = this.canvas.height / this.logicalH;
    this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: !!opts.nearest });
    this.dirty = true;
    this.lastFlush = -1e9;

    var tex = new THREE.CanvasTexture(this.canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = opts.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    this.texture = tex;
    list.push(this);
  }

  Screen.prototype.markDirty = function () {
    this.dirty = true;
  };

  /* Reset transform to logical units and clear. Returns the ctx. */
  Screen.prototype.begin = function () {
    var c = this.ctx;
    c.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    c.clearRect(0, 0, this.logicalW, this.logicalH);
    return c;
  };

  /* Upload to GPU at most every 33 ms. Returns true if flushed. */
  Screen.prototype.flush = function (now) {
    if (this.dirty && now - this.lastFlush >= MIN_FLUSH_MS) {
      this.texture.needsUpdate = true;
      this.dirty = false;
      this.lastFlush = now;
      return true;
    }
    return false;
  };

  FZ.Screen = Screen;
  FZ.screenList = {
    pending: function () {
      for (var i = 0; i < list.length; i++) if (list[i].dirty) return true;
      return false;
    },
    update: function (now) {
      var any = false;
      for (var i = 0; i < list.length; i++) if (list[i].flush(now)) any = true;
      return any;
    }
  };
})();

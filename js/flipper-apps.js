/* Built-in toy apps, not executable SD-card content. */
(function (FZ) {
  'use strict';
  var ui = FZ.os.ui;
  function clock() {
    var h24 = true;
    ui.show({
      id: 'clock',
      animation: true,
      interval: 1000,
      draw: function (c) {
        var d = new Date(),
          h = d.getHours();
        ui.title(c, 'Desk clock');
        ui.center(
          c,
          FZ.util.pad2(h24 ? h : h % 12 || 12) +
            ':' +
            FZ.util.pad2(d.getMinutes()) +
            ':' +
            FZ.util.pad2(d.getSeconds()),
          21,
          ui.fg,
          2
        );
        ui.center(c, h24 ? '24 HOUR' : h < 12 ? 'AM' : 'PM', 43);
        ui.center(c, 'OK TOGGLE FORMAT', 56);
      },
      key: function (k) {
        if (k === 'ok') h24 = !h24;
      }
    });
  }
  function hex(path) {
    var files = FZ.fs.list(path);
    ui.list(
      'hex-list',
      'Hex / ' + path.split('/').pop(),
      function () {
        return files.map(function (e) {
          return (e.dir ? '+ ' : '') + e.name;
        });
      },
      function (i) {
        var e = files[i];
        if (e.dir) {
          hex(e.path);
          return;
        }
        var data = new TextEncoder().encode(FZ.fs.read(e.path)),
          offset = 0;
        ui.show({
          id: 'hex',
          draw: function (c) {
            ui.title(c, e.name);
            for (var j = 0; j < 4; j++) {
              var a = offset + j * 5;
              if (a >= data.length) break;
              var s = a.toString(16).padStart(4, '0') + ': ';
              for (var t = a; t < Math.min(a + 5, data.length); t++)
                s += data[t].toString(16).padStart(2, '0') + ' ';
              ui.text(c, s, 1, 15 + j * 10);
            }
            ui.text(c, 'UP/DOWN PAGE', 3, 56);
          },
          key: function (k) {
            offset = FZ.util.clamp(
              offset + (k === 'down' ? 20 : k === 'up' ? -20 : 0),
              0,
              Math.max(0, Math.floor((data.length - 1) / 20) * 20)
            );
          }
        });
      }
    );
  }
  function music() {
    var play = true,
      step = 0,
      track = 0,
      due = 0,
      names = ['Daybreak', 'Bench notes', 'Moon tide'],
      tones = [262, 330, 392, 523, 440, 392, 330, 294];
    ui.show({
      id: 'music',
      animation: true,
      interval: 180,
      tick: function (now) {
        if (play && now >= due) {
          step = (step + 1) % 32;
          due = now + 280;
          FZ.audio.beep(tones[(step + track * 3) % 8], 0.12, 0.025);
          ui.dirty();
        }
      },
      draw: function (c) {
        ui.title(c, 'Music player');
        ui.text(c, names[track], 3, 15);
        c.fillStyle = ui.fg;
        for (var i = 0; i < 21; i++) {
          var h = play ? 2 + Math.floor((Math.sin((i + step) * 0.79) + 1) * 7) : 2;
          c.fillRect(3 + i * 6, 46 - h, 4, h);
        }
        ui.text(c, (play ? 'OK PAUSE' : 'OK PLAY') + '  > NEXT', 3, 55);
      },
      key: function (k) {
        if (k === 'ok') {
          play = !play;
          this.animation = play;
        }
        if (k === 'right') {
          track = (track + 1) % names.length;
          step = 0;
        }
      }
    });
  }
  FZ.mini = {
    open: function (i) {
      if (i === 2) clock();
      else if (i === 3) hex('/ext');
      else music();
    }
  };
})(window.FZ);

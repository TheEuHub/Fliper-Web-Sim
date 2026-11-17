/* Toy instruments. All readings come from the page's PRNG, never hardware. */
(function (FZ) {
  'use strict';
  var ui = FZ.os.ui,
    names = ['Sub-GHz', '125 kHz RFID', 'NFC', 'Infrared', 'GPIO', 'iButton', 'Bad USB', 'U2F'],
    folders = ['subghz', 'lfrfid', 'nfc', 'infrared', 'gpio', 'ibutton', 'badusb', 'u2f'],
    ext = ['sub', 'rfid', 'nfc', 'ir', 'pins', 'ibtn', 'txt', 'txt'];
  var readings = ['Orbit', 'Pebble', 'Cirrus', 'Lumen', 'Finch'],
    pick = function (a) {
      return a[FZ.util.randInt(0, a.length - 1)];
    };
  function token() {
    return FZ.util.randInt(0, 65535).toString(16).toUpperCase().padStart(4, '0');
  }
  function save(i, label, lines) {
    var path =
      '/ext/' +
      folders[i] +
      '/' +
      label.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
      '-' +
      token().toLowerCase() +
      '.' +
      ext[i];
    FZ.fs.write(path, ['FLIPPER LAB / SIMULATED RECORD', names[i], label].concat(lines).join('\n'));
    FZ.audio.ok();
    FZ.note('Saved ' + path.split('/').pop());
    ui.note('Saved to virtual SD', [path.split('/').pop(), '/ext/' + folders[i], 'OK: RETURN']);
    return path;
  }
  function result(i, label, lines, extra) {
    var saved = false;
    ui.show({
      id: 'result',
      draw: function (c) {
        ui.title(c, names[i] + ' / result');
        ui.text(c, label.slice(0, 20), 3, 16);
        lines.slice(0, 2).forEach(function (s, j) {
          ui.text(c, s.slice(0, 20), 3, 28 + 10 * j);
        });
        ui.text(
          c,
          saved ? 'SAVED TO SD' : extra ? 'OK SAVE  > WRITE' : 'OK SAVE  BACK EXIT',
          3,
          55
        );
      },
      key: function (k) {
        if (k === 'ok' && !saved) {
          saved = true;
          save(i, label, lines);
        }
        if (k === 'right' && extra) extra();
      }
    });
  }
  function sweep(i, label, done) {
    var t = FZ.util.now(),
      ticks = Array.from({ length: 34 }, function () {
        return FZ.util.randInt(2, 19);
      });
    ui.show({
      id: 'tool-scan',
      animation: true,
      interval: 90,
      draw: function (c, now) {
        ui.title(c, label);
        var f = FZ.util.clamp((now - t) / 1150, 0, 1);
        c.fillStyle = ui.fg;
        var n = Math.floor(f * 32);
        for (var j = 0; j < 34; j++) {
          var h = ticks[(j + n) % 34];
          c.fillRect(5 + j * 3, 40 - h, 2, h);
        }
        c.fillRect(5 + n * 3, 13, 1, 30);
        ui.text(c, 'SIM BUS ' + Math.round(f * 100) + '%', 4, 51);
      },
      tick: function (now) {
        if (now - t >= 1150) {
          ui.back();
          done();
        }
      }
    });
  }
  function capture(i) {
    sweep(i, i === 0 ? 'Spectrum scan' : 'Read inventory', function () {
      var name = pick(readings) + ' ' + token().slice(2),
        id = 'SIM-' + token();
      if (i === 0) {
        result(i, name, [
          'Band ' + (310 + Math.random() * 170).toFixed(2) + ' MHz',
          'Level -' + FZ.util.randInt(30, 81) + ' dB'
        ]);
        return;
      }
      if (i === 5) {
        id = FZ.os.keySlot();
        result(i, 'Key ' + id, ['BENCH KEY / READ', 'VIRTUAL CONTACT'], function () {
          id = FZ.os.keySlot('SIM-' + token());
          result(5, 'Key ' + id, ['WROTE VIRTUAL SLOT', 'NO HARDWARE']);
        });
        return;
      }
      var cards = [name, id + ' B', pick(readings) + ' ' + token().slice(0, 2)];
      ui.list(
        'inventory',
        'Found: 3 tags',
        function () {
          return cards;
        },
        function (n) {
          result(i, cards[n], [
            'ID SIM-' + token(),
            i === 2 ? 'Paper tag / demo' : 'Loop tag / demo'
          ]);
        }
      );
    });
  }
  function infrared() {
    var brands = ['Aster TV', 'Orbit Audio', 'Luma Light'];
    ui.list(
      'remotes',
      'Remote library',
      function () {
        return brands;
      },
      function (n) {
        var commands = [
            ['Power', 'Vol +', 'Vol -', 'Input'],
            ['Power', 'Play', 'Pause', 'Next'],
            ['On', 'Off', 'Dim', 'Bright']
          ][n],
          k = 0,
          last = 'Ready',
          lit = false;
        ui.show({
          id: 'remote',
          draw: function (c) {
            ui.title(c, brands[n]);
            ui.text(c, (lit ? 'ON ' : 'OFF') + ' / ' + last, 3, 15);
            for (var j = 0; j < 4; j++) {
              var x = 4 + (j % 2) * 60,
                y = 25 + Math.floor(j / 2) * 12;
              if (j === k) {
                c.fillStyle = ui.fg;
                c.fillRect(x, y, 57, 10);
              }
              ui.text(c, commands[j], x + 4, y + 1, j === k ? ui.bg : ui.fg);
            }
            ui.text(c, 'OK TAP / DOWN SAVE', 3, 56);
          },
          key: function (key) {
            if (key === 'left' || key === 'right' || key === 'up')
              k = (k + (key === 'left' ? 3 : key === 'up' ? 2 : 1)) % 4;
            if (key === 'ok') {
              last = commands[k];
              if (!k) lit = !lit;
              if (n === 2 && k === 1) lit = false;
              FZ.audio.beep(480, 0.035);
            }
            if (key === 'down')
              save(3, brands[n], ['Panel: ' + brands[n], 'Last button: ' + last, 'Power: ' + lit]);
          }
        });
      }
    );
  }
  function gpio() {
    var bits = [0, 0, 0, 0, 0, 0, 0, 0],
      sel = 0;
    ui.show({
      id: 'pinout',
      draw: function (c) {
        ui.title(c, 'GPIO / pin bank');
        ui.text(c, 'VIRTUAL OUTPUTS', 3, 14);
        for (var i = 0; i < 8; i++) {
          var x = 5 + i * 15;
          c.strokeStyle = ui.fg;
          c.strokeRect(x + 0.5, 26.5, 11, 13);
          if (bits[i]) {
            c.fillStyle = ui.fg;
            c.fillRect(x + 2, 28, 8, 10);
          }
          ui.text(c, '' + (i + 1), x + 3, 42);
          if (i === sel) {
            c.fillStyle = ui.fg;
            c.fillRect(x, 51, 12, 2);
          }
        }
        ui.text(c, 'OK FLIP / DOWN SAVE', 3, 56);
      },
      key: function (k) {
        if (k === 'left' || k === 'right') sel = (sel + (k === 'left' ? 7 : 1)) % 8;
        if (k === 'ok') bits[sel] = 1 - bits[sel];
        if (k === 'down') save(4, 'Pin bank', ['Pins 1 to 8', bits.join(' ')]);
      }
    });
  }
  function playback() {
    var files = FZ.fs.list('/ext/badusb').filter(function (e) {
      return !e.dir;
    });
    ui.list(
      'scripts',
      'Display scripts',
      function () {
        return files.map(function (e) {
          return e.name;
        });
      },
      function (n) {
        var lines = FZ.fs.read(files[n].path).split('\n').slice(0, 80),
          pos = 0,
          next = FZ.util.now() + 680;
        ui.show({
          id: 'playback',
          animation: true,
          interval: 350,
          tick: function (now) {
            if (pos < lines.length && now > next) {
              pos++;
              next = now + 680;
              ui.dirty();
            }
            if (pos >= lines.length) this.animation = false;
          },
          draw: function (c) {
            ui.title(c, 'Text playback');
            ui.text(c, 'LCD ONLY / NO HID', 2, 14);
            for (var j = 0; j < 3; j++)
              ui.text(
                c,
                (Math.max(0, pos - 3) + j < pos ? lines[Math.max(0, pos - 3) + j] || '' : '').slice(
                  0,
                  20
                ),
                3,
                25 + 9 * j
              );
            ui.text(c, pos >= lines.length ? 'OK SAVE LOG' : 'OK NEXT  BACK STOP', 2, 56);
          },
          key: function (k) {
            if (k === 'ok') {
              if (pos >= lines.length)
                save(6, 'Playback log', ['Displayed: ' + files[n].name, 'Lines: ' + pos]);
              else pos++;
            }
          }
        });
      }
    );
  }
  function challenge() {
    var key = token();
    ui.show({
      id: 'challenge',
      draw: function (c) {
        ui.title(c, 'U2F / challenge');
        ui.text(c, 'LOCAL TEST ONLY', 3, 18);
        ui.text(c, 'TOKEN: ' + key, 3, 31);
        ui.text(c, 'OK TO ACKNOWLEDGE', 3, 52);
      },
      key: function (k) {
        if (k === 'ok') result(7, 'Demo response', ['CHALLENGE ' + key, 'REPLY ACK-' + token()]);
      }
    });
  }
  FZ.tools = {
    open: function (i) {
      var action = [
        'Scan spectrum',
        'Scan inventory',
        'Scan inventory',
        'Choose remote',
        'Open pin bank',
        'Read virtual key',
        'Play text demo',
        'New challenge'
      ][i];
      ui.list(
        'tool',
        names[i],
        function () {
          return [action, 'Saved records'];
        },
        function (n) {
          if (n) ui.browser('/ext/' + folders[i], names[i] + ' files');
          else if (i === 3) infrared();
          else if (i === 4) gpio();
          else if (i === 6) playback();
          else if (i === 7) challenge();
          else capture(i);
        }
      );
    }
  };
})(window.FZ);

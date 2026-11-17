/* Fliper Web Sim — link: in-page event bus acting as a virtual RPC channel.
   Message shape: {id, type:"request"|"response"|"event", cmd, payload, error}
   Simulated latency 30–120 ms, optional packet loss (Link debug panel).
   No radio, no network — everything happens inside this page. */
(function () {
  'use strict';
  var FZ = window.FZ;

  var handlers = { flipper: {}, phone: {} };
  var pending = {}; /* id -> {cb, timer} */
  var subs = []; /* snapshot subscribers (scene, ui) */
  var log = [];
  var seq = 0;

  var LAT_MIN = 30,
    LAT_MAX = 120,
    TIMEOUT = 4000;

  var state = {
    connected: false,
    name: null,
    signal: 0,
    loss: 0,
    sent: 0,
    dropped: 0,
    rtt: null
  };

  function other(side) {
    return side === 'flipper' ? 'phone' : 'flipper';
  }

  function stamp() {
    var d = new Date();
    return (
      FZ.util.pad2(d.getHours()) +
      ':' +
      FZ.util.pad2(d.getMinutes()) +
      ':' +
      FZ.util.pad2(d.getSeconds()) +
      '.' +
      ('00' + d.getMilliseconds()).slice(-3)
    );
  }

  function pushLog(line) {
    log.push(stamp() + '  ' + line);
    if (log.length > 60) log.shift();
  }

  function notify() {
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](state);
      } catch (e) {}
    }
  }

  function fanout(cmd, payload) {
    ['flipper', 'phone'].forEach(function (side) {
      var h = handlers[side][cmd];
      if (h) {
        try {
          h(payload, null);
        } catch (e) {}
      }
    });
  }

  function make(type, cmd, payload) {
    return {
      id: 'm' + ++seq,
      type: type,
      cmd: cmd,
      payload: payload === undefined ? null : payload,
      error: null
    };
  }

  var epoch = 0;
  function privateCmd(cmd) {
    return !/^(link\.|system\.ping$)/.test(cmd);
  }
  function schedule(from, to, msg) {
    var generation = epoch;
    state.sent++;
    var delay = LAT_MIN + Math.random() * (LAT_MAX - LAT_MIN);
    pushLog(from + ' > ' + to + '  ' + msg.type + ' ' + msg.cmd);
    setTimeout(function () {
      if (state.loss > 0 && Math.random() < state.loss) {
        state.dropped++;
        pushLog('DROP  ' + msg.id + ' ' + msg.cmd);
        notify();
        return; /* pending requests die via their timeout */
      }
      if (privateCmd(msg.cmd) && (generation !== epoch || !state.connected)) {
        var p = pending[msg.id];
        if (p) {
          clearTimeout(p.timer);
          delete pending[msg.id];
          p.cb('not connected', null);
        }
        return;
      }
      deliver(from, to, msg);
    }, delay);
  }

  function deliver(from, to, msg) {
    if (msg.type === 'response') {
      var p = pending[msg.id];
      if (p) {
        clearTimeout(p.timer);
        delete pending[msg.id];
        p.cb(msg.error, msg.payload);
      }
      return;
    }

    var h = handlers[to][msg.cmd];

    if (msg.type === 'request') {
      if (!h) {
        schedule(to, from, {
          id: msg.id,
          type: 'response',
          cmd: msg.cmd,
          payload: null,
          error: 'unknown command: ' + msg.cmd
        });
        return;
      }
      var replied = false;
      h(msg.payload || {}, function (err, payload) {
        if (replied) return;
        replied = true;
        schedule(to, from, {
          id: msg.id,
          type: 'response',
          cmd: msg.cmd,
          payload: payload === undefined ? null : payload,
          error: err || null
        });
      });
      return;
    }

    /* event */
    if (h) {
      try {
        h(msg.payload || {}, null);
      } catch (e) {}
    }
  }

  function request(from, cmd, payload, cb) {
    var msg = make('request', cmd, payload);
    var done = typeof cb === 'function' ? cb : function () {};
    pending[msg.id] = {
      cb: done,
      timer: setTimeout(function () {
        var p = pending[msg.id];
        if (!p) return;
        delete pending[msg.id];
        pushLog('TIMEOUT ' + cmd);
        notify();
        p.cb('timeout', null);
      }, TIMEOUT)
    };
    schedule(from, other(from), msg);
    return msg.id;
  }

  function emit(from, cmd, payload) {
    schedule(from, other(from), make('event', cmd, payload));
  }

  FZ.link = {
    attach: function (side, map) {
      for (var k in map)
        if (Object.prototype.hasOwnProperty.call(map, k)) handlers[side][k] = map[k];
    },

    request: request,
    event: emit,

    /* Local (not on the wire) link-layer state change; fans out link.status
       to both endpoints so both UIs stay consistent. */
    establish: function (info) {
      if (state.connected !== !!info.connected) epoch++;
      state.connected = !!info.connected;
      if (info.name) state.name = info.name;
      pushLog('LINK  ' + (state.connected ? 'UP   ' + state.name : 'DOWN'));
      fanout('link.status', { connected: state.connected, name: state.name, signal: state.signal });
      notify();
    },

    setSignal: function (v) {
      v = Math.round(v) | 0;
      if (v === state.signal) return;
      state.signal = v;
      fanout('link.signal', { connected: state.connected, signal: v });
      notify();
    },

    setLoss: function (v) {
      state.loss = Math.max(0, Math.min(1, Number(v) || 0));
      pushLog('loss set to ' + Math.round(state.loss * 100) + '%');
      notify();
    },

    noteRtt: function (ms) {
      state.rtt = Math.round(ms);
      notify();
    },

    get: function () {
      return state;
    },
    getLog: function () {
      return log;
    },
    rename: function (name) {
      state.name = name;
      notify();
    },
    rpc: function (cmd, payload) {
      return new Promise(function (resolve, reject) {
        request('phone', cmd, payload || {}, function (e, v) {
          if (e) reject(Error(e));
          else resolve(v);
        });
      });
    },
    subscribe: function (fn) {
      if (typeof fn === 'function') subs.push(fn);
    }
  };
})();

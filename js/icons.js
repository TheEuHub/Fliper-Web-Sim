/* Original, inline workbench pictograms. No icon font or external sprites. */
(function (FZ) {
  'use strict';
  var shapes = {
    layers: '<path d="m3 8 9-5 9 5-9 5z M3 12l9 5 9-5 M3 16l9 5 9-5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
    mute: '<path d="M3 9h4l5-4v14l-5-4H3z M16 9l5 6m0-6-5 6"/>',
    sound: '<path d="M3 9h4l5-4v14l-5-4H3z M16 8q4 4 0 8 M19 5q7 7 0 14"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 1 1 4.4 2.1Q12 12.2 12 14m0 2.8v.2"/>',
    terminal: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/>',
    settings:
      '<path d="M4 6h5m4 0h7M4 12h10m4 0h2M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
    cube: '<path d="m12 2 9 5v10l-9 5-9-5V7z M3 7l9 5 9-5m-9 5v10"/>',
    expand: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5"/>',
    shrink: '<path d="M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    reset: '<path d="M4 10a8 8 0 1 1 .8 6M4 4v6h6"/>',
    hand: '<path d="M7 12V7a1.4 1.4 0 0 1 3 0v5-7a1.4 1.4 0 0 1 3 0v7-6a1.4 1.4 0 0 1 3 0v7-4a1.4 1.4 0 0 1 3 0v6c0 4-2.5 7-6.5 7-2.8 0-4.8-1.8-6-4L3 13a1.5 1.5 0 0 1 2-2z"/>',
    link: '<path d="m9 15 6-6 M7.8 12.7l-2 2a3.8 3.8 0 0 0 5.5 5.3l3.3-3.3a3.8 3.8 0 0 0 0-5.4 M16.2 11.3l2-2a3.8 3.8 0 0 0-5.5-5.3L9.4 7.3a3.8 3.8 0 0 0 0 5.4"/>',
    bluetooth: '<path d="m5 6 13 11-6 5V2l6 5L5 18"/>',
    flipper:
      '<path d="m2 12 3.4-5.3Q6 6 7 6h11q1 0 1.7 1l2.4 4.2v4.2q0 2-2 2H5q-1 0-1.7-1z"/><rect x="6.7" y="8.7" width="6.1" height="4.7" rx=".8"/><circle cx="16.8" cy="10.9" r="1.8"/><path d="M19.2 14h.2"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.7"/><path d="M10 4.8h4m-3.8 14.5h3.6"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2.5v3m6-3v3M9 18v3m6-3v3M2.5 9h3m-3 6h3M18 9h3m-3 6h3"/><rect x="9.5" y="9.5" width="5" height="5" rx=".7"/>',
    pulse: '<path d="M2 13h5l3-9 4 16 3-11 2 4h3"/>',
    keyboard:
      '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M5 9h1m3 0h1m3 0h1m3 0h1M5 12.5h1m3 0h1m3 0h1m3 0h1m-10 3h8"/>',
    orbit:
      '<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-32 12 12)"/><circle cx="12" cy="12" r="3"/><path d="m4 14-1 3 4 .2"/>',
    rotate:
      '<path d="m12 6 6 3.5v6L12 19l-6-3.5v-6z M6 10l6 3 6-3m-6 3v6 M2 11a10 10 0 0 1 17-7m-4 0h4V1"/>',
    zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5 M7.5 10.5h6 M10.5 7.5v6"/>',
    dpad: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
    shield: '<path d="m12 2 8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5z M8.5 12l2.3 2.3 4.7-5"/>',
    close: '<path d="m6 6 12 12m0-12L6 18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15m-8 4v7m4-7v7"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    pin: '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
    storage: '<path d="m6 3 9 0 4 4v14H5V5zM8 4v5m3-5v5m3-5v5"/>'
  };
  FZ.icons = function (root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      el.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        (shapes[el.dataset.icon] || '') +
        '</svg>';
    });
  };
})(window.FZ);

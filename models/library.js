/* The two Flipper entries use exactly the same official mesh. */
(function (FZ) {
  'use strict';
  FZ.library = window.FZ_MODELS = {
    flipper: [
      { id: 'flipper-official', label: 'Official body · F7B9C6' },
      { id: 'flipper-parts', label: 'Official body · part inspection' }
    ],
    phone: [
      { id: 'phone.procedural', label: 'Standard · 146 mm' },
      { id: 'phone.compact', label: 'Compact · 128 mm' }
    ]
  };
})(window.FZ);

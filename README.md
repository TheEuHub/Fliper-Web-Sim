# Fliper Web Sim

Unofficial fan project: an offline web simulation of a **Flipper Zero** (official
3D model) lying on a dark desk next to a generic **smartphone**. The Flipper
screen runs a JavaScript re-implementation of its OS; the phone runs a
re-implementation of the companion app; the two pair over a simulated Bluetooth
link (an in-page RPC bus).

**Simulation only.** No real radio, NFC, USB or firmware anywhere. Not
affiliated with Flipper Devices.

> Status: **Stage 5** — everything in Stage 3–4 plus a **Bad USB** menu item
> that is strictly **UI-only**: it plays back tiny, original, benign demo
> scripts as text animation on the Flipper's own LCD. It never creates a
> keyboard/HID device, never dispatches DOM/keyboard events, and cannot type
> into this page or any other application — see "Bad USB" below.

## Self-contained: zero external dependencies

Every required file ships inside this repository — nothing is fetched at
runtime, no CDN, no npm, no build step:

| File | What | License |
|---|---|---|
| `vendor/three.min.js` | Three.js **r128** UMD build (vendored) | MIT — `LICENSES/MIT.txt` |
| `models/source/flipper-zero-body-3d.stl` | Official Flipper body model, rev F7B9C6, 43,386 triangles | GPL-3.0 — `LICENSES/GPL-3.0.txt` |
| `models/source/flipper-zero-drawing.png` | Official reference drawing for visual comparison | (same repo, GPL-3.0) |
| `models/flipper-model.js` | **Generated**: the same STL embedded as base64 (the mesh the app renders) | GPL-3.0 (derived) |

Only genuinely optional download left: a CC0 phone GLB for Stage 2+ if you
prefer it over the built-in procedural phone (see `vendor/README.txt`,
OPTIONAL section).

## Getting started

1. Open `index.html` directly in **Chrome or Firefox** (`file://` works), or
   serve the folder:
   ```
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000/`.
2. **iOS / iPadOS**: local `file://` pages are blocked in Safari — use the
   server path above and open `http://<your-computer-ip>:8000/` on the device
   (same Wi-Fi). This path is best-effort; desktop Chrome/Firefox is the
   supported target.

### The official model (Stage 2, shipped)

- The Flipper on the desk is the **official body** (rev F7B9C6): the binary
  STL is embedded as base64 in `models/flipper-model.js`, decoded at runtime
  into a `BufferGeometry` — no loaders, no XHR, no network. 43,386 triangles
  (under the 150k budget → no decimation, geometry exact).
- Screen/button positions are **calibrated from the mesh** (measurements and
  the orientation derivation: `models/SOURCES.md`). Buttons are picked through
  invisible hit proxies that flash orange when pressed — the mesh itself is
  never modified.
- Regenerate or verify the embedded file with `tools/embed-model.html`
  (offline, file input only). The "Placeholder block" remains available in
  the Models dropdown as the S1 stand-in.

### Virtual SD card & file manager (Stage 3, shipped)

- `js/flipper-fs.js` is a self-contained virtual filesystem rooted at `/ext`
  (the Flipper SD-card convention). It persists to `localStorage` under
  `fz.v1.fs` (try/catch, falls back to in-memory if storage is unavailable)
  and is seeded on first run with a small original tree: `README.txt`,
  `apps/games/tictactoe.fap`, `subghz/demo_433.sub`, `nfc/demo.nfc`, an empty
  `ibtn/` folder, `dolphin/level.txt`, and an empty `screenshots/` folder.
  Every file's content is invented placeholder text — none of it is real
  firmware, app, sub-GHz, or NFC data.
- Every mutation (write / mkdir / remove / rename) is recorded as a small op
  record and broadcast to subscribers, which is the hook Stage 4 uses to keep
  the phone's Storage screen in sync with the Flipper within ~1 s.
- **On the Flipper**, press **OK** from the home or connected screen to open
  the **menu**:
  - **FILE MANAGER** — ↑/↓ select, **OK** opens a folder or views a file,
    **→** opens actions (Rename / Delete / Cancel), **←** goes up one folder,
    **Back** exits up a level (or to the menu at the SD root).
  - Viewing a `.txt`-style file shows up to 6 scrollable lines; viewing a
    screenshot renders the saved PNG scaled to fit the LCD.
  - **Rename**: ←/→ move the cursor, ↑/↓ cycle the character under the
    cursor through `a-z 0-9 _ - ( ) .` (plus a delete symbol shown as `<`,
    and an insert slot past the end of the name); **OK** commits, **Back**
    cancels. Names are edited in lowercase — the LCD font only has uppercase
    glyphs, so display is uppercase regardless of the stored case.
  - **Delete** asks for confirmation (**OK** = delete, **Back** = cancel).
  - **SCREENSHOT** — captures the current LCD canvas as a PNG data URL and
    saves it to `/ext/screenshots/lcd-YYYYMMDD-HHMMSS.png`, then shows a
    confirmation screen for ~2.5 s before returning to the menu.
  - **STORAGE** — shows used/free space (out of a simulated 128 MB card) and
    file/folder counts.

### Phone Storage screen & Find My Flipper (Stage 4, shipped)

- The phone **never** touches `js/flipper-fs.js` directly. Every list / read /
  rename / delete goes out as an RPC over `link.js` (`fs.list`, `fs.read`,
  `fs.rename`, `fs.remove`, handled on the Flipper side in `flipper-os.js`,
  which is the only code that calls into `FZ.fs`). This keeps the "single
  source of truth lives on the Flipper" rule intact even though both UIs
  happen to run in the same page.
- On the phone's **Connected** screen, tap **OPEN STORAGE** to browse the
  same `/ext` tree as the Flipper's file manager: folders and files, sizes,
  pagination for long folders, a **‹ UP** button, and a **⋯** action menu per
  row (Rename / Delete). Opening a file shows its text (scrollable) or, for
  screenshots, the decoded image. Renaming uses an on-screen lowercase
  keyboard (tap letters, ⌫ to delete, no mid-string cursor — a deliberate
  touch-friendly simplification vs. the Flipper's D-pad character-cycle
  editor); deleting asks for confirmation.
- **Sync**: every mutation anywhere (Flipper file manager *or* a phone RPC)
  fires one `fs.changed` event over the link bus (30–120 ms simulated
  latency). The phone's Storage screen listens for it and silently
  re-fetches whatever it's currently showing, and the Flipper's own file
  manager re-draws the same way — both comfortably inside the ~1 s budget.
- **Find My Flipper**: tapping the button on the phone's Connected screen
  sends a `find.flipper` RPC; the Flipper plays an alert tone and flashes its
  entire LCD "FIND MY FLIPPER / HERE I AM" (inverted, ~4.5 Hz) for 3 seconds,
  then returns to whatever screen it was on.

### Bad USB — UI-only (Stage 5, shipped)

- **What it is**: a menu item that reads tiny, original, invented scripts
  from `/ext/badusb` (plain `REM` / `STRING` / `ENTER` / `DELAY` lines — the
  same four instructions real Bad USB "Ducky Script" uses, reimplemented
  from scratch) and plays them back as a **terminal-style text animation on
  the Flipper's LCD**, character by character.
- **What it is not**: at no point does this code create a keyboard/HID
  device, call the WebHID/WebUSB/WebSerial APIs, dispatch a `KeyboardEvent`,
  call `document.execCommand`, or touch the clipboard. It cannot type into
  this page, a different tab, or any other application — there's a one-line
  source audit in the test harness plus a permanent on-screen reminder
  ("SIMULATED — NO HID OUT") the whole time a script is "running".
- **On the Flipper**: open the menu → **BAD USB** → ↑/↓ pick a script → **OK**
  to run it. While it plays, **OK** fast-forwards the current line and
  **Back** stops immediately; when it finishes, **Back** returns to the list.
- Two demo scripts ship in the seed filesystem: `demo_hello.txt` and
  `demo_note.txt` — both harmless placeholder text, nothing resembling a
  real payload.

## Later stages

- **S6 — polish & self-test**: `FZ.selfTest()`, final README pass, perf
  tuning — not yet added.

## Controls

| Input | Action |
|---|---|
| Drag empty desk | Orbit camera |
| Drag a device | Lift + free-axis rotate (eases back on release) |
| Scroll / pinch | Zoom |
| Double-click / double-tap | Reset view |
| Click Flipper 3D buttons | D-pad / OK / Back drive the OS |
| ↑ ↓ ← → / Enter / Esc | Keyboard for the Flipper |
| OK on the Flipper home screen | Open the menu (File Manager / Screenshot / Storage) |
| In the file manager | ↑↓ move, OK open/view, → actions, ← up a folder, Back exit |
| Tap phone screen | Use the companion app |
| Phone "Open Storage" (while connected) | Browse the same SD card over RPC, rename/delete, view files |
| Phone "Find My Flipper" (while connected) | Flashes the Flipper's LCD for ~3 s |
| Flipper menu → BAD USB | Pick a demo script, OK to play it on the LCD (OK = skip step, Back = stop) |
| Phone side buttons | Power = sleep/wake screen, volume = app volume |
| Top bar | Layout toggle, Models, Help, Sound, Reset storage, Link debug |

## Folder layout

```
index.html            entry point (classic <script> tags, explicit order)
css/style.css
js/core.js            namespace FZ, flags, storage (fz.v1.*), utils
js/audio.js           WebAudio synth (off by default, unlock on first gesture)
js/screen.js          canvas Screen objects with dirty flag + 30 fps texture cap
js/link.js            simulated RPC bus (30–120 ms latency, loss toggle)
js/flipper-os.js      128×64 LCD OS (boot, home, pairing, tools, settings)
js/flipper-fs.js      virtual SD card (Stage 3)
js/phone-app.js       companion app screens
js/models.js          model registry, placeholder/procedural + official builder
js/scene.js           Three.js desk scene, controls, raycast input, beam
js/ui.js              top bar, help, debug panel, keyboard, boot
models/flipper-model.js  generated: official STL as base64 (GPL-3.0)
models/SOURCES.md     provenance, mesh measurements, calibration table
models/source/        official STL + reference drawing (GPL-3.0)
tools/embed-model.html  offline STL → flipper-model.js generator/verifier
vendor/three.min.js   vendored Three.js r128 (MIT)
vendor/README.txt     provenance of every vendored file + optional downloads
LICENSES/             MIT.txt (Three.js), GPL-3.0.txt (Flipper model files)
```

## How it works (short)

- Single source of truth: Flipper state lives only in `flipper-os` / `flipper-fs`.
  The phone never reads it directly — it sends RPC requests through `link.js`
  (`{id, type, cmd, payload, error}`) and renders responses/events.
- Each device screen is a canvas `Screen` with a dirty flag; textures update
  only when dirty, capped at 30 fps; WebGL renders on demand.
- Sound is synthesized with WebAudio, **off by default**, unlocked on first
  gesture. Preferences persist in `localStorage` (`fz.v1.*`, try/catch with
  in-memory fallback). "Reset storage" wipes them.

## Simulated vs real

- All radio operations are simulated; no real RF.
- All captures, PINs, signal strengths and file contents are invented.
- No HID output, credential capture, replay or attack functionality.

## Licenses

- `vendor/three.min.js` — Three.js, MIT license (full text:
  `LICENSES/MIT.txt`).
- `models/source/flipper-zero-body-3d.stl` and the reference drawing are from
  flipperdevices/flipperzero-3d-models, GPL-3.0 (full text:
  `LICENSES/GPL-3.0.txt`). Stage 2 `models/flipper-model.js` is derived from
  these files and remains GPL-3.0 (see `models/SOURCES.md`).
- All other code and sprites in this repository are original, MIT.

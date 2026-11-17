Fliper Web Sim — vendored files & provenance
============================================

The repository is SELF-CONTAINED: every file required to run the app (and to
run the Stage 2 model pipeline) ships inside the repo. Nothing is fetched at
runtime — no CDN, no npm, no build step.

BUNDLED — no download needed
----------------------------
vendor/three.min.js
    Three.js r128 classic UMD build (603,445 bytes)
    Source: https://github.com/mrdoob/three.js/blob/r128/build/three.min.js
    License: MIT — full text in LICENSES/MIT.txt
    Verify:  sha256 9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2
             (first bytes: "/** @license Copyright 2010-2021 Three.js Authors ...")
    Note: r129+ removed the UMD build; do NOT replace it with a newer version.

models/source/flipper-zero-body-3d.stl
    Official Flipper Zero outer-body model, hardware rev F7B9C6.
    Source: https://github.com/flipperdevices/flipperzero-3d-models
            flipper-zero/body-3d/flipper-zero-body-3d.stl
    Binary STL, 2,169,384 bytes = 43,386 triangles (under the 150k budget,
    so Stage 2 needs no decimation). License: GPL-3.0 — LICENSES/GPL-3.0.txt
    Verify:  sha256 bfec3649820a0c866d3f266e81f6ef67d600f4f4a3d35ac05af803389b9b72d5
    Used by tools/embed-model.html in Stage 2 (read locally; no network).

models/source/flipper-zero-drawing.png
    Official reference drawing for comparing the embedded mesh (Stage 2).
    License: same repository, GPL-3.0.
    Verify:  sha256 926499b0e198f5d73b74d7af348d90e9aafc64b536d7d699630940f9d9b68bd7

OPTIONAL — only if you want a non-procedural phone (Stage 2+)
-------------------------------------------------------------
The default phone is the built-in procedural model (zero downloads). To use a
CC0 low-poly phone instead:

  1. Pick a phone (.glb/.gltf, license must be CC0) from either:
       https://github.com/ToxSam/open-source-3D-assets
       https://github.com/devanshutak25/3d-resources
  2. Download GLTFLoader.js r128 and save as vendor/GLTFLoader.js:
       https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js
  3. Record the asset's license in models/SOURCES.md.

Notes
-----
- If vendor/three.min.js is ever removed, the page shows a full-screen message
  pointing at this file instead of crashing.
- No file in this folder is fetched from the network at runtime.

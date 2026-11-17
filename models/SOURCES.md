# models/SOURCES.md — provenance & calibration (Stage 2)

## Files

| File | Origin | License |
|---|---|---|
| `source/flipper-zero-body-3d.stl` | [flipperdevices/flipperzero-3d-models](https://github.com/flipperdevices/flipperzero-3d-models), `flipper-zero/body-3d/flipper-zero-body-3d.stl`, hardware rev **F7B9C6** | GPL-3.0 (`../LICENSES/GPL-3.0.txt`) |
| `source/flipper-zero-drawing.png` | same repo, `preview/flipper-zero-drawing.png` (reference drawing) | GPL-3.0 |
| `flipper-model.js` | **generated** from the STL by `../tools/embed-model.html` — raw binary STL embedded as base64, no geometry altered | GPL-3.0 (derived work) |

sha256 (all three):

```
bfec3649820a0c866d3f266e81f6ef67d600f4f4a3d35ac05af803389b9b72d5  source/flipper-zero-body-3d.stl
926499b0e198f5d73b74d7af348d90e9aafc64b536d7d699630940f9d9b68bd7  source/flipper-zero-drawing.png
bfec3649820a0c866d3f266e81f6ef67d600f4f4a3d35ac05af803389b9b72d5  flipper-model.js payload (byte-identical to the STL)
```

Binary STL: 2,169,384 bytes = 84 + 50 × **43,386 triangles** — under the
150k budget, so **no decimation** was performed (geometry is exact).

## Mesh frame (raw STL, mm)

| Axis | Range | Meaning |
|---|---|---|
| X | −33.595 … 6.495 (40.09) | width |
| Y | −24.007 … 76.295 (100.30) | length; **nose (USB end) at −Y** |
| Z | −23.000 … 2.600 (25.60) | thickness; **front face at Z≈+2.10** |

## Desk transform (applied by `js/models.js`)

`rotateY(π)` then `rotateX(π/2)` then translate → local coordinates:

```
lx = -x - 13.55      (width centred, ±20.04)
ly =  z + 23.0001    (bottom face → y = 0 … 25.60)
lz =  y - 26.1441    (length centred, ±50.15; nose → -Z)
```

Face-up, nose toward −Z, UI content-top → **+X**, canvas width (128 px)
along **Z**. Derivation: the drawing's screen window measures 37.0 × 21.0
and the D-pad "up" arrow points across the width; a 128×64 UI therefore
runs its rows along the length (≈3.5 px/mm both axes — near-square
pixels). The placeholder's content-top→−Z layout was an S1 guess and is
kept only as an alternate model.

## Calibration (measured from the mesh, ±0.1 mm)

| Feature | Mesh frame | Group-local |
|---|---|---|
| Screen window (groove outline) | x −28.5…−6.5, y 1.0…38.0 (22.0 × 37.0) | — |
| Screen quad (2:1, inside window) | centre (−17.5, 19.5) | (3.95, 25.18, −6.64), 18 × 36 |
| Face plane | z = 2.10 | y = 25.10 |
| D-pad disc (outer groove) | centre (−17.5, 51.4), r 10.25 | (3.95, 25.10, 25.26) |
| OK button (z≥2.58) | centre (−17.5, 51.5), r ≈ 2.25 | proxy r 3.0 at (3.95, 25.90, 25.26) |
| Back button (z≥2.50) | centre (−10.25, 65.5), r ≈ 3.15 | (−3.30, 25.90, 39.36), proxy r 3.5 |
| D-pad arm hit proxies | 4 boxes, r 6.7, 6.2 × 5.4 × 0.9 | in tilt group hinged at disc centre |

Buttons on the official mesh are engraved/raised geometry, not separate
objects, so `js/models.js` attaches **invisible hit proxies**
(`opacity: 0`, `userData.flash`) over them: raycasts and press animations
target the proxies; `js/scene.js` flashes them orange for 280 ms while
pressed. The mesh itself is never modified.

## Shading

Runtime weld (0.001 mm grid) + angle-threshold smoothing (35°): fillets
read smooth, machined edges stay crisp. Output stays non-indexed with
per-corner normals, so hard edges are not averaged across. One-time cost
≈60–100 ms at first build; the transformed arrays are cached for the
session.

## Regenerating / verifying

1. Open `../tools/embed-model.html` in Chrome/Firefox (`file://` ok).
2. **Regenerate**: select `source/flipper-zero-body-3d.stl`, check the
   preview + overlay against `source/flipper-zero-drawing.png`, download
   the replacement `flipper-model.js`.
3. **Verify shipped file**: loads the current `flipper-model.js`,
   re-hashes the payload and compares it with the recorded sha256.

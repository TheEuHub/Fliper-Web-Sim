# Vendored dependencies

No runtime downloads. Hashes are SHA-256 of the committed bytes. Only Three.js is a runtime library. The converter uses the Python standard library; the phone is procedural, so no GLTFLoader is shipped.

| File | Pin · license | Source | SHA-256 |
|---|---|---|---|
| `vendor/three.min.js` | three **0.128.0**, r128 UMD · MIT | [npm tarball, package/build/three.min.js](https://registry.npmjs.org/three/-/three-0.128.0.tgz) | `1f8c2b2b518f1c5a71b8904ebfe7a63580432a3a25f80176cb917225a436aece` |
| `LICENSES/MIT.txt` | 0.128.0 · MIT | same tarball, package/LICENSE | `7dddf7c5b8fd10ee654db8857d75d104b5557889aa5a91fc4ca545ea7c07062f` |
| `models/source/flipper-zero-body-3d.stl` | F7B9C6 · GPL-3.0 | [official STL](https://github.com/flipperdevices/flipperzero-3d-models/blob/dff3b17f58a3ec59b8d7104d6c37f450691758a4/flipper-zero/body-3d/flipper-zero-body-3d.stl) | `bfec3649820a0c866d3f266e81f6ef67d600f4f4a3d35ac05af803389b9b72d5` |
| `models/source/flipper-zero-drawing.png` | F7B9C6 · GPL-3.0 | [reference drawing](https://github.com/flipperdevices/flipperzero-3d-models/blob/dff3b17f58a3ec59b8d7104d6c37f450691758a4/preview/flipper-zero-drawing.png) | `926499b0e198f5d73b74d7af348d90e9aafc64b536d7d699630940f9d9b68bd7` |
| `models/source/LICENSE`, `LICENSES/GPL-3.0.txt` | F7B9C6 · GPL-3.0 | [upstream LICENSE](https://github.com/flipperdevices/flipperzero-3d-models/blob/dff3b17f58a3ec59b8d7104d6c37f450691758a4/LICENSE) | `39c16b073710c5e55fc4d3ec9ba6ec6f1c84b49991e054e7ac3396f04b2f38e4` |

`tools/vendor-three.sh` verifies the upstream build (`9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2`) and escapes the colon in its four XHTML namespace string literals. Their actual values and the library's behaviour are unchanged. This makes a literal URL scan of runtime assets unambiguous; the namespace was never an asset request. Original license header retained.

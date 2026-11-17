#!/usr/bin/env python3
"""Offline, lossless facet partitioner. No third-party Python packages.
Default: the production F7B9C6 STL → indexed, Y-up millimetre geometry.
Other assets: --id NAME input.{stl,glb} output.js. Generic STL is Y-up/mm;
static, embedded GLB triangle primitives use their scene transforms and metres.
"""
import argparse
import base64
import collections
import json
import math
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]


def stl(data):
    if len(data) >= 84 and 84 + 50 * struct.unpack_from("<I", data, 80)[0] == len(data):
        for f in struct.iter_unpack("<12fH", data[84:]):
            yield "body", (f[3:6], f[6:9], f[9:12])
    else:
        pts = [
            tuple(map(float, row.split()))
            for row in re.findall(r"\bvertex\s+([^\r\n]+)", data.decode("ascii"), re.I)
        ]
        if not pts or len(pts) % 3 or any(len(p) != 3 for p in pts):
            raise ValueError("Malformed ASCII STL")
        for i in range(0, len(pts), 3):
            yield "body", pts[i : i + 3]


def glb(data):
    magic, ver, size = struct.unpack_from("<4sII", data)
    if (magic, ver, size) != (b"glTF", 2, len(data)):
        raise ValueError("Expected GLB 2.0")
    chunks = {}
    offset = 12
    while offset < size:
        n, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunks[kind] = data[offset : offset + n]
        offset += n
    doc = json.loads(chunks[b"JSON"])
    binary = chunks[b"BIN\0"]
    if doc.get("skins") or doc.get("extensionsRequired"):
        raise ValueError("Static uncompressed GLB only")

    def accessor(i):
        a = doc["accessors"][i]
        v = doc["bufferViews"][a["bufferView"]]
        if v["buffer"] != 0 or "sparse" in a:
            raise ValueError("Embedded non-sparse accessors only")
        fmt = (
            "<"
            + {5121: "B", 5123: "H", 5125: "I", 5126: "f"}[a["componentType"]]
            * {"SCALAR": 1, "VEC3": 3}[a["type"]]
        )
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride", struct.calcsize(fmt))
        return [struct.unpack_from(fmt, binary, start + k * stride) for k in range(a["count"])]

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    def node(i, parent):
        d = doc["nodes"][i]
        x, y, z, w = d.get("rotation", [0, 0, 0, 1])
        sx, sy, sz = d.get("scale", [1, 1, 1])
        m = d.get(
            "matrix",
            [
                (1 - 2 * y * y - 2 * z * z) * sx,
                (2 * x * y + 2 * z * w) * sx,
                (2 * x * z - 2 * y * w) * sx,
                0,
                (2 * x * y - 2 * z * w) * sy,
                (1 - 2 * x * x - 2 * z * z) * sy,
                (2 * y * z + 2 * x * w) * sy,
                0,
                (2 * x * z + 2 * y * w) * sz,
                (2 * y * z - 2 * x * w) * sz,
                (1 - 2 * x * x - 2 * y * y) * sz,
                0,
                *d.get("translation", [0, 0, 0]),
                1,
            ],
        )
        m = [
            sum(parent[r + 4 * k] * m[k + 4 * c] for k in range(4))
            for c in range(4)
            for r in range(4)
        ]
        if "mesh" in d:
            mesh = doc["meshes"][d["mesh"]]
            for p in mesh["primitives"]:
                if p.get("mode", 4) != 4 or "targets" in p:
                    raise ValueError("Static TRIANGLES only")
                vs = [
                    tuple(
                        1000 * (m[k] * a + m[4 + k] * b + m[8 + k] * c + m[12 + k])
                        for k in range(3)
                    )
                    for a, b, c in accessor(p["attributes"]["POSITION"])
                ]
                ix = (
                    [v[0] for v in accessor(p["indices"])]
                    if "indices" in p
                    else list(range(len(vs)))
                )
                for j in range(0, len(ix), 3):
                    yield d.get("name", mesh.get("name", "body")), tuple(
                        vs[k] for k in ix[j : j + 3]
                    )
        for child in d.get("children", []):
            yield from node(child, m)

    for i in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        yield from node(i, ident)


def convert(src, dst, name):
    official = name == "flipper-official"
    data = src.read_bytes()
    vertices = []
    unique = {}
    parent = []
    faces = []

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for part, tri in glb(data) if src.suffix.lower() == ".glb" else stl(data):
        ix = []
        for p in tri:
            if not all(map(math.isfinite, p)):
                raise ValueError("Non-finite vertex")
            if p not in unique:
                unique[p] = len(vertices)
                parent.append(len(vertices))
                vertices.append(p)
            ix.append(unique[p])
        a, b, c = ix
        parent[root(b)] = root(a)
        parent[root(c)] = root(a)
        faces.append((part, ix))
    bounds = [(min(axis), max(axis)) for axis in zip(*vertices)]
    center = [(lo + hi) / 2 for lo, hi in bounds]
    components = collections.Counter(root(f[0]) for _, f in faces)
    shell = components.most_common(1)[0][0]
    groups = collections.defaultdict(list)
    ink = collections.defaultdict(list)
    for part, ix in faces:
        mark = False
        if official and root(ix[0]) == shell:
            tri = [vertices[i] for i in ix]
            x, y, z = [sum(v) / 3 for v in zip(*tri)]
            radial = lambda cx, cy: max(math.hypot(a - cx, b - cy) for a, b, _ in tri)
            # Buttons share vertices deep in the shell. Split along the bottoms
            # of the moulded grooves; retain every triangle and its winding.
            if min(c for _, _, c in tri) >= 0.29:
                if radial(-17.5, 51.5) < 3.42:
                    part = "ok"
                elif radial(-17.5, 51.5) < 10.67:
                    dx = y - 51.5
                    dz = x + 17.5
                    part = "dpad_" + (
                        ("right" if dx > 0 else "left")
                        if abs(dx) > abs(dz)
                        else ("down" if dz > 0 else "up")
                    )
                elif radial(-10.212, 65.5) < 3.38:
                    part = "back"
            # Existing moulded arrow/back symbols get a dark ink material. No new faces.
            r = math.hypot(x + 17.5, y - 51.5)
            mark = (
                part.startswith("dpad_") and 5.6 < r < 8.5 and z > 1.92 + 0.106 * (r - 3.76) + 0.095
            ) or (part == "back" and math.hypot(x + 10.212, y - 65.5) < 2.3 and 2.33 < z < 2.48)
        (ink if mark else groups)[part].extend(ix)
    if official:
        ox, oy, oz = center[0], center[1], bounds[2][0]
        xf = lambda x, y, z: [y - oy, z - oz, x - ox]
        screen = {
            "position": xf(-17.5, 19.5, 2.135),
            "size": [36.1, 18.05],
            "rotation": [-math.pi / 2, 0, 0],
        }
        buttons = {}
        for k, x, y in [
            ("ok", -17.5, 51.5),
            ("back", -10.212, 65.5),
            ("dpad_up", -24.6, 51.5),
            ("dpad_down", -10.4, 51.5),
            ("dpad_left", -17.5, 44.4),
            ("dpad_right", -17.5, 58.6),
        ]:
            buttons[k] = {
                "position": xf(x, y, 2.1),
                "axis": [0, -1, 0],
                "travel": 0.55 if "dpad" in k else 0.65,
                "mode": "tilt" if "dpad" in k else "slide",
            }
    else:
        xf = lambda x, y, z: [x - center[0], y - bounds[1][0], z - center[2]]
        screen = None
        buttons = {}
    pos = [v for p in vertices for v in xf(*p)]
    parts = []
    indices = []
    for part, ix in groups.items():
        parts.append(
            {
                "name": part,
                "start": len(indices),
                "count": len(ix) + len(ink[part]),
                "surfaceCount": len(ix),
            }
        )
        indices.extend(ix)
        indices.extend(ink[part])

    def pack(fmt, arr):
        return base64.b64encode(struct.pack("<" + str(len(arr)) + fmt, *arr)).decode()

    dims = [round(b - a, 5) for a, b in bounds]
    dims = [dims[1], dims[2], dims[0]] if official else dims
    obj = {
        "id": name,
        "triangles": len(faces),
        "vertices": len(vertices),
        "dimensions": dims,
        "components": len(components),
        "manifest": {"unit": "mm", "screen": screen, "buttons": buttons},
        "parts": parts,
        "indexBits": 16 if len(vertices) <= 65536 else 32,
        "pos": pack("f", pos),
        "idx": pack("H" if len(vertices) <= 65536 else "I", indices),
    }
    dst.write_text(
        "/* Generated by tools/convert-model.py. "
        + ("Official F7B9C6 geometry, GPL-3.0. " if official else "")
        + 'All source facets retained. */\n(function(FZ){"use strict";(FZ.meshes=FZ.meshes||{})['
        + json.dumps(name)
        + "]="
        + json.dumps(obj, separators=(",", ":"))
        + ";})(window.FZ);\n"
    )
    print(
        src.name,
        "→",
        dst.name,
        "\nRaw bounds (mm):",
        bounds,
        "\nDesk XYZ (mm):",
        dims,
        "\nTriangles:",
        len(faces),
        "Vertices:",
        len(vertices),
        "Components:",
        len(components),
        "\nParts:",
        {p["name"]: p["count"] // 3 for p in parts},
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "source", nargs="?", type=Path, default=ROOT / "models/source/flipper-zero-body-3d.stl"
    )
    p.add_argument("output", nargs="?", type=Path, default=ROOT / "models/flipper-model.js")
    p.add_argument("--id", default="flipper-official")
    a = p.parse_args()
    convert(a.source, a.output, a.id)

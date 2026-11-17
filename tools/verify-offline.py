#!/usr/bin/env python3
"""Offline source, provenance, conversion, and facet-identity checks."""
from base64 import b64decode
from collections import Counter
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def report(name):
    print("PASS", name, flush=True)


class Assets(HTMLParser):
    paths = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "script":
            assert a.get("type") != "module" and "src" in a
            self.paths.append(a["src"])
        if tag == "link" and a.get("rel") != "icon":
            self.paths.append(a["href"])


assets = Assets()
assets.feed((ROOT / "index.html").read_text())
for name in [*assets.paths, "index.html"]:
    assert not re.match(r"[/\\]|\w+:", name), name
    p = (ROOT / name).resolve()
    assert p.is_relative_to(ROOT) and p.is_file(), name
    assert not re.search(rb"https?://", p.read_bytes()), name
report(f"{len(assets.paths)} relative runtime assets; zero external URL literals")
seen = set()
for line in (ROOT / "DEPENDENCIES.md").read_text().splitlines():
    if not line.startswith("| `"):
        continue
    fields = line.split("|")
    digest = re.search(r"`([0-9a-f]{64})`", fields[-2])[1]
    for filename in re.findall(r"`([^`]+)`", fields[1]):
        assert sha256((ROOT / filename).read_bytes()).hexdigest() == digest, filename
        seen.add(filename)
assert all(str(p.relative_to(ROOT)) in seen for p in (ROOT / "vendor").glob("*") if p.is_file())
report(f"{len(seen)} dependency/source/license SHA-256 checks")
for p in sorted(ROOT.glob("**/*")):
    if (
        p.is_file()
        and p.suffix in (".js", ".cjs", ".mjs")
        and not {".git", "node_modules"}.intersection(p.parts)
    ):
        subprocess.run(["node", "--check", str(p)], check=True)
report("Syntax of all runtime, vendored, generated and test JavaScript")


def mesh(p):
    return json.loads(p.read_text().split("]=", 1)[1].rsplit(";}", 1)[0])


with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / "mesh.js"
    tool = str(ROOT / "tools/convert-model.py")
    src = ROOT / "models/source/flipper-zero-body-3d.stl"
    subprocess.run(
        [sys.executable, tool, str(src), str(out)], check=True, stdout=subprocess.DEVNULL
    )
    assert out.read_bytes() == (ROOT / "models/flipper-model.js").read_bytes()
    m = mesh(out)
    assert m["triangles"] == 43386 and m["vertices"] == 21693
    data = list(struct.iter_unpack("<fff", b64decode(m["pos"])))
    indices = [v[0] for v in struct.iter_unpack("<H", b64decode(m["idx"]))]
    lookup = {p: i for i, p in enumerate(data)}
    triangles = [
        (f[3:6], f[6:9], f[9:12]) for f in struct.iter_unpack("<12fH", src.read_bytes()[84:])
    ]
    points = set(p for t in triangles for p in t)
    bounds = [(min(axis), max(axis)) for axis in zip(*points)]
    cx, cy = [(a + b) / 2 for a, b in bounds[:2]]
    floor = bounds[2][0]

    def index(p):
        x, y, z = p
        return lookup[struct.unpack("<fff", struct.pack("<fff", y - cy, z - floor, x - cx))]

    assert Counter(tuple(index(p) for p in t) for t in triangles) == Counter(
        tuple(indices[j : j + 3]) for j in range(0, len(indices), 3)
    )
    offset = 0
    for part in m["parts"]:
        assert part["start"] == offset and 0 < part["surfaceCount"] <= part["count"]
        offset += part["count"]
    assert offset == len(indices) and len(m["parts"]) == 7
    report(
        "Reproducible JS; all 43,386 transformed source triangles incl. winding, no missing or duplicate facets"
    )
    stl = Path(tmp) / "triangle.stl"
    stl.write_text(
        "solid test\nfacet normal 0 1 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 0 1\nendloop\nendfacet\nendsolid test\n"
    )
    subprocess.run(
        [sys.executable, tool, "--id", "test", str(stl), str(out)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    assert mesh(out)["triangles"] == 1
    binary = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    doc = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": 36}],
        "bufferViews": [{"buffer": 0, "byteLength": 36}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "nodes": [{"scale": [2, 1, 1], "translation": [3, 2, 1], "mesh": 0}],
        "scenes": [{"nodes": [0]}],
    }
    meta = json.dumps(doc).encode()
    meta += b" " * (-len(meta) % 4)
    glb = Path(tmp) / "triangle.glb"
    glb.write_bytes(
        struct.pack("<4sII", b"glTF", 2, 28 + len(meta) + len(binary))
        + struct.pack("<I4s", len(meta), b"JSON")
        + meta
        + struct.pack("<I4s", len(binary), b"BIN\0")
        + binary
    )
    subprocess.run(
        [sys.executable, tool, "--id", "test", str(glb), str(out)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    assert mesh(out)["dimensions"] == [2000, 1000, 0]
    report("ASCII STL and transformed, embedded static GLB 2.0 inputs")

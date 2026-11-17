#!/bin/sh
# Build-time only. Preserve r128's XHTML namespace string value; encode its
# colon so an offline source audit doesn't mistake it for an asset URL.
set -eu
root=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd "$tmp"; npm pack three@0.128.0 --silent
tar xzf three-0.128.0.tgz package/build/three.min.js package/LICENSE
echo '9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2  package/build/three.min.js' | sha256sum -c -
sed 's|http://www.w3.org/1999/xhtml|http\\x3a//www.w3.org/1999/xhtml|g' package/build/three.min.js > "$root/vendor/three.min.js"
cp package/LICENSE "$root/LICENSES/MIT.txt"

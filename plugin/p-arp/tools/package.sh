#!/bin/bash
# Build a shareable p-arp: a universal (Apple Silicon + Intel) release for macOS 12+, zipped
# with install notes into dist/p-arp-<version>.zip.
#
# Signing is ad hoc (no Apple Developer ID), so macOS quarantines the plugin when it's downloaded:
# the install notes include the one Terminal command that clears that.
#
# Usage: tools/package.sh   (from plugin/p-arp; run tools/import_presets.py first to update presets)
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

BUILD=build-release
cmake -B "$BUILD" -DCMAKE_BUILD_TYPE=Release -DPARP_BUILD_TESTS=OFF \
    -DCMAKE_OSX_ARCHITECTURES="arm64;x86_64" -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0 > /dev/null
cmake --build "$BUILD" -j 8 --target ParpPlugin_AU

COMPONENT="$BUILD/plugin/ParpPlugin_artefacts/Release/AU/p-arp.component"
BINARY="$COMPONENT/Contents/MacOS/p-arp"
VERSION=$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$COMPONENT/Contents/Info.plist")

# Checks: both architectures, macOS 12 minimum, valid signature
ARCHS=$(lipo -archs "$BINARY")
[[ "$ARCHS" == *arm64* && "$ARCHS" == *x86_64* ]] || { echo "not universal: $ARCHS"; exit 1; }
MINOS=$(vtool -show-build -arch arm64 "$BINARY" | awk '/minos/ { print $2 }')
[[ "$MINOS" == "12.0" ]] || { echo "minimum macOS is $MINOS, expected 12.0"; exit 1; }
codesign --force --sign - "$COMPONENT"
codesign --verify --strict "$COMPONENT"

STAGE=$(mktemp -d)/p-arp-$VERSION
mkdir -p "$STAGE"
ditto "$COMPONENT" "$STAGE/p-arp.component"
cp tools/INSTALL.txt "$STAGE/INSTALL.txt"
mkdir -p dist
rm -f "dist/p-arp-$VERSION.zip"
ditto -c -k --norsrc --noextattr --keepParent "$STAGE" "dist/p-arp-$VERSION.zip"
echo "dist/p-arp-$VERSION.zip ($ARCHS, macOS $MINOS+)"

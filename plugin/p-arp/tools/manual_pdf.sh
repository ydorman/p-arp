#!/bin/bash
# Build the user manual PDF (docs/p-arp-user-manual.pdf) from docs/user-manual.md: Markdown to
# print-styled HTML (tools/manual_html.js), then printed to PDF by headless Google Chrome.
#
# The Markdown renderer (marked) is installed once into build-manual/ (ignored by git).
#
# Usage: tools/manual_pdf.sh   (from plugin/p-arp)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
WORK=build-manual

if [ ! -d "$WORK/node_modules/marked" ]; then
    mkdir -p "$WORK"
    npm install --silent --no-save --prefix "$WORK" marked@12.0.2
fi

NODE_PATH="$WORK/node_modules" node tools/manual_html.js docs/user-manual.md "$WORK/manual.html"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
    --print-to-pdf=docs/p-arp-user-manual.pdf "file://$PWD/$WORK/manual.html" 2> /dev/null
echo "Wrote docs/p-arp-user-manual.pdf"

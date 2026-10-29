#!/usr/bin/env python3
"""Import presets saved in Logic into the repo as factory presets.

Reads the .aupreset files Logic saves for p-arp (Save As in the plugin's preset menu) and writes
one presets/<name>.xml per preset: the plugin's state minus per-project settings (debug log,
window size). The plugin embeds presets/*.xml and lists them in Logic's preset menu, sorted by
file name. Only the Presets subfolder is imported (files saved next to it are experiments).

Usage: tools/import_presets.py [folder]   (default: ~/Library/Audio/Presets/p-arp/p-arp/Presets)
Existing presets/*.xml are replaced; presets removed in Logic are removed here too.
"""

import glob
import os
import plistlib
import struct
import sys
import xml.etree.ElementTree as ET

JUCE_STATE_MAGIC = 0x21324356  # copyXmlToBinary
PER_PROJECT = ("debugLog", "editorWidth")

source = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Library/Audio/Presets/p-arp/p-arp/Presets")
target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "presets")

files = sorted(glob.glob(os.path.join(source, "*.aupreset")))
if not files:
    sys.exit(f"No .aupreset files in {source}")

for old in glob.glob(os.path.join(target, "*.xml")):
    os.remove(old)

for path in files:
    name = os.path.splitext(os.path.basename(path))[0]
    blob = plistlib.load(open(path, "rb"))["jucePluginState"]
    magic, size = struct.unpack("<II", blob[:8])
    if magic != JUCE_STATE_MAGIC:
        sys.exit(f"{path}: not a JUCE plugin state")
    root = ET.fromstring(blob[8 : 8 + size].rstrip(b"\0"))
    for attribute in PER_PROJECT:
        root.attrib.pop(attribute, None)
    root.set("name", name)
    params = sorted(root.findall("PARAM"), key=lambda p: p.get("id"))
    lines = [f'<ParpPreset name="{name}">']
    lines += [f'  <PARAM id="{p.get("id")}" value="{float(p.get("value")):g}"/>' for p in params]
    lines.append("</ParpPreset>")
    with open(os.path.join(target, name + ".xml"), "w") as out:
        out.write("\n".join(lines) + "\n")
    print(f"{name}: {len(params)} parameters")

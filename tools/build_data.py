#!/usr/bin/env python3
# diallcode.site data compiler
# Copyright (c) 2026 whispr.dev
#
# Turns Google's libphonenumber resource files (Apache-2.0) into small,
# lazily loaded JavaScript chunks for the browser:
#
#   site/data/cc/<cc>.js   geocoding + original carrier + time zones, one per calling code
#   site/data/areas.js     short geographic prefixes (area codes) for every code, for
#                     partial look-ups like "0161" or "+49 30"
#   site/data/short.js     short-number patterns per region (emergency, toll-free, ...)
#   site/data/base.js      small always-loaded tables (time zone -> calling codes)
#
# Usage (from the repo root):
#   py tools\build_data.py <path-to-libphonenumber-checkout>      (Windows)
#   python3 tools/build_data.py <path-to-libphonenumber-checkout> (Linux)
#
# The checkout only needs the resources/ folder:
#   git clone --depth 1 --filter=blob:none --sparse https://github.com/google/libphonenumber
#   cd libphonenumber && git sparse-checkout set resources

from __future__ import annotations

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "data")

B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def b36(n: int) -> str:
    if n < 0:
        raise ValueError("negative")
    if n == 0:
        return "0"
    s = []
    while n:
        n, r = divmod(n, 36)
        s.append(B36[r])
    return "".join(reversed(s))


def read_prefix_file(path: str) -> list[tuple[str, str]]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "|" not in line:
                continue
            p, d = line.split("|", 1)
            p = p.strip()
            d = d.strip()
            if not p.isdigit() or not d:
                continue
            rows.append((p, d))
    return rows


class Table:
    """Prefix -> string table, encoded compactly.

    Encoding (decoded by assets/engine.js, function decodeTable):
      { "t": [strings...], "e": { "<len>": "<runs>" } }
    where <runs> is a comma list of  delta[.count]:index  in base 36.
      delta  = start - (previous end + 1)   (first run: start itself)
      count  = run length - 1 (omitted when 0)
      index  = position in t
    A run is a block of numerically consecutive prefixes of the same length
    that all map to the same string. Length 0 means "whole calling code".
    """

    def __init__(self) -> None:
        self.strings: list[str] = []
        self.index: dict[str, int] = {}
        self.by_len: dict[int, dict[int, int]] = defaultdict(dict)

    def add(self, nsn_prefix: str, text: str) -> None:
        if text not in self.index:
            self.index[text] = len(self.strings)
            self.strings.append(text)
        L = len(nsn_prefix)
        val = int(nsn_prefix) if L else 0
        self.by_len[L][val] = self.index[text]

    def empty(self) -> bool:
        return not self.strings

    def encode(self) -> dict:
        enc = {}
        for L in sorted(self.by_len):
            items = sorted(self.by_len[L].items())
            runs = []
            start, end, idx = items[0][0], items[0][0], items[0][1]
            for v, i in items[1:]:
                if v == end + 1 and i == idx:
                    end = v
                else:
                    runs.append((start, end, idx))
                    start, end, idx = v, v, i
            runs.append((start, end, idx))
            parts = []
            prev_end = -1
            for s, e, i in runs:
                delta = s - (prev_end + 1)
                cnt = e - s
                parts.append(b36(delta) + ("." + b36(cnt) if cnt else "") + ":" + b36(i))
                prev_end = e
            enc[str(L)] = ",".join(parts)
        return {"t": self.strings, "e": enc}


def js_dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def strip_pattern(s: str | None) -> str | None:
    if s is None:
        return None
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    return re.sub(r"\s+", "", s)


def build(lpn: str) -> None:
    res = os.path.join(lpn, "resources")
    geo_dir = os.path.join(res, "geocoding", "en")
    car_dir = os.path.join(res, "carrier", "en")
    tz_file = os.path.join(res, "timezones", "map_data.txt")
    short_xml = os.path.join(res, "ShortNumberMetadata.xml")
    for p in (geo_dir, car_dir, tz_file, short_xml):
        if not os.path.exists(p):
            sys.exit(f"missing {p} - is this a libphonenumber checkout?")

    os.makedirs(os.path.join(OUT, "cc"), exist_ok=True)

    geo: dict[str, Table] = defaultdict(Table)
    car: dict[str, Table] = defaultdict(Table)
    tz: dict[str, Table] = defaultdict(Table)
    areas: dict[str, Table] = defaultdict(Table)
    nanp_rows: list[tuple[str, str]] = []

    for f in sorted(os.listdir(geo_dir)):
        if not f.endswith(".txt"):
            continue
        cc = f[:-4]
        for p, d in read_prefix_file(os.path.join(geo_dir, f)):
            if not p.startswith(cc):
                continue
            nsn = p[len(cc):]
            geo[cc].add(nsn, d)
            if len(nsn) <= 4:
                areas[cc].add(nsn, d)
            if cc == "1":
                nanp_rows.append((nsn, d))

    for f in sorted(os.listdir(car_dir)):
        if not f.endswith(".txt"):
            continue
        cc = f[:-4]
        for p, d in read_prefix_file(os.path.join(car_dir, f)):
            if p.startswith(cc):
                car[cc].add(p[len(cc):], d)

    # Time zones: prefixes include the calling code; find it from the real list
    # of calling codes in PhoneNumberMetadata.xml (country codes are prefix-free
    # per ITU-T E.164, so at most one can match).
    main_xml = os.path.join(res, "PhoneNumberMetadata.xml")
    if not os.path.exists(main_xml):
        sys.exit(f"missing {main_xml}")
    known_ccs = {
        t.get("countryCode")
        for t in ET.parse(main_xml).getroot().iter("territory")
        if t.get("countryCode")
    }
    tz_rows = read_prefix_file(tz_file)
    cc_list = sorted(known_ccs, key=len, reverse=True)
    tz_to_cc: dict[str, set[str]] = defaultdict(set)
    for p, d in tz_rows:
        cc = next((c for c in cc_list if p.startswith(c) and len(c) <= len(p)), None)
        if cc is None:
            continue
        zones = d.replace("&", " ")
        tz[cc].add(p[len(cc):], zones)
        for z in d.split("&"):
            tz_to_cc[z].add(cc)

    # NANP area-code summaries: state/province (from NPA line) + top places by
    # number of exchange (NPA-NXX) blocks.
    npa_state: dict[str, str] = {}
    npa_places: dict[str, Counter] = defaultdict(Counter)
    for nsn, d in nanp_rows:
        if len(nsn) == 3:
            npa_state[nsn] = d
        elif len(nsn) == 6:
            npa_places[nsn[:3]][d] += 1
    nanp_summary = {}
    for npa in sorted(set(npa_state) | set(npa_places)):
        top = [name for name, _ in npa_places[npa].most_common(6)]
        nanp_summary[npa] = [npa_state.get(npa, ""), top, sum(npa_places[npa].values())]

    # per-code chunks
    all_ccs = sorted(set(geo) | set(car) | set(tz), key=lambda c: (len(c), c))
    manifest = []
    total = 0
    for cc in all_ccs:
        chunk = {}
        if cc in geo and not geo[cc].empty():
            chunk["g"] = geo[cc].encode()
        if cc in car and not car[cc].empty():
            chunk["c"] = car[cc].encode()
        if cc in tz and not tz[cc].empty():
            chunk["z"] = tz[cc].encode()
        if cc == "1":
            chunk["npa"] = nanp_summary
        body = f'DCX.chunk("{cc}",{js_dump(chunk)});\n'
        with open(os.path.join(OUT, "cc", f"{cc}.js"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(body)
        total += len(body.encode("utf-8"))
        manifest.append(cc)

    with open(os.path.join(OUT, "areas.js"), "w", encoding="utf-8", newline="\n") as fh:
        enc = {cc: t.encode() for cc, t in sorted(areas.items()) if not t.empty()}
        fh.write(f"DCX.areas({js_dump(enc)});\n")

    # Short numbers
    tree = ET.parse(short_xml)
    short = {}
    cats = {
        "emergency": "em",
        "tollFree": "tf",
        "premiumRate": "pr",
        "standardRate": "sr",
        "shortCode": "sc",
        "carrierSpecific": "cs",
        "smsServices": "sms",
    }
    for terr in tree.getroot().iter("territory"):
        rid = terr.get("id")
        entry = {}
        gd = terr.find("generalDesc")
        if gd is not None:
            pat = strip_pattern(gd.findtext("nationalNumberPattern"))
            if pat:
                entry["g"] = pat
        for tag, key in cats.items():
            el = terr.find(tag)
            if el is None:
                continue
            pat = strip_pattern(el.findtext("nationalNumberPattern"))
            if not pat or pat == "NA":
                continue
            entry[key] = pat
            ex = el.findtext("exampleNumber")
            if key == "em" and ex:
                entry["emx"] = ex.strip()
        if entry:
            short[rid] = entry
    # validate every regex compiles in Python's engine as a sanity check
    for rid, e in short.items():
        for k, v in e.items():
            if k == "emx":
                continue
            re.compile(v)
    with open(os.path.join(OUT, "short.js"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"DCX.shortData({js_dump(short)});\n")

    base = {
        "chunks": manifest,
        "tz": {z: sorted(c) for z, c in sorted(tz_to_cc.items())},
    }
    with open(os.path.join(OUT, "base.js"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"DCX.base({js_dump(base)});\n")

    print(f"chunks: {len(manifest)} files, {total/1024:.0f} KiB total")
    for name in ("areas.js", "short.js", "base.js"):
        print(f"{name}: {os.path.getsize(os.path.join(OUT, name))/1024:.0f} KiB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: build_data.py <path-to-libphonenumber-checkout>")
    build(sys.argv[1])

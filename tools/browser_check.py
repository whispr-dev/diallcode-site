#!/usr/bin/env python3
# diallcode.site — real-browser smoke test (Playwright + Chromium)
# Copyright (c) 2026 whispr.dev
#
#   pip install playwright && python -m playwright install chromium
#   python tools/browser_check.py [out_dir]
#
# Serves the site on 127.0.0.1, then also opens it straight from disk
# (file://), types a set of inputs, checks the top result text, records any
# console errors / CSP violations, and saves screenshots.

import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent / "site"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "_shots"
OUT.mkdir(parents=True, exist_ok=True)

CASES = [
    # input, home, text that must appear in the main card
    ("020 7946 0123", "GB", "Reserved for films, TV & fiction"),
    ("(212) 555-0199", "GB", "New York"),
    ("044 123 4567", "UA", "Kyiv"),
    ("999", "GB", "Emergency: police, fire, ambulance, coastguard"),
    ("0161", "GB", "Manchester"),
    ("+81 3 1234 5678", "GB", "Tokyo"),
    ("1-800-FLOWERS", "US", "Toll-free"),
    ("+881 6 1234 5678", "GB", "Iridium"),
    ("+44", "GB", "Country code"),
    ("212", "GB", "New York"),
]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    os.chdir(ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), Quiet)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def check(page, base, label, shots=True):
    errors = []
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.goto(base)
    page.wait_for_selector("#q")
    page.wait_for_function("document.querySelectorAll('#home option').length > 200")
    fails = 0
    for i, (inp, home, want) in enumerate(CASES):
        page.select_option("#home", home)
        page.fill("#q", "")
        page.wait_for_selector("#results .card.empty")  # stale results are gone
        page.type("#q", inp, delay=8)
        try:
            page.wait_for_function(
                "w => { const c = document.querySelector('#results .card'); return c && c.innerText.includes(w) && !c.querySelector('.loading:not(:empty)') || (c && c.innerText.includes(w) && !/Loading/.test(c.innerText)); }",
                arg=want, timeout=8000)
            ok = True
        except Exception:
            ok = False
        txt = page.inner_text("#results .card") if page.query_selector("#results .card") else "(no card)"
        first = " | ".join(t for t in txt.splitlines()[:3] if t.strip())
        print(f"  [{label}] {'PASS' if ok else 'FAIL'} {inp!r:22} home={home}: {first[:110]}")
        if not ok:
            fails += 1
            print("      card text:", txt[:600].replace("\n", " / "))
        if shots and i in (0, 3, 6, 9):
            page.screenshot(path=str(OUT / f"{label}-{i:02d}.png"), full_page=True)
    # words <-> numbers keypad
    page.fill("#q", "")
    page.click("#vclear") if page.is_visible("#vclear") else None
    for k in "080010244":
        page.click(f'.keypad .key[data-key="{k}"]')
    try:
        page.wait_for_function("() => document.querySelector('#vout').innerText.includes('BIG')", timeout=8000)
        ok1 = True
    except Exception:
        ok1 = False
    page.fill("#vq", "0800 buy dogs")
    try:
        page.wait_for_function("() => document.querySelector('#vout').innerText.includes('0800 289 3647')", timeout=4000)
        ok2 = True
    except Exception:
        ok2 = False
    print(f"  [{label}] {'PASS' if ok1 else 'FAIL'} keypad 0800 102 44 -> words: {page.inner_text('#vout')[:0] or ('BIG found' if ok1 else 'missing')}")
    print(f"  [{label}] {'PASS' if ok2 else 'FAIL'} 0800 buy dogs -> 0800 289 3647")
    fails += (not ok1) + (not ok2)
    if shots:
        page.locator("#vanity").screenshot(path=str(OUT / f"{label}-vanity.png"))
    return fails, errors


def main():
    httpd = serve()
    port = httpd.server_address[1]
    total_fail = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, vp in (("desktop", {"width": 1366, "height": 900}), ("mobile", {"width": 390, "height": 844})):
            ctx = browser.new_context(viewport=vp, locale="en-GB", timezone_id="Europe/London",
                                      device_scale_factor=1, is_mobile=(label == "mobile"), has_touch=(label == "mobile"))
            page = ctx.new_page()
            fails, errs = check(page, f"http://127.0.0.1:{port}/", label)
            total_fail += fails
            for e in errs:
                print("   ", label, e)
            total_fail += len([e for e in errs if "error" in e])
            # horizontal overflow check
            ow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            print(f"  [{label}] horizontal overflow: {ow}px")
            if ow > 0:
                total_fail += 1
            ctx.close()
        # straight from disk, as when double-clicking index.html
        ctx = browser.new_context(viewport={"width": 1280, "height": 860}, locale="en-US", timezone_id="America/New_York")
        page = ctx.new_page()
        fails, errs = check(page, (ROOT / "index.html").as_uri(), "file", shots=False)
        total_fail += fails
        for e in errs:
            print("    file", e)
        total_fail += len([e for e in errs if "error" in e])
        auto = page.evaluate("document.querySelector('#home option').textContent")
        print("  [file] auto home option:", auto)
        ctx.close()
        browser.close()
    httpd.shutdown()
    print("\nRESULT:", "ALL GOOD" if not total_fail else f"{total_fail} problem(s)")
    sys.exit(1 if total_fail else 0)


if __name__ == "__main__":
    main()

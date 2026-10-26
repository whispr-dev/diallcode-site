# diallcode.site

One-page phone-number tool by whispr.dev: country codes, area codes, number
types, local time, original network, emergency & service short codes, film/TV
reserved ranges — and a ranked "most likely" guess when there's no `+`.
Plus a little 12-key **words ↔ numbers** pad: `0800 BUY DOGS` → `0800 289 3647`,
and `0800 102 44` → `0800 10 BIG`.
Pure static HTML/CSS/JS. Everything runs in the visitor's browser.

## What goes on the server

Upload the **contents** of `site/` so that `index.html` sits directly in the
web root of diallcode.site:

```
index.html
THIRD-PARTY-NOTICES.txt
assets/   styles.css  app.js  engine.js  vanity.js  meta.js  vendor/libphonenumber-max.js
data/     base.js  short.js  areas.js  words.js  cc/<country code>.js  (208 files)
```

No build step, no server code, no database. `tools/` and this README stay off
the server.

Optional, if it's nginx — gzip shrinks the data files to about a third:

```nginx
gzip on;
gzip_types application/javascript text/css text/plain;
location /data/   { add_header Cache-Control "public, max-age=604800"; }
location /assets/ { add_header Cache-Control "public, max-age=86400"; }
```

## Try it locally

Double-click `site/index.html` — it works straight from disk (the data files
load as plain scripts, so no local server is needed). Or:

```powershell
cd site
py -m http.server 8000
# then open http://localhost:8000
```

## How it works (short version)

* `assets/vendor/libphonenumber-max.js` — libphonenumber-js **1.13.15**
  (pinned, vendored, no CDN). Parsing, validation, number types, formatting.
* `assets/engine.js` — reads the digits every plausible way: international,
  domestic in each of 245 regions, after an exit code (00, 011, 0011, 8~10…),
  missing `+`, short code, bare country code, area code. Readings that land on
  the same real number are merged, then scored on: valid pattern, trunk prefix,
  your spacing/brackets/hyphen style, a reserved-range hit, where you're
  dialling from, and a gentle population prior. Percentages are estimates.
* `assets/meta.js` — curated extras with sources: Ofcom / NANPA / ACMA / Arcep /
  Bundesnetzagentur / PTS drama ranges, UK & NANP range notes, ITU special
  codes (+800, +881, +888…), short-code labels (999, 911, 112, 116xxx…).
  Short-code labels only show where Google's short-number data agrees.
* `data/` — Google libphonenumber geocoding, carrier, time-zone and short-number
  data compiled by `tools/build_data.py`, lazily loaded per country code.
* `assets/vanity.js` + `data/words.js` — the keypad converter. Letters → digits
  with the standard E.161 keypad; digits → words keeps the front of the number
  (first group as typed: `0800`, `+44`, `1-800`) and spells the end with one to
  three everyday words. 33.6k words from SCOWL sizes 10/20/35, rude words
  filtered, loaded only when someone uses the pad (~93 KB gzipped).

"Dialling from" is auto-detected from browser language + time zone and can be
changed; the choice is remembered in localStorage. The typed number goes in the
URL `#fragment` (never sent to the server), so results are shareable.

## Refresh the data (when Google publishes new metadata)

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/google/libphonenumber C:\github\libphonenumber
cd C:\github\libphonenumber
git sparse-checkout set resources
cd <this folder>
py tools\build_data.py C:\github\libphonenumber
```

To bump libphonenumber-js too: `npm view libphonenumber-js version`, then
`npm install --no-save libphonenumber-js@<that version>`, copy
`node_modules/libphonenumber-js/bundle/libphonenumber-max.js` over
`site/assets/vendor/` (delete its last `//# sourceMappingURL` line) and update the
version in this README and `site/THIRD-PARTY-NOTICES.txt`.

## Rebuild the word list

```powershell
npm ci
node tools\build_words.js
```

`package.json` only pins the two build-time packages (`wordlist-english`,
`badwords-list`); nothing from `node_modules` ships to the site.

## Tests

```powershell
node tools\engine_test.js            # 48 lookups + 7 vanity conversions
node tools\engine_test.js --show     # same, with the ranked list and details
pip install playwright
py -m playwright install chromium
py tools\browser_check.py            # real Chromium: http + file://, desktop + mobile, screenshots in tools\_shots
```

Copyright (c) 2026 whispr.dev. Third-party licences: `site/THIRD-PARTY-NOTICES.txt`.

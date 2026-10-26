/* diallcode.site — lookup engine
 * Copyright (c) 2026 whispr.dev
 *
 * Pure logic, no DOM. Needs (loaded first): libphonenumber (vendor bundle),
 * DCMETA (meta.js), DCX.base(...) (data/base.js). Everything else is loaded
 * on demand and the caller re-runs analyse() when it arrives.
 *
 * Mental model: we read the typed digits every plausible way (as an
 * international number, as a domestic number in each country, after an exit
 * code, as a short code, as a country or area code), score each reading,
 * merge readings that land on the same real number, and rank them.
 */
(function (g) {
  "use strict";

  const L = g.libphonenumber;
  const M = g.DCMETA;
  if (!L || !M) throw new Error("diallcode: libphonenumber and meta.js must load before engine.js");

  // ------------------------------------------------------------------ store
  const store = { chunks: Object.create(null), areas: null, short: null, base: null, chunkSet: null };
  const waiting = Object.create(null); // name -> [resolve]

  function settle(name) {
    const list = waiting[name];
    if (list) { delete waiting[name]; for (const fn of list) fn(true); }
  }

  const B36 = (s) => parseInt(s, 36);

  // See tools/build_data.py (class Table) for the format.
  function decodeTable(t) {
    if (!t) return null;
    const lens = [];
    const byLen = Object.create(null);
    for (const key of Object.keys(t.e)) {
      const Lx = +key;
      const starts = [], ends = [], idx = [];
      let prevEnd = -1;
      const runs = t.e[key] ? t.e[key].split(",") : [];
      for (const run of runs) {
        const c = run.indexOf(":");
        const head = run.slice(0, c);
        const dot = head.indexOf(".");
        const delta = B36(dot < 0 ? head : head.slice(0, dot));
        const cnt = dot < 0 ? 0 : B36(head.slice(dot + 1));
        const s = prevEnd + 1 + delta;
        const e = s + cnt;
        starts.push(s); ends.push(e); idx.push(B36(run.slice(c + 1)));
        prevEnd = e;
      }
      byLen[Lx] = { starts, ends, idx };
      lens.push(Lx);
    }
    lens.sort((a, b) => b - a);
    return { t: t.t, lens, byLen };
  }

  function findRun(tab, v) {
    const { starts, ends } = tab;
    let lo = 0, hi = starts.length - 1, at = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= v) { at = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return at >= 0 && v <= ends[at] ? at : -1;
  }

  // All matches, shortest prefix first, with repeated texts removed.
  function tableChain(tbl, nsn) {
    if (!tbl) return [];
    const out = [];
    for (let i = tbl.lens.length - 1; i >= 0; i--) {
      const Lx = tbl.lens[i];
      if (Lx > nsn.length) continue;
      const tab = tbl.byLen[Lx];
      const v = Lx === 0 ? 0 : +nsn.slice(0, Lx);
      const at = findRun(tab, v);
      if (at < 0) continue;
      const text = tbl.t[tab.idx[at]];
      if (!out.length || out[out.length - 1].text !== text) out.push({ text, len: Lx });
    }
    return out;
  }

  function tableLookup(tbl, nsn) {
    const c = tableChain(tbl, nsn);
    return c.length ? c[c.length - 1] : null;
  }

  // Entries whose prefix starts with `part` (for "0161…" style partials).
  function tablePrefixSearch(tbl, part, limit) {
    if (!tbl || !part) return [];
    const out = [];
    const seen = new Set();
    const lensAsc = tbl.lens.slice().sort((a, b) => a - b);
    for (const Lx of lensAsc) {
      if (Lx < part.length || Lx === 0) continue;
      const tab = tbl.byLen[Lx];
      const scale = Math.pow(10, Lx - part.length);
      const lo = +part * scale, hi = (+part + 1) * scale - 1;
      let i = Math.max(0, findFirstEndAtLeast(tab, lo));
      for (; i < tab.starts.length && tab.starts[i] <= hi; i++) {
        if (tab.ends[i] < lo) continue;
        const s = Math.max(tab.starts[i], lo);
        const text = tbl.t[tab.idx[i]];
        const prefix = String(s).padStart(Lx, "0");
        if (seen.has(text)) continue;
        seen.add(text);
        out.push({ prefix, text, exact: Lx === part.length });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  function findFirstEndAtLeast(tab, v) {
    let lo = 0, hi = tab.ends.length - 1, ans = tab.ends.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (tab.ends[mid] >= v) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans;
  }

  function compileShort(obj) {
    const out = Object.create(null);
    for (const r of Object.keys(obj)) {
      const e = obj[r];
      const c = {};
      for (const k of Object.keys(e)) {
        if (k === "emx") continue;
        try { c[k] = new RegExp("^(?:" + e[k] + ")$"); } catch (_) { /* skip bad pattern */ }
      }
      out[r] = c;
    }
    return out;
  }

  const DCX = {
    chunk(cc, obj) {
      store.chunks[cc] = {
        g: decodeTable(obj.g),
        c: decodeTable(obj.c),
        z: decodeTable(obj.z),
        npa: obj.npa || null,
      };
      settle("cc:" + cc);
    },
    areas(obj) {
      const a = Object.create(null);
      for (const cc of Object.keys(obj)) a[cc] = decodeTable(obj[cc]);
      store.areas = a;
      settle("areas");
    },
    shortData(obj) { store.short = compileShort(obj); settle("short"); },
    words(obj) { if (g.DCV) g.DCV.load(obj); store.words = true; settle("words"); },
    base(obj) { store.base = obj; store.chunkSet = new Set(obj.chunks); settle("base"); },
  };
  g.DCX = DCX;

  // ------------------------------------------------------------- loading
  let dataRoot = "data/";
  let loader = function (url) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = url;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("failed to load " + url));
      document.head.appendChild(s);
    });
  };
  const inflight = Object.create(null);
  const failed = new Set();

  function isLoaded(name) {
    if (name === "areas") return !!store.areas;
    if (name === "short") return !!store.short;
    if (name === "words") return !!store.words;
    if (name.startsWith("cc:")) return !!store.chunks[name.slice(3)];
    return false;
  }

  function hasChunk(cc) { return !!(store.chunkSet && store.chunkSet.has(cc)); }

  function need(name) {
    if (isLoaded(name)) return Promise.resolve(true);
    if (failed.has(name)) return Promise.resolve(false);
    if (inflight[name]) return inflight[name];
    const url = name === "areas" ? dataRoot + "areas.js"
      : name === "short" ? dataRoot + "short.js"
      : name === "words" ? dataRoot + "words.js"
      : dataRoot + "cc/" + name.slice(3) + ".js";
    const p = new Promise(function (resolve) {
      (waiting[name] = waiting[name] || []).push(resolve);
      loader(url).then(function () {
        // the file calls DCX.* which settles; guard against a file that didn't
        if (!isLoaded(name)) settle(name);
      }, function () { delete inflight[name]; failed.add(name); settle(name); });
    });
    inflight[name] = p;
    return p;
  }

  // ------------------------------------------------------------- regions
  const meta = new L.Metadata();
  const REGIONS = L.getCountries();
  const REGION_SET = new Set(REGIONS);
  const regionCache = Object.create(null);
  const CC_TO_REGIONS = Object.create(null);
  const NONGEO = new Set();

  for (const r of REGIONS) {
    const cc = L.getCountryCallingCode(r);
    (CC_TO_REGIONS[cc] = CC_TO_REGIONS[cc] || []).push(r);
  }
  for (const cc of ["800", "808", "870", "878", "881", "882", "883", "888", "979"]) {
    if (meta.isNonGeographicCallingCode && meta.isNonGeographicCallingCode(cc)) NONGEO.add(cc);
  }
  // main region per calling code = first in libphonenumber's list
  {
    const ccc = meta.metadata && meta.metadata.country_calling_codes;
    if (ccc) for (const cc of Object.keys(ccc)) if (CC_TO_REGIONS[cc]) CC_TO_REGIONS[cc] = ccc[cc].slice();
  }
  const ALL_CC = new Set(Object.keys(CC_TO_REGIONS).concat(Array.from(NONGEO)));

  const COMMON_EXITS = ["00", "011", "0011", "010", "001", "000", "009", "119", "810", "002", "005", "007", "008", "012", "013", "014", "0", "99"];

  function regionInfo(r) {
    if (regionCache[r]) return regionCache[r];
    meta.selectNumberingPlan(r);
    const p = meta.numberingPlan;
    const np = p.nationalPrefix();
    const iddPat = p.IDDPrefix();
    const pref = p.defaultIDDPrefix();
    let iddRe = null;
    try { iddRe = new RegExp("^(?:" + iddPat + ")"); } catch (_) { iddRe = null; }
    let exit = typeof pref === "string" && pref ? pref : null;
    if (!exit && /^\d+$/.test(iddPat)) exit = iddPat;
    if (!exit && iddRe) {
      const full = new RegExp("^(?:" + iddPat + ")$");
      exit = COMMON_EXITS.find((x) => full.test(x)) || null;
    }
    const info = {
      region: r,
      cc: p.callingCode(),
      trunk: typeof np === "string" ? np : "",
      iddRe,
      exit,
      main: (CC_TO_REGIONS[p.callingCode()] || [])[0] === r,
    };
    regionCache[r] = info;
    return info;
  }

  let displayNames = null;
  try { displayNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (_) { displayNames = null; }
  function regionName(r) {
    if (!r) return "";
    if (M.NAME_FALLBACK[r]) return M.NAME_FALLBACK[r];
    try { const n = displayNames && displayNames.of(r); if (n && n !== r) return n; } catch (_) { /* unknown */ }
    return r;
  }

  function prior(r) {
    const p = M.POP[r];
    // cube-root-ish: big countries matter more, but not 40x more
    return Math.max(0.03, Math.pow(p == null ? 0.05 : p, 0.35));
  }

  // ---------------------------------------------------------- home region
  const TZ_CA = /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Glace_Bay|Goose_Bay|Whitehorse|Dawson|Dawson_Creek|Fort_Nelson|Iqaluit|Rankin_Inlet|Resolute|Cambridge_Bay|Inuvik|Yellowknife|Swift_Current|Atikokan|Creston|Blanc-Sablon|Montreal|Nipigon|Thunder_Bay|Rainy_River|Pangnirtung)$/;
  const TZ_NANP_OTHER = {
    "America/Puerto_Rico": "PR", "America/Jamaica": "JM", "America/Nassau": "BS", "America/Barbados": "BB",
    "America/Port_of_Spain": "TT", "America/Santo_Domingo": "DO", "Atlantic/Bermuda": "BM", "Pacific/Guam": "GU",
    "America/Cayman": "KY", "America/Antigua": "AG", "America/Grenada": "GD", "America/St_Lucia": "LC",
    "America/St_Vincent": "VC", "America/St_Kitts": "KN", "America/Dominica": "DM", "America/Anguilla": "AI",
    "America/Montserrat": "MS", "America/Tortola": "VG", "America/St_Thomas": "VI", "America/Grand_Turk": "TC",
    "America/Lower_Princes": "SX", "Pacific/Pago_Pago": "AS", "Pacific/Saipan": "MP",
  };

  const TZ_ALIAS = {
    "Asia/Calcutta": "Asia/Kolkata", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv", "Atlantic/Faeroe": "Atlantic/Faroe",
    "America/Godthab": "America/Nuuk", "Pacific/Truk": "Pacific/Chuuk", "Pacific/Ponape": "Pacific/Pohnpei",
    "Asia/Ulan_Bator": "Asia/Ulaanbaatar", "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "Asia/Dacca": "Asia/Dhaka", "Asia/Thimbu": "Asia/Thimphu", "Africa/Asmera": "Africa/Asmara",
  };

  function detectHome(nav, tzName) {
    if (tzName && store.base && !store.base.tz[tzName] && TZ_ALIAS[tzName]) tzName = TZ_ALIAS[tzName];
    const langs = [];
    try { if (nav && nav.languages) langs.push(...nav.languages); if (nav && nav.language) langs.push(nav.language); } catch (_) { /* ignore */ }
    let langRegion = null;
    for (const l of langs) {
      const m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(String(l));
      if (m && REGION_SET.has(m[1].toUpperCase())) { langRegion = m[1].toUpperCase(); break; }
    }
    let tzRegion = null;
    const tzCCs = (store.base && tzName && store.base.tz[tzName]) || [];
    if (tzCCs.length) {
      if (langRegion && tzCCs.includes(L.getCountryCallingCode(langRegion))) return langRegion;
      const cc = tzCCs[0];
      if (cc === "1") tzRegion = TZ_NANP_OTHER[tzName] || (TZ_CA.test(tzName) ? "CA" : "US");
      else tzRegion = (CC_TO_REGIONS[cc] || [])[0] || null;
    }
    return tzRegion || langRegion || null;
  }

  // ---------------------------------------------------------- normalising
  const KEYPAD = { A: 2, B: 2, C: 2, D: 3, E: 3, F: 3, G: 4, H: 4, I: 4, J: 5, K: 5, L: 5, M: 6, N: 6, O: 6, P: 7, Q: 7, R: 7, S: 7, T: 8, U: 8, V: 8, W: 9, X: 9, Y: 9, Z: 9 };
  const ND = /\p{Nd}/u;

  function asciiDigits(s) {
    let out = "";
    for (const ch of s) {
      if (ch >= "0" && ch <= "9") { out += ch; continue; }
      if (ND.test(ch)) {
        // Unicode decimal digits come in contiguous runs of ten (0..9), and
        // adjacent runs are whole runs, so distance-from-start mod 10 is the value.
        const cp = ch.codePointAt(0);
        let back = 0;
        while (back < 200 && cp - back - 1 >= 0 && ND.test(String.fromCodePoint(cp - back - 1))) back++;
        out += String(back % 10);
        continue;
      }
      out += ch;
    }
    return out;
  }

  function normalise(raw) {
    let s = String(raw == null ? "" : raw).slice(0, 80);
    const n = { raw: s, notes: [] };
    s = s.normalize("NFKC");
    s = asciiDigits(s);

    const wa = /wa\.me\/\+?(\d{6,15})/i.exec(s);
    if (wa) { s = "+" + wa[1]; n.notes.push("Read the number from a WhatsApp link"); }

    const tel = /^\s*tel:\s*/i.exec(s);
    if (tel) {
      s = s.slice(tel[0].length);
      const ctx = /;phone-context=\+?([\d-]+)/i.exec(s);
      const ext = /;ext=(\d{1,7})/i.exec(s);
      s = s.replace(/;.*$/, "");
      if (ctx && !/^\s*\+/.test(s)) s = "+" + ctx[1].replace(/\D/g, "") + s;
      if (ext) s += " ext " + ext[1];
      n.notes.push("Read a tel: link");
    }

    // extension
    const ext = /(?:\s*[,;]?\s*(?:ext\.?|extension|ext\b|x|#)\s*(\d{1,7}))\s*$/i.exec(s);
    if (ext && /\d/.test(s.slice(0, ext.index))) { n.ext = ext[1]; s = s.slice(0, ext.index); }

    n.hasPlus = /^\s*[+]/.test(s) || /^\s*\(\s*\+/.test(s);
    if (n.hasPlus && /\(\s*0\s*\)/.test(s)) { s = s.replace(/\(\s*0\s*\)/, " "); n.notes.push("Dropped the (0) — it's only dialled from inside the country"); }

    // letters: vanity numbers like 1-800-FLOWERS
    const letters = (s.match(/[A-Za-z]/g) || []).length;
    if (letters) {
      const digitsBefore = (s.match(/\d/g) || []).length;
      if (letters >= 2 && letters + digitsBefore >= 7) {
        n.vanity = s.trim();
        s = s.replace(/[A-Za-z]/g, (c) => String(KEYPAD[c.toUpperCase()]));
        n.notes.push("Converted letters to keypad digits");
      } else {
        s = s.replace(/[A-Za-z]/g, " ");
        n.notes.push("Ignored stray letters");
      }
    }

    const body = s.replace(/^\s*\(?\s*\+/, "");
    const tokens = body.split(/[^\d]+/).filter(Boolean);
    n.groups = tokens.map((t) => t.length);
    const paren = /^\s*\(\s*(\d{1,5})\s*\)/.exec(body) || /^\s*\+?\s*\d{1,3}\s*\(\s*(\d{1,5})\s*\)/.exec(s);
    n.paren = paren ? paren[1] : null;
    n.digits = s.replace(/\D/g, "").slice(0, 20);
    return n;
  }

  // --------------------------------------------------------------- helpers
  function safeParse(text, region) {
    try { return L.parsePhoneNumberFromString(text, region) || null; } catch (_) { return null; }
  }

  function groupLens(str) { return (str.match(/\d+/g) || []).map((x) => x.length); }

  function sepSet(str) {
    const out = new Set();
    const re = /\d([^\d]+)(?=\d)/g;
    let m;
    while ((m = re.exec(str))) for (const ch of m[1]) {
      if (/\s/.test(ch)) out.add(" ");
      else if (ch === "-" || ch === "." || ch === "/") out.add(ch);
    }
    return out;
  }

  function sameArr(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

  function fictionalFor(cc, nsn) {
    for (const f of M.FICTIONAL) if (f.cc === cc && f.re.test(nsn)) return f;
    return null;
  }

  function rangeNoteFor(cc, nsn) {
    for (const r of M.RANGES) if (r.cc === cc && r.re.test(nsn)) return r;
    return null;
  }

  const TYPE_LABEL = {
    FIXED_LINE: "Landline", MOBILE: "Mobile", FIXED_LINE_OR_MOBILE: "Landline or mobile",
    TOLL_FREE: "Toll-free", PREMIUM_RATE: "Premium rate", SHARED_COST: "Shared cost",
    VOIP: "VoIP / internet phone", PERSONAL_NUMBER: "Personal (follow-me) number", PAGER: "Pager",
    UAN: "Company / universal access number", VOICEMAIL: "Voicemail access",
  };
  const GEO_TYPES = new Set(["FIXED_LINE", "FIXED_LINE_OR_MOBILE"]);
  const SHORT_CAT = { em: "Emergency", tf: "Free short code", pr: "Premium short code", sr: "Standard-rate short code", sms: "Text-message service", cs: "Network-specific short code", sc: "Short code" };
  const SHORT_ORDER = ["em", "tf", "pr", "sr", "sms", "cs", "sc"];

  function regionsLabel(list, max) {
    const names = list.map(regionName);
    if (names.length <= max) return names.join(", ");
    return names.slice(0, max).join(", ") + " and " + (names.length - max) + " more";
  }

  function exitUsers(exit) {
    const users = [];
    for (const r of REGIONS) {
      const i = regionInfo(r);
      if (i.iddRe && new RegExp("^(?:" + meta_idd(r) + ")$").test(exit)) users.push(r);
    }
    return users;
  }
  const iddCache = Object.create(null);
  function meta_idd(r) {
    if (iddCache[r] == null) { meta.selectNumberingPlan(r); iddCache[r] = meta.numberingPlan.IDDPrefix(); }
    return iddCache[r];
  }

  function areaCodeOf(ph, info) {
    const type = ph.getType();
    if (!GEO_TYPES.has(type)) return null;
    if (!info.trunk && info.region !== "IT" && info.region !== "VA") return null;
    const groups = (ph.formatNational().match(/\d+/g) || []).slice();
    if (!groups.length) return null;
    let first = groups[0];
    if (info.trunk && first === info.trunk && groups.length > 1) first = groups[1];
    else if (info.trunk && first.startsWith(info.trunk) && first.length > info.trunk.length) first = first.slice(info.trunk.length);
    if (!first || first.length >= ph.nationalNumber.length) return null;
    return first;
  }

  // ------------------------------------------------------------ analyse
  /**
   * @param {string} raw   what the user typed
   * @param {{home?: string|null}} opts
   * @returns {{kind:string, n:object, cands:object[], needs:string[], home:string|null}}
   */
  function analyse(raw, opts) {
    const home = opts && opts.home && REGION_SET.has(opts.home) ? opts.home : null;
    const homeCC = home ? L.getCountryCallingCode(home) : null;
    const n = normalise(raw);
    const res = { kind: "empty", n, cands: [], needs: [], home };
    if (!n.digits) return res;
    const D = n.digits;
    const needs = new Set();
    const byKey = new Map();

    function upsert(key, make, score, reading) {
      let c = byKey.get(key);
      if (!c) { c = make(); c.key = key; c.score = 0; c.readings = []; byKey.set(key, c); }
      c.readings.push(Object.assign({ score }, reading));
      return c;
    }

    // ---- full numbers ----------------------------------------------------
    function numberCand(ph, reading, baseScore, why) {
      const cc = ph.countryCallingCode;
      const nsn = ph.nationalNumber;
      const valid = ph.isValid();
      const possible = ph.isPossible();
      const fict = fictionalFor(cc, nsn);
      if (!possible && !fict) return;
      let v = valid ? 1 : fict ? 0.9 : 0.06;
      const region = ph.country || (NONGEO.has(cc) ? "001" : (CC_TO_REGIONS[cc] || [])[0]) || null;
      const dest = region && region !== "001" ? region : null;
      let s = baseScore * v * (dest ? prior(dest) : 1.2);
      const reasons = why.slice();
      if (fict) { s *= 4; reasons.push("Lands exactly in a block reserved for films & TV"); }
      if (valid) reasons.push("Matches the official number pattern for " + (dest ? regionName(dest) : "+" + cc));
      else if (fict) reasons.push("Correct length, deliberately never connected");
      else reasons.push("Right length, but no network uses this range");

      // grouping / bracket evidence
      if (n.groups.length > 1 || n.paren) {
        const fmt = reading.mode === "national" ? ph.formatNational() : ph.formatInternational().replace(/^\+\d+\s*/, "");
        const want = groupLens(fmt);
        let have = n.groups.slice();
        if (reading.mode !== "national" && reading.drop) {
          // drop leading exit code / country code groups from the typed groups
          let k = reading.drop;
          while (k > 0 && have.length) { if (have[0] <= k) { k -= have[0]; have.shift(); } else { have[0] -= k; k = 0; } }
        }
        const dinfo = dest ? regionInfo(dest) : null;
        if (reading.mode === "national" && dinfo && dinfo.trunk && have.length > 1 && D.startsWith(dinfo.trunk) && want[0] !== have[0] && have[0] === dinfo.trunk.length) {
          have = have.slice(1); // "1 212 555 0123": the lone trunk digit is its own group
        }
        if (n.groups.length > 1) {
          if (sameArr(have, want)) { s *= 2; reasons.push("Spacing matches how " + (dest ? regionName(dest) : "it") + " writes numbers"); }
          else if (have.length && want.length && have[0] === want[0]) s *= 1.35;
          else s *= 0.75;
        }
        if (n.groups.length > 1 && reading.mode === "national") {
          // separator style: Japan & Korea hyphenate, most of Europe uses spaces
          const typed = sepSet(n.raw), fmt = sepSet(ph.formatNational());
          if (typed.has("-") && fmt.has("-")) s *= 1.25;
          else if (typed.has(" ") && !typed.has("-") && fmt.has("-") && !fmt.has(" ")) s *= 0.7;
          else if (typed.has("-") && !typed.has(" ") && !fmt.has("-")) s *= 0.8;
        }
        if (n.paren) {
          const nat = ph.formatNational();
          const firstGroup = (nat.match(/\d+/g) || [""])[0];
          if (/\(/.test(nat) && nat.includes("(" + n.paren + ")")) { s *= 1.8; reasons.push("Brackets round the area code are the " + (dest ? regionName(dest) : "local") + " style"); }
          else if (dinfo && dinfo.trunk && n.paren.startsWith(dinfo.trunk) && n.paren === firstGroup) { s *= 1.3; reasons.push("Bracketed area code with its trunk " + dinfo.trunk + " is a " + regionName(dest) + " habit"); }
          else s *= 0.6;
        }
      }
      const c = upsert("n:" + ph.number, function () {
        return { kind: "number", cc, nsn, region, phone: ph, e164: ph.number, valid, possible, fict };
      }, s, Object.assign({ reasons }, reading));
      return c;
    }

    if (n.hasPlus) {
      const ph = safeParse("+" + D + (n.ext ? " ext. " + n.ext : ""));
      if (ph) numberCand(ph, { mode: "intl", drop: ph.countryCallingCode.length }, 1, ["Starts with +, so " + ph.countryCallingCode + " is the country code"]);
    } else {
      const extPart = n.ext ? " ext. " + n.ext : "";
      const plusPh = D.length >= 8 ? safeParse("+" + D + extPart) : null;
      const iddHits = new Map(); // exit+number -> {ph, exit, from: []}
      const seenPlan = new Set();
      for (const r of REGIONS) {
        const info = regionInfo(r);
        const ph = safeParse(D + extPart, r);
        if (!ph) continue;
        const m = info.iddRe && info.iddRe.exec(D);
        let idd = false;
        if (m && m[0].length && ph.countryCallingCode) {
          const rest = D.slice(m[0].length);
          const viaPlus = safeParse("+" + rest);
          idd = !!(viaPlus && viaPlus.number === ph.number);
        }
        if (idd) {
          const k = m[0] + "|" + ph.number;
          if (!iddHits.has(k)) iddHits.set(k, { ph, exit: m[0], from: [] });
          iddHits.get(k).from.push(r);
          continue;
        }
        if (ph.countryCallingCode !== info.cc) continue;
        // national reading — count once per calling-code plan (NANP has 25 regions)
        const dest = ph.country || r;
        const planKey = info.cc + ":" + ph.number;
        if (seenPlan.has(planKey)) continue;
        seenPlan.add(planKey);
        // libphonenumber also accepts the country code typed without "+"
        // ("447700900123" in GB); that's the no-plus reading, counted below.
        // (In the NANP the trunk prefix *is* "1", so "1 212…" stays a national reading.)
        if (info.trunk !== info.cc && D.startsWith(info.cc) && D.length === info.cc.length + ph.nationalNumber.length && plusPh && plusPh.number === ph.number) continue;
        let base = 1;
        const why = [];
        if (info.trunk && D.startsWith(info.trunk) && ph.nationalNumber.length < D.length) why.push("Leading " + info.trunk + " is the trunk prefix used inside " + regionName(dest));
        else if (info.trunk && info.trunk !== "1" && ph.nationalNumber.length === D.length) base *= 0.7;
        if (homeCC && homeCC === info.cc) { base *= 15; why.push("Dialled the way people do inside " + regionName(home)); }
        numberCand(ph, { mode: "national", region: dest }, base, why);
      }
      for (const hit of iddHits.values()) {
        const homeHit = !!home && hit.from.includes(home);
        const users = hit.from.length > 4 ? hit.from.length + " countries" : regionsLabel(hit.from, 4);
        const c = numberCand(hit.ph, { mode: "idd", exit: hit.exit, drop: hit.exit.length + hit.ph.countryCallingCode.length }, (homeHit ? 4 : 1) * 1.2,
          ["Starts with " + hit.exit + ", the exit code for calling abroad from " + users, "So " + hit.ph.countryCallingCode + " is the country code"]);
        if (c) c.from = hit.from;
      }
      if (plusPh) {
        const dest = plusPh.country;
        let base = 0.55 * (dest && dest === home ? 1.5 : 1) * (D.length >= 11 ? 1.5 : 1);
        numberCand(plusPh, { mode: "noplus", drop: plusPh.countryCallingCode.length }, base,
          ["Reads as an international number with the + left off", plusPh.countryCallingCode + " would be the country code"]);
      }
    }

    // ---- short codes -----------------------------------------------------
    if (!n.hasPlus && D.length <= 6 && !n.ext) {
      if (!store.short) needs.add("short");
      else {
        const groups = new Map();
        for (const r of Object.keys(store.short)) {
          const S = store.short[r];
          const cats = SHORT_ORDER.filter((k) => S[k] && S[k].test(D));
          if (!cats.length) continue;
          const cat = cats[0];
          let label = (M.SHORT[r] && M.SHORT[r][D]) || null;
          if (!label && M.EU116[D] && M.EU_REGIONS.includes(r)) label = M.EU116[D];
          if (!label && cat === "em" && M.SHORT["*"][D]) label = M.SHORT["*"][D];
          if (label === "Emergency") label = null; // generic: merge with the unlabelled group
          const key = cat + "|" + (label || "");
          if (!groups.has(key)) groups.set(key, { cat, label, regions: [] });
          groups.get(key).regions.push(r);
        }
        for (const [key, grp] of groups) {
          const ws = grp.regions.map((r) => prior(r) * (r === home ? 10 : 1)).sort((a, b) => b - a);
          const w = ws[0] + 0.15 * ws.slice(1).reduce((a, b) => a + b, 0);
          const catW = grp.cat === "em" ? 1 : grp.cat === "sc" || grp.cat === "cs" ? 0.35 : 0.6;
          const s = w * catW * (grp.label ? 1.2 : 1);
          grp.regions.sort((a, b) => (a === home ? -1 : b === home ? 1 : prior(b) - prior(a)));
          upsert("s:" + key, function () {
            return { kind: "short", code: D, cat: grp.cat, catLabel: SHORT_CAT[grp.cat], label: grp.label, regions: grp.regions, region: grp.regions[0] };
          }, s, { mode: "short", reasons: [
            (grp.regions.includes(home) ? "Recognised short code in " + regionName(home) : "Recognised short code in " + regionsLabel(grp.regions, 3)),
            SHORT_CAT[grp.cat] + " per Google's short-number data",
          ] });
        }
      }
    }

    // ---- country codes & area codes (partial input) ----------------------
    const fullValid = Array.from(byKey.values()).some((c) => c.kind === "number" && (c.valid || c.fict));
    if (!n.hasPlus && homeCC === "1" && D.length === 7 && /^[2-9]/.test(D)) {
      n.notes.push("Seven digits is a North American local number — add the 3-digit area code in front for a full check");
      if (/^55501\d\d$/.test(D)) n.notes.push("555-0100 to 555-0199 is kept for fiction in every North American area code");
    }
    const partialWanted = D.length <= 7 || !fullValid;
    if (partialWanted) {
      // which calling code does the input start with (after + or an exit code)?
      const ccPrefix = (digits) => {
        for (let k = 1; k <= 3 && k <= digits.length; k++) {
          const c = digits.slice(0, k);
          if (ALL_CC.has(c) || M.CC_NOTES[c]) return c;
        }
        return null;
      };
      const ccCand = (cc, rest, base, why) => {
        const regions = CC_TO_REGIONS[cc] || (NONGEO.has(cc) ? ["001"] : []);
        const w = regions.length ? Math.max(...regions.map((r) => (r === "001" ? 1 : prior(r)))) : 0.6;
        upsert("c:" + cc, function () {
          return { kind: "cc", cc, regions, region: regions[0] || null, assigned: regions.length > 0 };
        }, base * w, { mode: "cc", reasons: why });
        if (rest) areaCands(cc, rest, base * 1.15, why.concat(["Then looked up " + rest + " as an area code"]), true);
      };
      const areaCands = (cc, part, base, why, viaCC) => {
        if (!store.areas) { needs.add("areas"); return; }
        const tbl = store.areas[cc];
        if (!tbl || !part) return;
        const exact = tableChain(tbl, part).filter((x) => x.len === part.length);
        const comps = tablePrefixSearch(tbl, part, 8);
        if (!exact.length && !comps.length) return;
        const regions = CC_TO_REGIONS[cc] || [];
        let region = regions[0] || null;
        if (cc === "1" && part.length >= 3) {
          const t = safeParse("+1" + part.slice(0, 3) + "2345678");
          if (t && t.country) region = t.country;
        }
        const w = region ? prior(region) : 1;
        const homeHit = homeCC === cc;
        const s = base * w * (exact.length ? 1 : 0.3) * (homeHit && !viaCC ? 15 : 1);
        upsert("a:" + cc + ":" + part, function () {
          return { kind: "area", cc, part, region, exact: exact.length ? exact[exact.length - 1].text : null, completions: comps.filter((x) => !x.exact) };
        }, s, { mode: "area", reasons: why.concat(homeHit && !viaCC ? ["Area codes for " + regionName(home) + " come first because you're dialling from there"] : []) });
      };

      if (n.hasPlus) {
        const cc = ccPrefix(D);
        if (cc) ccCand(cc, D.slice(cc.length), D.length === cc.length ? 1 : 0.7, ["Starts with +" + cc]);
      } else {
        // bare country code: "44", "212", "0044", "011 44"
        for (const ex of ["00", "011", "0011", "810", "010"]) {
          if (D.startsWith(ex) && D.length > ex.length && D.length <= ex.length + 7) {
            const cc = ccPrefix(D.slice(ex.length));
            if (cc) ccCand(cc, D.slice(ex.length + cc.length), 0.9, ["Starts with " + ex + ", an exit code for dialling abroad", "Followed by country code " + cc]);
          }
        }
        if (D.length <= 3 && D[0] !== "0") {
          const cc = ALL_CC.has(D) || M.CC_NOTES[D] ? D : null;
          if (cc) ccCand(cc, "", 0.6, ["Could be country code +" + cc + " typed without the +"]);
        }
        // area codes after a trunk prefix, per calling code
        const seenCC = new Set();
        for (const r of REGIONS) {
          const info = regionInfo(r);
          if (seenCC.has(info.cc)) continue;
          if (info.trunk && D.startsWith(info.trunk) && D.length > info.trunk.length && D.length - info.trunk.length <= 6) {
            seenCC.add(info.cc);
            areaCands(info.cc, D.slice(info.trunk.length), 0.6, ["Leading " + info.trunk + " is the trunk prefix in " + regionName((CC_TO_REGIONS[info.cc] || [r])[0])]);
          }
        }
        // NANP: area codes are commonly written without the 1
        if (/^[2-9]\d\d$/.test(D) || /^[2-9]\d\d\d{1,3}$/.test(D) && D.length <= 6) {
          areaCands("1", D, 0.6, ["Three digits starting 2–9 is the shape of a North American area code"]);
        }
        // closed plans without a trunk prefix (Italy 06, Spain 91…)
        if (D.length >= 2 && D.length <= 5) {
          for (const r of REGIONS) {
            const info = regionInfo(r);
            if (info.trunk || !info.main || seenCC.has(info.cc) || info.cc === "1") continue;
            const tbl = store.areas && store.areas[info.cc];
            if (!tbl) { if (!store.areas) needs.add("areas"); continue; }
            if (tableChain(tbl, D).some((x) => x.len === D.length)) {
              seenCC.add(info.cc);
              areaCands(info.cc, D, 0.35, [regionName(r) + " has no trunk prefix, so area codes are dialled as-is"]);
            }
          }
        }
      }
    }

    // ---- finalise ---------------------------------------------------------
    let cands = Array.from(byKey.values());
    for (const c of cands) {
      c.readings.sort((a, b) => b.score - a.score);
      c.score = c.readings.reduce((a, r) => a + r.score, 0);
      c.best = c.readings[0];
      if (c.kind === "number" && c.best.mode === "national" && c.readings.length > 1) {
        // national + no-plus can coincide; keep both in readings
      }
    }
    cands = cands.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
    const total = cands.reduce((a, c) => a + c.score, 0) || 1;
    for (const c of cands) c.pct = c.score / total;
    cands = cands.slice(0, 12);

    for (const c of cands) {
      if (c.kind === "number" && hasChunk(c.cc) && !store.chunks[c.cc]) needs.add("cc:" + c.cc);
    }
    res.cands = cands;
    res.needs = Array.from(needs).filter((x) => !failed.has(x));
    res.kind = cands.length ? cands[0].kind : "unknown";
    return res;
  }

  // ---------------------------------------------------------- details
  /** Everything we can say about one number candidate. */
  function details(c, home) {
    const ph = c.phone;
    const cc = c.cc;
    const nsn = c.nsn;
    const out = { flags: [], facts: [], formats: [] };
    const type = ph.getType();
    const region = c.region;
    const info = region && region !== "001" ? regionInfo(region) : null;
    out.type = type || null;
    out.typeLabel = type ? TYPE_LABEL[type] || type : (c.fict ? "Reserved — never connected" : "Unknown type");
    out.regionName = region === "001" ? "International (non-geographic)" : regionName(region);
    out.lengthCheck = (() => { try { return L.validatePhoneNumberLength(ph.number) || "OK"; } catch (_) { return "OK"; } })();

    // formats
    out.formats.push({ k: "E.164", v: ph.number });
    out.formats.push({ k: "International", v: ph.formatInternational() });
    if (region !== "001") out.formats.push({ k: "National", v: ph.formatNational() });
    out.formats.push({ k: "Link", v: ph.getURI() });
    if (home) {
      const homeCC = L.getCountryCallingCode(home);
      let v = null;
      try { v = homeCC === cc ? ph.formatNational() : ph.format("IDD", { fromCountry: home }); } catch (_) { v = null; }
      if (v) out.formats.push({ k: "Dial from " + regionName(home), v: v.replace("~", " (wait for tone) ") });
    }

    // place, network, time zones
    const ch = store.chunks[cc];
    if (ch) {
      const chain = tableChain(ch.g, nsn).map((x) => x.text);
      const regionNm = out.regionName;
      out.place = chain.filter((t) => t !== regionNm);
      if (cc === "1" && ch.npa) {
        const s = ch.npa[nsn.slice(0, 3)];
        if (s) out.npa = { code: nsn.slice(0, 3), state: s[0], places: s[1], blocks: s[2] };
      }
      const car = tableLookup(ch.c, nsn);
      if (car && c.valid && (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE" || type === "PAGER")) out.carrier = car.text;
      const z = tableLookup(ch.z, nsn);
      if (z) out.zones = z.text.split(" ").filter((x) => x && x !== "Etc/Unknown");
      if (M.TZ_FIX[cc]) out.zones = M.TZ_FIX[cc].slice();
      if (out.zones && out.zones.length > 4) { out.zoneCount = out.zones.length; out.zones = null; }
    }
    const rn = rangeNoteFor(cc, nsn);
    if (rn) {
      out.flags.push({ level: rn.level || "info", title: rn.title, text: rn.text, src: rn.src });
      if (rn.place && (!out.place || !out.place.length)) out.place = [rn.place];
    }
    if (c.fict) {
      out.flags.unshift({ level: "fict", title: "Reserved for films, TV & fiction", text: c.fict.area + ". Set aside so it can be shown on screen without anyone real getting calls — it will never ring a real phone.", src: c.fict.src });
    }
    if (type === "PREMIUM_RATE" && !out.flags.some((f) => f.level === "warn")) out.flags.push({ level: "warn", title: "Premium rate", text: "Costs more than a normal call.", src: "lpn" });
    if (type === "TOLL_FREE" && !out.flags.length) out.flags.push({ level: "ok", title: "Toll-free", text: "Normally free for the caller within its own country.", src: "lpn" });
    if (cc === "881") {
      const op = M.SAT_881[nsn[0]];
      if (op) out.carrier = op + " (satellite)";
    }
    if (!c.valid && !c.fict) out.flags.push({ level: "bad", title: "Not a live number range", text: "The length is right, but this block isn't allocated in the official numbering plan, so a call won't connect.", src: "lpn" });

    if (info) {
      const ac = areaCodeOf(ph, info);
      if (ac) out.areaCode = ac;
      out.trunk = info.trunk;
      out.exit = info.exit;
    }
    out.cc = cc;
    out.ccNote = M.CC_NOTES[cc] || null;
    out.zone = M.ZONES[cc[0]] || null;
    out.shared = (CC_TO_REGIONS[cc] || []).length > 1 ? CC_TO_REGIONS[cc] : null;
    return out;
  }

  function regionFacts(r) {
    if (!r || r === "001") return null;
    const i = regionInfo(r);
    return { region: r, name: regionName(r), cc: i.cc, trunk: i.trunk, exit: i.exit, shared: CC_TO_REGIONS[i.cc] };
  }

  function localTime(zone, now) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(now || new Date());
    } catch (_) { return null; }
  }

  g.DC = {
    analyse, details, need, normalise, detectHome, regionName, regionFacts, regionInfo, localTime, exitUsers,
    hasChunk, isLoaded,
    regions: REGIONS,
    ccRegions: CC_TO_REGIONS,
    zoneOf: (cc) => M.ZONES[cc[0]] || null,
    setDataRoot(root) { dataRoot = root; },
    setLoader(fn) { loader = fn; },
    _store: store,
    _tables: { tableChain, tableLookup, tablePrefixSearch },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

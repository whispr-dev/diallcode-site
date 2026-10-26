/* diallcode.site — words <-> numbers (vanity numbers)
 * Copyright (c) 2026 whispr.dev
 *
 * DOM-free. Letters -> digits uses the standard phone keypad (ITU E.161):
 *   2 ABC  3 DEF  4 GHI  5 JKL  6 MNO  7 PQRS  8 TUV  9 WXYZ
 * Digits -> words follows the vanity convention: keep the front of the number
 * as digits and spell the end with one to three dictionary words.
 * Needs data/words.js (loaded on demand through DC.need("words")).
 */
(function (g) {
  "use strict";

  const KEY = { a: 2, b: 2, c: 2, d: 3, e: 3, f: 3, g: 4, h: 4, i: 4, j: 5, k: 5, l: 5, m: 6, n: 6, o: 6, p: 7, q: 7, r: 7, s: 7, t: 8, u: 8, v: 8, w: 9, x: 9, y: 9, z: 9 };
  const TIER_W = { 1: 3, 2: 2, 3: 1.2 };
  const PER_KEY = 8;       // words kept per digit pattern
  const MAX_SUFFIX = 12;   // digits we'll try to spell from the end
  const MAX_WORDS = 3;

  let byKey = null;        // "2893647" -> [{w, t}] most common first

  function digitsOf(word) {
    let s = "";
    for (const ch of word) s += KEY[ch];
    return s;
  }

  function load(tiers) {
    const m = new Map();
    for (const t of Object.keys(tiers).sort()) {
      for (const w of tiers[t].split(" ")) {
        if (!w) continue;
        const k = digitsOf(w);
        let list = m.get(k);
        if (!list) { list = []; m.set(k, list); }
        if (list.length < PER_KEY) list.push({ w, t: +t });
      }
    }
    byKey = m;
  }

  /** Swap letters for keypad digits, leaving spaces, dashes, + etc. alone. */
  function toDigits(s) {
    return String(s).replace(/[A-Za-z]/g, (c) => String(KEY[c.toLowerCase()]));
  }

  function hasLetters(s) { return /[A-Za-z]/.test(s); }

  // best segmentations of digits d (all of it) into 1..maxWords words
  function segment(d, maxWords, memo) {
    const mk = d + "|" + maxWords;
    if (memo.has(mk)) return memo.get(mk);
    const out = [];
    const whole = byKey.get(d);
    if (whole) for (const e of whole) out.push({ words: [e], q: quality([e]) });
    if (maxWords > 1) {
      for (let i = 2; i <= d.length - 2; i++) {
        const head = byKey.get(d.slice(0, i));
        if (!head) continue;
        const tails = segment(d.slice(i), maxWords - 1, memo);
        for (const e of head.slice(0, 4)) for (const t of tails.slice(0, 4)) {
          const words = [e].concat(t.words);
          out.push({ words, q: quality(words) });
        }
      }
    }
    out.sort((a, b) => b.q - a.q);
    const top = out.slice(0, 12);
    memo.set(mk, top);
    return top;
  }

  function quality(words) {
    let q = 0;
    for (const e of words) q += Math.pow(e.w.length, 1.5) * TIER_W[e.t] - (e.w.length === 2 ? 3 : 0);
    return q - (words.length - 1) * 4;
  }

  /**
   * Spell the end of a number as words.
   * @returns {{ready:boolean, list:{text:string, digits:string, words:string[], letters:number}[]}}
   */
  function spell(input, limit) {
    if (!byKey) return { ready: false, list: [] };
    const raw = String(input || "");
    const D = raw.replace(/\D/g, "");
    if (D.length < 2) return { ready: true, list: [] };
    const memo = new Map();
    const cands = [];
    const keep = protectedLength(raw, D);
    for (let start = D.length - 2; start >= Math.max(keep, D.length - MAX_SUFFIX); start--) {
      if (D[start] === "0" || D[start] === "1") break; // 0 and 1 carry no letters
      const suffix = D.slice(start);
      for (const seg of segment(suffix, MAX_WORDS, memo).slice(0, 6)) {
        const letters = suffix.length;
        if (letters === 2 && seg.words[0].t !== 1) continue;
        cands.push({ start, seg, score: letters * 12 + seg.q });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const list = [];
    for (const c of cands) {
      const words = c.seg.words.map((e) => e.w.toUpperCase());
      const prefix = prefixDisplay(raw, c.start);
      const text = (prefix ? prefix + " " : "") + words.join(" ");
      if (seen.has(text)) continue;
      // three-word filler ("AT WE NIP") only when nothing tidier turned up
      if (words.length === 3 && list.length >= 4) continue;
      if (list.length >= 4 && c.score < cands[0].score * 0.5) break;
      seen.add(text);
      list.push({ text, prefix, words, digits: D, letters: D.length - c.start });
      if (list.length >= (limit || 12)) break;
    }
    return { ready: true, list };
  }

  // Digits at the front that stay digits: the first group as typed ("0808",
  // "+44", "1-800"), or the first 4 when it's typed as one run starting 0/1.
  function protectedLength(raw, D) {
    const groups = raw.replace(/^\s*\+/, "").trim().split(/[^\d]+/).filter(Boolean);
    let keep = 0;
    if (groups.length > 1) {
      keep = groups[0].length;
      if (/^1$/.test(groups[0]) && groups[1].length === 3) keep += 3; // "1 800 …"
    } else if (/^[01]/.test(D)) keep = Math.min(4, D.length - 3);
    return Math.max(0, Math.min(keep, D.length - 2));
  }

  // the first n digits of what the user typed, with their own spacing
  function prefixDisplay(raw, n) {
    if (n <= 0) return "";
    let count = 0, i = 0;
    for (; i < raw.length && count < n; i++) if (/\d/.test(raw[i])) count++;
    return raw.slice(0, i).trim();
  }

  g.DCV = { load, toDigits, hasLetters, spell, isReady: () => !!byKey, KEY };
})(typeof globalThis !== "undefined" ? globalThis : this);

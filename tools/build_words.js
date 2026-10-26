// diallcode.site — word list for the words <-> numbers keypad
// Copyright (c) 2026 whispr.dev
//
// Builds site/data/words.js from SCOWL (via the wordlist-english npm package,
// sizes 10/20/35 = everyday words) with rude words removed (badwords-list plus
// a few extra below). Tier 1 is the most common.
//
//   npm ci                     (installs the two pinned dev dependencies)
//   node tools/build_words.js

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NM = path.join(ROOT, "node_modules");
const OUT = path.join(ROOT, "site", "data", "words.js");

function need(p) {
  if (!fs.existsSync(p)) {
    console.error("missing " + p + " — run `npm ci` in " + ROOT + " first");
    process.exit(1);
  }
  return p;
}

const TIERS = [
  ["1", [10]],
  ["2", [20]],
  ["3", [35]],
];

// badwords-list ships as an ES module source file; read the quoted strings.
const badSrc = fs.readFileSync(need(path.join(NM, "badwords-list", "dist", "array.js")), "utf8");
const bad = new Set([...badSrc.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()));
// Extra exclusions: slurs, violence and other things nobody wants spelled out
// on a business phone number.
for (const w of ("nigger nigga negro chink gook spic spick kike wetback beaner coon paki raghead towelhead " +
  "faggot fag fags dyke tranny retard retarded spaz cripple midget gyp gypped " +
  "rape raped rapist nazi nazis hitler kill killed killer murder suicide terror bomb bombs gun guns shoot " +
  "porn porno sex sexy nude naked stripper horny drug drugs heroin meth " +
  "dead die died death corpse " +
  "bitch bastard damn hell slut tit tits cunt dick cock fuck shit twat prick piss crap turd poop boob boobs butt " +
  "pussy whore hoe hoes semen sperm penis anal anus").split(/\s+/)) bad.add(w);

// Innocent words the stem check would otherwise catch (butter -> butt, spices -> spic…)
const KEEP = new Set(("assess butter butters buttes butted butting spaces spaced spacing spices spiced spicing spicy " +
  "strip strips striped stripes striping pawn pawns pawned pawning titter titters crack cracked cracking cracks").split(" "));

const isBad = (w) => {
  if (KEEP.has(w)) return false;
  if (bad.has(w)) return true;
  const stems = [w.replace(/(ings?|ers?|ed|es|s|y)$/, ""), w.replace(/s$/, ""), w.replace(/es$/, ""), w.replace(/ing$/, "e")];
  return stems.some((s) => s.length >= 3 && bad.has(s));
};

const seen = new Set();
const out = {};
let removed = 0;
for (const [tier, sizes] of TIERS) {
  const words = [];
  for (const size of sizes) {
    for (const variety of ["english", "british"]) {
      const f = path.join(NM, "wordlist-english", `${variety}-words-${size}.json`);
      if (!fs.existsSync(f)) continue;
      for (const w of JSON.parse(fs.readFileSync(f, "utf8"))) {
        if (!/^[a-z]{2,10}$/.test(w)) continue;          // lowercase letters only: no names, no apostrophes
        if (w.length === 2 && tier !== "1") continue;   // two-letter words only if very common
        if (seen.has(w)) continue;
        seen.add(w);
        if (isBad(w)) { removed++; continue; }
        words.push(w);
      }
    }
  }
  out[tier] = words.join(" ");
}

const body = "/* Word list derived from SCOWL, Copyright 2000-2016 Kevin Atkinson (see THIRD-PARTY-NOTICES.txt) */\n" +
  "DCX.words(" + JSON.stringify(out) + ");\n";
fs.writeFileSync(OUT, body);
const n = Object.values(out).reduce((a, s) => a + s.split(" ").length, 0);
console.log(`words.js: ${n} words, ${removed} removed by the filter, ${(body.length / 1024).toFixed(0)} KiB`);

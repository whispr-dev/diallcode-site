// diallcode.site — engine tests (Node 18+, no dependencies)
// Copyright (c) 2026 whispr.dev
//
// Runs the browser scripts inside a VM, exactly as a page would load them,
// and checks that the top reading for each input is the expected one.
//
//   node tools/engine_test.js            run the checks
//   node tools/engine_test.js --show     also print the ranked readings

"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "site");
const show = process.argv.includes("--show");

const ctx = { console, Intl, URL, Promise, setTimeout };
ctx.self = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
const run = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: rel });

run("assets/vendor/libphonenumber-max.js");
run("assets/meta.js");
run("assets/engine.js");
run("assets/vanity.js");
run("data/base.js");
ctx.DC.setLoader((url) => { run(url); return Promise.resolve(); });
ctx.DC.setDataRoot("data/");

async function analyse(input, home) {
  // load whatever the engine asks for, then re-run — same loop as the page
  for (let i = 0; i < 4; i++) {
    const r = ctx.DC.analyse(input, { home });
    if (!r.needs.length) return r;
    await Promise.all(r.needs.map((n) => ctx.DC.need(n)));
  }
  return ctx.DC.analyse(input, { home });
}

function describe(c) {
  if (c.kind === "number") return `${c.e164} ${c.region} ${c.best.mode}${c.fict ? " FICT" : ""}${c.valid ? "" : " (invalid)"}`;
  if (c.kind === "short") return `short ${c.code} ${c.cat} ${c.region} "${c.label || ""}" [${c.regions.length}]`;
  if (c.kind === "cc") return `cc +${c.cc} ${c.region}`;
  if (c.kind === "area") return `area ${c.cc}:${c.part} ${c.region} "${c.exact || ""}"`;
  return c.kind;
}

// [input, home, expected top (substring of describe()), optional extra check]
const CASES = [
  ["020 7946 0123", "GB", "+442079460123 GB national FICT"],
  ["02079460123", "US", "+442079460123 GB national FICT"],
  ["+44 20 7946 0123", null, "+442079460123 GB intl FICT"],
  ["+44 (0)20 7946 0123", null, "+442079460123 GB intl FICT"],
  ["07700 900123", "GB", "+447700900123 GB national FICT"],
  ["(212) 555-0199", "GB", "+12125550199 US national FICT"],
  ["212-555-0123", "US", "+12125550123 US national"],
  ["1 212 555 0123", "DE", "+12125550123 US national"],
  ["044 123 4567", "GB", "top4:+380441234567 UA national"], // 044 is also Kawasaki, George (ZA), Pampanga… honestly ambiguous
  ["044 123 4567", "UA", "+380441234567 UA national"],
  ["0044 7700 900123", "DE", "+447700900123 GB idd FICT"],
  ["011 44 20 7946 0123", "US", "+442079460123 GB idd FICT"],
  ["447700900123", "GB", "+447700900123 GB noplus FICT"],
  ["0491 570 156", "AU", "+61491570156 AU national FICT"],
  ["01 99 00 12 34", "FR", "+33199001234 FR national FICT"],
  ["030 23125 123", "DE", "+493023125123 DE national FICT"],
  ["0113 496 0000", null, "+441134960000 GB national FICT"],
  ["8 495 123 4567", "RU", "+74951234567 RU national"],
  ["+800 1234 5678", null, "+80012345678 001 intl"],
  ["+881 6 123 45678", null, "+881612345678 001 intl"],
  ["1-800-FLOWERS", "US", "+18003569377 US national"],
  ["tel:+1-201-555-0123", null, "+12015550123 US intl"],
  ["999", "GB", 'short 999 em GB "Emergency: police, fire, ambulance, coastguard"'],
  ["911", "US", "short 911 em US"],
  ["112", "DE", "short 112 em DE"],
  ["111", "GB", 'short 111'],
  ["111", "NZ", 'short 111 em NZ'],
  ["116123", "GB", 'short 116123'],
  ["000", "AU", 'short 000 em AU'],
  ["44", "GB", "cc +44 GB"],
  ["+44", null, "cc +44 GB"],
  ["+1", null, "cc +1 US"],
  ["212", "GB", 'area 1:212 US "New York, NY"'],
  ["0161", "GB", 'area 44:161 GB "Manchester"'],
  ["020", "GB", 'area 44:20 GB "London"'],
  ["020", "NL", 'area 31:20 NL "Amsterdam"'],
  ["+44 161", null, 'area 44:161 GB "Manchester"'],
  ["06", "IT", 'area 39:06 IT'],
  ["+7 495 123 45 67", null, "+74951234567 RU intl"],
  ["+380 44 123 4567", null, "+380441234567 UA intl"],
  ["(416) 555-0123", "US", "+14165550123 CA national"],
  ["+86 10 1234 5678", null, "+861012345678 CN intl"],
  ["+61 2 5550 1234", null, "+61255501234 AU intl FICT"],
  ["0300 123 4567", "GB", "+443001234567 GB national"],
  ["070 1234 5678", "GB", "+447012345678 GB national"],
  ["+888 12345678", null, "cc +888"],
  ["+999 123", null, "cc +999"],
  ["+44 20 7946 0123 ext 45", null, "+442079460123 GB intl FICT"],
];

(async () => {
  let fail = 0;
  const t0 = Date.now();
  for (const [input, home, want] of CASES) {
    const r = await analyse(input, home);
    const top = r.cands[0];
    const got = top ? describe(top) : "(nothing)";
    const ok = want.startsWith("top4:") ? r.cands.slice(0, 4).some((c) => describe(c).includes(want.slice(5))) : got.includes(want);
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(input).padEnd(26)} home=${String(home).padEnd(4)} -> ${got}${ok ? "" : "   EXPECTED " + want}`);
    if (show || !ok) {
      for (const c of r.cands.slice(0, 6)) console.log(`        ${(c.pct * 100).toFixed(1).padStart(5)}%  ${describe(c)}`);
    }
    if (top && top.kind === "number") {
      const d = ctx.DC.details(top, home);
      if (show) console.log("        details:", JSON.stringify({ type: d.typeLabel, place: d.place, npa: d.npa && d.npa.state, carrier: d.carrier, zones: d.zones, area: d.areaCode, flags: d.flags.map((f) => f.title), fmts: d.formats.map((f) => f.v) }));
    }
  }
  // words <-> numbers
  await ctx.DC.need("words");
  const V = ctx.DCV;
  const VCASES = [
    ["to", "0800 buy dogs", "0800 289 3647"],
    ["to", "1-800-FLOWERS", "1-800-3569377"],
    ["spell", "0800 102 44", "0800 10 BIG"],
    ["spell", "0800 289 3647", "0800 BUY DOGS"],
    ["spell", "1-800-356-9377", "1-800 FLOWERS"],
    ["spell", "0800 4357", "0800 HELP"],
    ["spell", "0808 222 7663", "0808 CAB"],
  ];
  for (const [kind, input, want] of VCASES) {
    const got = kind === "to" ? V.toDigits(input) : (V.spell(input, 10).list.map((x) => x.text));
    const ok = kind === "to" ? got === want : got.some((t) => t.startsWith(want));
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  vanity ${kind.padEnd(5)} ${JSON.stringify(input).padEnd(18)} -> ${kind === "to" ? got : got.slice(0, 3).join(" | ")}${ok ? "" : "   EXPECTED " + want}`);
  }
  CASES.push(...VCASES);

  // timing on a cold-ish engine
  const t1 = Date.now();
  for (let i = 0; i < 20; i++) ctx.DC.analyse("020 7946 012" + (i % 10), { home: "GB" });
  const per = (Date.now() - t1) / 20;
  console.log(`\n${CASES.length - fail}/${CASES.length} passed, total ${Date.now() - t0} ms, ~${per.toFixed(1)} ms per keystroke analysis`);
  process.exit(fail ? 1 : 0);
})();

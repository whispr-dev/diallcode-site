/* diallcode.site — page wiring
 * Copyright (c) 2026 whispr.dev
 *
 * DOM only. All the thinking lives in engine.js (DC.*). Every string that
 * comes from input or data is inserted with textContent, never as HTML.
 */
(function () {
  "use strict";

  const DC = window.DC;
  const META = window.DCMETA;
  if (!DC) { document.getElementById("results").textContent = "Sorry — the lookup engine failed to load. Please refresh."; return; }

  // ---------------------------------------------------------------- DOM kit
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { for (const k of kid) add(el, k); return; }
    el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }

  const q = document.getElementById("q");
  const clearBtn = document.getElementById("clear");
  const homeSel = document.getElementById("home");
  const results = document.getElementById("results");
  const statusEl = document.getElementById("status");
  const examples = document.getElementById("examples");

  // ---------------------------------------------------------------- state
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  };
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) { tz = ""; }
  const autoHome = DC.detectHome(navigator, tz);
  const state = { input: "", homeChoice: store.get("dc.home") || "auto", selected: null, last: null, token: 0 };
  const home = () => (state.homeChoice === "auto" ? autoHome : state.homeChoice) || null;

  // ---------------------------------------------------------- home select
  (function fillHome() {
    const names = DC.regions.map((r) => [r, DC.regionName(r)]).sort((a, b) => a[1].localeCompare(b[1], "en"));
    homeSel.appendChild(h("option", { value: "auto" }, "Auto" + (autoHome ? " — " + DC.regionName(autoHome) : " (not detected)")));
    for (const [r, n] of names) homeSel.appendChild(h("option", { value: r }, n + " (+" + DC.regionInfo(r).cc + ")"));
    if (state.homeChoice !== "auto" && !DC.regions.includes(state.homeChoice)) state.homeChoice = "auto";
    homeSel.value = state.homeChoice;
    homeSel.addEventListener("change", function () {
      state.homeChoice = homeSel.value;
      store.set("dc.home", state.homeChoice === "auto" ? null : state.homeChoice);
      state.selected = null;
      run();
    });
  })();

  // ------------------------------------------------------------- examples
  const EXAMPLES = [
    ["020 7946 0123", "UK drama number"],
    ["(212) 555-0199", "US film number"],
    ["044 123 4567", "Ambiguous: 044 is an area code in several countries"],
    ["999", "UK emergency"],
    ["0161", "Area code"],
    ["+81 3 1234 5678", "Tokyo"],
    ["1-800-FLOWERS", "Vanity number"],
    ["+881 6 1234 5678", "Satellite phone"],
  ];
  for (const [v, title] of EXAMPLES) {
    examples.appendChild(h("button", { type: "button", class: "chip", title, onclick() { setInput(v); q.focus(); } }, v));
  }

  // ----------------------------------------------------------- utilities
  const pctText = (p) => (p >= 0.995 ? "100%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%");
  const TYPE_PILL = { TOLL_FREE: "ok", PREMIUM_RATE: "warn" };
  const CAT_PILL = { em: "em", tf: "ok", pr: "warn" };

  function srcLink(key) {
    const s = META.SRC[key];
    if (!s) return null;
    return h("span", { class: "src" }, "Source: ", h("a", { href: s.url, rel: "noopener", target: "_blank" }, s.name));
  }

  function copyBtn(value) {
    const b = h("button", { type: "button", class: "copy", "aria-label": "Copy " + value }, "Copy");
    b.addEventListener("click", function () {
      const done = () => { b.textContent = "Copied"; b.classList.add("done"); setTimeout(() => { b.textContent = "Copy"; b.classList.remove("done"); }, 1400); };
      const fallback = () => {
        const t = h("textarea", { class: "visually-hidden", readonly: true });
        t.value = value; document.body.appendChild(t); t.select();
        try { document.execCommand("copy"); done(); } catch (_) { /* nothing more we can do */ }
        t.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(done, fallback);
      else fallback();
    });
    return b;
  }

  function badge(r) {
    if (!r) return h("span", { class: "badge dim" }, "??");
    return h("span", { class: "badge" + (r === "001" ? " dim" : "") }, r === "001" ? "INTL" : r);
  }

  function likely(c, many) {
    if (!many) return null;
    return h("span", { class: "likely" }, "Likelihood ", h("b", null, pctText(c.pct)));
  }

  function modeText(c) {
    const b = c.best;
    const name = DC.regionName(c.region);
    if (b.mode === "intl") return "Written in international format.";
    if (b.mode === "national") return "Read as a number dialled inside " + (c.region === "001" ? "its network" : name) + ".";
    if (b.mode === "noplus") return "Read as an international number with the + missing.";
    if (b.mode === "idd") {
      const from = c.from || [];
      const users = from.includes(home()) ? DC.regionName(home()) + (from.length > 1 ? " and " + (from.length - 1) + " other countries" : "")
        : from.length > 3 ? from.length + " countries" : from.map(DC.regionName).join(", ");
      return "Dialled with exit code " + b.exit + " (used for calling abroad from " + users + ").";
    }
    return "";
  }

  const city = (z) => z.split("/").pop().replace(/_/g, " ");
  function zoneLine(z, names) {
    const t = DC.localTime(z, new Date());
    return (t ? t + " · " : "") + (names || city(z));
  }
  // Zones that show the same clock right now are merged: "Mon 15:20 · Guernsey, Isle of Man, London"
  function zonesNodes(zones) {
    const groups = new Map();
    for (const z of zones) {
      const k = DC.localTime(z, new Date()) || z;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(z);
    }
    const out = [];
    for (const list of groups.values()) {
      if (out.length) out.push(h("br"));
      const names = list.map(city).join(", ");
      out.push(h("span", { class: "lt", "data-zone": list[0], "data-names": names, title: list.join(", ") }, zoneLine(list[0], names)));
    }
    return out;
  }
  function sharedText(list) {
    const names = list.map(DC.regionName);
    return names.length <= 4 ? names.join(", ") : names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more";
  }
  let inputNotes = [];
  let inputVanity = null;

  function rulesText(exit, trunk) {
    return [exit ? "Exit code " + exit : "No fixed exit code", trunk ? "trunk prefix " + trunk : "no trunk prefix"].join(" · ");
  }

  function factRow(dl, label, value, sub) {
    if (value == null || value === "" || (Array.isArray(value) && !value.length)) return;
    dl.appendChild(h("dt", null, label));
    dl.appendChild(h("dd", null, value, sub ? h("div", { class: "sub" }, sub) : null));
  }

  // ---------------------------------------------------------- number card
  function numberCard(c, many) {
    const d = DC.details(c, home());
    const card = h("article", { class: "card" });
    const typePill = c.fict ? h("span", { class: "pill fict" }, "Fictional / reserved") :
      h("span", { class: "pill" + (TYPE_PILL[d.type] ? " " + TYPE_PILL[d.type] : "") }, d.typeLabel);
    card.appendChild(h("div", { class: "card-head" }, badge(c.region), h("span", { class: "country" }, d.regionName), typePill,
      !c.valid && !c.fict ? h("span", { class: "pill bad" }, "Not in use") : null, likely(c, many)));
    card.appendChild(h("div", { class: "big" }, c.phone.formatInternational()));
    card.appendChild(h("p", { class: "reading" }, modeText(c)));

    for (const f of d.flags) {
      card.appendChild(h("div", { class: "flag " + (f.level || "info") }, h("h3", null, f.title), h("p", null, f.text), srcLink(f.src)));
    }

    const dl = h("dl", { class: "facts" });
    // place
    let place = d.place && d.place.length ? d.place.join(" › ") : null;
    if (!place && (d.type === "MOBILE")) place = "Mobiles aren't tied to a place";
    factRow(dl, "Location", place, d.place && d.place.length ? "Where the number block was issued" : null);
    if (d.areaCode && d.cc !== "1") {
      factRow(dl, "Area code", (d.trunk || "") + d.areaCode, d.trunk ? "From abroad drop the " + d.trunk + ": +" + d.cc + " " + d.areaCode : null);
    }
    if (d.npa) {
      factRow(dl, "Area code " + d.npa.code, d.npa.state || "—",
        d.npa.places && d.npa.places.length ? "Busiest exchanges: " + d.npa.places.join(", ") : null);
    }
    if (d.carrier) factRow(dl, "Network", d.carrier, "Original network — the number may since have moved to another");
    if (d.zones && d.zones.length) factRow(dl, "Local time", zonesNodes(d.zones));
    else if (d.zoneCount) factRow(dl, "Local time", "Spans " + d.zoneCount + " time zones", "Not tied to one place");
    if (inputVanity) factRow(dl, "Spelled", inputVanity, "Letters converted using the phone keypad");
    factRow(dl, "Country code", "+" + d.cc + (d.shared ? " · shared by " + sharedText(d.shared) : ""), d.ccNote);
    if (c.region && c.region !== "001") {
      factRow(dl, "Dialling rules", rulesText(d.exit, d.trunk), "How people in " + d.regionName + " call abroad, and what they add before area codes at home");
    }
    if (d.zone) factRow(dl, "World zone", d.zone.replace(/^World zone \d — /, ""), d.zone.match(/^World zone \d/)[0]);
    card.appendChild(dl);

    // formats
    const fs = h("div", { class: "sect" }, h("h3", null, "Formats"));
    const tbl = h("table", { class: "formats" });
    for (const f of d.formats) tbl.appendChild(h("tr", null, h("th", { scope: "row" }, f.k), h("td", null, f.v), h("td", { class: "act" }, copyBtn(f.v))));
    fs.appendChild(tbl);
    card.appendChild(fs);

    // checks
    const ck = h("ul", { class: "checks" });
    const item = (ok, text) => ck.appendChild(h("li", null, h("span", { class: "i " + (ok === true ? "y" : ok === "m" ? "m" : "n") }, ok === true ? "✓" : ok === "m" ? "◆" : "✗"), text));
    item(true, "Country code +" + d.cc + " is assigned");
    const lenMsg = { OK: "Length is right for this country", TOO_SHORT: "Too short for this country", TOO_LONG: "Too long for this country", INVALID_LENGTH: "No number here has this length", INVALID_COUNTRY: "Country not recognised", NOT_A_NUMBER: "Not a number" };
    item(d.lengthCheck === "OK", lenMsg[d.lengthCheck] || d.lengthCheck);
    if (c.fict) item("m", "Reserved range — deliberately never connected");
    else item(c.valid, c.valid ? "Inside a range that's allocated for use" : "Not inside any allocated range");
    if (d.type) item(true, "Number type: " + d.typeLabel);
    card.appendChild(h("div", { class: "sect" }, h("h3", null, "Checks"), ck));

    card.appendChild(whyBlock(c));
    if (!DC.isLoaded("cc:" + c.cc) && DC.hasChunk(c.cc)) card.appendChild(h("p", { class: "loading" }, "Loading place, network and time-zone data…"));
    return card;
  }

  function whyBlock(c) {
    const reasons = inputNotes.concat((c.best && c.best.reasons) || []);
    if (!reasons.length) return null;
    return h("div", { class: "sect" }, h("h3", null, "Why this reading"), h("ul", { class: "why" }, reasons.map((r) => h("li", null, r))));
  }

  // ----------------------------------------------------------- short card
  function shortCard(c, many) {
    const card = h("article", { class: "card" });
    const regs = c.regions;
    const where = regs.length === 1 ? DC.regionName(regs[0]) : regs.includes(home()) ? DC.regionName(home()) + " + " + (regs.length - 1) + " more" : regs.length + " countries";
    card.appendChild(h("div", { class: "card-head" }, badge(regs.length === 1 ? regs[0] : regs.includes(home()) ? home() : null),
      h("span", { class: "country" }, where), h("span", { class: "pill" + (CAT_PILL[c.cat] ? " " + CAT_PILL[c.cat] : "") }, c.catLabel), likely(c, many)));
    card.appendChild(h("div", { class: "big" }, c.code));
    card.appendChild(h("p", { class: "reading" }, c.label || (c.cat === "em" ? "Emergency number" : "Short code — only works when dialled inside the country")));
    if (c.cat === "em") {
      card.appendChild(h("div", { class: "flag em" }, h("h3", null, "Emergency number"),
        h("p", null, "Connects to emergency services" + (regs.length === 1 ? " in " + DC.regionName(regs[0]) : " in the countries below") + ". Only call it when someone's life, safety or property is at risk.")));
    } else if (c.cat === "pr") {
      card.appendChild(h("div", { class: "flag warn" }, h("h3", null, "Premium short code"), h("p", null, "Calls or texts to this code can be charged at a premium rate.")));
    }
    const tags = h("div", { class: "tags" });
    for (const r of regs.slice(0, 24)) tags.appendChild(h("span", { class: "tag" + (r === home() ? " home" : "") }, DC.regionName(r)));
    if (regs.length > 24) tags.appendChild(h("span", { class: "tag" }, "+" + (regs.length - 24) + " more"));
    card.appendChild(h("div", { class: "sect" }, h("h3", null, regs.length === 1 ? "Works in" : "Means this in " + regs.length + " countries"), tags));
    card.appendChild(h("div", { class: "sect" }, h("h3", null, "Good to know"), h("ul", { class: "why" },
      h("li", null, "Short codes only work when dialled inside the country — there's no international version."),
      h("li", null, "Some only work on certain networks, or only from mobiles."),
      c.label ? h("li", null, "Service label: diallcode's own list, shown only where Google's short-number data confirms the code.") : null)));
    card.appendChild(whyBlock(c));
    return card;
  }

  // ------------------------------------------------------- country code card
  function ccCard(c, many) {
    const card = h("article", { class: "card" });
    const regs = c.regions || [];
    const main = regs[0] && regs[0] !== "001" ? regs[0] : null;
    const name = !regs.length ? "Not assigned to a country" : regs[0] === "001" ? "International service" : DC.regionName(regs[0]);
    card.appendChild(h("div", { class: "card-head" }, badge(regs[0] || null), h("span", { class: "country" }, name),
      h("span", { class: "pill" }, "Country code"), likely(c, many)));
    card.appendChild(h("div", { class: "big" }, "+" + c.cc));
    const note = META.CC_NOTES[c.cc];
    if (note) card.appendChild(h("div", { class: "flag" + (regs.length ? "" : " warn") }, h("h3", null, regs.length ? "About +" + c.cc : "Unassigned / reserved"), h("p", null, note), srcLink("itu")));
    else if (!regs.length) card.appendChild(h("div", { class: "flag warn" }, h("h3", null, "Unassigned"), h("p", null, "No country or service uses +" + c.cc + " today."), srcLink("itu")));
    const dl = h("dl", { class: "facts" });
    if (regs.length > 1 && regs[0] !== "001") factRow(dl, "Used by", regs.length > 12 ? sharedText(regs) : regs.map(DC.regionName).join(", "));
    const zone = DC.zoneOf(c.cc);
    if (zone) factRow(dl, "World zone", zone.replace(/^World zone \d — /, ""), zone.match(/^World zone \d/)[0]);
    if (main) {
      const f = DC.regionFacts(main);
      factRow(dl, "Dialling rules", rulesText(f.exit, f.trunk), "How people in " + f.name + " call abroad, and what they add before area codes at home");
      const hm = home();
      if (hm && hm !== main) {
        const hf = DC.regionFacts(hm);
        if (hf && hf.cc !== c.cc) factRow(dl, "From " + hf.name, (hf.exit ? hf.exit + " " : "+") + c.cc + " …", "Then the number without its " + (f.trunk ? "leading " + f.trunk : "trunk prefix"));
      }
    }
    card.appendChild(dl);
    card.appendChild(h("p", { class: "loading" }, "Keep typing the area code and number for a full check."));
    card.appendChild(whyBlock(c));
    return card;
  }

  // ----------------------------------------------------------- area card
  function areaCard(c, many) {
    const card = h("article", { class: "card" });
    const f = c.region ? DC.regionFacts(c.region) : null;
    const trunk = f && f.trunk && c.cc !== "1" ? f.trunk : "";
    const typed = (trunk && !c.part.startsWith(trunk) ? trunk : "") + c.part;
    card.appendChild(h("div", { class: "card-head" }, badge(c.region), h("span", { class: "country" }, f ? f.name : "+" + c.cc),
      h("span", { class: "pill" }, c.exact ? "Area code" : "Start of an area code"), likely(c, many)));
    card.appendChild(h("div", { class: "big" }, c.cc === "1" ? c.part : typed));
    card.appendChild(h("p", { class: "reading" }, c.exact ? c.exact : "No area code is exactly " + typed + " — here's what starts with it."));
    const dl = h("dl", { class: "facts" });
    factRow(dl, "From abroad", "+" + c.cc + " " + c.part + " …");
    if (f) factRow(dl, "Country code", "+" + f.cc + (f.shared && f.shared.length > 1 ? " · shared by " + sharedText(f.shared) : ""));
    card.appendChild(dl);
    if (c.completions && c.completions.length) {
      const ul = h("ul", { class: "comp" });
      for (const x of c.completions) {
        const shown = c.cc === "1" ? x.prefix : (trunk ? trunk : "") + x.prefix;
        ul.appendChild(h("li", null, h("button", { type: "button", title: "Look up " + shown, onclick() { setInput(c.cc === "1" ? x.prefix : shown); } },
          h("span", { class: "p" }, shown), h("span", { class: "t" }, x.text))));
      }
      card.appendChild(h("div", { class: "sect" }, h("h3", null, c.exact ? "Longer codes starting " + typed : "Area codes starting " + typed), ul));
    }
    card.appendChild(h("p", { class: "loading" }, "Keep typing the rest of the number for a full check."));
    card.appendChild(whyBlock(c));
    return card;
  }

  // -------------------------------------------------------- alternatives
  function altLabel(c) {
    if (c.kind === "number") {
      const type = c.phone.getType();
      return [c.phone.formatInternational(), (c.region === "001" ? "International" : DC.regionName(c.region)) +
        (c.fict ? " · fictional range" : type ? " · " + typeName(type) : "") + (c.valid || c.fict ? "" : " · not in use")];
    }
    if (c.kind === "short") return [c.code, (c.label || c.catLabel) + " · " + (c.regions.length === 1 ? DC.regionName(c.regions[0]) : c.regions.length + " countries")];
    if (c.kind === "cc") return ["+" + c.cc, "Country code · " + (c.regions && c.regions.length ? (c.regions[0] === "001" ? "international service" : c.regions.map(DC.regionName).slice(0, 3).join(", ")) : "unassigned")];
    if (c.kind === "area") {
      const f = c.region ? DC.regionFacts(c.region) : null;
      const tr = f && f.trunk && c.cc !== "1" && !c.part.startsWith(f.trunk) ? f.trunk : "";
      return [(c.cc === "1" ? "" : tr) + c.part, (c.exact || "Start of an area code") + " · " + (f ? f.name : "+" + c.cc)];
    }
    return ["?", ""];
  }
  const TYPE_SHORT = { FIXED_LINE: "landline", MOBILE: "mobile", FIXED_LINE_OR_MOBILE: "landline/mobile", TOLL_FREE: "toll-free", PREMIUM_RATE: "premium", SHARED_COST: "shared cost", VOIP: "VoIP", PERSONAL_NUMBER: "personal number", PAGER: "pager", UAN: "company number", VOICEMAIL: "voicemail" };
  const typeName = (t) => TYPE_SHORT[t] || t.toLowerCase();

  function altsCard(cands, main) {
    if (cands.length < 2) return null;
    const card = h("section", { class: "card alts", "aria-label": "Other readings" });
    card.appendChild(h("h2", null, "Other ways to read it"));
    if (cands[0].pct < 0.5) card.appendChild(h("p", { class: "note" }, "Several countries use this pattern. Set “Dialling from” if you know where it came from, or add the + and country code."));
    const ul = h("ul", { class: "alt-list" });
    for (const c of cands.slice(0, 7)) {
      const [b, s] = altLabel(c);
      const bar = h("span", { class: "bar" }, h("i"));
      bar.firstChild.style.width = Math.max(2, Math.round(c.pct * 100)) + "%";
      ul.appendChild(h("li", null, h("button", {
        type: "button", class: "alt" + (c === main ? " on" : ""), "aria-pressed": c === main ? "true" : "false",
        onclick() { state.selected = c.key; render(state.last); window.scrollTo({ top: Math.max(0, results.getBoundingClientRect().top + window.scrollY - 80), behavior: "smooth" }); },
      }, h("span", { class: "pct" }, pctText(c.pct)), bar, h("span", { class: "lbl" }, h("b", { class: "x" }, b), h("span", { class: "x" }, s)))));
    }
    card.appendChild(ul);
    return card;
  }

  // -------------------------------------------------------------- empty
  function emptyCard() {
    return h("article", { class: "card empty" },
      h("p", null, "Paste or type anything number-shaped. A few things it knows:"),
      h("ul", null,
        h("li", null, h("b", null, "Any country"), " — numbers with or without +, 00 / 011 exit codes, (0) and spaces as you got them."),
        h("li", null, h("b", null, "Where & what"), " — area, network, local time, mobile vs landline, toll-free, premium, VoIP, satellite."),
        h("li", null, h("b", null, "Special numbers"), " — emergency and service short codes, plus the blocks kept back for films & TV."),
        h("li", null, h("b", null, "Codes on their own"), " — type 44, +1, 0161 or 212 to see what they belong to."),
        h("li", null, h("b", null, "Smart guessing"), " — no + ? It ranks every country the digits could belong to.")));
  }

  // ------------------------------------------------------------- render
  function render(res) {
    results.textContent = "";
    inputNotes = (res && res.n && res.n.notes) || [];
    inputVanity = (res && res.n && res.n.vanity) || null;
    if (!res || res.kind === "empty") { results.appendChild(emptyCard()); statusEl.textContent = ""; return; }
    if (!res.cands.length) {
      results.appendChild(h("article", { class: "card" }, h("p", { class: "reading" }, "Nothing matches yet — keep typing, or add the + and country code."), res.needs.length ? h("p", { class: "loading" }, "Loading data…") : null));
      statusEl.textContent = "No match yet";
      return;
    }
    const main = res.cands.find((c) => c.key === state.selected) || res.cands[0];
    const many = res.cands.length > 1;
    const card = main.kind === "number" ? numberCard(main, many) : main.kind === "short" ? shortCard(main, many) : main.kind === "cc" ? ccCard(main, many) : areaCard(main, many);
    results.appendChild(card);
    const alts = altsCard(res.cands, main);
    if (alts) results.appendChild(alts);
    const [b, s] = altLabel(main);
    statusEl.textContent = b + " — " + s;
  }

  // ---------------------------------------------------------------- run
  function run() {
    const token = ++state.token;
    let res;
    try { res = DC.analyse(state.input, { home: home() }); }
    catch (e) { results.textContent = ""; results.appendChild(h("article", { class: "card" }, h("p", { class: "reading" }, "Couldn't read that — try another format."))); return; }
    state.last = res;
    if (state.selected && !res.cands.some((c) => c.key === state.selected)) state.selected = null;
    render(res);
    if (res.needs.length) {
      Promise.all(res.needs.map((n) => DC.need(n))).then(function () { if (token === state.token) run(); });
    }
    // number cards also want their country chunk (place, network, time zone)
    const main = res.cands.find((c) => c.key === state.selected) || res.cands[0];
    if (main && main.kind === "number" && DC.hasChunk(main.cc) && !DC.isLoaded("cc:" + main.cc)) {
      DC.need("cc:" + main.cc).then(function () { if (token === state.token) render(state.last); });
    }
  }

  let debounce = 0;
  let hashTimer = 0;
  function onInput() {
    state.input = q.value;
    state.selected = null;
    clearBtn.hidden = !q.value;
    clearTimeout(debounce);
    debounce = setTimeout(run, 70);
    clearTimeout(hashTimer);
    hashTimer = setTimeout(syncHash, 500);
    warm();
  }
  function setInput(v) { q.value = v; onInput(); clearTimeout(debounce); run(); }

  function syncHash() {
    try {
      const v = q.value.trim();
      const url = location.pathname + location.search + (v ? "#" + encodeURIComponent(v) : "");
      history.replaceState(null, "", url);
    } catch (_) { /* file:// in some browsers */ }
  }
  function fromHash() {
    let v = "";
    try { v = decodeURIComponent((location.hash || "").slice(1)); } catch (_) { v = ""; }
    return v.slice(0, 80);
  }

  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    Promise.all([DC.need("short"), DC.need("areas")]).then(function () { if (state.input) run(); });
  }

  q.addEventListener("input", onInput);
  document.getElementById("search").addEventListener("submit", function (e) { e.preventDefault(); clearTimeout(debounce); run(); });
  clearBtn.addEventListener("click", function () { setInput(""); q.focus(); });
  window.addEventListener("hashchange", function () { const v = fromHash(); if (v !== q.value) setInput(v); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== q && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); q.focus(); q.select(); }
    if (e.key === "Escape" && document.activeElement === q && q.value) setInput("");
  });

  // keep local times fresh while a number is on screen
  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    for (const el of results.querySelectorAll(".lt[data-zone]")) el.textContent = zoneLine(el.getAttribute("data-zone"), el.getAttribute("data-names"));
  }, 20000);

  // ------------------------------------------------------ words <-> numbers
  (function vanity() {
    const V = window.DCV;
    const vq = document.getElementById("vq");
    const vout = document.getElementById("vout");
    const vclear = document.getElementById("vclear");
    if (!V || !vq) return;

    function insert(text) {
      const a = vq.selectionStart == null ? vq.value.length : vq.selectionStart;
      const b = vq.selectionEnd == null ? vq.value.length : vq.selectionEnd;
      vq.value = (vq.value.slice(0, a) + text + vq.value.slice(b)).slice(0, 40);
      const at = Math.min(a + text.length, vq.value.length);
      try { vq.setSelectionRange(at, at); } catch (_) { /* not focused */ }
      vrun();
    }

    for (const k of document.querySelectorAll(".keypad .key")) {
      k.addEventListener("click", function () { insert(k.getAttribute("data-key")); });
    }
    vq.addEventListener("input", vrun);
    vq.addEventListener("focus", function () { DC.need("words"); });
    vclear.addEventListener("click", function () { vq.value = ""; vrun(); vq.focus(); });

    function lookupButton(digits) {
      return h("button", { type: "button", class: "v-go", onclick() { setInput(digits); window.scrollTo({ top: 0, behavior: "smooth" }); } }, "Check this number ↑");
    }

    function vrun() {
      const v = vq.value;
      vclear.hidden = !v;
      vout.textContent = "";
      if (!v.trim()) { vout.appendChild(h("p", { class: "v-meta" }, "Press the keys or type. Letters become digits; digits become words.")); return; }

      if (V.hasLetters(v)) {
        const d = V.toDigits(v).toUpperCase();
        vout.appendChild(h("div", { class: "v-label" }, "Dials as"));
        vout.appendChild(h("div", { class: "v-big" }, h("span", null, d), copyBtn(d)));
        const digits = d.replace(/[^\d+]/g, "");
        let top = null;
        try { top = DC.analyse(digits, { home: home() }).cands[0]; } catch (_) { top = null; }
        if (top && top.kind === "number" && (top.valid || top.fict)) {
          const t = top.phone.getType();
          vout.appendChild(h("div", { class: "v-meta" }, top.phone.formatInternational() + " · " +
            (top.region === "001" ? "International" : DC.regionName(top.region)) + (t ? " · " + typeName(t) : "")));
        }
        if (digits.replace(/\D/g, "").length >= 5) vout.appendChild(lookupButton(digits));
        return;
      }

      const D = v.replace(/\D/g, "");
      if (D.length < 3) { vout.appendChild(h("p", { class: "v-meta" }, "Keep going — words need a few digits from 2 to 9.")); return; }
      if (!V.isReady()) {
        vout.appendChild(h("p", { class: "loading" }, "Loading the word list…"));
        DC.need("words").then(function (ok) { if (V.isReady()) vrun(); else { vout.textContent = ""; vout.appendChild(h("p", { class: "v-meta" }, "Couldn't load the word list — refresh to try again.")); } });
        return;
      }
      const r = V.spell(v, 10);
      if (!r.list.length) {
        vout.appendChild(h("p", { class: "v-meta" }, "No words fit the end of this number. 0 and 1 have no letters, so a word can only use digits 2–9."));
        vout.appendChild(lookupButton(D));
        return;
      }
      vout.appendChild(h("div", { class: "v-label" }, "Could spell"));
      const ul = h("ul", { class: "v-list" });
      for (const x of r.list) {
        ul.appendChild(h("li", null, h("span", { class: "v-t" }, x.prefix ? h("i", null, x.prefix + " ") : null, h("em", null, x.words.join(" "))), copyBtn(x.text)));
      }
      vout.appendChild(ul);
      if (r.list[0].letters < 3) vout.appendChild(h("p", { class: "v-meta" }, "Only short words fit here."));
      vout.appendChild(h("p", { class: "v-meta" }, "Everyday English words, rude ones filtered out. Words are only at the end, as on real vanity numbers."));
    }
    vrun();
  })();

  // boot
  const initial = fromHash();
  if (initial) setInput(initial); else render(null);
  if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) q.focus();
})();

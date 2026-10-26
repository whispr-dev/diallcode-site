/* diallcode.site — curated reference data
 * Copyright (c) 2026 whispr.dev
 *
 * Everything here is hand-curated from primary sources and only *adds labels*
 * on top of Google's libphonenumber metadata. Sources are named per entry and
 * shown on the page.
 */
(function (g) {
  "use strict";

  // ---------------------------------------------------------------- sources
  const SRC = {
    ofcom: { name: "Ofcom — numbers for drama", url: "https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama" },
    ofcomPlan: { name: "Ofcom — UK numbering plan", url: "https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/numbering" },
    nanpa: { name: "NANPA — 555 line numbers", url: "https://nanpa.com/numbering/555-line-numbers" },
    nanpaPlan: { name: "NANPA — North American Numbering Plan", url: "https://nanpa.com/" },
    acma: { name: "ACMA — numbers for TV, film & creative works", url: "https://www.acma.gov.au/phone-numbers-use-tv-shows-films-and-creative-works" },
    arcep: { name: "Arcep — numbers reserved for audiovisual works", url: "https://www.arcep.fr/" },
    bnetza: { name: "Bundesnetzagentur — Drama Numbers", url: "https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Nummerierung/DramaNumbers/artikel.html" },
    pts: { name: "PTS (Sweden) — fictional numbers", url: "https://www.pts.se/" },
    itu: { name: "ITU-T E.164 assigned country codes", url: "https://www.itu.int/pub/T-SP-E.164D" },
    eu116: { name: "Harmonised European 116 numbers", url: "https://www.ofcom.org.uk/phones-and-broadband/phone-numbers/116-euro-numbers" },
    lpn: { name: "Google libphonenumber metadata", url: "https://github.com/google/libphonenumber" },
  };

  // ------------------------------------------------- reserved / fictional
  // re is tested against the national significant number (no trunk 0).
  const FICTIONAL = [
    // United Kingdom — Ofcom drama numbers (1000 numbers each)
    { cc: "44", re: /^1134960\d{3}$/, area: "Leeds (0113)" },
    { cc: "44", re: /^1144960\d{3}$/, area: "Sheffield (0114)" },
    { cc: "44", re: /^1154960\d{3}$/, area: "Nottingham (0115)" },
    { cc: "44", re: /^1164960\d{3}$/, area: "Leicester (0116)" },
    { cc: "44", re: /^1174960\d{3}$/, area: "Bristol (0117)" },
    { cc: "44", re: /^1184960\d{3}$/, area: "Reading (0118)" },
    { cc: "44", re: /^1214960\d{3}$/, area: "Birmingham (0121)" },
    { cc: "44", re: /^1314960\d{3}$/, area: "Edinburgh (0131)" },
    { cc: "44", re: /^1414960\d{3}$/, area: "Glasgow (0141)" },
    { cc: "44", re: /^1514960\d{3}$/, area: "Liverpool (0151)" },
    { cc: "44", re: /^1614960\d{3}$/, area: "Manchester (0161)" },
    { cc: "44", re: /^1914980\d{3}$/, area: "Tyneside/Durham/Sunderland (0191)" },
    { cc: "44", re: /^2079460\d{3}$/, area: "London (020)" },
    { cc: "44", re: /^2896496\d{3}$/, area: "Northern Ireland (028)" },
    { cc: "44", re: /^2920180\d{3}$/, area: "Cardiff (029)" },
    { cc: "44", re: /^1632960\d{3}$/, area: "No area (01632)" },
    { cc: "44", re: /^7700900\d{3}$/, area: "Mobile (07700 900xxx)" },
    { cc: "44", re: /^8081570\d{3}$/, area: "Freephone (08081 570xxx)" },
    { cc: "44", re: /^9098790\d{3}$/, area: "Premium rate (0909 879 0xxx)" },
    { cc: "44", re: /^3069990\d{3}$/, area: "UK-wide (03069 990xxx)" },
    // NANP — 555-0100 to 555-0199 in every area code
    { cc: "1", re: /^[2-9]\d\d55501\d\d$/, area: "555-0100 to 555-0199, any area code", src: "nanpa" },
    // Australia — ACMA
    { cc: "61", re: /^[2378](?:5550|7010)\d{4}$/, area: "Geographic 5550 xxxx / 7010 xxxx blocks", src: "acma" },
    { cc: "61", re: /^491(?:570(?:006|156|157|158|159|110|313|737)|571(?:266|491|804)|572(?:549|665|983)|573(?:770|087)|574(?:118|632)|575(?:254|789)|576(?:398|801)|577(?:426|644)|578(?:957|148|888)|579(?:212|760|455))$/, area: "Mobile 0491 57x xxx list", src: "acma" },
    { cc: "61", re: /^(?:1800160401|180097570[7-9]|18009757(?:10|11)|130097570[7-9]|13009757(?:10|11))$/, area: "1800 / 1300 numbers", src: "acma" },
    { cc: "61", re: /^1900654321$/, area: "Premium 1900 654 321", src: "acma" },
    // France — Arcep: six blocks of 10,000
    { cc: "33", re: /^(?:19900|26191|35301|46571|53649|63998)\d{4}$/, area: "01 99 00 / 02 61 91 / 03 53 01 / 04 65 71 / 05 36 49 / 06 39 98 blocks", src: "arcep" },
    // Germany — Bundesnetzagentur drama numbers
    { cc: "49", re: /^(?:3023125|6990009|4066969|2214710|8999998)\d{3}$/, area: "Berlin / Frankfurt / Hamburg / Köln / München blocks", src: "bnetza" },
    { cc: "49", re: /^(?:17139200\d\d|176040690\d\d|15228817386|15228895456|15254599371|1729925904|1729968532|1729973185|1729973186|1729980752|1749091317|1749464308)$/, area: "Mobile drama numbers", src: "bnetza" },
    // Sweden — PTS
    { cc: "46", re: /^(?:70174060[5-9]|7017406[1-9]\d|3139006\d\d|4062804\d\d|8465004\d\d|9803192\d\d)$/, area: "070-174 06 05–99 and four landline blocks", src: "pts" },
  ];
  for (const f of FICTIONAL) if (!f.src) f.src = "ofcom";

  // ------------------------------------------------------- range notes
  // Human descriptions of number blocks. First match per (cc) wins, so put the
  // most specific first. Tested against the national significant number.
  const RANGES = [
    // UK
    { cc: "44", re: /^3/, title: "UK-wide 03 number", text: "Charged like a call to an 01/02 number and included in bundled minutes. 030 is kept for public bodies and charities.", src: "ofcomPlan" },
    { cc: "44", re: /^5[56]/, title: "Corporate / VoIP number (055, 056)", text: "Non-geographic numbers used by businesses and internet phone services.", src: "ofcomPlan" },
    { cc: "44", re: /^500/, title: "Old 0500 freephone", text: "The 0500 freephone range was withdrawn by Ofcom in 2017.", src: "ofcomPlan" },
    { cc: "44", re: /^70/, title: "070 personal number", text: "Follow-me numbers that forward anywhere. They look like mobiles but can cost far more to call, which is why scammers like them.", src: "ofcomPlan", level: "warn" },
    { cc: "44", re: /^7624/, title: "Isle of Man mobile", text: "A mobile number on the Isle of Man networks (Crown Dependency, shares +44).", src: "ofcomPlan" },
    { cc: "44", re: /^76/, title: "076 pager number", text: "Radiopaging range (except 07624, which is Isle of Man mobile).", src: "ofcomPlan" },
    { cc: "44", re: /^7[1-57-9]/, title: "UK mobile", text: "Mobile numbers can be moved between networks, so the network shown is the original allocation.", src: "ofcomPlan" },
    { cc: "44", re: /^80[08]/, title: "Freephone (0800 / 0808)", text: "Free to call from UK landlines and mobiles.", src: "ofcomPlan" },
    { cc: "44", re: /^8[47]/, title: "Business rate (084 / 087)", text: "Costs a service charge set by the business plus your own provider's access charge.", src: "ofcomPlan" },
    { cc: "44", re: /^98/, title: "098 premium rate (adult)", text: "Premium-rate range reserved for sexual entertainment services.", src: "ofcomPlan", level: "warn" },
    { cc: "44", re: /^9/, title: "Premium rate (09)", text: "Expensive to call: the price is set by the service and must be stated in its advertising.", src: "ofcomPlan", level: "warn" },
    // NANP non-geographic area codes
    { cc: "1", re: /^8(?:00|33|44|55|66|77|88)/, title: "Toll-free (8XX)", text: "Free for the caller anywhere in the North American Numbering Plan; usually not reachable from abroad.", src: "nanpaPlan" },
    { cc: "1", re: /^8(?:22|8[0-7]|89)/, title: "Reserved toll-free code", text: "Held in reserve for future toll-free expansion.", src: "nanpaPlan" },
    { cc: "1", re: /^900/, title: "900 premium (pay-per-call)", text: "Caller pays a premium charge set by the service.", src: "nanpaPlan", level: "warn" },
    { cc: "1", re: /^5(?:00|33|44|66|77|88)/, title: "5XX personal communications", text: "Non-geographic codes for personal communications services, not tied to a place.", src: "nanpaPlan" },
    { cc: "1", re: /^456/, title: "456 inbound international", text: "Carrier-specific services for calls coming into the NANP from abroad.", src: "nanpaPlan" },
    { cc: "1", re: /^600/, title: "600 Canadian non-geographic", text: "Canadian non-geographic services (data, satellite and similar).", src: "nanpaPlan" },
    { cc: "1", re: /^700/, title: "700 carrier services", text: "Interexchange-carrier-specific services; meaning depends on your long-distance carrier.", src: "nanpaPlan" },
    { cc: "1", re: /^710/, title: "710 US government", text: "Reserved for the US federal government (emergency preparedness).", src: "nanpaPlan" },
    { cc: "1", re: /^[2-9]\d\d5551212$/, title: "555-1212 directory assistance", text: "The traditional directory-assistance number in each area code.", src: "nanpa" },
    { cc: "1", re: /^[2-9]\d\d555\d{4}$/, title: "555 exchange", text: "Most 555 numbers were never assigned to homes. Only 555-0100 to 555-0199 are guaranteed fictional.", src: "nanpa" },
    { cc: "1", re: /^[2-9]\d\d950\d{4}$/, title: "950 carrier access", text: "Exchange code used for long-distance carrier access (Feature Group B).", src: "nanpaPlan" },
    { cc: "1", re: /^[2-9]\d\d95[89]\d{4}$/, title: "958 / 959 test codes", text: "Reserved for local telephone company testing.", src: "nanpaPlan" },
    { cc: "1", re: /^[2-9]\d\d976\d{4}$/, title: "976 exchange", text: "Historically used for premium-charge information lines.", src: "nanpaPlan", level: "warn" },
    // France has no city-level geocoding in libphonenumber; give the zone
    { cc: "33", re: /^1/, title: "Île-de-France (Paris region)", text: "Geographic zone 01.", src: "arcep", place: "Île-de-France" },
    { cc: "33", re: /^2/, title: "North-west France", text: "Geographic zone 02.", src: "arcep", place: "North-west France" },
    { cc: "33", re: /^3/, title: "North-east France", text: "Geographic zone 03.", src: "arcep", place: "North-east France" },
    { cc: "33", re: /^4/, title: "South-east France", text: "Geographic zone 04 (includes Corsica).", src: "arcep", place: "South-east France" },
    { cc: "33", re: /^5/, title: "South-west France", text: "Geographic zone 05.", src: "arcep", place: "South-west France" },
    { cc: "33", re: /^[67]/, title: "French mobile", text: "06 and 07 are mobile ranges.", src: "arcep" },
    { cc: "33", re: /^8/, title: "French special-rate number", text: "08 numbers range from free (0800–0805) to premium.", src: "arcep" },
    { cc: "33", re: /^9/, title: "French non-geographic (09)", text: "Internet-box / VoIP numbers, not tied to a region.", src: "arcep" },
  ];

  // ------------------------------------------- international calling codes
  const ZONES = {
    "1": "World zone 1 — North American Numbering Plan",
    "2": "World zone 2 — mostly Africa (plus Aruba, Faroe, Greenland, Diego Garcia)",
    "3": "World zone 3 — Europe",
    "4": "World zone 4 — Europe",
    "5": "World zone 5 — Mexico, Central & South America, Falklands",
    "6": "World zone 6 — Southeast Asia & Oceania",
    "7": "World zone 7 — Russia & Kazakhstan",
    "8": "World zone 8 — East Asia & special services",
    "9": "World zone 9 — West, Central & South Asia, Middle East",
  };

  // Codes with special meaning (ITU-T E.164). Shown for any code, assigned or not.
  const CC_NOTES = {
    "1": "Shared by the US, Canada and 23 Caribbean & Pacific territories; the area code tells them apart.",
    "7": "Shared by Russia and Kazakhstan (Kazakhstan uses +7 6xx and +7 7xx).",
    "39": "Shared by Italy and Vatican City.",
    "44": "Shared by the UK and the Crown Dependencies (Guernsey, Jersey, Isle of Man).",
    "47": "Shared by Norway and Svalbard & Jan Mayen.",
    "61": "Shared by Australia, Christmas Island and the Cocos (Keeling) Islands.",
    "262": "Shared by Réunion and Mayotte.",
    "590": "Shared by Guadeloupe, Saint Barthélemy and Saint Martin.",
    "599": "Shared by Curaçao and Caribbean Netherlands.",
    "800": "International Freephone (UIFN): one toll-free number valid in many countries.",
    "808": "International Shared Cost Service (ISCS).",
    "870": "Inmarsat single network access code (satellite phones).",
    "871": "Former Inmarsat Atlantic East code — retired in 2008.",
    "872": "Former Inmarsat Pacific code — retired in 2008.",
    "873": "Former Inmarsat Indian Ocean code — retired in 2008.",
    "874": "Former Inmarsat Atlantic West code — retired in 2008.",
    "878": "Universal Personal Telecommunications (UPT) service.",
    "881": "Global Mobile Satellite System: 8816/8817 Iridium, 8818/8819 Globalstar, 8812/8813 Ellipso, 8810/8811 ICO.",
    "882": "International networks (e.g. +882 16 is Thuraya satellite).",
    "883": "International networks (global carriers, IoT and roaming platforms).",
    "888": "UN OCHA — telecommunications for disaster relief.",
    "979": "International Premium Rate Service (IPRS).",
    "991": "Trial of a proposed international public correspondence service (ITPCS).",
    "999": "Reserved by the ITU for a future global service.",
    "388": "Formerly the European Telephony Numbering Space (+388 3) — withdrawn.",
    "42": "Former Czechoslovakia; split in 1997 into +420 Czechia and +421 Slovakia.",
    "969": "Formerly South Yemen; merged into +967 Yemen in 1990.",
  };
  const SAT_881 = { "0": "ICO", "1": "ICO", "2": "Ellipso", "3": "Ellipso", "6": "Iridium", "7": "Iridium", "8": "Globalstar", "9": "Globalstar" };

  // --------------------------------------------------------- short codes
  // Labels for short numbers. Only shown when Google's short-number data
  // confirms the code exists in that region, so a stale label can't appear
  // on its own.
  const EU116 = {
    "116000": "Missing children hotline (EU 116 number)",
    "116006": "Helpline for victims of crime (EU 116 number)",
    "116111": "Child helpline (EU 116 number)",
    "116117": "Non-emergency medical on-call service (EU 116 number)",
    "116123": "Emotional support helpline (EU 116 number)",
  };
  const SHORT = {
    "*": { "112": "Emergency — the international GSM / European emergency number" },
    GB: { "999": "Emergency: police, fire, ambulance, coastguard", "112": "Emergency (same as 999)", "101": "Police non-emergency", "111": "NHS non-urgent medical help", "105": "Power cut helpline", "100": "Operator", "123": "Speaking clock", "155": "International operator", "159": "Stop Scams UK — call your bank safely", "116000": "Missing children hotline", "116111": "Childline", "116123": "Samaritans — free emotional support", "7726": "Report spam texts (forward them to 7726)", "18000": "Emergency via Relay UK (text relay)" },
    US: { "911": "Emergency", "211": "Community services & information", "311": "Non-emergency city services", "411": "Directory assistance", "511": "Traffic & travel information", "611": "Phone company repair / customer service", "711": "Telecommunications Relay Service (deaf & hard of hearing)", "811": "Call before you dig", "988": "988 Suicide & Crisis Lifeline" },
    CA: { "911": "Emergency", "211": "Community & social services", "311": "Non-emergency city services", "411": "Directory assistance", "511": "Traffic & travel information", "611": "Phone company repair / customer service", "711": "Telecommunications Relay Service", "811": "Health advice line (most provinces)", "988": "9-8-8 Suicide Crisis Helpline" },
    AU: { "000": "Emergency: police, fire, ambulance", "112": "Emergency from mobiles (connects to 000)", "106": "Emergency for text / TTY users", "131444": "Police assistance line (non-urgent, most states)" },
    NZ: { "111": "Emergency: police, fire, ambulance", "105": "Police non-emergency" },
    IE: { "999": "Emergency", "112": "Emergency (same as 999)" },
    DE: { "110": "Police", "112": "Fire & ambulance (and EU emergency)", "115": "Public authorities information line", "116117": "Out-of-hours doctor service" },
    FR: { "15": "SAMU — medical emergency", "17": "Police / gendarmerie", "18": "Fire & rescue (pompiers)", "112": "Emergency (EU number)", "114": "Emergency by text for deaf & hard-of-hearing people", "115": "Emergency help for homeless people (SAMU social)", "119": "Child protection helpline (Allô Enfance en Danger)" },
    ES: { "112": "Emergency", "091": "National Police", "062": "Guardia Civil", "092": "Local police" },
    IT: { "112": "Emergency", "113": "Police (Polizia di Stato)", "115": "Fire brigade (Vigili del Fuoco)", "118": "Medical emergency", "117": "Guardia di Finanza", "1530": "Coast guard" },
    CH: { "112": "Emergency", "117": "Police", "118": "Fire", "144": "Ambulance", "1414": "Rega air rescue", "143": "Die Dargebotene Hand — emotional support", "147": "Pro Juventute — help for young people" },
    AT: { "112": "Emergency", "122": "Fire", "133": "Police", "144": "Ambulance", "140": "Mountain rescue", "141": "Doctor on call" },
    BE: { "112": "Emergency: fire & ambulance", "101": "Police" },
    PL: { "112": "Emergency", "997": "Police", "998": "Fire", "999": "Ambulance" },
    CZ: { "112": "Emergency", "150": "Fire", "155": "Ambulance", "158": "Police", "156": "Municipal police" },
    SE: { "112": "Emergency", "11414": "Police non-emergency", "1177": "Healthcare advice" },
    NO: { "110": "Fire", "112": "Police", "113": "Ambulance" },
    DK: { "112": "Emergency", "114": "Police non-emergency" },
    GR: { "112": "Emergency", "100": "Police", "166": "Ambulance", "199": "Fire" },
    RU: { "112": "Emergency", "101": "Fire", "102": "Police", "103": "Ambulance", "104": "Gas emergency" },
    UA: { "112": "Emergency", "101": "Fire", "102": "Police", "103": "Ambulance", "104": "Gas emergency" },
    BY: { "101": "Fire", "102": "Police", "103": "Ambulance", "104": "Gas emergency" },
    IL: { "100": "Police", "101": "Magen David Adom (ambulance)", "102": "Fire" },
    AE: { "999": "Police", "998": "Ambulance", "997": "Fire" },
    SA: { "911": "Unified emergency", "999": "Police", "997": "Ambulance", "998": "Civil defence" },
    EG: { "122": "Police", "123": "Ambulance", "180": "Fire" },
    ZA: { "10111": "Police", "10177": "Ambulance & fire", "112": "Emergency from mobiles" },
    IN: { "112": "National emergency number", "100": "Police", "101": "Fire", "102": "Ambulance", "108": "Emergency ambulance (most states)" },
    PK: { "15": "Police", "1122": "Rescue service" },
    CN: { "110": "Police", "119": "Fire", "120": "Ambulance", "122": "Traffic accidents" },
    JP: { "110": "Police", "119": "Fire & ambulance", "118": "Coast guard", "171": "Disaster message dial" },
    KR: { "112": "Police", "119": "Fire & ambulance" },
    HK: { "999": "Emergency" },
    SG: { "999": "Police", "995": "Fire & ambulance", "1777": "Non-emergency ambulance" },
    MY: { "999": "Emergency", "112": "Emergency from mobiles" },
    ID: { "112": "Emergency", "110": "Police", "113": "Fire", "118": "Ambulance", "119": "Ambulance" },
    PH: { "911": "Emergency" },
    TH: { "191": "Police", "199": "Fire", "1669": "Ambulance", "1155": "Tourist police" },
    VN: { "113": "Police", "114": "Fire", "115": "Ambulance" },
    MX: { "911": "Emergency", "089": "Anonymous crime reporting" },
    BR: { "190": "Police", "192": "SAMU ambulance", "193": "Fire brigade", "199": "Civil defence" },
    AR: { "911": "Emergency (many provinces)", "107": "Ambulance", "100": "Fire", "101": "Police" },
    CL: { "131": "Ambulance", "132": "Fire", "133": "Police" },
    CO: { "123": "Emergency" },
    KE: { "999": "Emergency", "112": "Emergency" },
    NG: { "112": "Emergency", "199": "Emergency" },
    TR: { "112": "Emergency" },
    PT: { "112": "Emergency" },
    NL: { "112": "Emergency" },
    FI: { "112": "Emergency", "116117": "Medical helpline" },
  };
  const EU_REGIONS = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO".split(" ");

  // ---------------------------------------------------------- priors
  // Rough population in millions; used only as a gentle tie-breaker when
  // the same digits fit several countries. Never displayed as fact.
  const POP_RAW = "AC .001 AD .08 AE 9.5 AF 41 AG .09 AI .016 AL 2.8 AM 2.8 AO 36 AR 46 AS .045 AT 9.1 AU 27 AW .11 AX .03 AZ 10.2 BA 3.2 BB .28 BD 172 BE 11.8 BF 23 BG 6.4 BH 1.5 BI 13 BJ 14 BL .01 BM .064 BN .45 BO 12.4 BQ .03 BR 216 BS .41 BT .78 BW 2.7 BY 9.2 BZ .41 CA 40 CC .0006 CD 102 CF 5.7 CG 6.1 CH 8.9 CI 29 CK .017 CL 19.6 CM 28.6 CN 1410 CO 52 CR 5.2 CU 11 CV .6 CW .19 CX .002 CY 1.3 CZ 10.9 DE 84 DJ 1.1 DK 5.9 DM .073 DO 11.3 DZ 46 EC 18 EE 1.37 EG 113 EH .6 ER 3.7 ES 48 ET 127 FI 5.6 FJ .94 FK .0037 FM .11 FO .054 FR 68 GA 2.4 GB 68 GD .13 GE 3.7 GF .3 GG .064 GH 34 GI .033 GL .057 GM 2.8 GN 14 GP .38 GQ 1.7 GR 10.4 GT 18 GU .17 GW 2.2 GY .81 HK 7.5 HN 10.6 HR 3.9 HT 11.7 HU 9.6 ID 278 IE 5.3 IL 9.8 IM .084 IN 1430 IO .003 IQ 45 IR 89 IS .39 IT 59 JE .103 JM 2.8 JO 11.3 JP 124 KE 55 KG 7 KH 17 KI .13 KM .85 KN .047 KP 26 KR 51.7 KW 4.3 KY .07 KZ 20 LA 7.6 LB 5.4 LC .18 LI .04 LK 22 LR 5.4 LS 2.3 LT 2.9 LU .67 LV 1.9 LY 6.9 MA 37.8 MC .039 MD 2.5 ME .62 MF .032 MG 30 MH .04 MK 1.8 ML 23 MM 54 MN 3.4 MO .7 MP .05 MQ .35 MR 4.9 MS .0045 MT .53 MU 1.26 MV .52 MW 21 MX 129 MY 34 MZ 34 NA 2.6 NC .29 NE 27 NF .002 NG 224 NI 7 NL 17.9 NO 5.5 NP 30.9 NR .013 NU .0016 NZ 5.2 OM 4.6 PA 4.5 PE 34 PF .31 PG 10.3 PH 117 PK 240 PL 37.6 PM .006 PR 3.2 PS 5.4 PT 10.5 PW .018 PY 6.9 QA 2.7 RE .87 RO 19 RS 6.6 RU 144 RW 14 SA 37 SB .74 SC .12 SD 48 SE 10.5 SG 5.9 SH .0055 SI 2.1 SJ .0026 SK 5.4 SL 8.8 SM .034 SN 18 SO 18 SR .62 SS 11 ST .23 SV 6.3 SX .044 SY 23 SZ 1.2 TA .00025 TC .046 TD 18 TG 9 TH 71.8 TJ 10 TK .0019 TL 1.36 TM 6.5 TN 12.4 TO .1 TR 85 TT 1.5 TV .011 TW 23.4 TZ 67 UA 37 UG 48.6 US 335 UY 3.4 UZ 36 VA .0008 VC .1 VE 28.8 VG .031 VI .1 VN 99 VU .33 WF .011 WS .22 XK 1.6 YE 34 YT .32 ZA 60 ZM 20.6 ZW 16";
  const POP = {};
  {
    const a = POP_RAW.split(" ");
    for (let i = 0; i + 1 < a.length; i += 2) POP[a[i]] = parseFloat(a[i + 1]);
  }

  // Time-zone corrections where Google's map uses a same-clock neighbour's
  // zone name (Ireland is listed under the London zones).
  const TZ_FIX = { "353": ["Europe/Dublin"] };

  // Region names the browser's Intl.DisplayNames might not know
  const NAME_FALLBACK = { AC: "Ascension Island", TA: "Tristan da Cunha", XK: "Kosovo", "001": "International (non-geographic)" };

  g.DCMETA = { SRC, FICTIONAL, RANGES, ZONES, CC_NOTES, SAT_881, EU116, SHORT, EU_REGIONS, POP, NAME_FALLBACK, TZ_FIX };
})(typeof globalThis !== "undefined" ? globalThis : this);

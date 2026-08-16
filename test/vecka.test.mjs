// Tester för skördediagrammets tidsindelning.
//
// ISO-veckor är lätta att få fel vid årsskiften: veckan tillhör det år där
// dess TORSDAG ligger, så 1 januari kan höra till vecka 52 eller 53 året
// innan. Felet syns bara några dagar om året, vilket är precis den sortens
// bugg som annars lever länge.
//
// Funktionerna läses direkt ur app.js mellan markörerna. Döps de om måste
// MARKOR_START/SLUT följa med.
//
// Kör med:  node test/vecka.test.mjs

import { readFileSync } from "node:fs";

const MARKOR_START = "// ---- Tidsindelning för skördediagrammet";
const MARKOR_SLUT = "// ---- slut tidsindelning";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf(MARKOR_START);
const slut = app.indexOf(MARKOR_SLUT);
if (start === -1 || slut === -1) {
  console.log(`Hittade inte blocket mellan "${MARKOR_START}" och "${MARKOR_SLUT}" i app.js.`);
  process.exit(1);
}
// Blocket använder MONTHS_SV, som ligger utanför.
const kalla = `const MONTHS_SV = ${JSON.stringify(
  ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"])};\n`
  + app.slice(start, slut)
  + "\nexport { isoVecka, veckansMandag, manadsHinkar, veckoHinkar, harvestHinkar, etikettSteg };";
const M = await import("data:text/javascript," + encodeURIComponent(kalla));

let fails = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${g}\n     ville: ${w}`);
}

const vecka = (iso) => M.isoVecka(new Date(iso + "T00:00:00Z"));

console.log("--- ISO-veckonummer ---");
check("2026-08-11 (Laras skörd)", vecka("2026-08-11"), { ar: 2026, vecka: 33 });
check("2026-07-12 (första skörden)", vecka("2026-07-12"), { ar: 2026, vecka: 28 });
check("4 januari ligger alltid i vecka 1", vecka("2026-01-04"), { ar: 2026, vecka: 1 });
// 2026-01-01 är en torsdag, alltså vecka 1 samma år.
check("2026-01-01 (torsdag) → vecka 1", vecka("2026-01-01"), { ar: 2026, vecka: 1 });
// 2027-01-01 är en fredag → hör till vecka 53 år 2026.
check("2027-01-01 (fredag) → vecka 53 år 2026", vecka("2027-01-01"), { ar: 2026, vecka: 53 });
// 2022-01-01 var en lördag → vecka 52 år 2021.
check("2022-01-01 (lördag) → vecka 52 år 2021", vecka("2022-01-01"), { ar: 2021, vecka: 52 });
// 2024-12-30 är en måndag i vecka 1 år 2025.
check("2024-12-30 (måndag) → vecka 1 år 2025", vecka("2024-12-30"), { ar: 2025, vecka: 1 });

console.log("\n--- Måndagen i veckan ---");
check("tisdag → måndagen före", M.veckansMandag("2026-08-11"), "2026-08-10");
check("måndag → sig själv", M.veckansMandag("2026-08-10"), "2026-08-10");
check("söndag → måndagen samma vecka", M.veckansMandag("2026-08-16"), "2026-08-10");
check("över månadsskifte", M.veckansMandag("2026-08-01"), "2026-07-27");

console.log("\n--- Veckohinkar ---");
const rader = [
  { harvested_at: "2026-07-12", weight_g: 100 },  // v28 (söndag)
  { harvested_at: "2026-07-13", weight_g: 200 },  // v29 (måndag)
  { harvested_at: "2026-07-19", weight_g: 300 },  // v29 (söndag)
  { harvested_at: "2026-08-03", weight_g: 400 },  // v32 – v30 och v31 tomma
];
const h = M.veckoHinkar(rader);
check("antal veckor inkl. tomma", h.length, 5);
check("etiketter", h.map((x) => x.label), ["v28", "v29", "v30", "v31", "v32"]);
check("vikter", h.map((x) => x.grams), [100, 500, 0, 0, 400]);
check("antal skördar", h.map((x) => x.count), [1, 2, 0, 0, 1]);
check("v29 slås ihop över månadsgräns", h[1].grams, 500);
check("beskrivning med datumspann", h[1].full, "v. 29 2026 (13 jul–19 jul)");

console.log("\n--- Månadshinkar (oförändrat beteende) ---");
const m = M.manadsHinkar(rader);
check("två månader", m.map((x) => x.label), ["jul", "aug"]);
check("vikter", m.map((x) => x.grams), [600, 400]);
check("tom lista ger tom lista", M.manadsHinkar([]), []);
check("veckor: tom lista ger tom lista", M.veckoHinkar([]), []);
check("rader utan datum hoppas över", M.veckoHinkar([{ weight_g: 5 }]), []);

console.log("\n--- Val av skala ---");
check("vecka väljer veckohinkar", M.harvestHinkar(rader, "vecka").length, 5);
check("annat väljer månadshinkar", M.harvestHinkar(rader, "manad").length, 2);

console.log("\n--- Etikettgles x-axel ---");
check("få staplar: varje etikett", M.etikettSteg(5), 1);
check("8 staplar: varje etikett", M.etikettSteg(8), 1);
check("16 staplar: varannan", M.etikettSteg(16), 2);
check("53 veckor: var sjunde", M.etikettSteg(53), 7);
check("noll ger aldrig 0 (skulle ge division/modulo-fel)", M.etikettSteg(0), 1);

console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} TESTER MISSLYCKADES`);
process.exit(fails === 0 ? 0 : 1);

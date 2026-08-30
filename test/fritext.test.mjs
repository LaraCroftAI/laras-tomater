// Tester för trimningen av fritextfält.
//
// Bakgrund: näringsloggen innehöll både "Rhizoferm" och "Rhizoferm " som
// skilda poster, eftersom formulärvärdet sparades rått. Samma preparat såg ut
// som två i historiken. Blanksteg syns inte i gränssnittet, så felet upptäcks
// först när man grupperar datan.
//
// Funktionen läses direkt ur app.js mellan markörerna. Döps de om måste
// MARKOR_START/SLUT följa med.
//
// Kör med:  node test/fritext.test.mjs

import { readFileSync } from "node:fs";

const MARKOR_START = "// ---- Fritext från formulär";
const MARKOR_SLUT = "// ---- slut fritext";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf(MARKOR_START);
const slut = app.indexOf(MARKOR_SLUT);
if (start === -1 || slut === -1) {
  console.log(`Hittade inte blocket mellan "${MARKOR_START}" och "${MARKOR_SLUT}" i app.js.`);
  process.exit(1);
}
const kalla = app.slice(start, slut) + "\nexport { trimmad };";
const M = await import("data:text/javascript," + encodeURIComponent(kalla));

let fails = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${g}\n     ville: ${w}`);
}

// FormData duger som den är – trimmad() rör bara .get().
const fd = (varden) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(varden)) f.append(k, v);
  return f;
};
const t = (varde) => M.trimmad(fd({ notes: varde }), "notes");

console.log("--- Blanksteg i kanterna ---");
check("efterhängande mellanslag", t("Rhizoferm "), "Rhizoferm");
check("inledande mellanslag", t(" Rhizoferm"), "Rhizoferm");
check("båda hållen", t("  Rhizoferm  "), "Rhizoferm");
check("redan ren sträng lämnas orörd", t("Rhizoferm"), "Rhizoferm");
check("de två varianterna blir samma post", t("Rhizoferm "), t("Rhizoferm"));

console.log("\n--- Tomt blir null, inte tom sträng ---");
check("tom sträng", t(""), null);
check("bara mellanslag", t("   "), null);
check("bara radbrytning", t("\n\n"), null);
check("fältet saknas helt", M.trimmad(fd({}), "notes"), null);

console.log("\n--- Innehållet i mitten rörs inte ---");
check("dubbla mellanslag inuti bevaras", t("Rhizoferm  10 ml"), "Rhizoferm  10 ml");
check("radbrytningar inuti bevaras", t("\nIngredienser\n\n1 kg tomat\n"), "Ingredienser\n\n1 kg tomat");
check("å ä ö överlever", t(" Växthuset "), "Växthuset");

console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} FEL`);
process.exit(fails === 0 ? 0 : 1);

// Tester för näringspåminnelsen.
//
// Påminnelsen är hela poängen med funktionen, så den får inte tiga när den
// borde säga till – och inte heller tjata dagen efter att man gödslat. Båda
// felen är tysta i gränssnittet: man ser bara en ruta som inte finns.
//
// Dygnsräkningen är den känsliga biten. Datumen i databasen är rena datum
// (YYYY-MM-DD) medan jämförelsen sker mot ett klockslag, så räknas det fel
// hamnar allt en dag bort – vilket inte märks förrän man står precis på
// tröskeln.
//
// Funktionerna läses direkt ur app.js mellan markörerna. Döps de om måste
// MARKOR_START/SLUT följa med.
//
// Kör med:  node test/naring.test.mjs

import { readFileSync } from "node:fs";

const MARKOR_START = "// ---- Näringspåminnelse";
const MARKOR_SLUT = "// ---- slut näringspåminnelse";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf(MARKOR_START);
const slut = app.indexOf(MARKOR_SLUT);
if (start === -1 || slut === -1) {
  console.log(`Hittade inte blocket mellan "${MARKOR_START}" och "${MARKOR_SLUT}" i app.js.`);
  process.exit(1);
}
const kalla = app.slice(start, slut)
  + "\nexport { dagarSedan, naringsLage, NARING_PAMINN_DAGAR, NARING_SENT_DAGAR };";
const M = await import("data:text/javascript," + encodeURIComponent(kalla));

let fails = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${g}\n     ville: ${w}`);
}

// Fast "idag" så testet inte ändrar svar med kalendern. Sent på dygnet med
// flit: räknas dygnen på klockslag i stället för på midnatt slår det fel här.
const IDAG = new Date(2026, 7, 30, 23, 15);
const rad = (plats, datum) => ({ location: plats, fed_on: datum });

console.log("--- Dygnsräkning ---");
check("samma dag", M.dagarSedan("2026-08-30", IDAG), 0);
check("i går", M.dagarSedan("2026-08-29", IDAG), 1);
check("Laras Rhizoferm 29 aug", M.dagarSedan("2026-08-29", IDAG), 1);
check("förra omgången 19 aug", M.dagarSedan("2026-08-19", IDAG), 11);
check("över månadsskifte", M.dagarSedan("2026-07-31", IDAG), 30);
check("sent på dygnet ger inte extra dag", M.dagarSedan("2026-08-23", new Date(2026, 7, 30, 23, 59)), 7);
check("tidigt på dygnet ger samma svar", M.dagarSedan("2026-08-23", new Date(2026, 7, 30, 0, 1)), 7);

console.log("\n--- Vem som hamnar i påminnelsen ---");
const platser = ["Friland", "Kruka", "Planteringslåda", "Växthus"];

const nyssGodslat = platser.map((p) => rad(p, "2026-08-29"));
check("allt gödslat i går → ingen påminnelse", M.naringsLage(platser, nyssGodslat, IDAG), []);

check("exakt 6 dagar → tyst",
  M.naringsLage(["Växthus"], [rad("Växthus", "2026-08-24")], IDAG), []);
check("exakt 7 dagar → påminner, men inte försenat",
  M.naringsLage(["Växthus"], [rad("Växthus", "2026-08-23")], IDAG),
  [{ plats: "Växthus", dagar: 7, sent: false }]);
check("exakt 13 dagar → fortfarande bara påminnelse",
  M.naringsLage(["Växthus"], [rad("Växthus", "2026-08-17")], IDAG),
  [{ plats: "Växthus", dagar: 13, sent: false }]);
check("exakt 14 dagar → försenat",
  M.naringsLage(["Växthus"], [rad("Växthus", "2026-08-16")], IDAG),
  [{ plats: "Växthus", dagar: 14, sent: true }]);

console.log("\n--- Platser utan historik ---");
check("plats som aldrig gödslats i år räknas som försenad",
  M.naringsLage(["Kruka"], [], IDAG),
  [{ plats: "Kruka", dagar: null, sent: true }]);
check("plats utan plantor kommer aldrig med",
  M.naringsLage([], [rad("Vinden", "2026-01-01")], IDAG), []);

console.log("\n--- Ordning: mest försenad först ---");
check("aldrig gödslat läggs överst",
  M.naringsLage(["Friland", "Kruka", "Växthus"],
    [rad("Friland", "2026-08-20"), rad("Växthus", "2026-08-10")], IDAG),
  [
    { plats: "Kruka", dagar: null, sent: true },
    { plats: "Växthus", dagar: 20, sent: true },
    { plats: "Friland", dagar: 10, sent: false },
  ]);

console.log("\n--- Bara senaste raden per plats styr ---");
check("gammal rad drar inte upp en nyss gödslad plats",
  M.naringsLage(["Växthus"],
    [rad("Växthus", "2026-08-29"), rad("Växthus", "2026-06-01")], IDAG), []);

console.log("\n--- Trösklarna är de dokumenterade ---");
check("påminnelsetröskel", M.NARING_PAMINN_DAGAR, 7);
check("förseningströskel", M.NARING_SENT_DAGAR, 14);

console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} FEL`);
process.exit(fails === 0 ? 0 : 1);

// Tester för vilken säsong appen väljer att visa.
//
// Regeln är lätt att få om bakfram, och felet märks bara en gång om året: öppnar
// man appen i januari ska årets odling INTE se ut att ha försvunnit bara för att
// kalendern bytt år.
//
// Funktionen läses direkt ur app.js, mellan markörerna nedan, så testet följer
// den kod som faktiskt levereras. Döps de om måste MARKOR_START/SLUT följa med.
//
// Kör med:  node test/season.test.mjs

import { readFileSync } from "node:fs";

const MARKOR_START = "// ---- Val av säsong";
const MARKOR_SLUT = "// ---- slut val av säsong";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf(MARKOR_START);
const slut = app.indexOf(MARKOR_SLUT);
if (start === -1 || slut === -1) {
  console.log(`Hittade inte blocket mellan "${MARKOR_START}" och "${MARKOR_SLUT}" i app.js.`);
  process.exit(1);
}
const kalla = app.slice(start, slut) + "\nexport { valjSasong };";
const { valjSasong } = await import("data:text/javascript," + encodeURIComponent(kalla));

let fails = 0;
function check(label, got, want) {
  if (got === want) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${got}\n     ville: ${want}`);
}

// Inget sparat val
check("inget sparat, data finns → senaste året med data",
  valjSasong(["2026", "2025"], null, "2026"), "2026");
check("inget sparat, bara gammal data → det gamla året, inte i år",
  valjSasong(["2026"], null, "2027"), "2026");
check("inget sparat, ingen data alls → i år",
  valjSasong([], null, "2027"), "2027");

// Sparat val
check("sparat år som finns → behålls",
  valjSasong(["2027", "2026"], "2026", "2027"), "2026");
check("sparat år = i år utan data → tillåts ändå (man ska kunna börja)",
  valjSasong(["2026"], "2027", "2027"), "2027");
check("sparat år som varken finns eller är i år → faller tillbaka",
  valjSasong(["2026"], "1999", "2027"), "2026");
check("sparat tomt värde → ignoreras",
  valjSasong(["2026"], "", "2027"), "2026");

// Det egentliga skälet till funktionen: januariöppningen.
// Kalendern har slagit om till 2027, ingen data finns för det året, och inget
// är sparat. Då ska 2026 års odling fortfarande visas.
check("januari: nytt kalenderår, ingen ny data → förra årets odling syns",
  valjSasong(["2026"], null, "2027"), "2026");

console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} TESTER MISSLYCKADES`);
process.exit(fails === 0 ? 0 : 1);

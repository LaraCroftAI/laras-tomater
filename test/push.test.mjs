// Tester för push-notisernas tillståndsrad och nyckelavkodning.
//
// Raden under växtnäringen ska alltid säga något begripligt. Flera av
// tillstånden går inte att framkalla på en dator – en iPhone som inte har
// appen på hemskärmen, eller en webbläsare där notiser är blockerade – och
// utan test skulle de aldrig bli provade förrän någon står i växthuset och
// undrar varför knappen saknas.
//
// Funktionerna läses direkt ur app.js mellan markörerna. Döps de om måste
// MARKOR_START/SLUT följa med.
//
// Kör med:  node test/push.test.mjs

import { readFileSync } from "node:fs";

const MARKOR_START = "// ---- Push-notiser";
const MARKOR_SLUT = "// ---- slut push-notiser";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf(MARKOR_START);
const slut = app.indexOf(MARKOR_SLUT);
if (start === -1 || slut === -1) {
  console.log(`Hittade inte blocket mellan "${MARKOR_START}" och "${MARKOR_SLUT}" i app.js.`);
  process.exit(1);
}
const kalla = app.slice(start, slut) + "\nexport { pushLaget, nyckelTillBytes };";
const M = await import("data:text/javascript," + encodeURIComponent(kalla));

let fails = 0;
function check(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${g}\n     ville: ${w}`);
}

const lage = (over) => M.pushLaget({
  stods: true, arIos: false, installerad: false,
  tillstand: "default", prenumererad: false, ...over,
});

console.log("--- Knappen syns bara när den kan göra något ---");
check("normalt läge erbjuder att slå på", lage().knapp, "Slå på");
check("påslaget erbjuder att stänga av",
  lage({ prenumererad: true }).knapp, "Stäng av");
check("blockerat ger ingen knapp",
  lage({ tillstand: "denied" }).knapp, null);
check("webbläsare utan stöd ger ingen knapp",
  lage({ stods: false }).knapp, null);

console.log("\n--- iPhone utan appen på hemskärmen ---");
// Safari på iOS tillåter push bara för en installerad webbapp. Utan det här
// särfallet får hon bara "din webbläsare kan inte visa notiser", vilket är
// sant men obrukbart – det går ju att åtgärda.
const ios = lage({ stods: false, arIos: true, installerad: false });
check("får ett besked som går att göra något åt",
  ios.text.includes("hemskärmen"), true);
check("och ingen knapp", ios.knapp, null);
check("installerad iPhone får vanliga texten",
  lage({ stods: true, arIos: true, installerad: true }).knapp, "Slå på");

console.log("\n--- Testknappen finns bara när det går att testa ---");
check("påslaget erbjuder testnotis", lage({ prenumererad: true }).test, true);
check("avslaget gör det inte", lage().test, false);
check("blockerat gör det inte", lage({ tillstand: "denied" }).test, false);
check("utan stöd gör det inte", lage({ stods: false }).test, false);

console.log("\n--- Blockerat väger tyngre än allt utom saknat stöd ---");
check("blockerat vinner över prenumererad",
  lage({ tillstand: "denied", prenumererad: true }).knapp, null);
check("saknat stöd vinner över blockerat",
  lage({ stods: false, tillstand: "denied" }).text,
  "Den här webbläsaren kan inte visa notiser.");

console.log("\n--- Alla lägen säger något ---");
for (const stods of [true, false]) {
  for (const arIos of [true, false]) {
    for (const installerad of [true, false]) {
      for (const tillstand of ["default", "granted", "denied"]) {
        for (const prenumererad of [true, false]) {
          const l = M.pushLaget({ stods, arIos, installerad, tillstand, prenumererad });
          if (typeof l.text !== "string" || l.text.length < 10) {
            fails++;
            console.log(`FEL  tom text för ${JSON.stringify({ stods, arIos, installerad, tillstand, prenumererad })}`);
          }
        }
      }
    }
  }
}
console.log("OK   48 kombinationer ger alla en läsbar text");

console.log("\n--- Nyckeln avkodas till 65 bytes ---");
// Den riktiga publika nyckeln ur push_config. En VAPID-nyckel är alltid en
// okomprimerad P-256-punkt: 0x04 följt av X och Y, 32 bytes vardera.
const NYCKEL = "BNkMTg_d4c9-2HP02VeKqrDBXzEZAxPeXGs42j0R8WKBYEhF-CmyyhcYy4pvGkyKvkLq2IoxCIOx816jiLcNRKk";

// atob() kastar på ogiltiga tecken. Utan try/catch kraschar hela testet med en
// stackdump i stället för att peka ut vilken regel som brustit – och en krasch
// är svårare att läsa i en CI-logg än ett FEL på rätt rad.
let bytes = null;
try {
  bytes = M.nyckelTillBytes(NYCKEL);
} catch (e) {
  fails++;
  console.log(`FEL  längd: avkodningen kastade i stället för att ge bytes\n     ${e}`);
}
if (bytes) {
  check("längd", bytes.length, 65);
  check("inleds med 0x04 (okomprimerad punkt)", bytes[0], 4);
  check("är verkligen bytes", bytes instanceof Uint8Array, true);
}

// base64url använder - och _ där base64 har + och /. Missar man översättningen
// kastar atob() bara ibland, beroende på vilka tecken nyckeln råkar innehålla.
check("nyckeln innehåller både - och _ (så översättningen provas)",
  NYCKEL.includes("-") && NYCKEL.includes("_"), true);

console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} FEL`);
process.exit(fails === 0 ? 0 : 1);

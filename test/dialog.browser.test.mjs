// Test i riktig webbläsare: Avbryt måste stänga dialogen.
//
// Kör med:  node test/dialog.browser.test.mjs
//
// Bakgrund: Avbryt är en submit-knapp. Utan formnovalidate kör webbläsaren sin
// validering av obligatoriska fält först, blockerar klicket, och submit-händelsen
// som stänger dialogen skickas aldrig. På desktop går man ur med Esc – på mobilen
// finns ingen Esc, så appen måste laddas om. Det gick inte att fånga utan en
// riktig webbläsarmotor, därav det här testet.
//
// Testet läser dialogerna direkt ur index.html och kör dem i Edge eller Chrome via
// felsökningsprotokollet (CDP). Det innehåller också en negativ kontroll: en kopia
// av sortdialogen utan formnovalidate MÅSTE fastna – annars bevisar testet inget,
// och då larmar det.
//
// Hittas ingen webbläsare hoppas testet över med exitkod 0. I CI sätts
// REQUIRE_BROWSER=1, och då blir en saknad webbläsare i stället ett fel – annars
// hade jobbet kunnat lysa grönt utan att ha testat någonting.

import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INDEX = new URL("../index.html", import.meta.url);
const DIALOGS = ["variety-dialog", "planting-dialog", "feeding-dialog", "harvest-dialog", "gallery-dialog"];

// ---------------------------------------------------------------- webbläsare
function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/microsoft-edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

// Nodes inbyggda WebSocket-klient finns från Node 22. Utan den kraschar testet
// långt senare med ett kryptiskt "WebSocket is not defined".
if (typeof WebSocket === "undefined") {
  console.log(`Node 22 eller senare krävs för det här testet (kör ${process.version}).`);
  process.exit(1);
}

const browser = findBrowser();
if (!browser) {
  console.log("Ingen Edge/Chrome hittades.");
  console.log("Peka ut en webbläsare med miljövariabeln BROWSER för att köra testet.");
  // I CI sätts REQUIRE_BROWSER=1 så att en saknad webbläsare blir ett fel i
  // stället för ett tyst godkänt test – annars vore CI grön utan att ha testat något.
  if (process.env.REQUIRE_BROWSER) {
    console.log("REQUIRE_BROWSER är satt: det här räknas som ett fel.");
    process.exit(1);
  }
  console.log("Hoppar över webbläsartestet.");
  process.exit(0);
}

// ------------------------------------------------------------- bygg testsida
const html = readFileSync(INDEX, "utf8");
function extractDialog(id) {
  const start = html.indexOf(`<dialog id="${id}">`);
  if (start === -1) throw new Error(`Hittade inte <dialog id="${id}"> i index.html`);
  const end = html.indexOf("</dialog>", start) + "</dialog>".length;
  return html.slice(start, end);
}

const real = DIALOGS.map(extractDialog).join("\n");
// Negativ kontroll: samma dialog utan skyddet ska fastna.
const control = extractDialog("variety-dialog")
  .replace(/ formnovalidate/g, "")
  .replace(/id="([^"]+)"/g, 'id="$1-utan-skydd"');

const page = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>dialogtest</title></head><body>
${real}
${control}
<script>
window.avbrytStanger = function (id) {
  const dlg = document.getElementById(id);
  const form = dlg.querySelector("form");
  form.reset();
  dlg.showModal();
  const oppnades = dlg.open;
  form.querySelector('button[value="cancel"]').click();
  const stangd = !dlg.open;
  if (dlg.open) dlg.close();
  return { oppnades, stangd };
};
<\/script></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "evas-dialogtest-"));
const pagePath = join(dir, "page.html");
const profile = join(dir, "profile");
writeFileSync(pagePath, page, "utf8");

// ------------------------------------------------------------------ kör CDP
const proc = spawn(browser, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--no-sandbox", // krävs ofta på byggservrar; ofarligt här (headless, lokal fil)
  "--disable-dev-shm-usage",
  "--remote-debugging-port=0", // 0 = låt webbläsaren välja ledig port
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtoolsPort() {
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 80; i++) {
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (port) return port;
    }
    await sleep(250);
  }
  throw new Error("Webbläsaren startade aldrig felsökningsporten");
}

let nextId = 1;
const pending = new Map();
function send(ws, method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

let fails = 0;
function check(label, got, want) {
  if (got === want) { console.log(`OK   ${label}`); return; }
  fails++;
  console.log(`FEL  ${label}\n     fick:  ${got}\n     ville: ${want}`);
}

try {
  const port = await devtoolsPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.type === "page");
  if (!target) throw new Error("Hittade ingen sidflik i webbläsaren");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const loaded = new Promise((resolve) => {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
      if (msg.method === "Page.loadEventFired") resolve();
    });
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("Kunde inte ansluta till webbläsaren")), { once: true });
  });

  await send(ws, "Page.enable");
  await send(ws, "Page.navigate", { url: "file:///" + pagePath.replace(/\\/g, "/") });
  await loaded;

  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  console.log(`Webbläsare: ${version.Browser}\n`);

  const run = async (id) => {
    const r = await send(ws, "Runtime.evaluate", {
      expression: `JSON.stringify(window.avbrytStanger(${JSON.stringify(id)}))`,
      returnByValue: true,
    });
    return JSON.parse(r.result.value);
  };

  for (const id of DIALOGS) {
    const r = await run(id);
    check(`${id}: dialogen öppnas`, r.oppnades, true);
    check(`${id}: Avbryt stänger den`, r.stangd, true);
  }

  console.log("\n--- Negativ kontroll (utan formnovalidate ska den fastna) ---");
  const control = await run("variety-dialog-utan-skydd");
  check("kontrollen fastnar som förväntat", control.stangd, false);

  console.log(fails === 0 ? "\nALLA TESTER OK" : `\n${fails} TESTER MISSLYCKADES`);
  ws.close();
  process.exitCode = fails === 0 ? 0 : 1;
} finally {
  proc.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}

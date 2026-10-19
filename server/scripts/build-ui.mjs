// Składa kartę MCP Apps w jeden samodzielny plik HTML (CSS, czcionki Lato i logo jako data URI, JS w środku),
// bo sandbox hosta domyślnie blokuje zewnętrzne zasoby. Wynik: src/ui/karta.generated.ts (importowany przez serwer)
// oraz ui/dist/karta.html (do oglądania w harnessie). Uruchamiane automatycznie przez wrangler (build.command) i npm test.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const rel = (p) => new URL(p, import.meta.url);

const js = (await build({
  entryPoints: [rel("../ui/src/main.ts").pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  bundle: true, minify: true, format: "iife", platform: "browser", target: "es2022", write: false, legalComments: "none", logLevel: "error",
})).outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const fontsMeta = JSON.parse(readFileSync(rel("../ui/fonts/fonts.json"), "utf-8"));
const fontFace = fontsMeta.map((f) => {
  const b64 = readFileSync(rel(`../ui/fonts/${f.plik}`)).toString("base64");
  return `@font-face{font-family:"Lato";font-style:normal;font-weight:${f.waga};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${f.range}}`;
}).join("\n");

const logo = readFileSync(rel("../../brand/znak-128.png")).toString("base64");
const css = readFileSync(rel("../ui/src/styles.css"), "utf-8");
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Lajkonektor</title><style>:root{--lk-logo:url(data:image/png;base64,${logo})}\n${fontFace}\n${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`;

mkdirSync(rel("../src/ui/"), { recursive: true });
mkdirSync(rel("../ui/dist/"), { recursive: true });
// Zapisujemy tylko przy zmianie treści: wrangler obserwuje ten plik i w przeciwnym razie budowałby się w pętli.
const zapisz = (sciezka, tresc) => { if (!existsSync(sciezka) || readFileSync(sciezka, "utf-8") !== tresc) writeFileSync(sciezka, tresc); };
zapisz(rel("../src/ui/karta.generated.ts"), `// Plik generowany przez scripts/build-ui.mjs. Nie edytować ręcznie.\nexport const KARTA_HTML = ${JSON.stringify(html)};\n`);
zapisz(rel("../ui/dist/karta.html"), html);
console.log(`karta.html: ${(html.length / 1024).toFixed(0)} KB (js ${(js.length / 1024).toFixed(0)} KB, czcionki ${(fontFace.length / 1024).toFixed(0)} KB)`);

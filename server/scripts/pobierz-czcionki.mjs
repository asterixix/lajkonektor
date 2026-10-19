// Pobiera czcionkę Lato (licencja OFL) w podzbiorach latin i latin-ext do ui/fonts, żeby karty MCP Apps nie zależały
// od Google Fonts w sandboxie hosta (domyślny CSP blokuje zewnętrzne zasoby). Uruchamiane jednorazowo; pliki są w repo.
import { writeFileSync, mkdirSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const css = await (await fetch("https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap", { headers: { "user-agent": UA } })).text();
mkdirSync(new URL("../ui/fonts/", import.meta.url), { recursive: true });
const bloki = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
const wynik = [];
for (const [, podzbior, ciało] of bloki) {
  if (!["latin", "latin-ext"].includes(podzbior)) continue;
  const waga = /font-weight:\s*(\d+)/.exec(ciało)[1];
  const url = /url\((https:[^)]+\.woff2)\)/.exec(ciało)[1];
  const range = /unicode-range:\s*([^;]+);/.exec(ciało)?.[1] ?? "";
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const plik = `lato-${podzbior}-${waga}.woff2`;
  writeFileSync(new URL(`../ui/fonts/${plik}`, import.meta.url), bytes);
  wynik.push({ plik, waga, podzbior, range, bajty: bytes.length });
}
writeFileSync(new URL("../ui/fonts/fonts.json", import.meta.url), JSON.stringify(wynik, null, 1));
console.log(wynik.map((w) => `${w.plik} ${w.bajty} B`).join("\n"));

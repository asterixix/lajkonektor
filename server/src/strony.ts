// Strony dla ludzi pod adresami usług: /mcp (jak podłączyć) i /health (stan usług i dostępność).
// Programy i agenci dostają to co wcześniej: protokół MCP oraz JSON; HTML tylko dla przeglądarki (Accept: text/html).
import { TRESC } from "../site/src/tresc.ts";
import { testyZrodel } from "./status.ts";
import { WERSJA } from "./wersja.ts";
import type { MagazynMigawek } from "./migawki.ts";

/** Przeglądarka przy wejściu z paska adresu; klient MCP prosi o JSON lub text/event-stream. */
export function chcePrzegladarka(r: Request): boolean {
  const a = r.headers.get("accept") ?? "";
  return r.method === "GET" && a.includes("text/html") && !a.includes("text/event-stream") && !r.headers.has("mcp-session-id");
}

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ok = (t: { status?: number; ms: number }) => t.status !== undefined && t.status >= 200 && t.status < 400;

// Historia pomiarów crona: jeden obiekt w R2 (UE), nadpisywany co 30 min. Bez danych użytkowników.
const KLUCZ = "status/historia-v1.json";
const OKNO_MS = 30 * 86_400_000;
type Pomiar = { t: number; w: Record<string, 0 | 1> };

export async function zapiszPomiar(m: MagazynMigawek | undefined, teraz = Date.now()) {
  if (!m) return;
  const { testy } = await testyZrodel();
  const historia: Pomiar[] = (await m.get(KLUCZ).then((x) => x?.json()).catch(() => null)) ?? [];
  historia.push({ t: teraz, w: Object.fromEntries(testy.map((x) => [x.nazwa, ok(x) ? 1 : 0])) });
  await m.put(KLUCZ, JSON.stringify(historia.filter((p) => teraz - p.t <= OKNO_MS)));
}

/** Odsetek udanych pomiarów usługi w oknie; null, gdy brak pomiarów. */
export function dostepnosc(historia: Pomiar[], nazwa: string, okno: number, teraz = Date.now()): number | null {
  const w = historia.filter((p) => teraz - p.t <= okno && nazwa in p.w);
  return w.length ? w.reduce((n, p) => n + p.w[nazwa], 0) / w.length : null;
}

const STYL = `
@font-face{font-family:Lato;src:url(/fonts/lato-latin-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:Lato;src:url(/fonts/lato-latin-900.woff2) format("woff2");font-weight:900;font-display:swap}
@font-face{font-family:Lato;src:url(/fonts/lato-latin-ext-400.woff2) format("woff2");font-weight:400;font-display:swap;unicode-range:U+0100-02BA}
@font-face{font-family:Lato;src:url(/fonts/lato-latin-ext-900.woff2) format("woff2");font-weight:900;font-display:swap;unicode-range:U+0100-02BA}
:root{--akcent:#0063AF;--tekst:#071F32;--tekst-2:#505050;--linia:#BFBFBF;--tlo:#fff;--pasmo:#F5F5F5;--ok:#2E7D32;--zle:#AF1828;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--akcent:#7FB8FF;--tekst:#F2F5F8;--tekst-2:#C2CAD2;--linia:#4A5560;--tlo:#0E1720;--pasmo:#16222D;--ok:#7BD389;--zle:#FF8A8A}}
*{box-sizing:border-box}body{margin:0;font:1rem/1.55 Lato,system-ui,sans-serif;color:var(--tekst);background:var(--tlo)}
header{border-bottom:4px solid var(--akcent)}header div,main{max-width:860px;margin:0 auto;padding:16px}
header a{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none;font-weight:900;font-size:1.25rem}header img{width:44px;height:44px;background:#fff}
h1{font-size:2rem;line-height:1.2;margin:24px 0 8px}h2{font-size:1.25rem;margin:32px 0 8px}a{color:var(--akcent)}
.lead{font-size:1.125rem;color:var(--tekst-2);max-width:65ch}
.adres{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px;background:var(--pasmo);border-left:6px solid var(--akcent)}
.adres code{font-size:1.0625rem;word-break:break-all;flex:1 1 240px}
button{font:inherit;font-weight:900;min-height:44px;padding:8px 16px;border:2px solid var(--akcent);background:var(--akcent);color:var(--tlo);cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid var(--akcent);outline-offset:2px}
.klienci{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;padding:0;list-style:none}
.klienci>li{border:1px solid var(--linia);border-top:4px solid var(--akcent);padding:16px}.klienci ol li{margin-bottom:4px}.klienci h3{margin:0 0 8px}.klienci ol{margin:0;padding-left:20px}
pre{overflow:auto;padding:12px;background:var(--pasmo);border:1px solid var(--linia)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--linia);vertical-align:top}th{font-size:.875rem;color:var(--tekst-2)}
td.l{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.stan{font-weight:900;white-space:nowrap}.stan.ok{color:var(--ok)}.stan.zle{color:var(--zle)}
.podsumowanie{padding:16px;border:2px solid var(--ok);font-weight:900}.podsumowanie.zle{border-color:var(--zle)}
.uwaga{font-size:.875rem;color:var(--tekst-2)}
@media (max-width:600px){.ukryj-waskie{display:none}}`;

const strona = (tytul: string, tresc: string, skrypt = "") => new Response(`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tytul)}</title><link rel="icon" href="/logo.png"><style>${STYL}</style></head><body>
<header><div><a href="/"><img src="/logo.png" alt="">Lajkonektor</a></div></header><main>${tresc}</main>${skrypt ? `<script>${skrypt}</script>` : ""}</body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export function stronaMcp(origin: string): Response {
  const adres = `${origin}/mcp`;
  const p = TRESC.podlaczenie;
  const klienci = p.klienci.map((k) => `<li><h3>${esc(k.nazwa)}</h3><ol>${k.kroki.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></li>`).join("");
  const json = JSON.stringify({ mcpServers: { lajkonektor: { type: "http", url: adres } } }, null, 2);
  return strona("Podłącz Lajkonektor do AI", `
<h1>To adres serwera MCP, nie strona do czytania</h1>
<p class="lead">Wklej go w ustawieniach swojego asystenta AI. Asystent będzie wtedy pobierał otwarte dane Krakowa: rejestry miasta, GUS, komunikację ZTP i OpenStreetMap. Serwer jest publiczny, tylko czyta dane i nie wymaga logowania.</p>
<div class="adres"><code id="adres">${esc(adres)}</code><button type="button" id="kopiuj">${esc(p.kopiuj)}</button><span id="komunikat" role="status" aria-live="polite"></span></div>
<h2>Jak podłączyć</h2>
<ol>${p.kroki.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
<ul class="klienci">${klienci}</ul>
<h2>Edytory kodu i własne agenty</h2>
<p>Cursor, VS Code, Claude Code i inne klienty, które czytają plik konfiguracji, przyjmują wpis zdalnego serwera (transport Streamable HTTP):</p>
<pre><code>${esc(json)}</code></pre>
<p class="uwaga">Nazwy menu zależą od wersji aplikacji, planu i ustawień organizacji. Nie wpisuj danych osobowych w pytaniach. <a href="/#podlaczenie">Więcej na stronie głównej</a> · <a href="/health">Stan usług</a></p>`,
    `document.getElementById("kopiuj").onclick=async()=>{const k=document.getElementById("komunikat");try{await navigator.clipboard.writeText(${JSON.stringify(adres)});k.textContent=${JSON.stringify(p.skopiowano)}}catch{k.textContent=${JSON.stringify(p.blad)}}}`);
}

export async function stronaZdrowia(m: MagazynMigawek | undefined, czatDostepny: boolean, teraz = Date.now()): Promise<Response> {
  const [{ testy, sprawdzono }, historia] = await Promise.all([
    testyZrodel(),
    m ? m.get(KLUCZ).then((x) => x?.json() as Promise<Pomiar[]>).catch(() => [] as Pomiar[]) : Promise.resolve([] as Pomiar[]),
  ]);
  const h = historia ?? [];
  const proc = (v: number | null) => (v === null ? "brak pomiarów" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);
  const dzialaja = testy.filter(ok).length;
  const wiersze = testy.map((x) => `<tr><td>${esc(x.nazwa)}</td><td class="stan ${ok(x) ? "ok" : "zle"}">${ok(x) ? "✓ działa" : "✗ nie odpowiada"}</td><td class="l ukryj-waskie">${x.ms} ms</td><td class="l">${proc(dostepnosc(h, x.nazwa, 86_400_000, teraz))}</td><td class="l">${proc(dostepnosc(h, x.nazwa, 7 * 86_400_000, teraz))}</td><td class="l ukryj-waskie">${proc(dostepnosc(h, x.nazwa, OKNO_MS, teraz))}</td></tr>`).join("");
  const od = h.length ? new Date(h[0].t).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : null;
  return strona("Stan usług Lajkonektora", `
<h1>Stan usług</h1>
<p class="lead">Lajkonektor sam nie przechowuje danych miasta: przy każdym pytaniu odczytuje je ze źródeł. Tu widać, które źródła odpowiadają teraz i jak często odpowiadały wcześniej.</p>
<p class="podsumowanie${dzialaja === testy.length ? "" : " zle"}" role="status">Serwer Lajkonektora działa (wersja ${esc(WERSJA)}). Odpowiada ${dzialaja} z ${testy.length} źródeł danych. Czat na stronie: ${czatDostepny ? "dostępny" : "niedostępny"}.</p>
<h2>Źródła danych i usługi</h2>
<table><caption class="uwaga" style="text-align:left;caption-side:bottom;padding-top:8px">Dostępność to odsetek udanych sprawdzeń wykonywanych co 30 minut${od ? `, zapisywanych od ${esc(od)}` : ""}. Sprawdzenie z serwera Lajkonektora (Cloudflare), ostatni test z ${esc(new Date(sprawdzono).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }))}.</caption>
<thead><tr><th scope="col">Usługa</th><th scope="col">Teraz</th><th scope="col" class="l ukryj-waskie">Czas odpowiedzi</th><th scope="col" class="l">24 h</th><th scope="col" class="l">7 dni</th><th scope="col" class="l ukryj-waskie">30 dni</th></tr></thead>
<tbody>${wiersze}</tbody></table>
<p class="uwaga">Gdy źródło nie odpowiada, narzędzia, które z niego korzystają, zwrócą błąd albo oznaczoną migawkę archiwalną (najwyżej 24 h). Usługi OpenStreetMap są publiczne i bywają przeciążone. Dane techniczne w JSON: <a href="/diag">/diag</a>. <a href="/mcp">Jak podłączyć Lajkonektor do AI</a></p>`);
}

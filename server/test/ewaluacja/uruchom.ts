// Uruchamia zestaw ewaluacyjny na prawdziwym agencie czatu (ten sam, co w /api/czat) i prawdziwych źródłach danych.
// Wymaga klucza Eden AI i internetu; nie jest częścią `npm test`.
//   npm run ewaluacja                      wszystkie 50 pytań
//   npm run ewaluacja -- --filtr=sprzeciw  jedna kategoria albo id (np. f05)
//   npm run ewaluacja -- --n=3             każde pytanie 3 razy (rozrzut odpowiedzi modelu)
//   MCP_URL=https://lajkonektor.sendyka.workers.dev/mcp npm run ewaluacja   test wdrożonego serwera
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../../src/server.ts";
import { MODEL_DOMYSLNY, agent, mcpPrzezHandler, wolajEdenAi, type Zdarzenie } from "../../src/czat.ts";
import { ocen, type Ocena, type Przypadek } from "./ocena.ts";

const arg = (nazwa: string) => process.argv.find((a: string) => a.startsWith(`--${nazwa}=`))?.split("=")[1];
const filtr = arg("filtr"), powtorzenia = Number(arg("n") ?? 1), rownolegle = Number(arg("rownolegle") ?? 2);
const przypadki = (JSON.parse(readFileSync(new URL("./pytania.json", import.meta.url), "utf8")).przypadki as Przypadek[])
  .filter((p) => !filtr || p.id === filtr || p.kategoria === filtr);

const env = { EDEN_AI_API_KEY: process.env.EDEN_AI_API_KEY, CZAT_MODEL: process.env.CZAT_MODEL };
if (!env.EDEN_AI_API_KEY) throw new Error("Brak EDEN_AI_API_KEY (np. node --env-file=.dev.vars albo zmienna środowiskowa).");
const handler = process.env.MCP_URL
  ? { fetch: (r: Request) => fetch(new Request(process.env.MCP_URL!, r)) }
  : createMcpHandler(() => createServer());
const mcp = mcpPrzezHandler(handler);
const eden = wolajEdenAi(env);
const model = env.CZAT_MODEL || MODEL_DOMYSLNY;

async function uruchomPrzypadek(p: Przypadek) {
  const wiadomosci: { role: "user" | "assistant"; content: string }[] = [];
  const narzedzia: string[] = [], wyniki: string[] = [];
  let odpowiedz = "";
  for (const pytanie of p.tury) {
    wiadomosci.push({ role: "user", content: pytanie });
    const emit = (z: Zdarzenie) => {
      if (z.t === "tekst") odpowiedz = z.tresc;
      if (z.t === "wynik") wyniki.push(z.blad ? `Błąd: ${z.blad}` : JSON.stringify(z.dane));
    };
    const r = await agent({ wiadomosci: [...wiadomosci], mcp, eden, emit, model });
    narzedzia.push(...r.narzedzia);
    wiadomosci.push({ role: "assistant", content: odpowiedz });
  }
  return { odpowiedz, narzedzia, wyniki };
}

interface Wiersz { id: string; kategoria: string; proba: number; pytanie: string; ocena: Ocena; odpowiedz: string; narzedzia: string[]; blad?: string }
const zadania = przypadki.flatMap((p) => Array.from({ length: powtorzenia }, (_, i) => ({ p, proba: i + 1 })));
const wiersze: Wiersz[] = [];
let nastepne = 0;
await Promise.all(Array.from({ length: rownolegle }, async () => {
  while (nastepne < zadania.length) {
    const { p, proba } = zadania[nastepne++];
    const baza = { id: p.id, kategoria: p.kategoria, proba, pytanie: p.tury.join(" → ") };
    try {
      const o = await uruchomPrzypadek(p);
      const ocena = ocen(p, o);
      wiersze.push({ ...baza, ocena, odpowiedz: o.odpowiedz, narzedzia: o.narzedzia });
      console.log(`${ocena.zaliczony ? "OK  " : "FAIL"} ${p.id}${powtorzenia > 1 ? `#${proba}` : ""} ${p.tury[0]}${ocena.zaliczony ? "" : `\n       ${ocena.powody.join("\n       ")}`}`);
    } catch (e) {
      const blad = e instanceof Error ? e.message : String(e);
      wiersze.push({ ...baza, ocena: { zaliczony: false, powody: [`błąd uruchomienia: ${blad}`], nieuziemione: [] }, odpowiedz: "", narzedzia: [], blad });
      console.log(`ERR  ${p.id} ${blad}`);
    }
  }
}));

const proc = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : "-");
console.log(`\nModel: ${model} · serwer: ${process.env.MCP_URL ?? "w procesie"} · przebiegów: ${wiersze.length}`);
for (const k of ["fakt", "falszywa_przesłanka", "brak_danych", "sprzeciw"]) {
  const w = wiersze.filter((x) => x.kategoria === k);
  if (w.length) console.log(`${k.padEnd(20)} zaliczone ${w.filter((x) => x.ocena.zaliczony).length}/${w.length} (${proc(w.filter((x) => x.ocena.zaliczony).length, w.length)}), z liczbami bez pokrycia: ${w.filter((x) => x.ocena.nieuziemione.length).length}`);
}
const bezPokrycia = wiersze.filter((x) => x.ocena.nieuziemione.length).length;
console.log(`Odpowiedzi z liczbą bez pokrycia w narzędziach (cel: 0): ${bezPokrycia}/${wiersze.length}`);

const katalog = new URL("./wyniki/", import.meta.url);
mkdirSync(katalog, { recursive: true });
const plik = new URL(`${new Date().toISOString().replace(/[:.]/g, "-")}.json`, katalog);
writeFileSync(plik, JSON.stringify({ model, serwer: process.env.MCP_URL ?? "w procesie", wiersze }, null, 2));
console.log(`Pełne odpowiedzi do ręcznego przeglądu: ${plik.pathname.replace(/^\/(\w:)/, "$1")}`);
process.exitCode = wiersze.every((x) => x.ocena.zaliczony) ? 0 : 1;

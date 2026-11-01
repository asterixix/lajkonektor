import { PUBLICZNE } from "../src/kontrakt.ts";
// Narzędzia analityczne (offline, na migawkach): wskaźniki dzielnic, standardy dostępności, statystyka i błędy wejścia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";

const handler = createMcpHandler(() => createServer());
let id = 0;
async function narzedzie(name: string, args: unknown): Promise<any> {
  const r = await handler.fetch(new Request("https://lajkonektor.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: "operacja_wykonaj", arguments: { operacja: name, argumenty: args } } }) }));
  const t = await r.text();
  const m = t.match(/data: (\{.*\})/);
  const wynik = JSON.parse(m ? m[1] : t).result;
  if (wynik?._meta?.karta) wynik.structuredContent = wynik._meta.karta;
  return wynik;
}

test("wskaznik_dzielnic: dzieci 3–6 na 100 mieszkańców, 18 dzielnic, mapa i ranking z miejscami", async () => {
  const r = await narzedzie("wskaznik_dzielnic", { licznik: "dzieci_3_6", mianownik: "ludnosc", dzielnica: "Nowa Huta" });
  assert.ok(!r.isError, r.content?.[0]?.text);
  assert.equal(r.structuredContent._widok, "zlozony");
  const w = r.structuredContent.wskaznik;
  assert.equal(w.dzielnice.length, 18);
  assert.deepEqual(w.dzielnice.map((d: any) => d.miejsce).sort((a: number, b: number) => a - b), Array.from({ length: 18 }, (_, i) => i + 1), "miejsca 1–18 bez remisów");
  assert.ok(w.miasto > 100 && w.miasto < 400, `na 10 tys. mieszkańców: ${w.miasto}`);
  const typy = r.structuredContent.bloki.map((b: any) => b.typ);
  assert.ok(typy.includes("mapa") && typy.includes("wykres") && typy.includes("tabela"));
  const mapa = r.structuredContent.bloki.find((b: any) => b.typ === "mapa");
  assert.equal(mapa.kontury.length, 18);
  assert.ok(mapa.legenda.length >= 2);
  assert.doesNotMatch(r.content[0].text, /pierscien/, "kontury nie trafiają do tekstu dla modelu");
});

test("wskaznik_dzielnic: błędy wejścia mówią, co poprawić", async () => {
  assert.match((await narzedzie("wskaznik_dzielnic", { licznik: "ludnosc", dzielnica: "Wieliczka" })).content[0].text, /Nie rozpoznano dzielnicy/);
});

test("dostepnosc: standardy planu ogólnego dla miasta, procenty od 0 do 100, szkoła ≥ wszystkie trzy", async () => {
  const r = await narzedzie("dostepnosc", {});
  assert.ok(!r.isError, r.content?.[0]?.text);
  const s = r.structuredContent.standardy;
  assert.ok(s.razem > 400_000 && s.razem <= 710_000, String(s.razem));
  for (const k of ["wszystkie", "szkola", "zielen3", "zielen15"]) assert.ok(s.procent[k] >= 0 && s.procent[k] <= 100, k);
  assert.ok(s.procent.wszystkie <= Math.min(s.procent.szkola, s.procent.zielen3, s.procent.zielen15) + 1e-9);
  assert.equal(s.wg_dzielnic.length, 18);
  assert.deepEqual(s.progi[1], { nazwa: "Obszar Intensywny", szkola_m: 1000, zielen3_m: 500, zielen15_m: 2000 });
  assert.match(r.structuredContent.bloki.at(-1).tekst, /Zieleń = strefy zieleni/, "ostrzeżenie o definicji zieleni");
});

test("statystyka: korelacja liczb wprost, opis z histogramem, odstające, błędy wejścia", async () => {
  const k = await narzedzie("statystyka", { operacja: "korelacja", x: [1, 2, 3, 4, 5], y: [2, 4, 6, 8, 10] });
  assert.ok(Math.abs(k.structuredContent.korelacja.pearson - 1) < 1e-9);
  assert.ok(k.structuredContent.bloki.some((b: any) => b.typ === "wykres" && b.rodzaj === "punktowy"));
  const o = await narzedzie("statystyka", { operacja: "opis", x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  assert.equal(o.structuredContent.opis.mediana, 5.5);
  const odst = await narzedzie("statystyka", { operacja: "odstajace", x: [10, 11, 9, 10, 12, 10, 11, 90], etykiety: ["a", "b", "c", "d", "e", "f", "g", "h"] });
  assert.equal(odst.structuredContent.odstajace[0].etykieta, "h");
  assert.match((await narzedzie("statystyka", { operacja: "korelacja", x: [1, 2, 3] })).content[0].text, /wymaga `y`/);
  assert.match((await narzedzie("statystyka", { operacja: "opis" })).content[0].text, /Podaj x albo z/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { zlozony } from "../src/widoki/zlozony.ts";
import type { Ctx } from "../src/widoki/typy.ts";
import type { RaportAnalityczny } from "../../shared/raport.ts";

const raport: RaportAnalityczny = { wersja: "1", tytul: "Raport testowy", pytanie: "Ile?", utworzono: "2026-10-25T10:00:00Z", id_planu: "id-test", plan: { kroki: [] }, zatwierdzenie: "Deklaracja użytkownika", tabele: [{ id: "t1", tytul: "Tabela", kolumny: ["nazwa", "wartosc"], wiersze: [{ nazwa: "Dębniki", wartosc: 2 }], zrodla: ["z1"], uwagi: [] }], zrodla: [{ id: "z1", nazwa: "Źródło", narzedzie: "test", argumenty: {}, pobrano: "2026-10-25T10:00:00Z", kompletne: true, uwagi: [] }], metody: ["Zliczanie"], ograniczenia: ["Tylko zakres źródła"], wnioski: [] };
const ctx: Ctx = { wywolaj: async () => ({}), pokaz() {}, przejdz() {}, przerysuj() {}, otworz() {}, czyMoznaWolac: false };

// Minimalny adapter zdarzeń: testuje prawdziwe handlery bez przeglądarki i bez uruchamiania API.
function korzen() {
  const element = (dataset: Record<string, string> = {}) => ({ dataset, disabled: false, hidden: true, textContent: "", value: "", zdarzenia: {} as Record<string, (e?: any) => any>, addEventListener(n: string, f: (e: any) => any) { this.zdarzenia[n] = f; }, focus() {}, select() {} });
  const status = element(), awaria = element(), pole = element(), kopiuj = element(), czytnik = element({ raportCzytnik: "https://example.test/?raport=1" });
  const przyciski = ["zip", "html", "json"].map((format) => element({ raport: format }));
  const mapa: Record<string, ReturnType<typeof element>> = { "[data-raport-status]": status, "[data-raport-awaryjny]": awaria, "[data-raport-json]": pole, "[data-raport-kopiuj]": kopiuj, "[data-raport-czytnik]": czytnik };
  const root = { querySelector: (s: string) => mapa[s], querySelectorAll: () => przyciski } as unknown as HTMLElement;
  return { root, status, awaria, pole, przyciski, czytnik };
}

test("karta raportu: ten sam kontrakt w MCP i lokalnym czytniku, pełna metodologia i eksporty", () => {
  const html = zlozony.render({ raport: { ...raport, wykresy: [{ tabela: "t1", tytul: "Wartość w dzielnicy", rodzaj: "slupki", kolumna_x: "nazwa", kolumny_y: ["wartosc"] }] } }, ctx);
  for (const tekst of ["Pobierz pakiet ZIP", "HTML / PDF", "JSON", "Metody", "Źródła i pochodzenie", "Ograniczenia", "Dębniki", "Zatwierdzenie"]) assert.ok(html.includes(tekst), tekst);
  assert.match(html, /<table>/); assert.match(html, /<svg/); assert.match(html, /aria-live="polite"/);
  assert.match(zlozony.render({ raport: { ...raport, wersja: "99" } }, ctx), /Niepoprawny raport/);
  const htmlAtak = zlozony.render({ raport: { ...raport, tytul: "<img src=x onerror=alert(1)>" }, _raport_url: "javascript:alert(1)" }, ctx);
  assert.doesNotMatch(htmlAtak, /<img|data-raport-czytnik="javascript:/);
  assert.match(zlozony.render({ raport, _kafelki: "https://example.test/kafelki/{z}/{x}/{y}.png" }, ctx), /data-raport-czytnik="https:\/\/example\.test\/\?raport=1"/);
});

test("karta raportu: brak obsługi hosta odsłania JSON zamiast ogłaszać pobranie", async () => {
  const dom = korzen(); zlozony.podlacz!(dom.root, { raport }, ctx);
  await dom.przyciski[0].zdarzenia.click();
  assert.equal(dom.awaria.hidden, false); assert.deepEqual(JSON.parse(dom.pole.value), raport);
  assert.match(dom.status.textContent, /nie obsługuje/); assert.doesNotMatch(dom.status.textContent, /Przekazano/);
  assert.equal(dom.przyciski[0].disabled, false);
});

test("karta raportu: odmowa hosta obsługiwana jak błąd, można otworzyć czytnik", async () => {
  const dom = korzen(), urls: string[] = [];
  zlozony.podlacz!(dom.root, { raport }, { ...ctx, pobierz: async () => { throw new Error("Odmowa klienta"); }, otworz: (u) => { urls.push(u); } });
  await dom.przyciski[1].zdarzenia.click();
  assert.match(dom.status.textContent, /Nie udało się pobrać raportu.*Odmowa klienta/); assert.equal(dom.awaria.hidden, false);
  dom.czytnik.zdarzenia.click({ currentTarget: dom.czytnik }); assert.deepEqual(urls, ["https://example.test/?raport=1"]);
});

test("karta raportu: host dostaje rzeczywisty ZIP i dopiero wtedy potwierdzamy przekazanie", async () => {
  const dom = korzen(), pobrane: { nazwa: string; mime: string; dane: Uint8Array }[] = [];
  zlozony.podlacz!(dom.root, { raport }, { ...ctx, async pobierz(nazwa, mime, dane) { pobrane.push({ nazwa, mime, dane }); } });
  await dom.przyciski[0].zdarzenia.click();
  assert.equal(pobrane[0].mime, "application/zip"); assert.match(pobrane[0].nazwa, /\.zip$/);
  assert.ok(unzipSync(pobrane[0].dane)["raport.html"]); assert.match(dom.status.textContent, /Przekazano plik/);
  assert.equal(dom.awaria.hidden, true);
});

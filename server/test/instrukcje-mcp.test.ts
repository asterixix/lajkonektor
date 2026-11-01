import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ZASADY_ODPOWIEDZI } from "../src/instrukcje.ts";

// Regresje treści kontraktu. Te testy nie wywołują modelu i nie mierzą jakości jego odpowiedzi.
const zasada = (wzor: RegExp) => {
  const tekst = ZASADY_ODPOWIEDZI.split("\n").find((linia) => wzor.test(linia));
  assert.ok(tekst, `Brakuje zasady: ${wzor}`);
  return tekst;
};

test("kontekst: domyślny Kraków zachowuje obowiązek wyboru rzeczywiście różnych miejsc", () => {
  const tekst = zasada(/Kraków jest domyślnym miastem/);
  assert.match(tekst, /różne, pasujące lokalizacje/);
  assert.match(tekst, /poproś użytkownika o wybór/);
  assert.match(tekst, /przerwij zależne wywołania/);
  assert.match(tekst, /nie wybieraj pierwszego trafienia/);
});

test("kontekst: kategoria, punkt odniesienia i zmiana zadania mają odrębne reguły", () => {
  const miejsce = zasada(/poszukiwany typ obiektów/);
  assert.match(miejsce, /licea przy Parku Wodnym/);
  assert.match(miejsce, /szukasz liceów/);
  const cel = zasada(/Nowe samodzielne pytanie/);
  assert.match(cel, /zastępuje poprzedni cel/);
  assert.match(cel, /Doprecyzowanie/);
  assert.match(cel, /bieżącego celu, kategorii i wybranego miejsca/);
  assert.match(cel, /zadaj jedno konkretne pytanie/);
});

test("odległość: ranking wymaga pomiaru i pokrycia, a niepełny odczyt ogranicza wniosek", () => {
  const tekst = zasada(/Ranking „najbliższe”/);
  assert.match(tekst, /obliczonej odległości/);
  assert.match(tekst, /pokrycia danych/);
  assert.match(tekst, /rodzaj odległości i przeszukany zakres/);
  assert.match(tekst, /najbliższe spośród sprawdzonych/);
  assert.match(tekst, /bez zgadywania rankingu/);
});

test("prezentacja: jedna świadomie dobrana karta przez istniejącą bramkę, decyzje człowieka pozostają widoczne", () => {
  assert.match(zasada(/Domyślnie udziel krótkiej odpowiedzi/), /źródła, daty, kompletność i ograniczenia/);
  const tekst = zasada(/najwyżej jedną końcową prezentację/);
  assert.match(tekst, /operację widok/);
  assert.match(tekst, /operacje_szukaj/);
  assert.match(tekst, /operacja_wykonaj/);
  assert.match(tekst, /ostatni wynik narzędzia nie staje się automatycznie/);
  assert.match(tekst, /Wybór miejsca i zatwierdzenie planu/);
  assert.match(tekst, /zależy również od klienta MCP/);
});

test("raport i eksport wymagają osobnych próśb, a zmieniony plan ponownego zatwierdzenia", () => {
  const pliki = zasada(/Raport i eksport danych to osobne potrzeby/);
  assert.match(pliki, /raport wyłącznie na wyraźną prośbę o raport/);
  assert.match(pliki, /eksport wyłącznie na wyraźną prośbę o pobranie danych/);
  assert.match(pliki, /eksport nie jest zgodą na tworzenie raportu/);
  assert.match(pliki, /nazwij ograniczenie i uzgodnij alternatywę/);
  const zgoda = zasada(/Plan analizy wymaga jawnego zatwierdzenia/);
  assert.match(zgoda, /Nie twórz deklaracji zgody/);
  assert.match(zgoda, /ponownego sprawdzenia i zatwierdzenia zmienionego planu/);
});

test("interpretacja i zakres: hipotezy mają podstawę, błąd nie dowodzi braku, instytucje kultury pozostają dostępne", () => {
  const hipotezy = zasada(/Hipotezy i warianty interpretacji/);
  assert.match(hipotezy, /podstawę w danych/);
  assert.match(hipotezy, /oceny badacza/);
  assert.match(zasada(/Domyślnie udziel krótkiej odpowiedzi/), /nie dowodzą braku placówek ani zjawiska/);
  const zakres = zasada(/Aktualny kalendarz koncertów i wydarzeń/);
  assert.match(zakres, /nie jest obsługiwany w tej wersji/);
  assert.match(zakres, /instytucjach kultury nadal można wyszukiwać w katalogu/);
  assert.match(zakres, /lista instytucji nie zastępuje kalendarza/);
});

test("ewaluacja ma 10 niezależnych przypadków z pojedynczą odpowiedzią i jawnym statusem nieuruchomienia", async () => {
  const xml = await readFile(new URL("./ewaluacja/zadania-mcp.xml", import.meta.url), "utf8");
  assert.match(xml, /Model nie został uruchomiony/);
  assert.match(xml, /Nie jest to wynik ewaluacji jakości LLM/);
  const pary = [...xml.matchAll(/<qa_pair id="([^"]+)">\s*<question>([\s\S]+?)<\/question>\s*<answer>([^<]+)<\/answer>\s*<\/qa_pair>/g)];
  assert.equal(pary.length, 10);
  assert.equal(new Set(pary.map((para) => para[1])).size, 10);
  assert.equal(new Set(pary.map((para) => para[2].trim())).size, 10);
  for (const [, id, pytanie, odpowiedz] of pary) {
    assert.ok(pytanie.trim().length > 100, id);
    assert.ok(odpowiedz.trim().length > 0 && odpowiedz.trim().length < 100, id);
    assert.doesNotMatch(pytanie, /poprzedni(?:ego|ej) (?:przypadku|zadania)|pytani[au] (?:nr|numer)\s*\d/i, id);
  }
});

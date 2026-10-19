// Wyszukiwanie w katalogu (offline): potoczne tematy mieszkańców trafiają w urzędowe nazwy zbiorów, braków nie udajemy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { brakiTematu, szukaj } from "../src/katalog.ts";

const pierwsze = (temat: string, n = 3) => szukaj(temat, { limit: n }).map((p) => p.id);
const zawiera = (temat: string, fragment: string, n = 3) => assert.ok(pierwsze(temat, n).some((id) => id.includes(fragment)), `${temat} → ${pierwsze(temat, n).join(", ")}`);

test("katalog: tematy z życia miasta trafiają w odpowiednie zbiory", () => {
  const oczekiwane: [string, string][] = [
    ["ceny mieszkań", "Rejestr_cen"],
    ["parki", "parki-miejskie-powierzchnia"],
    ["żłobki", "Zlobki"],
    ["szpitale", "Placowki_sluzby_zdrowia"],
    ["apteki", "Placowki_sluzby_zdrowia"],
    ["parkingi", "Parkomaty"],
    ["strefa płatnego parkowania", "strefa_platnego_parkowania"],
    ["ścieżki rowerowe", "Rowerowa"],
    ["dzielnicowy", "OC_Bezpiecze"],
    ["komisariaty", "OC_Bezpiecze"],
    ["działki ewidencyjne", "Dzialki"],
    ["pozwolenia na budowę", "AU_Sos"],
    ["wycinka drzew", "wycinka"],
    ["stacje bazowe telefonii", "WS_GSM"],
    ["jakość powietrza", "Gios_Indeks"],
    ["mapa hałasu", "Mapa_Halasu"],
    ["stacje kolejowe", "Koleje_malopolskie"],
    ["toalety publiczne", "ZIW_WC"],
    ["mieszkania komunalne", "Lokale_ZBK"],
    ["okręgi wyborcze", "Wybory"],
    ["ile ludzi mieszka w Krakowie", "zameldowani-na-pobyt-staly"],
  ];
  for (const [temat, fragment] of oczekiwane) zawiera(temat, fragment);
});

test("katalog: bez wzmianki o cudzoziemcach tabele o cudzoziemcach nie zalewają wyników, a z nią są pierwsze", () => {
  assert.ok(!pierwsze("ludność Krakowa", 5).some((id) => id.includes("Cudzoziem")));
  assert.ok(pierwsze("cudzoziemcy pobyt czasowy", 2).every((id) => id.includes("Cudzoziem")));
});

test("katalog: wyniki z kolejnych lat jednej tabeli idą razem, od najnowszego roku", () => {
  const ids = pierwsze("zameldowani na pobyt stały", 3);
  const lata = ids.map((id) => +id.match(/(20\d\d)(?!.*20\d\d)/)![1]);
  assert.deepEqual(lata, [...lata].sort((a, b) => b - a), ids.join(", "));
  assert.ok(lata[0] >= 2025);
});

test("katalog: nazwa krótka nie łapie dłuższej (parki ≠ parking), a końcówka fleksyjna tak (hałas ~ hałasu)", () => {
  assert.ok(!pierwsze("parki", 2).some((id) => /Parking/i.test(id)));
  zawiera("halas", "Halasu");
});

test("katalog: tematy, których nie ma w danych miasta, są nazwane wprost", () => {
  for (const t of ["wywóz odpadów", "PSZOK", "kina w Krakowie", "wypadki drogowe", "targowiska", "rowery miejskie Wavelo", "dzielnicowy mojej ulicy"]) assert.ok(brakiTematu(t), t);
  for (const t of ["parki", "teatry", "ceny mieszkań", "żłobki", "komisariaty"]) assert.equal(brakiTematu(t), undefined, t);
});

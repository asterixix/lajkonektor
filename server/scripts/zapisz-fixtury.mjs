// Zapisuje prawdziwe wyniki narzędzi (structuredContent po opakowaniu widokiem) jako fixtury do testów kart i harnessu.
// Uruchom: node --experimental-strip-types scripts/zapisz-fixtury.mjs   (wymaga internetu; wyniki są migawką z dnia uruchomienia)
import { writeFileSync, mkdirSync } from "node:fs";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server.ts";

const handler = createMcpHandler(() => createServer());
let id = 0;
async function wywolaj(nazwa, args) {
  const r = await handler.fetch(new Request("https://lajkonektor.test/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name: nazwa, arguments: args } }),
  }));
  const t = await r.text();
  const m = t.match(/data: (\{.*\})/);
  return JSON.parse(m ? m[1] : t).result;
}

const MPZP = "msip:Planowanie/BP_MPZP/3";
const ZESTAW = {
  odjazdy: ["odjazdy", { nazwa: "Teatr Słowackiego", limit: 8 }],
  trasa: ["trasa", { z: { ulica: "Łojasiewicza", numer: "4" }, do: { ulica: "Basztowa", numer: "20" } }],
  przystanki: ["przystanki_w_poblizu", { miejsce: { ulica: "Łojasiewicza", numer: "4" }, promien_m: 600, limit: 6 }],
  parki_jordana: ["parki_geometria", { nazwa: "Jordana" }],
  parki_wszystkie: ["parki_geometria", { tylko_z_geometria: true }],
  tabela_parki: ["dane_zapytaj", { id: "od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia", grupuj_po: ["Dzielnica"], agreguj: [{ fn: "sum", pole: "Powierzchnia_ha", nazwa: "ha" }, { fn: "count", pole: "Lp", nazwa: "parki" }], sortuj: "ha desc" }],
  plik_xlsx: ["plik_odczyt", { url: "https://api.dane.gov.pl/resources/2826170,ceny-ofertowe-mieszkan-dewelopera-dom-development-krakow-sp-z-oo-2026-10-18/file", pola: ["Cena m 2 powierzchni użytkowej lokalu mieszkalnego / domu jednorodzinnego [zł]", "Cena części nieruchomości, będących przedmiotem umowy [zł]"], sortuj: "Cena m 2 powierzchni użytkowej lokalu mieszkalnego / domu jednorodzinnego [zł] desc", limit: 6 }],
  szereg: ["bdl_dane", { zmienne: [60270], lata: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025] }],
  wskaznik_dzielnic: ["wskaznik_dzielnic", { licznik: "przedszkola", mianownik: "dzieci_3_6" }],
  profil_dzielnicy: ["wskaznik_dzielnic", { dzielnica: "Nowa Huta" }],
  dostepnosc_standardy: ["dostepnosc", {}],
  dostepnosc_apteki: ["dostepnosc", { usluga: "apteka", promien_m: 500 }],
  dostepnosc_punkt: ["dostepnosc", { miejsce: { ulica: "Telimeny", numer: "11" } }],
  obiekty_apteki: ["obiekty_w_poblizu", { miejsce: { tekst: "Rynek Główny" }, rodzaj: "apteka_calodobowa" }],
  statystyka_korelacja: ["statystyka", { operacja: "korelacja", z: { narzedzie: "dane_zapytaj", argumenty: { id: "msip:Rejestr_cen/Rc_Lokale_m_Rp_Mapa/12", limit: 20 } }, kolumna_x: "med_wart_m2", kolumna_y: "lkl_count", kolumna_etykiet: "nazwa_dz" }],
  planowanie_telimeny: ["planowanie_w_punkcie", { miejsce: { ulica: "Telimeny", numer: "11" } }],
  planowanie_rynek: ["planowanie_w_punkcie", { miejsce: { tekst: "Rynek Główny" } }],
  katalog: ["katalog_szukaj", { temat: "przedszkola", limit: 6 }],
  katalog_brak: ["katalog_szukaj", { temat: "kina w Krakowie", limit: 4 }],
  trasa_pociag: ["trasa", { z: { tekst: "Dworzec Główny" }, do: { tekst: "Wieliczka Rynek" } }],
  trasa_wies: ["trasa", { z: { tekst: "Dworzec Główny" }, do: { tekst: "Staniątki 15" } }],
  odjazdy_pociagi: ["odjazdy", { nazwa: "Kraków Główny", limit: 8 }],
  opis_zbioru: ["zbior_opis", { id: "od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia" }],
  bdl_lista: ["bdl_szukaj", { nazwa: "stopa bezrobocia", limit: 5 }],
  dane_gov: ["dane_gov", { q: "Kraków ceny mieszkań", limit: 4 }],
  adres: ["adres_na_punkt", { ulica: "Telimeny", numer: "11" }],
  komunikaty: ["utrudnienia", {}],
  status: ["status_zrodel", {}],
  kontury: ["ui_kontury_parkow", { wokol_lp: 17, promien_m: 900 }],
  mapa_msip: ["dane_zapytaj", { id: MPZP, filtr: "oznaczenie LIKE 'ZP%'", geometria: { punkt: { lat: 50.0614, lon: 19.9372 }, promien_m: 1500 }, kontury: true, limit: 30 }],
};

mkdirSync(new URL("../test/fixtury/", import.meta.url), { recursive: true });
const zapisz = (n, o) => writeFileSync(new URL(`../test/fixtury/${n}.json`, import.meta.url), JSON.stringify(o, null, 1));
for (const [nazwa, [narz, args]] of Object.entries(ZESTAW)) {
  const r = await wywolaj(narz, args);
  if (r.isError) { console.log(`${nazwa}: BŁĄD ${r.content[0].text.slice(0, 100)}`); continue; }
  zapisz(nazwa, r.structuredContent);
  console.log(`${nazwa}: ${(JSON.stringify(r.structuredContent).length / 1024).toFixed(1)} KB, widok=${r.structuredContent._widok ?? "-"}`);
}
// Karta złożona z komponentów: tabela, wykres i mapa pobierane przez serwer (pole z), a nie przepisywane przez model
const wz = await wywolaj("widok", { tytul: "Zieleń w centrum Krakowa", podtytul: "Parki miejskie i tereny zieleni z planów miejscowych", zrodlo: "Otwarte Dane UMK (parki), MSIP (MPZP), GUS BDL", bloki: [
  { typ: "metryki", pozycje: [{ etykieta: "Parki w rejestrze", wartosc: 78 }, { etykieta: "Z konturem OSM", wartosc: 46, opis: "44,9% powierzchni" }, { etykieta: "Bezrobocie 2025", wartosc: "2,5%" }] },
  { typ: "tabela", tytul: "Powierzchnia parków wg dzielnic (ha)", z: { narzedzie: "dane_zapytaj", argumenty: { id: "od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia", grupuj_po: ["Dzielnica"], agreguj: [{ fn: "sum", pole: "Powierzchnia_ha", nazwa: "ha" }], sortuj: "ha desc", limit: 6 } } },
  { typ: "wykres", rodzaj: "slupki", tytul: "Stopa bezrobocia rejestrowanego", jednostka: "%", z: { narzedzie: "bdl_dane", argumenty: { zmienne: [60270], lata: [2021, 2022, 2023, 2024, 2025] } } },
  { typ: "mapa", tytul: "Tereny zieleni (ZP) w promieniu 1,5 km od Rynku", kolumna_etykiety: "oznaczenie", z: { narzedzie: "dane_zapytaj", argumenty: { id: MPZP, filtr: "oznaczenie LIKE 'ZP%'", geometria: { punkt: { lat: 50.0614, lon: 19.9372 }, promien_m: 1500 }, kontury: true, limit: 30 } } },
  { typ: "tekst", wariant: "uwaga", tekst: "Oznaczenie ZP w planie miejscowym to teren zieleni, niekoniecznie park miejski z rejestru." },
] });
zapisz("widok_zlozony", wz.structuredContent);
console.log(`widok_zlozony: ${(JSON.stringify(wz.structuredContent).length / 1024).toFixed(1)} KB`);
// Szereg dla prognozy z prawdziwych danych BDL
const sz = JSON.parse((await import("node:fs")).readFileSync(new URL("../test/fixtury/szereg.json", import.meta.url), "utf-8"));
const pr = await wywolaj("prognoza", { serie: sz.wiersze.map((w) => ({ x: w.rok, y: w.wartosc })), horyzont: 3, etykieta: "Stopa bezrobocia rejestrowanego, Kraków (%)" });
zapisz("prognoza", pr.structuredContent);
console.log(`prognoza: widok=${pr.structuredContent._widok}`);
// Stany szczególne
zapisz("odjazdy_puste", { _widok: "odjazdy", _zapytanie: { nazwa: "Nieistniejący" }, zrodlo: "ZTP", przystankow: 0, odjazdy: [], komunikaty: [] });
zapisz("blad_522", { isError: true, tekst: "Błąd: HTTP 522 dla https://msip3.um.krakow.pl/server/rest/services/Pobieranie/Adresy/MapServer/0/query" });

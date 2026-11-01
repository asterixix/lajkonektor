// Próba techniczna rdzenia bez płatnego LLM. Nie zastępuje zatwierdzenia interpretacji przez badacza.
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "../src/server.ts";
import { raportHTML, raportJSON, pakietRaportu } from "../shared/eksport-raportu.ts";
const folder = new URL("../../docs/10-walidacja/2026-10-25/", import.meta.url);
const zatwierdzenie = process.argv.find((a) => a.startsWith("--zatwierdzenie="))?.slice("--zatwierdzenie=".length);
if (!zatwierdzenie) throw new Error("Podaj --zatwierdzenie=treść podstawy wykonania próby. Nie jest to zatwierdzenie wniosków badawczych.");
const zakres = "Migawka ludności opisuje zameldowanych na pobyt stały. Infrastruktura ma inną datę publikacji/importu lub nieznany stan. To porównanie orientacyjne, nie pomiar popytu ani wolnych miejsc.";
const msip = (id, nazwa, zbior, pola, dzielnica_pole, filtr) => ({ id, nazwa, narzedzie: "dane_zapytaj", argumenty: { id: zbior, pola, ...(filtr ? { filtr } : {}) }, dzielnica_z_geometrii: true, ...(dzielnica_pole ? { dzielnica_pole } : {}), poziom: "dzielnica", definicja: nazwa + "; lokalizacja z geometrii MSIP, nie ocena dostępności miejsc." });
const gus = (id, nazwa, zmienna) => ({ id, nazwa, narzedzie: "bdl_dane", argumenty: { zmienne: [zmienna], jednostka: "gmina", lata: [2020, 2021, 2022, 2023, 2024, 2025] }, poziom: "gmina", definicja: nazwa + ". Kontekst całej gminy, bez przypisywania wartości do dzielnic." });
const agreguj = (id, z, miary) => ({ id, typ: "agreguj", z, grupuj_po: ["dzielnica_id"], miary });
const polacz = (id, lewe, prawe, prefiks_prawy) => ({ id, typ: "polacz", lewe, prawe, klucz_lewy: "id", klucz_prawy: "dzielnica_id", prefiks_prawy, uzasadnienie_roznic: zakres });
const plan = {
  tytul: "Usługi dla rodzin w Krakowie i 18 dzielnicach",
  pytanie: "Jak rozmieszczone są żłobki, przedszkola i kluby rodziców względem zameldowanych dzieci i jakie ograniczenia trzeba sprawdzić przed rekomendacją działań?",
  zrodla: [
    { id: "ludnosc", nazwa: "Dzieci zameldowane na pobyt stały", narzedzie: "ludnosc_dzielnic", argumenty: { pola: ["r_0_2", "r_3_6"] } },
    msip("publiczne", "Żłobki publiczne", "msip:Zdrowie/Zlobki_Kluby_rodzicow/0", ["objectid", "nazwa", "dzielnica", "l_miejsc", "data_imp"], "dzielnica"),
    { ...msip("niepubliczne", "Żłobki niepubliczne", "msip:Zdrowie/Zlobki_Kluby_rodzicow/1", ["objectid", "nazwa", "dzielnica", "l_miejsc", "data_imp"], "dzielnica"), dzielnica_z_geometrii: false, definicja: "Rejestr żłobków niepublicznych; źródło nie zwraca geometrii. Dzielnica z pola opisowego, sprzeczny numer i nazwa pozostają nierozstrzygnięte." },
    msip("kluby", "Kluby rodziców z dziećmi do lat 3", "msip:Zdrowie/Zlobki_Kluby_rodzicow/2", ["objectid", "organizacja", "rodzaj"]),
    msip("przedszkola", "Placówki przedszkolne", "msip:Edukacja/EK_PLACOWKI/1", ["objectid", "nz_pl", "typ_pl", "publiczn"], undefined, "typ_pl = 'Przedszkole'"),
    gus("urodzenia", "Urodzenia żywe ogółem GUS", 59),
    gus("przyrost", "Przyrost naturalny ogółem GUS", 68),
    gus("migracje", "Saldo migracji na pobyt stały ogółem GUS", 1365234),
  ],
  operacje: [
    agreguj("miejsca_publiczne", "publiczne", [{ fn: "sum", pole: "l_miejsc", nazwa: "miejsca" }, { fn: "count", nazwa: "placowki" }]),
    agreguj("miejsca_niepubliczne", "niepubliczne", [{ fn: "sum", pole: "l_miejsc", nazwa: "miejsca" }, { fn: "count", nazwa: "placowki" }]),
    agreguj("kluby_dzielnice", "kluby", [{ fn: "count", nazwa: "placowki" }]),
    agreguj("przedszkola_dzielnice", "przedszkola", [{ fn: "count", nazwa: "placowki" }]),
    polacz("zestawienie_publiczne", "ludnosc", "miejsca_publiczne", "publiczne_"),
    polacz("zestawienie_niepubliczne", "zestawienie_publiczne", "miejsca_niepubliczne", "niepubliczne_"),
    polacz("zestawienie_kluby", "zestawienie_niepubliczne", "kluby_dzielnice", "kluby_"),
    polacz("zestawienie", "zestawienie_kluby", "przedszkola_dzielnice", "przedszkola_"),
    { id: "wskaznik_publiczne", typ: "wskaznik", z: "zestawienie", licznik: "publiczne_miejsca", mianownik: "r_0_2", nazwa: "publiczne_miejsca_na_1000_dzieci", mnoznik: 1000, jednostka: "miejsc na 1000 zameldowanych dzieci 0–2" },
    { id: "wskaznik_niepubliczne", typ: "wskaznik", z: "wskaznik_publiczne", licznik: "niepubliczne_miejsca", mianownik: "r_0_2", nazwa: "niepubliczne_miejsca_na_1000_dzieci", mnoznik: 1000, jednostka: "miejsc na 1000 zameldowanych dzieci 0–2" },
    { id: "wskaznik_przedszkola", typ: "wskaznik", z: "wskaznik_niepubliczne", licznik: "przedszkola_placowki", mianownik: "r_3_6", nazwa: "przedszkola_na_1000_dzieci", mnoznik: 1000, jednostka: "placówek na 1000 zameldowanych dzieci 3–6" },
    { id: "scenariusz_urodzen", typ: "projekcja", z: "urodzenia", x: "rok", y: "wartosc", horyzont: 2, metoda: "auto" },
  ],
  ograniczenia: [zakres, "Liczba miejsc nie oznacza wolnych miejsc. Kluby rodzica nie są żłobkami. Liczba przedszkoli nie oznacza pojemności.", "Saldo migracji jest przepływem osób zameldowanych na pobyt stały, nie liczbą migrantów ani rodzin migranckich. Nie utożsamiaj tych kategorii.", "Projekcja urodzeń to wariant trendu, nie prognoza potrzeb opieki. Nie modeluje migracji, wyborów rodziców ani polityki miasta.", "Brak kosztów, kolejek i wykorzystania nie pozwala wyliczyć oszczędności ani zalecić zamknięcia placówek.", "Licencje i trafność rekomendacji wymagają odrębnego przeglądu przed wykorzystaniem raportu w decyzji."]
};
await mkdir(folder, { recursive: true });
await writeFile(new URL("plan-rodziny.json", folder), JSON.stringify(plan, null, 2) + "\n");
const serwer = createServer(undefined, "http://localhost:5173");
const start = Date.now();
const sprawdzony = await serwer.wywolaj("analiza", { tryb: "sprawdz", plan });
await writeFile(new URL("sprawdzenie-planu.json", folder), JSON.stringify(sprawdzony, null, 2) + "\n");
const wynik = await serwer.wywolaj("analiza", { tryb: "wykonaj", plan, id_planu: sprawdzony.id_planu, zatwierdzenie });
await writeFile(new URL("raport-rodziny.json", folder), raportJSON(wynik.raport));
await writeFile(new URL("raport-rodziny.html", folder), raportHTML(wynik.raport));
await writeFile(new URL("raport-rodziny.zip", folder), pakietRaportu(wynik.raport));
await writeFile(new URL("wynik-karty.json", folder), JSON.stringify(wynik, null, 2));
console.log(JSON.stringify({ ms: Date.now() - start, tabele: wynik.raport.tabele.map((t) => ({ id: t.id, wierszy: t.wiersze.length })), ograniczenia: wynik.raport.ograniczenia }, null, 2));
// Drugi temat: ta sama implementacja planu, bez specjalnego kodu analizy parków.
const drugi = { tytul: "Parki a liczba zameldowanych mieszkańców", pytanie: "Jak wypadają dzielnice pod względem powierzchni parków na mieszkańca?", zrodla: [{ id: "parki", narzedzie: "wskaznik_dzielnic", argumenty: { licznik: "parki_ha", mianownik: "ludnosc" }, definicja: "Powierzchnia parków na mieszkańca zameldowanego na pobyt stały, z ograniczeniami narzędzia." }], operacje: [] };
const p2 = await serwer.wywolaj("analiza", { tryb: "sprawdz", plan: drugi });
const w2 = await serwer.wywolaj("analiza", { tryb: "wykonaj", plan: drugi, id_planu: p2.id_planu, zatwierdzenie });
await writeFile(new URL("raport-drugi-temat.json", folder), raportJSON(w2.raport));
console.log(JSON.stringify({ drugi_temat: w2.raport.tytul, wierszy: w2.raport.tabele[0].wiersze.length }));

// Odczyt publicznych źródeł; zapis dowodów audytu poza katalogiem generowanych danych.
import { mkdir, writeFile } from "node:fs/promises";
import { daneZapytaj } from "../src/zapytanie.ts";
import { bdlSzukaj, bdlDane } from "../src/zewnetrzne.ts";
import { znajdz, migawkaKatalogu } from "../src/katalog.ts";

const folder = new URL("../../docs/10-walidacja/2026-10-25/", import.meta.url);
const przypadki = [
  ["zlobki_publiczne", "msip:Zdrowie/Zlobki_Kluby_rodzicow/0"],
  ["zlobki_niepubliczne", "msip:Zdrowie/Zlobki_Kluby_rodzicow/1"],
  ["kluby_rodzica", "msip:Zdrowie/Zlobki_Kluby_rodzicow/2"],
  ["przedszkola_samorzadowe", "od:OD-OswiataPrzedszkolaLiczbaDzieci/liczba-dzieci-przedszkola-samorzadowe-2025-2026"],
  ["przedszkola_niesamorzadowe", "od:OD-OswiataPrzedszkolaLiczbaDzieci/liczba-dzieci-przedszkola-niesamorzadowe-2025-2026"],
];
await mkdir(folder, { recursive: true });
const start = Date.now();
const wyniki = await Promise.all(przypadki.map(async ([nazwa, id]) => {
  const poczatek = Date.now(), p = znajdz(id);
  try {
    const r = await daneZapytaj({ id, limit: 1000 });
    return { nazwa, id, url: p.url, ms: Date.now() - poczatek, pobrano: new Date().toISOString(), ok: true,
      kompletne: r.kompletne, kolumny: r.kolumny, wierszy: r.wiersze.length,
      sumy: Object.fromEntries(["l_miejsc", "Liczba dzieci ogółem"].filter((k) => r.wiersze.some((w) => k in w)).map((k) => [k, {
        suma: r.wiersze.reduce((s, w) => s + (typeof w[k] === "number" ? w[k] : 0), 0), braki: r.wiersze.filter((w) => typeof w[k] !== "number").length,
      }])),
      dzielnice: [...new Set(r.wiersze.map((w) => w.dzielnica).filter(Boolean))],
      rodzaje: [...new Set(r.wiersze.map((w) => w.rodzaj).filter(Boolean))],
      daty_importu: [...new Set(r.wiersze.map((w) => w.data_imp).filter(Boolean))], uwagi: r.uwagi ?? [] };
  } catch (e) { return { nazwa, id, url: p?.url, ok: false, blad: e.message, ms: Date.now() - poczatek }; }
}));
const gus = [];
for (const temat of ["urodzenia żywe", "przyrost naturalny", "saldo migracji"]) {
  try { gus.push({ temat, ...(await bdlSzukaj(temat, 4)) }); }
  catch (e) { gus.push({ temat, blad: e.message }); }
}
const urodzenia = gus.find((x) => x.temat === "urodzenia żywe")?.zmienne?.find((x) => x.nazwa === "Urodzenia żywe | ogółem");
let szereg;
if (urodzenia) {
  try { szereg = await bdlDane({ zmienne: [urodzenia.id], jednostka: "gmina", lata: [2020, 2021, 2022, 2023, 2024, 2025] }); }
  catch (e) { szereg = { blad: e.message }; }
}
const raport = { pobrano: new Date().toISOString(), ms: Date.now() - start, migawka_katalogu: migawkaKatalogu, wyniki, gus, szereg_urodzen: szereg,
  ograniczenia: ["Pojedyncza próba dostępności, nie test obciążenia ani walidacja scenariusza w kliencie AI.", "Liczba miejsc nie oznacza wolnych miejsc ani popytu. Daty importu nie zastępują dat stanu danych.", "Dane przedszkoli opisują dzieci uczęszczające w roku szkolnym, a nie pojemność placówek.", "Brak danych o kosztach i wykorzystaniu nie pozwala oszacować oszczędności."] };
await writeFile(new URL("audyt-zrodel.json", folder), JSON.stringify(raport, null, 2) + "\n");
const md = `# Audyt źródeł usług dla rodzin\n\nOdczyt: ${raport.pobrano}. Dowody: [audyt-zrodel.json](audyt-zrodel.json). Generator: \`node scripts/audyt-rodziny.mjs\` z server/.\n\n| Źródło | Wynik | Wiersze | Kompletność |\n|---|---|---:|---|\n${wyniki.map((r) => `| ${r.nazwa} | ${r.ok ? "odpowiada" : "błąd"} | ${r.wierszy ?? ""} | ${r.kompletne ?? "nieustalona"} |`).join("\n")}\n\n## Ograniczenia\n\n${raport.ograniczenia.map((x) => `- ${x}`).join("\n")}\n\nWyszukiwanie GUS znajduje kandydatów zmiennych, których definicje trzeba sprawdzić. Szereg urodzeń, jeśli pobrany, dotyczy gminy Kraków. Nie jest szeregiem 18 dzielnic. Licencje i okresy pozostałych tabel wymagają sprawdzenia przed publikowaniem rekomendacji.\n`;
await writeFile(new URL("audyt-zrodel.md", folder), md);
console.log(JSON.stringify(raport, null, 2));

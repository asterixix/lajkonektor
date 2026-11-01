// Samodzielne dane i ich pochodzenie. Pakiet nie wymaga pełnego raportu ani interpretacji modelu.
import { strToU8, zipSync } from "fflate";
import { nazwaPliku, tabelaCSV } from "./eksport-raportu.ts";
import type { TabelaRaportu, ZrodloRaportu } from "./raport.ts";

export interface TabelaDanych extends TabelaRaportu {
  rodzaj: "odczytana" | "przeliczona";
  kompletne: true;
}
export interface PakietDanych {
  format: "lajkonektor-dane";
  wersja: "1";
  tytul: string;
  utworzono: string;
  odczyt: "ponowiony";
  tabele: TabelaDanych[];
  zrodla: ZrodloRaportu[];
  metody: string[];
  ograniczenia: string[];
  plan?: Record<string, unknown>;
  id_planu?: string;
  zatwierdzenie?: string;
}

export const LIMIT_DANYCH = 1024 * 1024;
const obiekt = (v: unknown): v is Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v);
const napis = (v: unknown): v is string => typeof v === "string" && v.length <= 20000;
const napisy = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every(napis);
function wymagaj(warunek: unknown, opis: string): asserts warunek {
  if (!warunek) throw Error(`Niepoprawny pakiet danych: ${opis}.`);
}

function sprawdzPakietDanych(p: unknown): asserts p is PakietDanych {
  let elementy = 0;
  const sprawdz = (v: unknown, glebokosc = 0) => {
    wymagaj(++elementy <= 500000 && glebokosc <= 20, "zbyt złożona struktura");
    if (typeof v === "number") wymagaj(Number.isFinite(v), "liczba poza zakresem");
    if (typeof v === "string") wymagaj(napis(v), "tekst przekracza 20 tys. znaków");
    wymagaj(!["bigint", "function", "symbol"].includes(typeof v), "wartość nie jest danymi JSON");
    if (v && typeof v === "object") for (const k of Object.keys(v)) {
      wymagaj(!["__proto__", "prototype", "constructor"].includes(k), "niedozwolony klucz");
      sprawdz((v as Record<string, unknown>)[k], glebokosc + 1);
    }
  };
  sprawdz(p);
  wymagaj(obiekt(p) && p.format === "lajkonektor-dane" && p.wersja === "1", "nieobsługiwany format lub wersja");
  wymagaj(napis(p.tytul) && p.tytul.length > 0 && napis(p.utworzono) && Number.isFinite(Date.parse(p.utworzono)), "tytuł lub data utworzenia");
  wymagaj(p.odczyt === "ponowiony", "odczyt musi jawnie oznaczać ponowione pobranie");
  wymagaj(napisy(p.metody) && napisy(p.ograniczenia), "metody i ograniczenia");
  const maPlan = p.plan !== undefined || p.id_planu !== undefined || p.zatwierdzenie !== undefined;
  if (maPlan) wymagaj(obiekt(p.plan) && napis(p.id_planu) && /^[a-f0-9]{64}$/.test(p.id_planu) && napis(p.zatwierdzenie) && p.zatwierdzenie.trim().length >= 2, "plan wymaga identyfikatora i deklaracji zatwierdzenia");
  wymagaj(Array.isArray(p.zrodla) && p.zrodla.length >= 1 && p.zrodla.length <= 8, "lista źródeł (1–8)");
  const zrodla = new Set<string>();
  for (const s of p.zrodla) {
    wymagaj(obiekt(s), "źródło musi być obiektem");
    for (const k of ["id", "nazwa", "narzedzie", "pobrano"]) wymagaj(napis(s[k]) && s[k].length > 0, `pole źródła ${k}`);
    wymagaj(!zrodla.has(s.id), "powtórzone ID źródła"); zrodla.add(s.id);
    wymagaj(Number.isFinite(Date.parse(s.pobrano)) && obiekt(s.argumenty) && s.kompletne === true && napisy(s.uwagi), "metadane lub kompletność źródła");
    for (const k of ["data_stanu", "url", "definicja", "jednostka", "poziom"]) wymagaj(s[k] === undefined || napis(s[k]), `pole źródła ${k}`);
  }
  wymagaj(Array.isArray(p.tabele) && p.tabele.length >= 1 && p.tabele.length <= 20, "lista tabel (1–20)");
  const tabele = new Set<string>();
  let wiersze = 0, komorki = 0;
  for (const t of p.tabele) {
    wymagaj(obiekt(t) && napis(t.id) && t.id.length > 0 && napis(t.tytul), "identyfikator i tytuł tabeli");
    wymagaj(!tabele.has(t.id), "powtórzone ID tabeli"); tabele.add(t.id);
    wymagaj(["odczytana", "przeliczona"].includes(t.rodzaj) && t.kompletne === true, "rodzaj lub kompletność tabeli");
    wymagaj(napisy(t.kolumny) && t.kolumny.length <= 100 && new Set(t.kolumny).size === t.kolumny.length, "kolumny tabeli");
    wymagaj(Array.isArray(t.wiersze) && t.wiersze.every(obiekt) && (t.kolumny.length > 0 || t.wiersze.length === 0), "wiersze tabeli");
    wiersze += t.wiersze.length; komorki += t.wiersze.length * t.kolumny.length;
    wymagaj(wiersze <= 5000 && komorki <= 200000, "maks. 5000 wierszy łącznie i 200 tys. komórek");
    wymagaj(napisy(t.zrodla) && t.zrodla.length > 0 && t.zrodla.every((id: string) => zrodla.has(id)) && napisy(t.uwagi), "powiązania tabeli ze źródłami");
    if (!maPlan) wymagaj(t.rodzaj === "odczytana", "tabela przeliczona wymaga planu i zatwierdzenia");
  }
}

export function pakietDanychJSON(pakiet: PakietDanych): string {
  sprawdzPakietDanych(pakiet);
  const json = JSON.stringify(pakiet);
  if (strToU8(json).byteLength > LIMIT_DANYCH) throw Error("Pakiet danych przekracza limit 1 MiB; zawęź odczyt lub plan. Wyniku nie ucięto.");
  return json;
}

/** Walidacja pliku nie pobiera źródeł ani nie potwierdza autentyczności zapisanej deklaracji. */
export function wczytajPakietDanych(json: string): PakietDanych {
  wymagaj(typeof json === "string" && strToU8(json).byteLength <= LIMIT_DANYCH, "plik przekracza 1 MiB");
  let p: unknown;
  try { p = JSON.parse(json); } catch { throw Error("Plik nie zawiera poprawnego JSON pakietu danych."); }
  sprawdzPakietDanych(p);
  return p;
}

export const nazwaPakietuDanych = (pakiet: PakietDanych): string => `${nazwaPliku(pakiet.tytul)}-dane.zip`;

export function pakietDanychZIP(pakiet: PakietDanych): Uint8Array {
  const json = pakietDanychJSON(pakiet);
  const pochodzenie = { format: pakiet.format, wersja: pakiet.wersja, tytul: pakiet.tytul, utworzono: pakiet.utworzono, odczyt: pakiet.odczyt,
    tabele: pakiet.tabele.map(({ wiersze, ...t }) => ({ ...t, liczba_wierszy: wiersze.length })), zrodla: pakiet.zrodla, metody: pakiet.metody,
    ograniczenia: pakiet.ograniczenia, ...(pakiet.plan ? { plan: pakiet.plan, id_planu: pakiet.id_planu, zatwierdzenie: pakiet.zatwierdzenie } : {}) };
  const pliki: Record<string, Uint8Array> = {
    "dane.json": strToU8(json),
    "pochodzenie.json": strToU8(JSON.stringify(pochodzenie)),
    "README.txt": strToU8(`Lajkonektor — dane do własnej analizy\n\nPakiet powstał przez ponowione pobranie danych lub odczyt zaufanej migawki. Nie zakłada tożsamości z wcześniejszą odpowiedzią. Czas pobrania nie jest datą stanu danych.\n\nCSV zawierają wszystkie odczytane i przeliczone tabele, bez geometrii prezentacyjnej. Kodowanie UTF-8 z BOM, separator średnik, przecinek dziesiętny. Teksty przypominające formuły mają ochronny apostrof. Oryginalne wartości oraz null pozostają w dane.json.\n\npochodzenie.json zawiera źródła, argumenty, daty, definicje, jednostki, metody i ograniczenia. Pakiet nie zawiera pełnego raportu ani interpretacji modelu. Jeśli zapisano zatwierdzenie planu, jest to deklaracja z rozmowy, nie uwierzytelniony dowód zgody.\n`),
  };
  pakiet.tabele.forEach((t, i) => { pliki[`tabele/${String(i + 1).padStart(3, "0")}-${nazwaPliku(t.id)}.csv`] = strToU8(tabelaCSV(t)); });
  return zipSync(pliki, { level: 6 });
}

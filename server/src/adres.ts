import { MSIP, arcgisQuery } from "./sources.ts";

const ADRESY = `${MSIP}/Pobieranie/Adresy/MapServer/0`;

// Warstwa rozróżnia diakrytyki ("Lojasiewicza" nie znajdzie "Łojasiewicza"), a użytkownicy często je pomijają,
// więc litery mogące mieć polski wariant zamieniamy na wieloznacznik `_`. Nadmiar dopasowań zawęża numer budynku.
export function streetPattern(raw: string): string {
  return raw
    .trim()
    .replace(/^(ul\.?|ulica|al\.?|aleja|pl\.?|plac|os\.?|osiedle)\s+/i, "")
    .replace(/[%'_]/g, "")
    .toUpperCase()
    .replace(/[ACELNOSZĄĆĘŁŃÓŚŹŻ]/g, "_");
}

export async function addressToPoint(opts: { ulica: string; numer: string; kod_pocztowy?: string }) {
  const pat = streetPattern(opts.ulica);
  const num = opts.numer.trim().toUpperCase().replace(/'/g, "");
  if (pat.length < 2 || !num) throw new Error("Podaj nazwę ulicy (min. 2 znaki) i numer budynku");
  let where = `UPPER(nazwa_ulicy) LIKE '%${pat}%' AND UPPER(numer_adresowy) = '${num}'`;
  if (opts.kod_pocztowy) where += ` AND kod_pocztowy = '${opts.kod_pocztowy.trim().replace(/'/g, "")}'`;
  const r = await arcgisQuery(ADRESY, {
    where,
    outFields: "nazwa_ulicy,numer_adresowy,kod_pocztowy,nazwa_dzielnicy",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "10",
  });
  const kandydaci = (r.features ?? []).map((f: any) => ({
    ulica: f.attributes.nazwa_ulicy,
    numer: f.attributes.numer_adresowy,
    kod_pocztowy: f.attributes.kod_pocztowy,
    dzielnica: f.attributes.nazwa_dzielnicy,
    lat: f.geometry?.y,
    lon: f.geometry?.x,
  }));
  return {
    status: kandydaci.length ? "poprawna" : "pusta",
    wymaga_wyboru: false,
    kompletne: !r.exceededTransferLimit,
    zrodlo: "MSIP Kraków, Pobieranie/Adresy (punkty adresowe)",
    uwaga:
      kandydaci.length === 0
        ? "Nie znaleziono adresu. Numer musi być dokładny (np. 11A, 4/2); sprawdź pisownię ulicy."
        : kandydaci.length > 1
          ? `Kilka dopasowań; przyjęto pierwsze: ${kandydaci[0].ulica} ${kandydaci[0].numer}, ${kandydaci[0].kod_pocztowy} (${kandydaci[0].dzielnica}). Podaj w odpowiedzi, który adres przyjęto.`
          : "Współrzędne WGS84 punktu adresowego; użyj lat/lon w innych narzędziach.",
    liczba: kandydaci.length,
    kandydaci,
  };
}

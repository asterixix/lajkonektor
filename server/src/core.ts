// Logika narzędzi bez zależności od SDK MCP (łatwa do testowania).
import { MSIP, arcgisQuery, odGet } from "./sources.ts";

const PARKI = {
  miejskie: "/opendata-srodowisko-parki-miejskie/v1/parki-miejskie-powierzchnia",
  kieszonkowe: "/opendata-srodowisko-parki-kieszonkowe/v1/parki-kieszonkowe-powierzchnia",
} as const;

export type ParkRodzaj = keyof typeof PARKI;

export async function listParks(opts: { rodzaj: ParkRodzaj; dzielnica?: string }) {
  const json = await odGet(PARKI[opts.rodzaj]);
  let rows: Record<string, unknown>[] = json.value ?? [];
  const d = opts.dzielnica?.toLowerCase();
  if (d) rows = rows.filter((r) => String(r.Dzielnica ?? "").toLowerCase().includes(d));
  return {
    zrodlo: `Otwarte Dane Miasta Krakowa, API OD-Srodowisko-Parki (${opts.rodzaj})`,
    uwaga: "Tabela nie zawiera geometrii parków (tylko nazwa, typ, dzielnica, powierzchnia w ha).",
    liczba: rows.length,
    parki: rows,
  };
}

// Warstwy 1-3 to ta sama treść w różnych skalach; zbieramy z wszystkich i usuwamy duplikaty.
const MPZP_LAYERS = [1, 2, 3];

export async function mpzpAtPoint(lat: number, lon: number) {
  const params = {
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "nazwa_mpzp,oznaczenie,rodzaj_ozn,opis_oznac,www,data_ob",
    returnGeometry: "false",
  };
  const results = await Promise.all(
    MPZP_LAYERS.map((i) => arcgisQuery(`${MSIP}/Planowanie/BP_MPZP/MapServer/${i}`, params)),
  );
  const seen = new Set<string>();
  const plany: Record<string, unknown>[] = [];
  for (const r of results) {
    for (const f of r.features ?? []) {
      const a = f.attributes;
      const key = `${a.nazwa_mpzp}|${a.oznaczenie}`;
      if (!seen.has(key)) {
        seen.add(key);
        plany.push(a);
      }
    }
  }
  return {
    zrodlo: "MSIP Kraków, Planowanie/BP_MPZP (przeznaczenia miejscowych planów)",
    uwaga: "Brak wyniku oznacza brak obowiązującego MPZP w tym punkcie (może obowiązywać studium lub decyzja WZ).",
    punkt: { lat, lon },
    liczba: plany.length,
    przeznaczenia: plany,
  };
}

const HEX = `${MSIP}/Demografia/Elud_Hex100/MapServer/1`;

export async function populationWithin(lat: number, lon: number, promienM: number) {
  // Warstwa ma wiele snapshotów w czasie, więc najpierw bierzemy najnowszą datę.
  // (statystyka max po całej warstwie wywala serwer, więc sortowanie z limitem 1)
  const maxQ = await arcgisQuery(HEX, {
    where: "1=1",
    outFields: "na_dzien_txt",
    orderByFields: "na_dzien DESC",
    resultRecordCount: "1",
    returnGeometry: "false",
  });
  const maxDate: string | undefined = maxQ.features?.[0]?.attributes?.na_dzien_txt;
  if (!maxDate) throw new Error("Brak snapshotów w warstwie Elud_Hex100");
  const sumQ = await arcgisQuery(HEX, {
    where: `na_dzien_txt = '${maxDate}'`,
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(promienM),
    units: "esriSRUnit_Meter",
    outStatistics: JSON.stringify([
      { statisticType: "sum", onStatisticField: "r_ogolem", outStatisticFieldName: "suma" },
      { statisticType: "count", onStatisticField: "grid_id", outStatisticFieldName: "heksy" },
    ]),
  });
  const a = sumQ.features?.[0]?.attributes ?? {};
  return {
    zrodlo: "MSIP Kraków, Demografia/Elud_Hex100 (zameldowania stałe, siatka heksagonów 100 m)",
    uwaga: "To liczba osób zameldowanych na pobyt stały, nie faktyczna liczba mieszkańców.",
    snapshot: maxDate,
    punkt: { lat, lon },
    promien_m: promienM,
    zameldowani: a.suma ?? 0,
    liczba_heksagonow: a.heksy ?? 0,
  };
}

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
    zrodlo: "MSIP Kraków, Pobieranie/Adresy (punkty adresowe)",
    uwaga:
      kandydaci.length === 0
        ? "Nie znaleziono adresu. Numer musi być dokładny (np. 11A, 4/2); sprawdź pisownię ulicy."
        : kandydaci.length > 1
          ? "Kilka dopasowań (np. ta sama ulica w różnych dzielnicach): wybierz po kodzie pocztowym lub dzielnicy."
          : "Współrzędne WGS84 punktu adresowego; użyj lat/lon w innych narzędziach.",
    liczba: kandydaci.length,
    kandydaci,
  };
}

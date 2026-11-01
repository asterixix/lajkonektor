// Cache obejmuje testy źródeł, nigdy metadane bieżącego żądania.
import { zCache, MSIP, arcgisQuery } from "./sources.ts";
import { WERSJA } from "./wersja.ts";
// Nazwa jest dla ludzi (strona /health), host zostaje dla klientów i diagnozy 522.
const CELE: [string, string][] = [
  ["Otwarte Dane Krakowa (UMK)", "https://api.um.krakow.pl/opendata-srodowisko-parki-miejskie/v1/metadata"],
  ["MSIP Kraków (mapy i rejestry)", "https://msip3.um.krakow.pl/server/rest/services?f=json"],
  ["GUS Bank Danych Lokalnych", "https://bdl.stat.gov.pl/api/v1/subjects?format=json&page-size=1"],
  ["ZTP Kraków, rozkłady i pojazdy na żywo", "https://gtfs.ztp.krakow.pl/"],
  ["Rozkłady kolejowe (PKP PLK przez mkuran.pl)", "https://mkuran.pl/gtfs/"],
  ["OpenStreetMap: wyszukiwanie miejsc (Nominatim)", "https://nominatim.openstreetmap.org/status?format=json"],
  ["OpenStreetMap: dojścia piesze (OSRM)", "https://routing.openstreetmap.de/"],
];
// Usługę planu ogólnego (Planowanie/BP_Projekt_planu_ogolnego) MSIP wycofał w X 2026, więc jej nie sprawdzamy.
const WARSTWY: [string, string][] = [
  ["MSIP: punkty adresowe", "Pobieranie/Adresy/MapServer/0"],
  ["MSIP: działki", "Pobieranie/Dzialki/MapServer/0"],
  ["MSIP: plany miejscowe", "Planowanie/BP_MPZP/MapServer/3"],
];
const UA = `lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)`;

export async function testyZrodel(): Promise<{ testy: { nazwa: string; host: string; status?: number; blad?: string; ms: number }[]; sprawdzono: string }> {
  return zCache("status-zrodel-v3", 60, async () => {
    const testy = await Promise.all([
      ...CELE.map(async ([nazwa, u]) => {
        const t0 = Date.now();
        const host = new URL(u).host;
        try {
          const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
          await r.body?.cancel().catch(() => {});
          return { nazwa, host, status: r.status, ms: Date.now() - t0 };
        } catch (e) {
          return { nazwa, host, blad: (e as Error).message, ms: Date.now() - t0 };
        }
      }),
      ...WARSTWY.map(async ([nazwa, warstwa]) => {
        const t0 = Date.now();
        try {
          const r = await arcgisQuery(`${MSIP}/${warstwa}`, { where: "1=1", returnCountOnly: "true" });
          return { nazwa, host: `MSIP: ${warstwa}`, status: Number.isFinite(r.count) ? 200 : 502, ms: Date.now() - t0 };
        } catch { return { nazwa, host: `MSIP: ${warstwa}`, blad: "Zapytanie do warstwy nie powiodło się.", ms: Date.now() - t0 }; }
      }),
    ]);
    return { testy, sprawdzono: new Date().toISOString() };
  });
}

export async function statusZrodel(cf: { colo?: string; country?: string } | undefined) {
  const zrodla = await testyZrodel();
  return {
    worker: { colo: cf?.colo ?? null, kraj: cf?.country ?? null },
    uwaga: "status 200 = źródło dostępne z tego miejsca; 522/timeout = serwer źródła nie odpowiada na połączenia z tego regionu.",
    ...zrodla,
  };
}

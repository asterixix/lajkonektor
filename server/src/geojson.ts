// Eksport całej warstwy MSIP do GeoJSON (RFC 7946, WGS84) do pracy w GIS: pełna geometria źródła, bez upraszczania z kart.
// Adres warstwy bierzemy wyłącznie z katalogu (nie od użytkownika), więc trasa nie pobiera dowolnych URL-i.
// Strony idą strumieniem, żeby duża warstwa nie musiała mieścić się w pamięci Workera.
import katalog from "../data/katalog.json" with { type: "json" };
import { WERSJA } from "./wersja.ts";

export const LIMIT_OBIEKTOW = 50_000;
const UA = `lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)`;
interface Pozycja { id: string; zrodlo: string; url?: string; tytul?: string; geometria?: string; pola?: string[]; maxRecordCount?: number }

const blad = (status: number, komunikat: string) =>
  new Response(JSON.stringify({ blad: komunikat }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export function warstwaGIS(id: string): Pozycja | undefined {
  const p = (katalog.pozycje as Pozycja[]).find((x) => x.id === id);
  return p && p.zrodlo === "msip" && p.geometria && p.url ? p : undefined;
}

async function arcgis(url: string, fetchFn: typeof fetch): Promise<any> {
  const r = await fetchFn(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`MSIP HTTP ${r.status}`);
  const j: any = await r.json();
  // ArcGIS zgłasza błąd w treści odpowiedzi HTTP 200.
  if (j?.error) throw new Error(`ArcGIS: ${j.error.message ?? "błąd zapytania"}`);
  return j;
}

export async function eksportGeoJSON(id: string, o: { fetchFn?: typeof fetch; strona?: number; limit?: number } = {}): Promise<Response> {
  const fetchFn = o.fetchFn ?? fetch, limit = o.limit ?? LIMIT_OBIEKTOW;
  const p = warstwaGIS(id);
  if (!p) return blad(404, "To nie jest warstwa mapy MSIP z katalogu. Eksport GIS obsługuje tylko warstwy z geometrią.");
  const baza = `${p.url}/query`;
  let razem: number;
  try { razem = Number((await arcgis(`${baza}?where=1%3D1&returnCountOnly=true&f=json`, fetchFn)).count); }
  catch { return blad(502, "Źródło MSIP nie odpowiedziało. Spróbuj ponownie za chwilę."); }
  if (!Number.isInteger(razem) || razem < 0) return blad(502, "Źródło MSIP zwróciło niepoprawną liczbę obiektów.");
  if (razem > limit) return blad(413, `Warstwa ma ${razem} obiektów, więcej niż limit pobrania (${limit}). Dodaj w GIS adres usługi ArcGIS REST: ${p.url}`);

  const oid = (p.pola ?? []).find((x) => x.endsWith(":OID"))?.split(":")[0] ?? "objectid";
  const strona = Math.min(o.strona ?? p.maxRecordCount ?? 1000, 2000);
  const kodek = new TextEncoder();
  const naglowek = { type: "FeatureCollection", name: p.tytul ?? p.id, lajkonektor: { zbior: p.id, zrodlo: "MSIP Kraków (ArcGIS REST)", usluga: p.url, pobrano: new Date().toISOString(), obiektow: razem, uwaga: "Pełna geometria źródła w WGS84 (EPSG:4326). Czas pobrania nie jest datą stanu danych." } };
  let offset = 0, pierwszy = true;
  const strumien = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(kodek.encode(JSON.stringify(naglowek).slice(0, -1) + ',"features":[')); },
    async pull(c) {
      try {
        if (offset >= razem) { c.enqueue(kodek.encode("]}")); c.close(); return; }
        const q = new URLSearchParams({ where: "1=1", outFields: "*", outSR: "4326", f: "geojson", orderByFields: oid, resultOffset: String(offset), resultRecordCount: String(strona) });
        const cechy: unknown[] = (await arcgis(`${baza}?${q}`, fetchFn)).features ?? [];
        // Pusta strona przed końcem znaczy, że warstwa zmieniła się w trakcie albo stronicowanie zawiodło; nie oddajemy niepełnego pliku jako całości.
        if (!cechy.length) throw new Error(`Pobrano ${offset} z ${razem} obiektów; przerwano, żeby nie zapisać niepełnej warstwy.`);
        c.enqueue(kodek.encode((pierwszy ? "" : ",") + cechy.map((x) => JSON.stringify(x)).join(",")));
        pierwszy = false;
        offset += cechy.length;
      } catch (e) { c.error(e); }
    },
  });
  const plik = (p.tytul ?? p.id).split(" / ").pop()!.normalize("NFD").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "warstwa";
  return new Response(strumien, { headers: { "content-type": "application/geo+json; charset=utf-8", "content-disposition": `attachment; filename="${plik}.geojson"`, "cache-control": "no-store" } });
}

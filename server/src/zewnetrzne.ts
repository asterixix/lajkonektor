// Źródła spoza miasta: GUS BDL (makro, demografia, rynek pracy) i dane.gov.pl (zbiory instytucji publicznych).
import { getJson } from "./sources.ts";

const BDL = "https://bdl.stat.gov.pl/api/v1";
const JEDNOSTKI: Record<string, string> = {
  powiat: "011212161000", // Powiat m. Kraków
  gmina: "011212161011", // Kraków (gmina)
  podregion: "011212100000", // Podregion miasto Kraków
};

const bdlUrl = (path: string, extra: Record<string, string | string[]> = {}) => {
  const p = new URLSearchParams({ lang: "pl", format: "json" });
  for (const [k, v] of Object.entries(extra)) for (const x of [v].flat()) p.append(k, x);
  return `${BDL}${path}?${p}`;
};

export async function bdlSzukaj(nazwa: string, limit: number) {
  const j = await getJson(bdlUrl("/variables/search", { name: nazwa, "page-size": "100" }));
  // level >= 5 = dane dostępne co najmniej na poziomie powiatu, więc także dla Krakowa.
  const zmienne = (j.results ?? []).filter((v: any) => v.level >= 5).slice(0, limit).map((v: any) => ({
    id: v.id, temat: v.subjectId,
    nazwa: [v.n1, v.n2, v.n3, v.n4].filter(Boolean).join(" | "),
    jednostka_miary: v.measureUnitName,
  }));
  return {
    zrodlo: "GUS, Bank Danych Lokalnych (BDL)",
    uwaga: "Wiele zmiennych ma tę samą nazwę dla różnych okresów (np. kwartałów); sprawdź pole 'nazwa' i użyj bdl_dane z kilkoma id.",
    razem_w_bdl: j.totalRecords, zwrocono: zmienne.length, zmienne,
  };
}

export async function bdlDane(opts: { zmienne: number[]; jednostka: string; lata?: number[] }) {
  const unit = JEDNOSTKI[opts.jednostka] ?? opts.jednostka;
  const [dane, ...info] = await Promise.all([
    getJson(bdlUrl(`/data/by-unit/${unit}`, { "var-id": opts.zmienne.map(String), ...(opts.lata?.length ? { year: opts.lata.map(String) } : {}) })),
    ...opts.zmienne.map((id) => getJson(bdlUrl(`/variables/${id}`)).catch(() => ({ id }))),
  ]);
  const opis = new Map<number, any>(info.map((v: any) => [v.id, v]));
  const wiersze = (dane.results ?? []).flatMap((r: any) => {
    const v = opis.get(r.id) ?? {};
    const nazwa = [v.n1, v.n2, v.n3, v.n4].filter(Boolean).join(" | ");
    return (r.values ?? []).map((x: any) => ({ zmienna_id: r.id, nazwa, jednostka_miary: v.measureUnitName, rok: Number(x.year), wartosc: x.val }));
  });
  return {
    zrodlo: "GUS, Bank Danych Lokalnych (BDL)",
    jednostka: dane.unitName ?? unit, jednostka_id: unit,
    uwaga: wiersze.length ? "Brak wartości w danym roku oznacza brak publikacji dla tej jednostki." : "Brak danych dla podanych zmiennych/lat (sprawdź bdl_szukaj).",
    liczba: wiersze.length, wiersze,
  };
}

const JSONAPI = { headers: { accept: "application/vnd.api+json" } };

export async function daneGovSzukaj(q: string, limit: number) {
  const res = await fetch(`https://api.dane.gov.pl/1.4/datasets?${new URLSearchParams({ q, per_page: String(limit), sort: "-modified" })}`, {
    ...JSONAPI, signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`dane.gov.pl HTTP ${res.status}`);
  const j: any = await res.json();
  const strip = (s: unknown) => String(s ?? "").replace(/<\/?mark>/g, "");
  return {
    zrodlo: "dane.gov.pl (Portal Danych Otwartych)",
    razem: j.meta?.count ?? null,
    zbiory: (j.data ?? []).map((d: any) => ({
      id: d.id, tytul: strip(d.attributes?.title), opis: strip(d.attributes?.notes).slice(0, 240),
      formaty: d.attributes?.formats, url: `https://dane.gov.pl/pl/dataset/${d.id}`,
      slowa_kluczowe: (d.attributes?.keywords ?? []).slice(0, 6),
    })),
  };
}

export async function daneGovZasoby(datasetId: string) {
  const res = await fetch(`https://api.dane.gov.pl/1.4/datasets/${encodeURIComponent(datasetId)}/resources?per_page=50`, { ...JSONAPI, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`dane.gov.pl HTTP ${res.status}`);
  const j: any = await res.json();
  return {
    zrodlo: "dane.gov.pl (Portal Danych Otwartych)", zbior: datasetId,
    zasoby: (j.data ?? []).map((r: any) => ({ id: r.id, tytul: r.attributes?.title, format: r.attributes?.format, link: r.attributes?.download_url ?? r.attributes?.link })),
  };
}

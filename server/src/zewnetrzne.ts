// Źródła spoza miasta: GUS BDL (makro, demografia, rynek pracy) i dane.gov.pl (zbiory instytucji publicznych).
import { getJson, zCache } from "./sources.ts";

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

// Nazwa tematu BDL nosi okres danych („…(dane miesięczne)”), więc bez niej zmienne o tym samym n1 są nierozróżnialne.
// `.catch()` stoi PO zCache: inaczej pusty wynik błędu zostałby zapisany w cache na 24 h.
async function tematyBdl(ids: (string | undefined)[]): Promise<Map<string, string>> {
  return new Map(await Promise.all([...new Set(ids.filter(Boolean) as string[])].map(
    async (id) => [id, (await zCache(`bdl/temat/${id}`, 86400, () => getJson(bdlUrl(`/subjects/${id}`))).catch(() => ({}))).name ?? ""] as [string, string])));
}

export async function bdlSzukaj(nazwa: string, limit: number) {
  const wyszukaj = (fraza: string) => zCache(`bdl/szukaj/${fraza}`, 86400, () => getJson(bdlUrl("/variables/search", { name: fraza, "page-size": "100" })));
  const j = await wyszukaj(nazwa);
  // Szerokie hasło często stawia na początku wynik ankietowy BAEL z jednym rokiem.
  // Dla Krakowa dołóż rozłączne pojęciowo, lokalne wskaźniki rejestrowane, żeby model
  // mógł sprawdzić właściwy szereg bez zgadywania kolejnej frazy wyszukiwania.
  const bezrobocie = /stopa\s+bezroboc/i.test(nazwa) && !/rejestrowan|bael/i.test(nazwa);
  // Stan ludności ma w BDL zmienną nazwaną samym „ogółem” (temat P2137), więc „ludność ogółem” nic nie znajduje,
  // a „ludność” daje wodociągi i kanalizację. Dla pytań o liczbę ludności dokładamy sumy tego tematu, zaczynając od całości.
  const ludnosc = /ludno|mieszka[nń]c/i.test(nazwa) && !/wodoci|kanaliz|gaz|oczyszcz|aktywn|bael|bezrob|pracuj/i.test(nazwa);
  const dodatkowe = bezrobocie ? await wyszukaj("stopa bezrobocia rejestrowanego").catch(() => ({ results: [] }))
    : ludnosc ? await zCache("bdl/temat-zmienne/P2137", 86400, () => getJson(bdlUrl("/variables", { "subject-id": "P2137", "page-size": "100" })))
      .then((r: any) => ({ results: (r.results ?? []).filter((v: any) => v.n2 === "ogółem").sort((a: any, b: any) => Number(b.n1 === "ogółem") - Number(a.n1 === "ogółem")) })).catch(() => ({ results: [] }))
    : { results: [] };
  // level >= 5 = dane dostępne co najmniej na poziomie powiatu, więc także dla Krakowa.
  const unikalne = new Map<number, any>();
  for (const v of [...(dodatkowe.results ?? []), ...(j.results ?? [])]) if (v.level >= 5 && !unikalne.has(v.id)) unikalne.set(v.id, v);
  const znalezione = [...unikalne.values()].slice(0, limit);
  const tematy = await tematyBdl(znalezione.map((v: any) => v.subjectId));
  const zmienne = znalezione.map((v: any) => ({
    id: v.id, temat: tematy.get(v.subjectId) || undefined,
    nazwa: [v.n1, v.n2, v.n3, v.n4].filter(Boolean).join(" | "),
    jednostka_miary: v.measureUnitName,
  }));
  return {
    zrodlo: "GUS, Bank Danych Lokalnych (BDL)",
    uwaga: bezrobocie
      ? "Wyniki obejmują też dokładne dopasowanie „stopa bezrobocia rejestrowanego”. Sprawdź temat i nazwę: stopa BAEL, stopa rejestrowana i liczba bezrobotnych na ofertę pracy to różne miary. Osobne zmienne miesięczne pozwalają porównać ten sam miesiąc w kolejnych latach."
      : ludnosc
      ? "Na początku wyników są sumy z tematu stanu ludności wg grup wieku i płci (GUS, stan na 31 XII): „ogółem | ogółem” to cała ludność, kolejne to grupy wieku. Pozostałe trafienia sprawdź po temacie, bo „ludność korzystająca z…” to inne miary."
      : "Temat mówi o okresie danych (np. „dane miesięczne”); dla pytania o rok bierz zmienne z tematu rocznym.",
    razem_w_bdl: j.totalRecords, zwrocono: zmienne.length, zmienne,
  };
}

export async function bdlDane(opts: { zmienne: number[]; jednostka: string; lata?: number[] }) {
  const unit = JEDNOSTKI[opts.jednostka] ?? opts.jednostka;
  const [dane, ...info] = await Promise.all([
    getJson(bdlUrl(`/data/by-unit/${unit}`, { "var-id": opts.zmienne.map(String), ...(opts.lata?.length ? { year: opts.lata.map(String) } : {}) })),
    ...opts.zmienne.map((id) => zCache(`bdl/zmienna/${id}`, 86400, () => getJson(bdlUrl(`/variables/${id}`))).catch(() => ({ id }))),
  ]);
  const opis = new Map<number, any>(info.map((v: any) => [v.id, v]));
  // n1 bywa samym „ogółem”; temat (np. „Stopa bezrobocia rejestrowanego (dane miesięczne)”) mówi, co faktycznie jest mierzone.
  const tematy = await tematyBdl(info.map((v: any) => v.subjectId));
  const wiersze = (dane.results ?? []).flatMap((r: any) => {
    const v = opis.get(r.id) ?? {};
    const nazwa = [v.n1, v.n2, v.n3, v.n4].filter(Boolean).join(" | ");
    return (r.values ?? []).map((x: any) => ({ zmienna_id: r.id, temat: tematy.get(v.subjectId) || undefined, nazwa, jednostka_miary: v.measureUnitName, rok: Number(x.year), wartosc: x.val }));
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
  const j: any = await zCache(`dane-gov/lista/${q}/${limit}`, 900, async () => {
    const res = await fetch(`https://api.dane.gov.pl/1.4/datasets?${new URLSearchParams({ q, per_page: String(limit), sort: "-modified" })}`, {
      ...JSONAPI, signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`dane.gov.pl HTTP ${res.status}`);
    return res.json();
  });
  // Opisy na dane.gov.pl to HTML (<p>, <span style>, &nbsp;), a tytuły mają podświetlenie <mark>.
  const strip = (s: unknown) => String(s ?? "").replace(/<\/?mark>/g, "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
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
  const j: any = await zCache(`dane-gov/zasoby/${datasetId}`, 900, async () => {
    const res = await fetch(`https://api.dane.gov.pl/1.4/datasets/${encodeURIComponent(datasetId)}/resources?per_page=50`, { ...JSONAPI, signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`dane.gov.pl HTTP ${res.status}`);
    return res.json();
  });
  return {
    zrodlo: "dane.gov.pl (Portal Danych Otwartych)", zbior: datasetId,
    zasoby: (j.data ?? []).map((r: any) => ({ id: r.id, tytul: r.attributes?.title, format: r.attributes?.format, link: r.attributes?.download_url ?? r.attributes?.link })),
  };
}

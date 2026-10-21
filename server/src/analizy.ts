// Narzędzia analityczne: wskaźniki w przekroju dzielnic (mapa, ranking, profil), dostępność usług i standardy planu ogólnego,
// najbliższe obiekty oraz statystyka. Zwracają `bloki` zgodne z kartą „zlozony”, więc jedna karta pokazuje metryki, mapę i wykresy.
import { arcgisQuery, zCache } from "./sources.ts";
import { znajdz } from "./katalog.ts";
import { centroid, metry, odlegloscDoObszaru, ringAreaHa, type Ring } from "./geo.ts";
import { daneZapytaj } from "./zapytanie.ts";
import * as A from "./analityka.ts";
import { PARKI_OSM_ID, parkiRings, pokrycieParkow } from "./parki.ts";

const PALETA = ["#E3EDF7", "#AFCDE9", "#6AA2D4", "#0063AF", "#00366B"];
const f = (n: number | null | undefined, m = 1) => (n == null || !Number.isFinite(n) ? "–" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: m }).format(n));

// ───────────── warstwy punktowe MSIP (z cache)

export interface Obiekt { nazwa: string; adres?: string; lat: number; lon: number; atrybuty: Record<string, unknown> }
const pierwszy = (a: Record<string, any>, klucze: string[]) => { for (const k of klucze) if (typeof a[k] === "string" && a[k].trim()) return a[k].trim() as string; return undefined; };

export async function obiektyWarstwy(id: string, where = "1=1"): Promise<Obiekt[]> {
  const p = znajdz(id);
  if (!p?.url) throw new Error(`Nieznana warstwa ${id}`);
  return zCache(`obiekty|${id}|${where}`, 3600, async () => {
    const r = await arcgisQuery(p.url, { where, outFields: "*", returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultRecordCount: "2000" });
    const out: Obiekt[] = [];
    for (const ft of r.features ?? []) {
      const g = ft.geometry; if (!g) continue;
      const c = g.rings ? centroid(g.rings as Ring[]) : g.x != null ? { lat: g.y, lon: g.x } : null;
      if (!c) continue;
      const a = ft.attributes ?? {};
      out.push({
        nazwa: pierwszy(a, ["nazwa", "nz_pl", "nazwa_obiektu", "name", "nazwa_jedn"]) ?? pierwszy(a, Object.keys(a)) ?? "bez nazwy",
        adres: pierwszy(a, ["adres", "ulica", "nz_ul"]) ? [pierwszy(a, ["adres", "ulica", "nz_ul"]), a.nr_bud ?? a.nr_budynku].filter(Boolean).join(" ") : undefined,
        lat: c.lat, lon: c.lon, atrybuty: a,
      });
    }
    return out;
  });
}

/** Rodzaje obiektów dostępne w narzędziach `obiekty_w_poblizu` i `dostepnosc` (warstwy MSIP; promień domyślny w metrach). */
export const RODZAJE: Record<string, { nazwa: string; warstwy: [string, string?][]; promien_m: number }> = {
  apteka: { nazwa: "Apteki", warstwy: [["msip:Zdrowie/Placowki_sluzby_zdrowia/6"]], promien_m: 1000 },
  apteka_calodobowa: { nazwa: "Apteki całodobowe", warstwy: [["msip:Zdrowie/Placowki_sluzby_zdrowia/5"]], promien_m: 3000 },
  szpital: { nazwa: "Szpitale", warstwy: [["msip:Zdrowie/Placowki_sluzby_zdrowia/2"]], promien_m: 3000 },
  sor: { nazwa: "Szpitalne oddziały ratunkowe", warstwy: [["msip:Zdrowie/Placowki_sluzby_zdrowia/0"]], promien_m: 5000 },
  podstawowa_opieka_zdrowotna: { nazwa: "Podstawowa opieka zdrowotna", warstwy: [["msip:Zdrowie/Placowki_sluzby_zdrowia/20"]], promien_m: 1000 },
  zlobek: { nazwa: "Żłobki", warstwy: [["msip:Zdrowie/Zlobki_Kluby_rodzicow/0"], ["msip:Zdrowie/Zlobki_Kluby_rodzicow/1"]], promien_m: 1000 },
  przedszkole: { nazwa: "Przedszkola", warstwy: [["msip:Edukacja/EK_PLACOWKI/1", "typ_pl = 'Przedszkole'"]], promien_m: 1000 },
  szkola_podstawowa: { nazwa: "Szkoły podstawowe", warstwy: [["msip:Edukacja/EK_PLACOWKI/1", "typ_pl = 'Szkoła podstawowa' AND kat_uczn <> 'Dorośli'"]], promien_m: 1500 },
  biblioteka: { nazwa: "Biblioteki", warstwy: [["msip:Kultura/Miejskie_Instytucje_Kultury/0"]], promien_m: 1500 },
  muzeum: { nazwa: "Muzea", warstwy: [["msip:Kultura/Miejskie_Instytucje_Kultury/3"]], promien_m: 3000 },
  teatr: { nazwa: "Teatry", warstwy: [["msip:Kultura/Miejskie_Instytucje_Kultury/5"]], promien_m: 3000 },
  toaleta_publiczna: { nazwa: "Toalety publiczne", warstwy: [["msip:G_komunalna/ZIW_WC/0"]], promien_m: 1000 },
  pitnik: { nazwa: "Pitniki", warstwy: [["msip:G_komunalna/GK_Pitniki/0"]], promien_m: 1000 },
  parkomat: { nazwa: "Parkomaty", warstwy: [["msip:Transport/ZDMK_Parkomaty/4"]], promien_m: 500 },
  park_and_ride: { nazwa: "Parkingi Park and Ride", warstwy: [["msip:Transport/ZTP_Komunikacja_Miejska_i_Rowerowa/1"]], promien_m: 5000 },
  posterunek_policji: { nazwa: "Posterunki i siedziby policji", warstwy: [["msip:Bezpieczenstwo/OC_Bezpieczeństwo/0"]], promien_m: 3000 },
  stacja_kolejowa: { nazwa: "Stacje kolejowe", warstwy: [["msip:Transport/Koleje_malopolskie_Stacje_kolejowe/0"]], promien_m: 3000 },
  punkt_obslugi_urzedu: { nazwa: "Punkty obsługi mieszkańców Urzędu Miasta", warstwy: [["msip:Administracja/BIP_Budynki_UMK/1"]], promien_m: 3000 },
};
export const NAZWY_RODZAJOW = Object.keys(RODZAJE) as [string, ...string[]];

export async function obiektyRodzaju(rodzaj: string): Promise<Obiekt[]> {
  const r = RODZAJE[rodzaj];
  if (!r) throw new Error(`Nieznany rodzaj '${rodzaj}'. Dostępne: ${NAZWY_RODZAJOW.join(", ")}`);
  return (await Promise.all(r.warstwy.map(([id, where]) => obiektyWarstwy(id, where)))).flat();
}

// ───────────── blok: mapa koropletowa dzielnic

function mapaDzielnic(wartosci: Map<number, number>, jednostka: string, k = 5) {
  const w = [...wartosci.values()];
  const g = A.granice(w, Math.min(k, Math.max(2, new Set(w).size)), "kwantyle");
  const klasy = g.length - 1;
  const kolor = (v: number) => PALETA[Math.round((A.klasaWartosci(v, g) / Math.max(1, klasy - 1)) * (PALETA.length - 1))];
  return {
    typ: "mapa", tytul: `Wartość wg dzielnic (${jednostka})`, kontury: A.DZIELNICE.filter((d) => wartosci.has(d.id)).map((d) => ({ etykieta: `${d.rzym} ${d.nazwa}: ${f(wartosci.get(d.id), 1)}`, pierscien: d.rings[0], pierscienie: d.rings, kolor: kolor(wartosci.get(d.id)!), wartosc: wartosci.get(d.id) })),
    legenda: Array.from({ length: klasy }, (_, i) => ({ kolor: PALETA[Math.round((i / Math.max(1, klasy - 1)) * (PALETA.length - 1))], tekst: `${f(g[i], 1)} – ${f(g[i + 1], 1)}` })),
  };
}

// ───────────── wskaźniki dzielnic

type Mapa = Map<number, number>;
const pustaMapa = (): Mapa => new Map(A.DZIELNICE.map((d) => [d.id, 0]));
const zLudnosci = (pole: A.PoleLudnosci): Mapa => new Map(A.DZIELNICE.map((d) => [d.id, A.ludnosc(d.id, pole) ?? 0]));
async function liczPunkty(rodzaj: string): Promise<Mapa> {
  const m = pustaMapa();
  for (const o of await obiektyRodzaju(rodzaj)) { const d = A.dzielnicaPunktu(o.lat, o.lon); if (d) m.set(d, (m.get(d) ?? 0) + 1); }
  return m;
}
const rzymskie = (t: string) => [...t.toUpperCase().matchAll(/\b(XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/g)].map((x) => A.RZYMSKIE.indexOf(x[1]) + 1);

export interface Wskaznik { opis: string; jednostka: string; zrodlo: string; licz: () => Promise<Mapa>; uwaga?: string }
export const WSKAZNIKI: Record<string, Wskaznik> = {
  ludnosc: { opis: "Ludność (zameldowani na pobyt stały)", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_ogolem") },
  dzieci_0_2: { opis: "Dzieci 0–2 lata", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_0_2") },
  dzieci_3_6: { opis: "Dzieci 3–6 lat", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_3_6") },
  dzieci_7_14: { opis: "Dzieci 7–14 lat", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_7_14") },
  mlodziez_15_18: { opis: "Młodzież 15–18 lat", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_15_18") },
  seniorzy_80_plus: { opis: "Osoby w wieku 80+", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, licz: async () => zLudnosci("r_po_80") },
  seniorzy_60_plus: { opis: "Osoby w wieku 60/65+ (grupa 60/65–79 i 80+)", jednostka: "osób", zrodlo: A.ZRODLO_LUDNOSCI, uwaga: "Grupa wiekowa w danych miasta to „60/65–79” (kobiety od 60, mężczyźni od 65).", licz: async () => new Map(A.DZIELNICE.map((d) => [d.id, (A.ludnosc(d.id, "r_60_65_79") ?? 0) + (A.ludnosc(d.id, "r_po_80") ?? 0)])) },
  parki_ha: {
    opis: "Powierzchnia parków miejskich", jednostka: "ha", zrodlo: "Otwarte Dane UMK, parki-miejskie-powierzchnia",
    uwaga: "Park obejmujący kilka dzielnic dzielimy po równo między nie.",
    licz: async () => {
      const m = pustaMapa();
      const r = await daneZapytaj({ id: "od:OD-SrodowiskoParkiMiejskie/parki-miejskie-powierzchnia", limit: 200 });
      for (const w of r.wiersze as any[]) { const ids = rzymskie(String(w.Dzielnica)); for (const id of ids) m.set(id, (m.get(id) ?? 0) + Number(w.Powierzchnia_ha) / ids.length); }
      return m;
    },
  },
  zlobki: { opis: "Żłobki publiczne i niepubliczne", jednostka: "placówek", zrodlo: "MSIP, Zdrowie/Zlobki_Kluby_rodzicow", licz: () => liczPunkty("zlobek") },
  przedszkola: { opis: "Przedszkola", jednostka: "placówek", zrodlo: "MSIP, Edukacja/EK_PLACOWKI", licz: () => liczPunkty("przedszkole") },
  szkoly_podstawowe: { opis: "Szkoły podstawowe", jednostka: "placówek", zrodlo: "MSIP, Edukacja/EK_PLACOWKI", licz: () => liczPunkty("szkola_podstawowa") },
  apteki: { opis: "Apteki", jednostka: "placówek", zrodlo: "MSIP, Zdrowie/Placowki_sluzby_zdrowia", licz: () => liczPunkty("apteka") },
  biblioteki: { opis: "Biblioteki", jednostka: "placówek", zrodlo: "MSIP, Kultura/Miejskie_Instytucje_Kultury", licz: () => liczPunkty("biblioteka") },
  cena_m2: {
    opis: "Mediana ceny m² lokali mieszkalnych (rynek pierwotny, bieżący rok)", jednostka: "zł/m²", zrodlo: "MSIP, Rejestr cen nieruchomości (Rc_Lokale_m_Rp_Mapa/12)",
    uwaga: "Mediana transakcji z rejestru; w dzielnicach z kilkunastoma transakcjami wartość jest niepewna.",
    licz: async () => {
      const m = new Map<number, number>();
      const r = await daneZapytaj({ id: "msip:Rejestr_cen/Rc_Lokale_m_Rp_Mapa/12", limit: 100 });
      for (const w of r.wiersze as any[]) { const id = A.dzielnicaId(w.nazwa_dz); if (id && w.med_wart_m2) m.set(id, w.med_wart_m2); }
      return m;
    },
  },
};
export const NAZWY_WSKAZNIKOW = Object.keys(WSKAZNIKI) as [string, ...string[]];
const NIE_SUMOWAC = new Set(["cena_m2"]);

export interface ArgsWskaznik { licznik?: string; mianownik?: string; dzielnica?: string; klasy?: number }

export async function wskaznikDzielnic(a: ArgsWskaznik) {
  const dz = a.dzielnica ? A.dzielnicaId(a.dzielnica) : null;
  if (a.dzielnica && !dz) throw new Error(`Nie rozpoznano dzielnicy '${a.dzielnica}'. Użyj numeru 1–18 lub nazwy, np. 'VIII Dębniki'.`);
  if (!a.licznik) return profilDzielnicy(dz);
  const L = WSKAZNIKI[a.licznik]; if (!L) throw new Error(`Nieznany wskaźnik '${a.licznik}'. Dostępne: ${NAZWY_WSKAZNIKOW.join(", ")}`);
  const M = a.mianownik ? WSKAZNIKI[a.mianownik] : undefined;
  if (a.mianownik && !M) throw new Error(`Nieznany mianownik '${a.mianownik}'. Dostępne: ${NAZWY_WSKAZNIKOW.join(", ")}`);
  const [lm, mm] = await Promise.all([L.licz(), M?.licz()]);
  // ha na mieszkańca to m² na mieszkańca; liczności placówek na 10 tys. mieszkańców, a względem grup wieku na 1000 osób
  const mnoznik = !M || NIE_SUMOWAC.has(a.licznik) ? 1 : a.licznik === "parki_ha" ? 10_000 : a.mianownik === "ludnosc" ? 10_000 : 1000;
  const jednostka = !M ? L.jednostka : a.licznik === "parki_ha" && a.mianownik === "ludnosc" ? "m² na mieszkańca" : `${L.jednostka} na ${mnoznik === 10_000 ? "10 tys." : "1000"} (${M.opis.toLowerCase()})`;
  const wiersze = A.DZIELNICE.map((d) => {
    const l = lm.get(d.id) ?? 0, m = mm?.get(d.id);
    return { id: d.id, nazwa: `${d.rzym} ${d.nazwa}`, licznik: l, mianownik: m ?? null, wartosc: M ? (m ? (l / m) * mnoznik : null) : l };
  });
  const ważne = wiersze.filter((w) => w.wartosc != null) as (typeof wiersze[number] & { wartosc: number })[];
  const razemL = NIE_SUMOWAC.has(a.licznik) ? null : suma(wiersze.map((w) => w.licznik)), razemM = mm && !NIE_SUMOWAC.has(a.licznik) ? suma(wiersze.map((w) => w.mianownik ?? 0)) : null;
  const miasto = M ? (razemL != null && razemM ? (razemL / razemM) * mnoznik : null) : razemL;
  const m = A.miejsca(ważne.map((w) => w.wartosc));
  ważne.forEach((w, i) => { (w as any).miejsce = m[i]; });
  const stat = A.opis(ważne.map((w) => w.wartosc)), nier = A.nierownosc(ważne.map((w) => w.wartosc));
  const sort = ważne.slice().sort((x, y) => y.wartosc - x.wartosc);
  const uwagi = [L.uwaga, M?.uwaga, "Ludność = zameldowani na pobyt stały; centrum ma zwykle więcej osób niezameldowanych (studenci, najem), więc wskaźniki na mieszkańca bywają tam zawyżone.", a.licznik === "parki_ha" ? `Do powierzchni parków używamy rejestru OD (78 parków); geometria OSM jest tylko dla ${pokrycieParkow().z} z 78.` : ""].filter(Boolean) as string[];
  const tytul = `${L.opis}${M ? ` / ${M.opis.toLowerCase()}` : ""} wg dzielnic`;
  const bloki: any[] = [
    { typ: "metryki", pozycje: [{ etykieta: "Najwyżej", wartosc: `${f(sort[0].wartosc, 1)}`, opis: sort[0].nazwa }, { etykieta: "Najniżej", wartosc: `${f(sort[sort.length - 1].wartosc, 1)}`, opis: sort[sort.length - 1].nazwa }, { etykieta: "Mediana", wartosc: f(stat.mediana, 1) }, ...(miasto != null ? [{ etykieta: "Miasto", wartosc: f(miasto, 1), opis: "suma/średnia ważona" }] : [])] },
    mapaDzielnic(new Map(ważne.map((w) => [w.id, w.wartosc])), jednostka, a.klasy ?? 5),
    { typ: "wykres", rodzaj: "slupki", tytul: `Ranking dzielnic (${jednostka})`, punkty: sort.map((w) => ({ x: w.nazwa, y: +w.wartosc.toFixed(2) })) },
    { typ: "tabela", kolumny: ["Miejsce", "Dzielnica", "Licznik", ...(M ? ["Mianownik"] : []), "Wartość"], wiersze: sort.map((w) => [(w as any).miejsce, w.nazwa, +w.licznik.toFixed(2), ...(M ? [w.mianownik] : []), +w.wartosc.toFixed(2)]), razem: sort.length },
    { typ: "tekst", wariant: "informacja", tekst: `Nierówność między dzielnicami: Gini ${f(nier.gini, 2)}; najwyższa wartość to ${f(stat.max / (stat.min || NaN), 1)}× najniższa. ${uwagi.join(" ")}` },
  ];
  if (dz) bloki.unshift({ typ: "tekst", wariant: "informacja", tekst: `Dzielnica ${A.dzielnica(dz).rzym} ${A.dzielnica(dz).nazwa}: ${f(wiersze.find((w) => w.id === dz)?.wartosc, 1)} ${jednostka}, miejsce ${(ważne.find((w) => w.id === dz) as any)?.miejsce ?? "–"} z 18.` });
  return { tytul, podtytul: `Wskaźnik w przekroju 18 dzielnic Krakowa`, zrodlo: [...new Set([L.zrodlo, M?.zrodlo].filter(Boolean))].join("; "), bloki, wskaznik: { licznik: a.licznik, mianownik: a.mianownik ?? null, jednostka, miasto, statystyka: stat, nierownosc: { gini: nier.gini, udzial_top10: nier.udzial_top10 }, dzielnice: sort.map(({ id, nazwa, licznik, mianownik, wartosc }) => ({ id, nazwa, licznik, mianownik, wartosc, miejsce: (sort.find((s) => s.id === id) as any).miejsce })) }, uwagi };
}
const suma = (x: number[]) => x.reduce((a, b) => a + b, 0);

/** Profil dzielnicy (albo całego miasta): zestaw wskaźników z porównaniem do miasta i miejscem wśród 18 dzielnic. */
async function profilDzielnicy(dz: number | null) {
  const DEF: { nazwa: string; licz: string; mian?: string; jednostka: string; mnoznik: number }[] = [
    { nazwa: "Ludność", licz: "ludnosc", jednostka: "osób", mnoznik: 1 },
    { nazwa: "Dzieci 0–2 na 100 mieszkańców", licz: "dzieci_0_2", mian: "ludnosc", jednostka: "", mnoznik: 100 },
    { nazwa: "Osoby 80+ na 100 mieszkańców", licz: "seniorzy_80_plus", mian: "ludnosc", jednostka: "", mnoznik: 100 },
    { nazwa: "Parki miejskie (m² na mieszkańca)", licz: "parki_ha", mian: "ludnosc", jednostka: "m²", mnoznik: 10_000 },
    { nazwa: "Przedszkola na 1000 dzieci 3–6", licz: "przedszkola", mian: "dzieci_3_6", jednostka: "", mnoznik: 1000 },
    { nazwa: "Żłobki na 1000 dzieci 0–2", licz: "zlobki", mian: "dzieci_0_2", jednostka: "", mnoznik: 1000 },
    { nazwa: "Apteki na 10 tys. mieszkańców", licz: "apteki", mian: "ludnosc", jednostka: "", mnoznik: 10_000 },
    { nazwa: "Mediana ceny m² (rynek pierwotny)", licz: "cena_m2", jednostka: "zł/m²", mnoznik: 1 },
  ];
  const ids = [...new Set(DEF.flatMap((d) => [d.licz, d.mian].filter(Boolean) as string[]))];
  const mapy = Object.fromEntries(await Promise.all(ids.map(async (i) => [i, await WSKAZNIKI[i].licz()] as const)));
  const wiersze = DEF.map((d) => {
    const w = (id: number) => { const l = mapy[d.licz].get(id); if (d.mian) { const m = mapy[d.mian].get(id); return l != null && m ? (l / m) * d.mnoznik : null; } return l ?? null; };
    const wszystkie = A.DZIELNICE.map((x) => ({ id: x.id, v: w(x.id) })).filter((x): x is { id: number; v: number } => x.v != null);
    const miasto = NIE_SUMOWAC.has(d.licz) ? A.opis(wszystkie.map((x) => x.v)).mediana : d.mian ? (suma([...mapy[d.licz].values()]) / suma([...mapy[d.mian].values()])) * d.mnoznik : suma([...mapy[d.licz].values()]);
    const mj = dz ? A.miejsca(wszystkie.map((x) => x.v))[wszystkie.findIndex((x) => x.id === dz)] : null;
    return { nazwa: d.nazwa, wartosc: dz ? w(dz) : miasto, miasto, miejsce: mj ?? null, jednostka: d.jednostka };
  });
  const nazwa = dz ? `Dzielnica ${A.dzielnica(dz).rzym} ${A.dzielnica(dz).nazwa}` : "Kraków";
  const bloki: any[] = [
    { typ: "metryki", pozycje: wiersze.slice(0, 4).map((w) => ({ etykieta: w.nazwa, wartosc: `${f(w.wartosc, w.wartosc != null && w.wartosc < 100 ? 1 : 0)}${w.jednostka ? " " + w.jednostka : ""}`, opis: dz ? `miasto: ${f(w.miasto, 1)}${w.miejsce ? `, miejsce ${w.miejsce}/18` : ""}` : undefined })) },
    ...(dz ? [{ typ: "mapa", tytul: nazwa, kontury: [{ etykieta: nazwa, pierscien: A.dzielnica(dz).rings[0], pierscienie: A.dzielnica(dz).rings, kolor: PALETA[3] }] }] : [mapaDzielnic(mapy.ludnosc, "osób")]),
    { typ: "tabela", tytul: `Wskaźniki: ${nazwa}${dz ? " na tle miasta" : ""}`, kolumny: dz ? ["Wskaźnik", "Dzielnica", "Miasto", "Miejsce z 18"] : ["Wskaźnik", "Miasto"], wiersze: wiersze.map((w) => (dz ? [w.nazwa, w.wartosc == null ? null : +w.wartosc.toFixed(2), +(w.miasto ?? NaN).toFixed(2), w.miejsce] : [w.nazwa, w.miasto == null ? null : +w.miasto.toFixed(2)])), razem: wiersze.length },
    { typ: "tekst", wariant: "informacja", tekst: `Ludność to zameldowani na pobyt stały (stan ${A.OSTATNIA_DATA}). Miejsce 1 oznacza największą wartość, nie „najlepszą”. Cena m² to mediana z rejestru cen (rynek pierwotny).` },
  ];
  return { tytul: `Profil: ${nazwa}`, podtytul: "Wskaźniki dzielnicy na tle Krakowa", zrodlo: "MSIP (Demografia, Zdrowie, Edukacja, Rejestr cen), Otwarte Dane UMK (parki)", bloki, profil: wiersze };
}

// ───────────── dostępność i standardy planu ogólnego

export interface ArgsDostepnosc { miejsce?: { lat: number; lon: number; etykieta?: string }; usluga?: string; promien_m?: number }

export async function dostepnosc(a: ArgsDostepnosc) {
  return a.miejsce ? dostepnoscPunktu(a.miejsce) : a.usluga && a.usluga !== "standardy" ? dostepnoscUslugi(a.usluga, a.promien_m) : dostepnoscStandardow();
}

const STD_OPIS = "Standardy z projektu planu ogólnego Krakowa (art. 13f ustawy o planowaniu): odległość dojścia od działki do szkoły podstawowej i do zieleni publicznej ≥ 3 ha oraz ≥ 15 ha, osobno dla obszarów intensywnych i ekstensywnych.";

function oceniHex() {
  let razem = 0, sz = 0, z3 = 0, z15 = 0, wszystkie = 0, bez = 0;
  const per = new Map<number, { razem: number; sz: number; z3: number; z15: number; wszystkie: number }>(A.DZIELNICE.map((d) => [d.id, { razem: 0, sz: 0, z3: 0, z15: 0, wszystkie: 0 }]));
  const bialeSzkola: A.Hex[] = [];
  for (const h of A.hexy()) {
    const s = A.STANDARDY[h.strefa as 1 | 2];
    if (!s) { bez += h.lud; continue; }
    const ok1 = h.mSzkola * A.WSPOLCZYNNIK_DROGI <= s.szkola_m, ok2 = h.mZiel3 * A.WSPOLCZYNNIK_DROGI <= s.zielen3_m, ok3 = h.mZiel15 * A.WSPOLCZYNNIK_DROGI <= s.zielen15_m;
    const p = per.get(h.dz) ?? per.set(h.dz, { razem: 0, sz: 0, z3: 0, z15: 0, wszystkie: 0 }).get(h.dz)!;
    razem += h.lud; p.razem += h.lud;
    if (ok1) { sz += h.lud; p.sz += h.lud; } else bialeSzkola.push(h);
    if (ok2) { z3 += h.lud; p.z3 += h.lud; }
    if (ok3) { z15 += h.lud; p.z15 += h.lud; }
    if (ok1 && ok2 && ok3) { wszystkie += h.lud; p.wszystkie += h.lud; }
  }
  return { razem, sz, z3, z15, wszystkie, bez, per, bialeSzkola };
}

async function dostepnoscStandardow() {
  const o = oceniHex();
  const proc = (x: number) => (o.razem ? (x / o.razem) * 100 : 0);
  const wg = A.DZIELNICE.map((d) => { const p = o.per.get(d.id)!; return { id: d.id, nazwa: `${d.rzym} ${d.nazwa}`, razem: p.razem, szkola: p.razem ? (p.sz / p.razem) * 100 : 0, zielen3: p.razem ? (p.z3 / p.razem) * 100 : 0, zielen15: p.razem ? (p.z15 / p.razem) * 100 : 0, wszystkie: p.razem ? (p.wszystkie / p.razem) * 100 : 0 }; });
  const wgSort = wg.slice().sort((x, y) => x.wszystkie - y.wszystkie);
  const biale = o.bialeSzkola.sort((x, y) => y.lud - x.lud).slice(0, 12).map((h) => ({ lat: h.lat, lon: h.lon, etykieta: `${h.lud} os.` }));
  const bloki: any[] = [
    { typ: "metryki", pozycje: [{ etykieta: "Spełnia wszystkie trzy", wartosc: `${f(proc(o.wszystkie), 1)}%`, opis: `${f(o.wszystkie, 0)} z ${f(o.razem, 0)} mieszkańców` }, { etykieta: "Szkoła podstawowa", wartosc: `${f(proc(o.sz), 1)}%` }, { etykieta: "Zieleń ≥ 3 ha", wartosc: `${f(proc(o.z3), 1)}%` }, { etykieta: "Zieleń ≥ 15 ha", wartosc: `${f(proc(o.z15), 1)}%` }] },
    mapaDzielnic(new Map(wg.map((d) => [d.id, d.wszystkie])), "% mieszkańców spełniających wszystkie standardy"),
    { typ: "wykres", rodzaj: "slupki", tytul: "% mieszkańców spełniających wszystkie standardy wg dzielnic", jednostka: "%", punkty: wgSort.map((d) => ({ x: d.nazwa, y: +d.wszystkie.toFixed(1) })) },
    { typ: "tabela", kolumny: ["Dzielnica", "Mieszkańców", "Szkoła %", "Zieleń ≥3 ha %", "Zieleń ≥15 ha %", "Wszystkie %"], wiersze: wgSort.map((d) => [d.nazwa, d.razem, +d.szkola.toFixed(1), +d.zielen3.toFixed(1), +d.zielen15.toFixed(1), +d.wszystkie.toFixed(1)]), razem: 18 },
    { typ: "mapa", tytul: "Największe skupiska mieszkańców bez dostępu do szkoły podstawowej wg standardu", punkty: biale },
    { typ: "tekst", wariant: "uwaga", tekst: `${STD_OPIS} Odległość to linia prosta × ${A.WSPOLCZYNNIK_DROGI} (przybliżenie drogi dojścia), liczona od środka sześciokąta siatki 100 m, a nie od działki. Zieleń = strefy zieleni i rekreacji oraz otwarte z planu ogólnego (nie rejestr parków). Mieszkańcy poza strefami standardów (${f(o.bez, 0)} os.) pominięci. Ludność = zameldowani na pobyt stały, stan ${A.HEX_STAN}.` },
  ];
  return { tytul: "Standardy dostępności infrastruktury społecznej w Krakowie", podtytul: "Ilu mieszkańców spełnia standardy projektu planu ogólnego", zrodlo: A.ZRODLO_HEX, bloki, standardy: { razem: o.razem, procent: { wszystkie: proc(o.wszystkie), szkola: proc(o.sz), zielen3: proc(o.z3), zielen15: proc(o.z15) }, wg_dzielnic: wg, progi: A.STANDARDY, wspolczynnik_drogi: A.WSPOLCZYNNIK_DROGI } };
}

async function dostepnoscUslugi(usluga: string, promien?: number) {
  const r = RODZAJE[usluga]; if (!r) throw new Error(`Nieznana usługa '${usluga}'. Dostępne: standardy, ${NAZWY_RODZAJOW.join(", ")}`);
  const p = promien ?? r.promien_m;
  const obiekty = await obiektyRodzaju(usluga);
  const w = A.pokrycie(obiekty, p);
  const wg = w.wg_dzielnic.slice().sort((x, y) => x.udzial - y.udzial);
  const bloki: any[] = [
    { typ: "metryki", pozycje: [{ etykieta: `Mieszkańcy w zasięgu ${f(p, 0)} m`, wartosc: `${f(w.udzial * 100, 1)}%`, opis: `${f(w.w_zasiegu, 0)} z ${f(w.razem, 0)}` }, { etykieta: r.nazwa, wartosc: f(obiekty.length, 0), opis: "obiektów w katalogu" }, { etykieta: "Bez dostępu", wartosc: f(w.razem - w.w_zasiegu, 0), opis: "osób" }] },
    mapaDzielnic(new Map(w.wg_dzielnic.map((d) => [d.id, d.udzial * 100])), "% mieszkańców w zasięgu"),
    { typ: "mapa", tytul: `${r.nazwa} i największe białe plamy`, punkty: [...obiekty.slice(0, 250).map((o) => ({ lat: o.lat, lon: o.lon, etykieta: obiekty.length <= 12 ? o.nazwa : undefined })), ...w.biale_plamy.map((b) => ({ lat: b.lat, lon: b.lon, etykieta: `brak: ${f(b.bez_dostepu, 0)} os.` }))] },
    { typ: "tabela", tytul: "Pokrycie wg dzielnic", kolumny: ["Dzielnica", "Mieszkańców", "W zasięgu", "Udział %"], wiersze: wg.map((d) => [`${A.dzielnica(d.id).rzym} ${d.nazwa}`, d.razem, d.w_zasiegu, +(d.udzial * 100).toFixed(1)]), razem: 18 },
    { typ: "tabela", tytul: "Białe plamy: największe skupiska mieszkańców bez dostępu", kolumny: ["Dzielnica", "Mieszkańców bez dostępu", "Najbliższy obiekt (m)", "Szerokość", "Długość"], wiersze: w.biale_plamy.map((b) => [b.dzielnica, b.bez_dostepu, b.najblizsza_m, b.lat, b.lon]), razem: w.biale_plamy.length },
    { typ: "tekst", wariant: "uwaga", tekst: `Zasięg to odległość w linii prostej ${f(p, 0)} m (droga pieszo bywa ok. ${A.WSPOLCZYNNIK_DROGI}× dłuższa), liczona od środków sześciokątów siatki 100 m. Lokalizacje z warstw MSIP, ludność = zameldowani na pobyt stały (${A.HEX_STAN}).` },
  ];
  return { tytul: `Dostępność: ${r.nazwa.toLowerCase()} w promieniu ${f(p, 0)} m`, podtytul: "Ludność w zasięgu usługi i białe plamy", zrodlo: `MSIP (${r.warstwy.map((x) => x[0].replace("msip:", "")).join(", ")}); ${A.ZRODLO_HEX}`, bloki, pokrycie: { ...w, usluga, obiektow: obiekty.length } };
}

async function dostepnoscPunktu(m: { lat: number; lon: number; etykieta?: string }) {
  const [strefa, szkoly, ziel] = await Promise.all([
    arcgisQuery(znajdz("msip:Planowanie/BP_Projekt_planu_ogolnego/2")!.url, { where: "1=1", outFields: "nazwa,odszkpod,odziel3,odziel15", returnGeometry: "false", geometry: JSON.stringify({ x: m.lon, y: m.lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects" }),
    obiektyRodzaju("szkola_podstawowa"),
    arcgisQuery(znajdz("msip:Planowanie/BP_Projekt_planu_ogolnego/3")!.url, { where: "symbol IN ('SN','SO')", outFields: "symbol,nazwa", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.0002", geometry: JSON.stringify({ x: m.lon, y: m.lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", distance: "3200", units: "esriSRUnit_Meter", geometryPrecision: "5", resultRecordCount: "400" }),
  ]);
  const z = strefa.features?.[0]?.attributes as { nazwa: string; odszkpod: number; odziel3: number; odziel15: number } | undefined;
  const sz = szkoly.map((o) => ({ o, d: metry(m.lat, m.lon, o.lat, o.lon) })).sort((x, y) => x.d - y.d)[0];
  const pol: { rings: Ring[]; ha: number; symbol: string }[] = (ziel.features ?? []).filter((ft: any) => ft.geometry?.rings).map((ft: any) => ({ rings: ft.geometry.rings as Ring[], ha: (ft.geometry.rings as Ring[]).reduce((s, r) => s + ringAreaHa(r), 0), symbol: ft.attributes.symbol as string }));
  const najbl = (min: number) => pol.filter((p) => p.ha >= min).map((p) => ({ p, d: odlegloscDoObszaru(m.lat, m.lon, p.rings) })).sort((x, y) => x.d - y.d)[0];
  const z3 = najbl(3), z15 = najbl(15);
  const droga = (d?: number) => (d == null ? null : Math.round(d * A.WSPOLCZYNNIK_DROGI));
  const krok = (nazwa: string, d: number | undefined, prog: number | undefined, opis: string) => ({ nazwa, najblizszy: opis, odleglosc_prosta_m: d == null ? null : Math.round(d), droga_szacunkowa_m: droga(d), standard_m: prog ?? null, spelnia: d == null || prog == null ? null : droga(d)! <= prog });
  const kroki = [krok("Szkoła podstawowa", sz?.d, z?.odszkpod, sz ? sz.o.nazwa : "brak"), krok("Zieleń publiczna ≥ 3 ha", z3?.d, z?.odziel3, z3 ? `${z3.p.symbol === "SO" ? "strefa otwarta" : "strefa zieleni i rekreacji"}, ${f(z3.p.ha, 1)} ha` : "brak w promieniu 3,2 km"), krok("Zieleń publiczna ≥ 15 ha", z15?.d, z?.odziel15, z15 ? `${f(z15.p.ha, 1)} ha` : "brak w promieniu 3,2 km")];
  const ok = kroki.filter((k) => k.spelnia === true).length, razem = kroki.filter((k) => k.spelnia != null).length;
  const bloki: any[] = [
    { typ: "metryki", pozycje: [{ etykieta: "Standardy spełnione", wartosc: razem ? `${ok} z ${razem}` : "brak danych", opis: z ? z.nazwa : "miejsce poza strefami standardów" }, ...kroki.map((k) => ({ etykieta: k.nazwa, wartosc: k.spelnia == null ? "–" : k.spelnia ? "tak" : "nie", opis: `${f(k.droga_szacunkowa_m, 0)} m (próg ${f(k.standard_m, 0)} m)` }))] },
    { typ: "mapa", tytul: m.etykieta ?? "Wskazane miejsce", punkty: [{ lat: m.lat, lon: m.lon, etykieta: "Tu" }, ...(sz ? [{ lat: sz.o.lat, lon: sz.o.lon, etykieta: sz.o.nazwa }] : [])], kontury: [...(z3 ? [{ etykieta: "zieleń ≥3 ha", pierscien: z3.p.rings[0], pierscienie: z3.p.rings }] : []), ...(z15 && z15 !== z3 ? [{ etykieta: "zieleń ≥15 ha", pierscien: z15.p.rings[0], pierscienie: z15.p.rings }] : [])] },
    { typ: "tabela", kolumny: ["Standard", "Najbliższy obiekt", "Linia prosta (m)", "Droga szac. (m)", "Próg (m)", "Spełnia"], wiersze: kroki.map((k) => [k.nazwa, k.najblizszy, k.odleglosc_prosta_m, k.droga_szacunkowa_m, k.standard_m, k.spelnia == null ? "brak danych" : k.spelnia ? "tak" : "nie"]), razem: 3 },
    { typ: "tekst", wariant: "uwaga", tekst: `${STD_OPIS} Droga dojścia = linia prosta × ${A.WSPOLCZYNNIK_DROGI}; zieleń z planu ogólnego (strefy SN, SO) liczona od granicy obszaru. Dla pewności rozstrzyga pomiar po sieci pieszej od działki.` },
  ];
  return { tytul: `Standardy dostępności: ${m.etykieta ?? `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`}`, podtytul: z ? `${z.nazwa} według planu ogólnego` : "Poza obszarami standardów planu ogólnego", zrodlo: "MSIP: projekt planu ogólnego (BP_Projekt_planu_ogolnego/2 i /3), Edukacja/EK_PLACOWKI", bloki, standardy: { strefa: z ?? null, kroki } };
}

// ───────────── najbliższe obiekty

export async function najblizszeObiekty(m: { lat: number; lon: number; etykieta?: string }, rodzaj: string, promien?: number, limit = 8) {
  const r = RODZAJE[rodzaj]; if (!r) throw new Error(`Nieznany rodzaj '${rodzaj}'. Dostępne: ${NAZWY_RODZAJOW.join(", ")}`);
  const p = promien ?? r.promien_m;
  const wszystkie = (await obiektyRodzaju(rodzaj)).map((o) => ({ o, d: metry(m.lat, m.lon, o.lat, o.lon) })).sort((x, y) => x.d - y.d);
  const wPromieniu = wszystkie.filter((x) => x.d <= p), wybrane = (wPromieniu.length ? wPromieniu : wszystkie.slice(0, 3)).slice(0, limit);
  const min = (d: number) => Math.max(1, Math.ceil((d * A.WSPOLCZYNNIK_DROGI) / 75));
  const lista = wybrane.map((x) => ({ nazwa: x.o.nazwa, adres: x.o.adres ?? null, odleglosc_prosta_m: Math.round(x.d), pieszo_min_szac: min(x.d), lat: x.o.lat, lon: x.o.lon }));
  const bloki: any[] = [
    { typ: "metryki", pozycje: [{ etykieta: "Najbliższy", wartosc: lista[0] ? `${lista[0].odleglosc_prosta_m} m` : "–", opis: lista[0]?.nazwa }, { etykieta: `W promieniu ${f(p, 0)} m`, wartosc: f(wPromieniu.length, 0) }, { etykieta: "Pieszo (szac.)", wartosc: lista[0] ? `${lista[0].pieszo_min_szac} min` : "–" }] },
    { typ: "mapa", tytul: `${r.nazwa} wokół: ${m.etykieta ?? "wskazanego miejsca"}`, punkty: [{ lat: m.lat, lon: m.lon, etykieta: "Tu" }, ...lista.map((l, i) => ({ lat: l.lat, lon: l.lon, etykieta: `${i + 1}. ${l.nazwa}` }))] },
    { typ: "tabela", kolumny: ["Obiekt", "Adres", "Odległość (m)", "Pieszo (min, szac.)"], wiersze: lista.map((l) => [l.nazwa, l.adres, l.odleglosc_prosta_m, l.pieszo_min_szac]), razem: lista.length },
    ...(wPromieniu.length ? [] : [{ typ: "tekst", wariant: "uwaga", tekst: `Brak obiektów w promieniu ${f(p, 0)} m, pokazano najbliższe trzy.` }]),
  ];
  return { tytul: `${r.nazwa} w pobliżu`, podtytul: m.etykieta, zrodlo: `MSIP (${r.warstwy.map((x) => x[0].replace("msip:", "")).join(", ")}); czas pieszo: linia prosta × ${A.WSPOLCZYNNIK_DROGI}, 4,5 km/h`, bloki, obiekty: lista };
}

// ───────────── statystyka

export interface ArgsStatystyka { operacja: "opis" | "korelacja" | "trend" | "wzrost" | "nierownosc" | "klasy" | "odstajace"; x: (number | null)[]; y?: (number | null)[]; etykiety?: (string | number)[]; nazwa_x?: string; nazwa_y?: string; klasy?: number; metoda?: "kwantyle" | "rowne" | "jenks"; lata?: number }

export function statystyka(a: ArgsStatystyka) {
  const x = a.x.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (x.length < 2) throw new Error("Potrzeba co najmniej 2 liczb w `x`.");
  const nx = a.nazwa_x ?? "x", ny = a.nazwa_y ?? "y";
  const bloki: any[] = [];
  let wynik: Record<string, unknown> = {}, tytul = "";
  switch (a.operacja) {
    case "opis": {
      const o = A.opis(x); wynik = { opis: o }; tytul = `Statystyka opisowa: ${nx}`;
      const g = A.granice(x, Math.min(10, Math.max(4, Math.round(Math.sqrt(x.length)))), "rowne");
      const licz = Array(g.length - 1).fill(0); x.forEach((v) => { licz[Math.min(licz.length - 1, A.klasaWartosci(v, g))]++; });
      bloki.push({ typ: "metryki", pozycje: [{ etykieta: "Liczba", wartosc: o.n }, { etykieta: "Średnia", wartosc: f(o.srednia, 2) }, { etykieta: "Mediana", wartosc: f(o.mediana, 2) }, { etykieta: "Odchylenie", wartosc: f(o.odchylenie, 2) }, { etykieta: "Min – maks", wartosc: `${f(o.min, 2)} – ${f(o.max, 2)}` }] },
        { typ: "wykres", rodzaj: "slupki", tytul: "Histogram", punkty: licz.map((c, i) => ({ x: `${f(g[i], 1)}–${f(g[i + 1], 1)}`, y: c })) },
        { typ: "tabela", kolumny: ["Miara", "Wartość"], wiersze: [["suma", o.suma], ["p10", o.p10], ["Q1", o.q1], ["mediana", o.mediana], ["Q3", o.q3], ["p90", o.p90], ["współczynnik zmienności", o.wspolczynnik_zmiennosci], ["skośność", o.skosnosc]].map(([k, v]) => [k, v == null ? null : +Number(v).toFixed(3)]), razem: 8 });
      break;
    }
    case "korelacja": {
      if (!a.y) throw new Error("Korelacja wymaga `y` tej samej długości co `x`.");
      const k = A.korelacja(a.x, a.y); wynik = { korelacja: k }; tytul = `Korelacja: ${nx} i ${ny}`;
      bloki.push({ typ: "metryki", pozycje: [{ etykieta: "Pearson r", wartosc: f(k.pearson, 3), opis: `p ≈ ${f(k.p_pearson, 4)}` }, { etykieta: "Spearman ρ", wartosc: f(k.spearman, 3), opis: `p ≈ ${f(k.p_spearman, 4)}` }, { etykieta: "Związek", wartosc: `${k.sila}, ${k.kierunek}` }, { etykieta: "R²", wartosc: f(k.r2, 3) }, { etykieta: "Par", wartosc: k.n }] },
        { typ: "tekst", wariant: "informacja", tekst: `Prosta regresji: ${ny} ≈ ${f(k.wyraz_wolny, 3)} + ${f(k.nachylenie, 3)} · ${nx}. Wartość p jest przybliżona i zakłada niezależność obserwacji (dzielnice sąsiadują ze sobą, więc ją zawyża). Korelacja nie dowodzi przyczynowości.` },
        { typ: "wykres", rodzaj: "punktowy", tytul: `${ny} względem ${nx}`, punkty: a.x.map((v, i) => ({ x: v, y: a.y![i], etykieta: a.etykiety?.[i] })).filter((p) => p.x != null && p.y != null), regresja: { a: k.nachylenie, b: k.wyraz_wolny } });
      break;
    }
    case "trend": {
      const t = A.trend(x); wynik = { trend: t }; tytul = `Trend: ${nx}`;
      const xs = a.etykiety?.length === a.x.length ? a.etykiety : x.map((_, i) => i + 1);
      bloki.push({ typ: "metryki", pozycje: [{ etykieta: "Trend (Mann-Kendall)", wartosc: t.kierunek, opis: `p ≈ ${f(t.p, 4)}` }, { etykieta: "Nachylenie Sena", wartosc: f(t.nachylenie_sena, 3), opis: "zmiana na okres" }, { etykieta: "Obserwacji", wartosc: t.n }] }, { typ: "wykres", rodzaj: "linia", tytul: nx, punkty: x.map((v, i) => ({ x: xs[i], y: v })) });
      break;
    }
    case "wzrost": {
      const lata = a.lata ?? x.length - 1, w = A.wzrost(x[0], x[x.length - 1], lata); wynik = { wzrost: { ...w, od: x[0], do: x[x.length - 1], lata } }; tytul = `Zmiana: ${nx}`;
      bloki.push({ typ: "metryki", pozycje: [{ etykieta: "Od", wartosc: f(x[0], 2) }, { etykieta: "Do", wartosc: f(x[x.length - 1], 2) }, { etykieta: "Zmiana", wartosc: `${f(w.zmiana, 2)} (${f(w.zmiana_proc, 1)}%)` }, { etykieta: "Średnio rocznie (CAGR)", wartosc: w.cagr_proc == null ? "–" : `${f(w.cagr_proc, 2)}%`, opis: `${lata} okresów` }] });
      break;
    }
    case "nierownosc": {
      const n = A.nierownosc(x); wynik = { nierownosc: { n: n.n, gini: n.gini, udzial_top10: n.udzial_top10 } }; tytul = `Nierówność rozkładu: ${nx}`;
      bloki.push({ typ: "metryki", pozycje: [{ etykieta: "Gini", wartosc: f(n.gini, 3), opis: "0 = równo, 1 = u jednej jednostki" }, { etykieta: "Udział top 10%", wartosc: `${f((n.udzial_top10 ?? NaN) * 100, 1)}%` }] }, { typ: "wykres", rodzaj: "linia", tytul: "Krzywa Lorenza (udział jednostek → udział sumy, %)", punkty: n.krzywa_lorenza.map((p) => ({ x: +(p.udzial_jednostek * 100).toFixed(1), y: +(p.udzial_sumy * 100).toFixed(1) })) });
      break;
    }
    case "klasy": {
      const k = a.klasy ?? 5, g = A.granice(x, k, a.metoda ?? "kwantyle"); const licz = Array(g.length - 1).fill(0); x.forEach((v) => licz[A.klasaWartosci(v, g)]++); wynik = { granice: g, liczebnosc: licz, metoda: a.metoda ?? "kwantyle" }; tytul = `Klasy (${a.metoda ?? "kwantyle"}): ${nx}`;
      bloki.push({ typ: "wykres", rodzaj: "slupki", tytul: "Liczba obserwacji w klasach", punkty: licz.map((c, i) => ({ x: `${f(g[i], 2)}–${f(g[i + 1], 2)}`, y: c })) });
      break;
    }
    case "odstajace": {
      const o = A.odstajace(x); wynik = { odstajace: o.map((p) => ({ ...p, etykieta: a.etykiety?.[p.i] })) }; tytul = `Wartości odstające: ${nx}`;
      bloki.push({ typ: "tekst", tekst: o.length ? `Odstające: ${o.map((p) => `${a.etykiety?.[p.i] ?? `#${p.i + 1}`} = ${f(p.wartosc, 2)} (z = ${f(p.z, 1)}, ${p.regula})`).join("; ")}` : "Brak wartości odstających według reguły z-score (|z| > 3) i IQR." });
      break;
    }
  }
  return { tytul, zrodlo: "obliczenia serwera Lajkonektor na przekazanych danych", bloki, ...wynik };
}

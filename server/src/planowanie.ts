// Narzędzie `planowanie_w_punkcie`: co obowiązuje i co wolno w danym miejscu (miejscowy plan, projekt planu ogólnego,
// obszary specjalne, działka). Wszystkie dane z MSIP Krakowa, zapytania punktowe wykonywane równolegle.
import { arcgisQuery } from "./sources.ts";
import { znajdz } from "./katalog.ts";
import { dzielnica, dzielnicaPunktu } from "./analityka.ts";
import type { Ring } from "./geo.ts";

const f = (n: number | null | undefined, m = 1) => (n == null || !Number.isFinite(n) ? "–" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: m }).format(n));

const WARSTWY: { id: string; nazwa: string; sekcja: "mpzp" | "inne" }[] = [
  { id: "msip:Planowanie/BP_MPZP/1", nazwa: "Miejscowy plan (skala do 1:1000)", sekcja: "mpzp" },
  { id: "msip:Planowanie/BP_MPZP/2", nazwa: "Miejscowy plan (skala 1:1000–1:2000)", sekcja: "mpzp" },
  { id: "msip:Planowanie/BP_MPZP/3", nazwa: "Miejscowy plan (skala od 1:2000)", sekcja: "mpzp" },
  { id: "msip:Planowanie/BP_STUDIUM_K1/0", nazwa: "Studium: kierunki zagospodarowania (K1)", sekcja: "inne" },
  { id: "msip:Planowanie/BP_Projekt_planu_ogolnego/0", nazwa: "Obszar zabudowy śródmiejskiej", sekcja: "inne" },
  { id: "msip:Planowanie/BP_Projekt_planu_ogolnego/1", nazwa: "Obszar uzupełnienia zabudowy", sekcja: "inne" },
  { id: "msip:Planowanie/BP_Projekt_planu_ogolnego/2", nazwa: "Obszar standardów dostępności infrastruktury", sekcja: "inne" },
  { id: "msip:Planowanie/PI_Rewitalizacja_od_2022/0", nazwa: "Podobszar rewitalizacji (od 2022)", sekcja: "inne" },
  { id: "msip:Planowanie/BP_UCHWALA_KRAJOBRAZOWA/2", nazwa: "Uchwała krajobrazowa: strefa", sekcja: "inne" },
  { id: "msip:Zabytki/Unesco/0", nazwa: "Obszar UNESCO", sekcja: "inne" },
  { id: "msip:Zabytki/Unesco/1", nazwa: "Strefa buforowa UNESCO", sekcja: "inne" },
  { id: "msip:Obszary/KD_Parki_Kulturowe/0", nazwa: "Park kulturowy", sekcja: "inne" },
];
const TECHNICZNE = /^(objectid|gdb_id|data_imp|data_akt|st_area|st_length|globalid|shape)/i;
const czyste = (a: Record<string, unknown>) => Object.fromEntries(Object.entries(a ?? {}).filter(([k, v]) => !TECHNICZNE.test(k) && v != null && String(v).trim() !== ""));
const lista = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).join("; ");

export async function planowanieWPunkcie(m: { lat: number; lon: number; etykieta?: string }) {
  const geometria = { geometry: JSON.stringify({ x: m.lon, y: m.lat, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects" };
  // null = warstwa niedostępna (inaczej niż pusta lista: „nie ma”)
  const pyt = async (id: string, extra: Record<string, string> = {}): Promise<any[] | null> => {
    const p = znajdz(id);
    if (!p?.url) return null;
    try { return (await arcgisQuery(p.url, { where: "1=1", outFields: "*", returnGeometry: "false", ...geometria, ...extra })).features ?? []; } catch { return null; }
  };
  const [ogolny, dzialka, ...inne] = await Promise.all([
    pyt("msip:Planowanie/BP_Projekt_planu_ogolnego/3"),
    pyt("msip:Pobieranie/Dzialki/0", { returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.00002", geometryPrecision: "6" }),
    ...WARSTWY.map((w) => pyt(w.id)),
  ]);
  const niedostepne: string[] = [];
  if (ogolny === null) niedostepne.push("Strefy planistyczne");
  const wyniki = WARSTWY.map((w, i) => { if (inne[i] === null) niedostepne.push(w.nazwa); return { ...w, wiersze: (inne[i] ?? []).map((ft: any) => czyste(ft.attributes)) }; });
  const strefa = ogolny?.[0] ? czyste(ogolny[0].attributes) : null;
  const mpzp: Record<string, any>[] = wyniki.filter((w) => w.sekcja === "mpzp").flatMap((w) => w.wiersze.map((r) => ({ ...r, skala: w.nazwa })));
  const standardy = wyniki.find((w) => w.id.endsWith("ogolnego/2"))?.wiersze[0] as { nazwa?: string } | undefined;
  const dzId = dzielnicaPunktu(m.lat, m.lon);
  const parcela = dzialka?.[0]?.geometry?.rings as Ring[] | undefined;
  const bloki: any[] = [
    { typ: "metryki", pozycje: [
      { etykieta: "Miejscowy plan", wartosc: mpzp.length ? "obowiązuje" : "brak", opis: mpzp[0]?.nazwa_mpzp as string | undefined },
      { etykieta: "Strefa planu ogólnego", wartosc: (strefa?.symbol as string) ?? "–", opis: strefa?.nazwa as string | undefined },
      ...(strefa ? [{ etykieta: "Intensywność / wysokość", wartosc: `${f(strefa.max_niz as number, 1)} / ${f(strefa.max_wz as number, 0)} m` }, { etykieta: "Zabudowa maks. / bio. czynna min.", wartosc: `${f(strefa.max_upz as number, 0)}% / ${f(strefa.min_upbc as number, 0)}%` }] : []),
    ] },
    { typ: "mapa", tytul: m.etykieta ?? "Wskazane miejsce", punkty: [{ lat: m.lat, lon: m.lon, etykieta: "Tu" }], ...(parcela ? { kontury: [{ etykieta: "działka", pierscien: parcela[0], pierscienie: parcela, kolor: "#AFCDE9" }] } : {}) },
    ...(strefa ? [{ typ: "tabela", tytul: "Projekt planu ogólnego Krakowa: strefa planistyczna", kolumny: ["Parametr", "Wartość"], wiersze: [["Strefa", `${strefa.symbol}: ${strefa.nazwa}`], ["Odmiana", (strefa.nazwaalter as string) ?? null], ["Przeznaczenie podstawowe", lista(strefa.profil_p)], ["Przeznaczenie dopuszczalne", lista(strefa.profil_d)], ["Maks. nadziemna intensywność zabudowy", (strefa.max_niz as number) ?? null], ["Maks. wysokość zabudowy (m)", (strefa.max_wz as number) ?? null], ["Maks. udział powierzchni zabudowy (%)", (strefa.max_upz as number) ?? null], ["Min. udział powierzchni biologicznie czynnej (%)", (strefa.min_upbc as number) ?? null]], razem: 8 }] : []),
    ...(mpzp.length
      ? [{ typ: "tabela", tytul: "Obowiązujące miejscowe plany zagospodarowania", kolumny: ["Plan", "Oznaczenie", "Przeznaczenie", "Opis", "Skala"], wiersze: mpzp.map((r) => [(r.nazwa_mpzp as string) ?? null, (r.oznaczenie as string) ?? null, (r.rodzaj_ozn as string) ?? null, (r.opis_oznac as string) ?? null, r.skala]), razem: mpzp.length }]
      : [{ typ: "tekst", wariant: "informacja", tekst: "W tym miejscu nie ma obowiązującego miejscowego planu zagospodarowania; zasady zabudowy wynikają z decyzji o warunkach zabudowy oraz (od wejścia w życie) z planu ogólnego." }]),
    ...(dzialka?.[0] ? [{ typ: "tabela", tytul: "Działka ewidencyjna", kolumny: ["Pole", "Wartość"], wiersze: Object.entries(czyste(dzialka[0].attributes)).slice(0, 8).map(([k, v]) => [k, v as string | number]), razem: 8 }] : []),
    { typ: "tabela", tytul: "Obszary specjalne i ograniczenia w tym miejscu", kolumny: ["Warstwa", "Wynik"], wiersze: wyniki.filter((w) => w.sekcja === "inne").map((w) => [w.nazwa, w.wiersze.length ? (w.id.endsWith("ogolnego/2") && standardy?.nazwa ? `tak: ${standardy.nazwa}` : `tak: ${Object.values(w.wiersze[0]).filter((v) => typeof v === "string").slice(0, 3).join(", ") || "tak"}`) : "nie"]), razem: wyniki.length },
    ...(niedostepne.length ? [{ typ: "tekst", wariant: "uwaga", tekst: `Nie udało się pobrać warstw: ${niedostepne.join(", ")}. Brak wpisu oznacza wtedy „nie sprawdzono”, nie „nie ma”.` }] : []),
    { typ: "tekst", wariant: "uwaga", tekst: "Dane informacyjne z MSIP, w tym projekt planu ogólnego (nie jest jeszcze uchwalony). Nie zastępują wypisu i wyrysu z planu ani decyzji o warunkach zabudowy; parametry strefy mogą się zmienić do uchwalenia." },
  ];
  return {
    tytul: `Co obowiązuje w tym miejscu: ${m.etykieta ?? `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`}`,
    podtytul: dzId ? `Dzielnica ${dzielnica(dzId).rzym} ${dzielnica(dzId).nazwa}` : undefined,
    zrodlo: "MSIP Kraków: BP_MPZP, BP_Projekt_planu_ogolnego, BP_STUDIUM_K1, PI_Rewitalizacja_od_2022, BP_UCHWALA_KRAJOBRAZOWA, Zabytki, Pobieranie/Dzialki",
    bloki,
    plan: { miejscowy_plan: mpzp, strefa_planu_ogolnego: strefa, obszar_standardow: standardy ?? null, dzialka: dzialka?.[0] ? czyste(dzialka[0].attributes) : null, obszary: wyniki.filter((w) => w.sekcja === "inne" && w.wiersze.length).map((w) => ({ warstwa: w.nazwa, dane: w.wiersze[0] })), niedostepne },
  };
}

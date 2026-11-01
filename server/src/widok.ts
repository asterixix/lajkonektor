import { BladDomeny } from "./bledy.ts";
// Narzędzie `widok`: model składa własną kartę z gotowych komponentów (tekst, metryki, tabela, wykres, mapa, lista, oś czasu),
// gdy odpowiedź nie mieści się w karcie pojedynczego narzędzia. Dane można podać wprost albo wskazać zapytanie (`z`),
// które serwer wykona sam: model nie przepisuje wtedy liczb, więc nie może ich przekręcić.
import { z } from "zod";

const komorka = z.union([z.string(), z.number(), z.null()]);
const punkt = z.object({ lat: z.number().min(49).max(51).describe("szerokość geograficzna WGS84, np. 50.06"), lon: z.number().min(19).max(21.5).describe("długość geograficzna WGS84, np. 19.94") });

const wiazanie = z
  .object({
    narzedzie: z.enum(["dane_zapytaj", "plik_odczyt", "bdl_dane"]),
    argumenty: z.record(z.string(), z.unknown()).describe("Dokładnie te argumenty, które podałbyś przy bezpośrednim wywołaniu tego narzędzia"),
  })
  .describe("Serwer sam pobierze dane tym narzędziem (bez przepisywania liczb przez model)");

const tytul = z.string().max(120).optional();

export const blok = z.discriminatedUnion("typ", [
  z.object({ typ: z.literal("tekst"), tekst: z.string().max(2000).describe("Akapity rozdzielaj pustą linią; bez Markdown"), wariant: z.enum(["zwykly", "uwaga", "informacja"]).optional() }),
  z.object({
    typ: z.literal("metryki"),
    pozycje: z.array(z.object({ etykieta: z.string().max(60), wartosc: z.union([z.string().max(40), z.number()]), opis: z.string().max(80).optional() })).min(1).max(6),
  }),
  z.object({
    typ: z.literal("tabela"), tytul,
    kolumny: z.array(z.string()).max(10).optional().describe("Nagłówki (przy `z`: wybór kolumn z wyniku)"),
    wiersze: z.array(z.array(komorka)).max(200).optional().describe("Wiersze zgodne z `kolumny`; pomiń, gdy podajesz `z`"),
    z: wiazanie.optional(), limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    typ: z.literal("wykres"), tytul, rodzaj: z.enum(["linia", "slupki"]), jednostka: z.string().max(20).optional(),
    punkty: z.array(z.object({ x: z.union([z.string(), z.number()]), y: z.number() })).max(200).optional(),
    z: wiazanie.optional(), kolumna_x: z.string().optional().describe("przy `z`: kolumna osi X (bdl_dane: domyślnie rok)"), kolumna_y: z.string().optional().describe("przy `z`: kolumna liczbowa osi Y (bdl_dane: domyślnie wartosc)"),
  }),
  z.object({
    typ: z.literal("mapa"), tytul,
    punkty: z.array(punkt.extend({ etykieta: z.string().max(60).optional() })).max(300).optional(),
    linie: z.array(z.object({ punkty: z.array(punkt).min(2).max(500), rodzaj: z.enum(["pieszo", "jazda"]).optional() })).max(30).optional(),
    obszary: z.array(z.object({ etykieta: z.string().max(60).optional(), kontur: z.array(punkt).min(3).max(500) })).max(100).optional(),
    z: wiazanie.optional().describe("dane_zapytaj z kontury=true (poligony) albo zwroc_geometrie=true (środki obiektów)"),
    kolumna_etykiety: z.string().optional().describe("przy `z`: kolumna z podpisem obiektu"),
  }),
  z.object({ typ: z.literal("lista"), tytul, pozycje: z.array(z.object({ tytul: z.string().max(120), opis: z.string().max(300).optional(), znacznik: z.string().max(20).optional() })).min(1).max(50) }),
  z.object({ typ: z.literal("os_czasu"), tytul, kroki: z.array(z.object({ etykieta: z.string().max(120), opis: z.string().max(200).optional(), czas: z.string().max(20).optional() })).min(1).max(20) }),
]);

export const widokSchema = z.object({
  tytul: z.string().min(2).max(120).describe("Tytuł karty: jeden obiekt albo jedno pytanie, np. 'Przedszkola na 10 000 mieszkańców'"),
  podtytul: z.string().max(200).optional(),
  zrodlo: z.string().min(3).max(300).describe("Skąd są dane (zbiory, daty, uwagi o pokryciu), pokazywane w stopce karty"),
  cel: z.literal("odpowiedz").optional().describe("Końcowa prezentacja odpowiedzi: najwyżej jeden blok wizualny oraz teksty. Tabela, wykres i mapa wymagają odczytu przez z; bez tego pola zachowany jest dotychczasowy widok wieloblokowy."),
  bloki: z.array(blok).min(1).max(8).describe("Komponenty od góry do dołu"),
}).superRefine((a, ctx) => {
  if (a.cel !== "odpowiedz") return;
  if (a.bloki.filter((b) => b.typ !== "tekst").length > 1) ctx.addIssue({ code: "custom", path: ["bloki"], message: "Końcowa odpowiedź może zawierać najwyżej jedną wizualizację; pozostałe objaśnienia podaj jako tekst." });
  a.bloki.forEach((b, i) => {
    if (b.typ === "metryki") ctx.addIssue({ code: "custom", path: ["bloki", i], message: "Końcowe metryki nie mogą pochodzić z ręcznie wpisanych wartości. Użyj tabeli albo wykresu z odczytem przez z." });
    if (b.typ === "tabela" || b.typ === "wykres" || b.typ === "mapa") {
      if (!b.z) ctx.addIssue({ code: "custom", path: ["bloki", i, "z"], message: "Końcowa wizualizacja wymaga źródła z; serwer sam pobierze dane bez przepisywania wartości przez model." });
      const reczne = b.typ === "tabela" ? b.wiersze !== undefined : b.typ === "wykres" ? b.punkty !== undefined : b.punkty !== undefined || b.linie !== undefined || b.obszary !== undefined;
      if (reczne) ctx.addIssue({ code: "custom", path: ["bloki", i], message: "W końcowej wizualizacji pomiń ręczne dane; podaj wyłącznie źródło z oraz wybór kolumn." });
    }
  });
});
export type WidokArgs = z.infer<typeof widokSchema>;
export type Wywolaj = (narzedzie: string, argumenty: unknown) => Promise<any>;

const ZB = 200;
const tekstKomorki = (v: unknown) => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : (v as string | number));

// Przenosimy metadane odczytu, bez jego ciężkich wierszy i argumentów użytkownika.
function metadaneZrodla(r: Record<string, any>): Record<string, any> {
  const pola = ["status", "zbior", "zrodlo", "zrodla", "url", "_dowod", "data_stanu", "data_odswiezenia", "pobrano", "definicja", "jednostka", "poziom", "kompletne", "uwagi", "uwaga", "ostrzezenia", "ograniczenia", "warstwy", "uwaga_migawek", "archiwalne", "wiek_godzin", "pokrycie", "nastepny_offset", "nastepny_kursor"];
  return Object.fromEntries(pola.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));
}

async function dane(b: { z?: z.infer<typeof wiazanie> }, wywolaj: Wywolaj) {
  const r = await wywolaj(b.z!.narzedzie, b.z!.argumenty);
  const wiersze: Record<string, any>[] = r.wiersze ?? [];
  if (!wiersze.length) throw new BladDomeny("wejscie", `zapytanie ${b.z!.narzedzie} nie zwróciło wierszy (sprawdź filtr i nazwy pól)`);
  return { r, wiersze };
}

function kolumna(wiersze: Record<string, any>[], nazwa: string, gdzie: string) {
  if (!nazwa) throw new BladDomeny("wejscie", `${gdzie}: podaj nazwę kolumny. Dostępne: ${Object.keys(wiersze[0]).filter((k) => k !== "_geometria").join(", ")}`);
  if (!(nazwa in wiersze[0])) throw new BladDomeny("wejscie", `${gdzie}: brak kolumny '${nazwa}'. Dostępne: ${Object.keys(wiersze[0]).filter((k) => k !== "_geometria").join(", ")}`);
  return nazwa;
}

async function rozwiaz(b: z.infer<typeof blok>, wywolaj: Wywolaj, odpowiedz = false): Promise<Record<string, any>> {
  let pochodzenie: Record<string, any> | undefined;
  const zrodlo = "z" in b ? b.z : undefined;
  const odczytaj = async () => {
    const wynik = await dane({ z: zrodlo }, wywolaj);
    if (odpowiedz) pochodzenie = { narzedzie: zrodlo!.narzedzie, ...metadaneZrodla(wynik.r), zrodlo: wynik.r.zrodlo ?? wynik.r.zbior ?? zrodlo!.narzedzie };
    return wynik;
  };
  const uzupelnij = (wynik: Record<string, any>, uwagi: string[] = []) => {
    if (!pochodzenie) return wynik;
    const odziedziczone = Array.isArray(pochodzenie.uwagi) ? pochodzenie.uwagi : [];
    return { ...metadaneZrodla(pochodzenie), ...wynik, ...(uwagi.length ? { uwagi: [...odziedziczone, ...uwagi] } : {}), pochodzenie };
  };
  switch (b.typ) {
    case "tabela": {
      if (b.z) {
        const { r, wiersze } = await odczytaj();
        const wszystkie: string[] = r.kolumny ?? Object.keys(wiersze[0]).filter((k) => k !== "_geometria");
        const kol = (b.kolumny?.length ? b.kolumny : wszystkie).slice(0, 10);
        kol.forEach((k) => kolumna(wiersze, k, "tabela"));
        const lim = Math.min(b.limit ?? ZB, ZB);
        return uzupelnij({ typ: "tabela", tytul: b.tytul, kolumny: kol, wiersze: wiersze.slice(0, lim).map((w) => kol.map((k) => tekstKomorki(w[k]))), razem: wiersze.length }, wiersze.length > lim ? [`Pokazano ${lim} z ${wiersze.length} pobranych wierszy; wizualizacja nie obejmuje całego odczytu.`] : []);
      }
      if (!b.kolumny?.length || !b.wiersze?.length) throw new BladDomeny("wejscie", "podaj `kolumny` i `wiersze` albo `z`");
      const zle = b.wiersze.findIndex((w) => w.length !== b.kolumny!.length);
      if (zle >= 0) throw new BladDomeny("wejscie", `wiersz ${zle + 1} ma ${b.wiersze[zle].length} komórek, a kolumn jest ${b.kolumny.length}`);
      return { typ: "tabela", tytul: b.tytul, kolumny: b.kolumny, wiersze: b.wiersze, razem: b.wiersze.length };
    }
    case "wykres": {
      let punkty = b.punkty ?? [];
      const uwagi: string[] = [];
      if (b.z) {
        const { wiersze } = await odczytaj();
        const bdl = b.z.narzedzie === "bdl_dane";
        const xk = kolumna(wiersze, b.kolumna_x ?? (bdl ? "rok" : ""), "wykres.kolumna_x"), yk = kolumna(wiersze, b.kolumna_y ?? (bdl ? "wartosc" : ""), "wykres.kolumna_y");
        const pelne = wiersze.filter((w) => typeof w[yk] === "number" && w[xk] != null);
        if (pelne.length < wiersze.length) uwagi.push(`Pominięto ${wiersze.length - pelne.length} wierszy bez liczbowej miary lub wartości osi X.`);
        if (pelne.length > ZB) uwagi.push(`Pokazano ${ZB} z ${pelne.length} punktów; wizualizacja nie obejmuje całego odczytu.`);
        punkty = pelne.slice(0, ZB).map((w) => ({ x: w[xk], y: w[yk] }));
      }
      if (punkty.length < 2) throw new BladDomeny("wejscie", "wykres wymaga co najmniej 2 punktów (`punkty` albo `z` z kolumnami x i y)");
      return uzupelnij({ typ: "wykres", tytul: b.tytul, rodzaj: b.rodzaj, jednostka: b.jednostka ?? (odpowiedz ? pochodzenie?.jednostka : undefined), punkty }, uwagi);
    }
    case "mapa": {
      const inline = { punkty: b.punkty ?? [], linie: (b.linie ?? []).map((l) => ({ pts: l.punkty.map((p) => [p.lon, p.lat]), klasa: l.rodzaj ?? "jazda" })), kontury: (b.obszary ?? []).map((o) => ({ etykieta: o.etykieta, pierscien: o.kontur.map((p) => [p.lon, p.lat]) })) };
      let wiersze: Record<string, any>[] | undefined;
      let etykieta = b.kolumna_etykiety;
      const uwagi: string[] = [];
      if (b.z) {
        const odczyt = (await odczytaj()).wiersze;
        const w = odczyt.filter((x) => x._geometria);
        if (!w.length) throw new BladDomeny("wejscie", "wyniki nie mają geometrii: w dane_zapytaj ustaw kontury=true (poligony) albo zwroc_geometrie=true (środki)");
        if (w.length < odczyt.length) uwagi.push(`Pominięto ${odczyt.length - w.length} wierszy bez geometrii; mapa ma niepełne pokrycie odczytu.`);
        if (w.length > ZB) uwagi.push(`Pokazano ${ZB} z ${w.length} obiektów z geometrią; mapa nie obejmuje całego odczytu.`);
        if (etykieta) kolumna(w, etykieta, "mapa.kolumna_etykiety");
        wiersze = w.slice(0, ZB).map((x) => ({ ...(etykieta ? { [etykieta]: x[etykieta] } : {}), _geometria: x._geometria }));
      }
      if (!wiersze && !inline.punkty.length && !inline.linie.length && !inline.kontury.length) throw new BladDomeny("wejscie", "mapa jest pusta: podaj `punkty`, `linie`, `obszary` albo `z`");
      return uzupelnij({ typ: "mapa", tytul: b.tytul, ...inline, wiersze, kolumna_etykiety: etykieta }, uwagi);
    }
    default:
      return b;
  }
}

export async function zlozWidok(a: WidokArgs, wywolaj: Wywolaj): Promise<Record<string, any> & { tytul: string; podtytul?: string; zrodlo: string; bloki: Record<string, any>[]; cel?: "odpowiedz" }> {
  if (a.cel === "odpowiedz") {
    const sprawdzony = widokSchema.safeParse(a);
    if (!sprawdzony.success) throw new BladDomeny("wejscie", sprawdzony.error.issues.map((i) => i.message).join(" "));
    a = sprawdzony.data;
  }
  const bloki: Record<string, any>[] = [];
  for (const [i, b] of a.bloki.entries()) {
    try { bloki.push(await rozwiaz(b, wywolaj, a.cel === "odpowiedz")); } catch (e) { throw new BladDomeny("wejscie", `Blok ${i + 1} (${b.typ}): ${(e as Error).message}`); }
  }
  const zeZrodla = a.cel === "odpowiedz" ? bloki.find((b) => b.pochodzenie) : undefined;
  return { tytul: a.tytul, podtytul: a.podtytul, zrodlo: a.zrodlo, bloki, ...(a.cel ? { cel: a.cel } : {}), ...(zeZrodla ? { ...metadaneZrodla(zeZrodla), pochodzenie: zeZrodla.pochodzenie } : {}) };
}

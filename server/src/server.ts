import { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { addressToPoint } from "./adres.ts";
import { brakiTematu, pozycje, szukaj } from "./katalog.ts";
import { konturyParkow, parkGeometry } from "./parki.ts";
import { KARTA_HTML } from "./ui/karta.generated.ts";
import { podsumuj } from "./podsumowanie.ts";
import { widokSchema, zlozWidok } from "./widok.ts";
import { daneZapytaj, zbiorOpis } from "./zapytanie.ts";
import { statusZrodel } from "./status.ts";
import { plikOdczyt } from "./plik.ts";
import { prognoza } from "./prognoza.ts";
import { geokodujOsm, kandydaciOsm, kandydaciPara } from "./osm.ts";
import { dotyczace, pobierzKomunikaty } from "./komunikaty.ts";
import { odleglosc, odjazdyZPrzystankow, opisPrzystanku, planuj, przystankiBlisko, uzupelnijNaZywo, wczytajSiec } from "./transport.ts";
import { bdlDane, bdlSzukaj, daneGovSzukaj, daneGovZasoby } from "./zewnetrzne.ts";
import { czyZtp } from "./siec.ts";
import { WERSJA } from "./wersja.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Wspólne opakowanie: wynik jako tekst JSON (dla każdego klienta) + structuredContent; błąd jako isError.
async function run(fn: () => Promise<Record<string, unknown>>) {
  try {
    const data = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
  } catch (e) {
    return { isError: true, content: [{ type: "text" as const, text: `Błąd: ${(e as Error).message}` }] };
  }
}

// Karta MCP Apps wspólna dla wszystkich narzędzi: widok wybiera pole `_widok` w wyniku.
const KARTA_URI = "ui://lajkonektor/karta.html";
export const WIDOK: Record<string, string> = {
  katalog_szukaj: "katalog", zbior_opis: "opis_zbioru", dane_zapytaj: "tabela", adres_na_punkt: "adres", parki_geometria: "parki",
  bdl_szukaj: "bdl_lista", bdl_dane: "szereg", dane_gov: "dane_gov", przystanki_w_poblizu: "przystanki", odjazdy: "odjazdy",
  trasa: "trasa", utrudnienia: "komunikaty", status_zrodel: "status", prognoza: "prognoza", plik_odczyt: "plik", widok: "zlozony",
};

// Kontury i przebiegi do rysowania map są potrzebne karcie (structuredContent), a nie modelowi: w tekście wyniku ich nie powtarzamy.
const bezKonturow = (k: string, v: unknown) => (k === "kontury" || k === "linie_geom" ? undefined : v);

const INSTRUKCJE = `Lajkonektor: otwarte dane Krakowa (Otwarte Dane i MSIP Urzędu Miasta, GUS BDL, dane.gov.pl, rozkłady i pozycje pojazdów ZTP na żywo, OpenStreetMap). Tylko odczyt.

Zbiory danych: katalog_szukaj szuka po temacie i zwraca id; zbior_opis opisuje pola i słowniki; dane_zapytaj filtruje, sortuje, grupuje i agreguje (sum/count/avg/min/max) — także filtr przestrzenny dla warstw MSIP ({punkt,promien_m}, {bbox} albo {z:{id,bufor_m}}). Pokrycie obejmuje parki, plany miejscowe, pozwolenia na budowę, hałas, działki, ludność i cudzoziemców, ceny nieruchomości, żłobki, przedszkola, szkoły, szpitale, apteki, muzea, teatry, biblioteki, parkingi i strefę płatnego parkowania, infrastrukturę rowerową, policję i wybory. Tematów bez danych (odpady i PSZOK, kina, targowiska, wypadki drogowe) katalog_szukaj nie znajdzie i zwraca je w polu brak_w_katalogu.

Adresy i miejsca: adres_na_punkt geokoduje adres lub nazwę miejsca i podaje dzielnicę.

Komunikacja: przystanki_w_poblizu, odjazdy (GTFS-RT na żywo), trasa (z i do: adres, nazwa miejsca albo współrzędne; dojście piesze po sieci OSM, jedna przesiadka) oraz utrudnienia. Obejmuje ZTP (autobusy, tramwaje, linie aglomeracyjne do gmin wokół Krakowa) i pociągi (Koleje Małopolskie, PolRegio, Intercity — dokładne godziny z rozkładu PKP PLK, bez opóźnień). Miejsca poza Krakowem podawaj jako {tekst}, np. 'Staniątki 15'. Czasy trasy są szacunkami (oczekiwanie z częstotliwości kursów, jazda z mediany rozkładu). Gdy źródło zwraca błąd 522, status_zrodel pokazuje colo, kraj i dostępność każdego źródła.

Szeregi GUS: bdl_szukaj znajduje wskaźnik, bdl_dane zwraca szereg; prognoza robi deterministyczną projekcję z przedziałami 80% i 95% (trend liniowy, wzrost wykładniczy, Holt) i wymaga co najmniej 3 punktów. Pliki CSV/XLSX/GeoJSON z adresów *.gov.pl i *.krakow.pl czyta plik_odczyt (limit 8 MB) z profilem kolumn i agregacją po stronie serwera.

Karty: każde narzędzie zwraca kartę w klientach z MCP Apps (mapa OSM, tabela, wykres) i pełny wynik tekstowy z polskim podsumowaniem w pozostałych. widok składa własną kartę z bloków (tekst, metryki, tabela, wykres, mapa, lista, oś czasu), gdy odpowiedź łączy dane z kilku źródeł.

Nie podawaj liczb, których narzędzia nie zwróciły. Podawaj źródło, datę danych i pokrycie (np. geometria jest tylko dla części parków).`;

const geometria = z
  .union([
    z.object({ punkt: z.object({ lat: z.number().min(49.9).max(50.2), lon: z.number().min(19.7).max(20.2) }), promien_m: z.number().min(1).max(5000).optional() }),
    z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
    z.object({ z: z.object({ id: z.string(), where: z.string().optional(), bufor_m: z.number().min(1).max(5000).optional() }) }),
  ])
  .describe(
    "Filtr przestrzenny (tylko warstwy MSIP): {punkt:{lat,lon},promien_m} | {bbox:[zach,pld,wsch,pln]} | {z:{id,where,bufor_m}} = obiekty innej warstwy (lub 'lokalne:parki_osm') z buforem",
  );

// origin: publiczny adres serwera; karty pobierają z niego kafelki mapy (CSP hosta musi go znać).
export function createServer(cf?: { colo?: string; country?: string }, origin?: string): McpServer {
  const server = new McpServer({ name: "lajkonektor", version: WERSJA }, { instructions: INSTRUKCJE });

  registerAppResource(server, "Karta Lajkonektora", KARTA_URI, { description: "Widoki wyników narzędzi: odjazdy, trasa, mapa parków, tabele, wykresy, prognoza." }, async () => ({
    contents: [{ uri: KARTA_URI, mimeType: RESOURCE_MIME_TYPE, text: KARTA_HTML, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: origin ? [origin] : [] } } } }],
  }));

  // Każde narzędzie ma kartę UI (klienci z MCP Apps) i pełny wynik tekstowy (pozostali). Do wyniku dokładamy widok,
  // zapytanie (do odświeżania) i krótkie podsumowanie po polsku dla klientów bez UI.
  // Rejestr surowych handlerów: narzędzie `widok` wykonuje przez niego zapytania wskazane w blokach (`z`).
  const rejestr = new Map<string, { schema: z.ZodType; handler: (args: any) => Promise<any> }>();
  const narzedzie = (nazwa: string, cfg: any, handler: (args: any) => Promise<any>) => {
    rejestr.set(nazwa, { schema: cfg.inputSchema, handler });
    return registerAppTool(server, nazwa, { ...cfg, _meta: { ui: { resourceUri: KARTA_URI } } }, async (args: any) => {
      const r = await handler(args);
      if (!r.structuredContent) return r;
      const dane = { podsumowanie: podsumuj(nazwa, r.structuredContent), ...r.structuredContent };
      return { content: [{ type: "text" as const, text: JSON.stringify(dane, bezKonturow) }], structuredContent: { _widok: WIDOK[nazwa], _zapytanie: args, ...(origin ? { _kafelki: `${origin}/kafelki/{z}/{x}/{y}.png` } : {}), ...dane } };
    });
  };
  const wywolaj = async (nazwa: string, argumenty: unknown) => {
    const t = rejestr.get(nazwa);
    if (!t) throw new Error(`nieznane narzędzie ${nazwa}`);
    const p = t.schema.safeParse(argumenty);
    if (!p.success) throw new Error(`argumenty ${nazwa}: ${p.error.issues.map((i) => `${i.path.join(".") || "(korzeń)"}: ${i.message}`).join("; ")}`);
    const r = await t.handler(p.data);
    if (r.isError) throw new Error(String(r.content[0].text).replace(/^Błąd:\s*/, ""));
    return r.structuredContent;
  };

  narzedzie(
    "katalog_szukaj",
    {
      title: "Szukaj danych o Krakowie",
      description:
        `Szukaj w katalogu ${pozycje.length} zbiorów danych miasta Krakowa (tabele Otwartych Danych UMK i warstwy mapowe MSIP: plany miejscowe, demografia, hałas, transport, edukacja, zdrowie, zieleń i inne) po temacie lub nazwie pola. Zwraca id do użycia w zbior_opis i dane_zapytaj. Największe pokrycie ma dla pytań o dane miasta Krakowa.`,
      inputSchema: z.object({
        temat: z.string().min(2).describe("Słowa kluczowe po polsku, np. 'parki', 'cudzoziemcy', 'bezrobocie', 'miejscowy plan', 'hałas', 'przystanki'"),
        zrodlo: z.enum(["od", "msip"]).optional().describe("od = tabele Otwartych Danych, msip = warstwy mapowe"),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      annotations: readOnly,
    },
    ({ temat, zrodlo, limit }) =>
      run(async () => {
        const wyniki = szukaj(temat, { zrodlo, limit }).map((p) => ({
          id: p.id, zrodlo: p.zrodlo, tytul: p.tytul, geometria: p.geometria ?? undefined,
          pola: p.pola.slice(0, 14).map((f) => f.split(":")[0]), ...(p.pola.length > 14 ? { pol_razem: p.pola.length } : {}),
        }));
        const brak = brakiTematu(temat);
        return { liczba: wyniki.length, wyniki, ...(brak ? { brak_w_katalogu: brak } : {}), podpowiedz: wyniki.length ? "Użyj zbior_opis(id), by zobaczyć pola i słowniki, potem dane_zapytaj." : "Brak wyników: spróbuj innych słów lub bez filtra 'zrodlo'." };
      }),
  );

  narzedzie(
    "zbior_opis",
    {
      title: "Opis zbioru danych",
      description: "Pełny opis zbioru z katalogu: pola i typy, aliasy, słowniki kodów, liczba rekordów, próbka danych i wskazówki do zapytań.",
      inputSchema: z.object({ id: z.string().describe("id z katalog_szukaj, np. 'msip:Planowanie/BP_MPZP/3'") }),
      annotations: readOnly,
    },
    ({ id }) => run(() => zbiorOpis(id)),
  );

  narzedzie(
    "dane_zapytaj",
    {
      title: "Zapytaj zbiór danych",
      description:
        "Uniwersalne zapytanie do zbioru z katalogu: filtr, wybór pól, sortowanie, agregacje (sum/count/avg/min/max z grupowaniem), stronicowanie oraz filtr przestrzenny dla warstw MSIP (punkt z promieniem, ramka, albo bufor wokół obiektów innej warstwy). Agregacje liczy serwer, więc wynik jest powtarzalny. Współrzędne WGS84.",
      inputSchema: z.object({
        id: z.string().describe("id zbioru z katalog_szukaj"),
        pola: z.array(z.string()).optional().describe("Kolumny do zwrócenia (domyślnie wszystkie)"),
        filtr: z.string().optional().describe("MSIP: SQL where, np. \"oznaczenie LIKE 'ZP%'\". OD: OData $filter, np. \"Dzielnica eq 'VIII Dębniki'\""),
        sortuj: z.string().optional().describe("np. 'Powierzchnia_ha desc' (OD) lub 'pole DESC' (MSIP)"),
        limit: z.number().int().min(1).max(1000).default(100),
        offset: z.number().int().min(0).optional().describe("MSIP: przesunięcie stronicowania"),
        kursor: z.string().optional().describe("OD: nastepny_kursor z poprzedniej odpowiedzi"),
        grupuj_po: z.array(z.string()).optional(),
        agreguj: z.array(z.object({ fn: z.enum(["sum", "count", "avg", "min", "max"]), pole: z.string(), nazwa: z.string().optional() })).optional(),
        geometria: geometria.optional(),
        zwroc_geometrie: z.boolean().optional().describe("MSIP: dołącz środek i ramkę obiektu"),
        kontury: z.boolean().optional().describe("MSIP: dołącz uproszczone kontury obiektów (do mapy w karcie; używaj z limit ≤ 200)"),
        tylko_liczba: z.boolean().optional().describe("MSIP: zwróć tylko liczbę obiektów"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => daneZapytaj(args)),
  );

  narzedzie(
    "adres_na_punkt",
    {
      title: "Adres na współrzędne",
      description:
        "Geokodowanie adresu w Krakowie (punkty adresowe MSIP): zwraca lat/lon, kod pocztowy i dzielnicę. Użyj przed zapytaniami przestrzennymi z punktem.",
      inputSchema: z.object({
        ulica: z.string().min(2).describe("Nazwa ulicy, np. 'Telimeny' (bez 'ul.'; polskie litery opcjonalne)"),
        numer: z.string().describe("Numer budynku dokładnie jak w adresie, np. '11' lub '4A'"),
        kod_pocztowy: z.string().optional().describe("Opcjonalnie, np. '30-838', gdy ulica powtarza się w mieście"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => addressToPoint(args)),
  );

  narzedzie(
    "parki_geometria",
    {
      title: "Parki z geometrią (OSM)",
      description:
        "Parki miejskie z tabeli OD z dopasowaną geometrią z OpenStreetMap: środek, ramka, zgodność powierzchni i pokrycie. Zbiór 'lokalne:parki_osm' można podać jako obszar w dane_zapytaj (geometria.z), by liczyć np. mieszkańców w zasięgu parków. Pokrycie jest częściowe.",
      inputSchema: z.object({
        nazwa: z.string().optional().describe("Fragment nazwy parku, np. 'Jordana'"),
        dzielnica: z.string().optional().describe("Fragment nazwy dzielnicy, np. 'Podgórze'"),
        tylko_z_geometria: z.boolean().default(false),
      }),
      annotations: readOnly,
    },
    (args) => run(async () => parkGeometry(args)),
  );

  narzedzie(
    "status_zrodel",
    {
      title: "Status źródeł danych",
      description: "Sprawdza z serwera Lajkonektora, czy źródła (Otwarte Dane UMK, MSIP, GUS BDL, ZTP) odpowiadają, i podaje lokalizację serwera. Użyj, gdy inne narzędzia zwracają błąd HTTP 5xx lub timeout.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => run(() => statusZrodel(cf)),
  );

  narzedzie(
    "bdl_szukaj",
    {
      title: "Szukaj wskaźników GUS (BDL)",
      description:
        "Szukaj zmiennych w Banku Danych Lokalnych GUS (bezrobocie, ludność, wynagrodzenia, mieszkania, edukacja, środowisko i inne) dostępnych dla Krakowa. Zwraca id do bdl_dane. Użyj do pytań o sytuację makro i trendy w czasie.",
      inputSchema: z.object({
        nazwa: z.string().min(3).describe("np. 'stopa bezrobocia', 'bezrobotni zarejestrowani', 'przeciętne wynagrodzenie', 'ludność ogółem'"),
        limit: z.number().int().min(1).max(50).default(15),
      }),
      annotations: readOnly,
    },
    ({ nazwa, limit }) => run(() => bdlSzukaj(nazwa, limit)),
  );

  narzedzie(
    "bdl_dane",
    {
      title: "Dane GUS (BDL) dla Krakowa",
      description:
        "Wartości zmiennych BDL w czasie dla Krakowa (domyślnie powiat m. Kraków). Zwraca wiersze {zmienna, rok, wartość} gotowe do analizy trendu i prognozy.",
      inputSchema: z.object({
        zmienne: z.array(z.number().int()).min(1).max(20).describe("id z bdl_szukaj"),
        jednostka: z.string().default("powiat").describe("'powiat' (m. Kraków), 'gmina', 'podregion' albo surowe id jednostki BDL"),
        lata: z.array(z.number().int()).max(40).optional().describe("Lata; domyślnie wszystkie dostępne"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => bdlDane(args)),
  );

  narzedzie(
    "dane_gov",
    {
      title: "Portal dane.gov.pl",
      description:
        "Szukaj zbiorów danych otwartych instytucji publicznych w dane.gov.pl (po 'q') albo pobierz listę zasobów (plików) zbioru (po 'zbior_id'). Linki do plików można dalej przetwarzać.",
      inputSchema: z.object({
        q: z.string().optional().describe("Szukana fraza, np. 'Kraków ceny mieszkań'"),
        zbior_id: z.string().optional().describe("id zbioru z poprzedniego wyniku: zwróci jego zasoby i linki do plików"),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: readOnly,
    },
    ({ q, zbior_id, limit }) =>
      run(async () => {
        if (zbior_id) return daneGovZasoby(zbior_id);
        if (!q) throw new Error("Podaj 'q' (fraza) albo 'zbior_id'.");
        return daneGovSzukaj(q, limit);
      }),
  );

  const punkt = z.object({ lat: z.number().min(49.2).max(50.5), lon: z.number().min(18.9).max(21.5) });
  const adres = z.object({ ulica: z.string().min(2), numer: z.string(), kod_pocztowy: z.string().optional() }).describe("Adres w Krakowie (punkty adresowe MSIP); poza Krakowem użyj {tekst}");
  const nazwaMiejsca = z.object({ tekst: z.string().min(2).describe("Nazwa miejsca lub adres, np. 'Rynek Główny', 'Dworzec Główny', 'AGH', a poza Krakowem 'Staniątki 15', 'Niepołomice rynek', 'Wieliczka kopalnia' (geokodowanie OSM, Małopolska)") });
  const miejsce = z
    .union([punkt, adres, nazwaMiejsca])
    .describe("Miejsce: {lat,lon} | adres w Krakowie {ulica,numer[,kod_pocztowy]} (MSIP) | {tekst} nazwa miejsca lub adres w Krakowie i Małopolsce (OpenStreetMap)");
  const rozwiaz = async (m: z.infer<typeof miejsce>) => {
    if ("lat" in m) return { lat: m.lat, lon: m.lon, etykieta: `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`, zrodlo: "współrzędne podane" };
    if ("tekst" in m) {
      const g = await geokodujOsm(m.tekst);
      if (!g) throw new Error(`Nie znaleziono miejsca w Krakowie ani w Małopolsce: ${m.tekst}. Spróbuj z nazwą miejscowości, np. 'Staniątki 15'.`);
      return { lat: g.lat, lon: g.lon, etykieta: g.nazwa, zrodlo: "OpenStreetMap (Nominatim)" };
    }
    const r = await addressToPoint(m);
    if (!r.liczba) {
      // Poza Krakowem punktów adresowych MSIP nie ma: próbujemy OSM.
      const g = await geokodujOsm(`${m.ulica} ${m.numer}`);
      if (g) return { lat: g.lat, lon: g.lon, etykieta: g.nazwa, zrodlo: "OpenStreetMap (Nominatim); adres spoza punktów adresowych MSIP" };
      throw new Error(`Nie znaleziono adresu: ${m.ulica} ${m.numer}. ${r.uwaga}`);
    }
    const k = r.kandydaci[0];
    return { lat: k.lat as number, lon: k.lon as number, etykieta: `${k.ulica} ${k.numer}, ${k.kod_pocztowy} (${k.dzielnica})`, zrodlo: "MSIP Kraków (punkty adresowe)" };
  };

  narzedzie(
    "przystanki_w_poblizu",
    {
      title: "Przystanki komunikacji w pobliżu",
      description:
        "Przystanki autobusowe, tramwajowe, aglomeracyjne (ZTP Kraków) i stacje kolejowe (Koleje Małopolskie, PolRegio, Intercity) w pobliżu miejsca: odległość i czas dojścia pieszo po sieci OSM (OSRM), linie. Miejsce: współrzędne, adres albo nazwa miejsca, także w gminach wokół Krakowa.",
      inputSchema: z.object({ miejsce, promien_m: z.number().int().min(100).max(1500).default(500), limit: z.number().int().min(1).max(10).default(6) }),
      annotations: readOnly,
    },
    ({ miejsce: m, promien_m, limit }) =>
      run(async () => {
        const [p, S] = await Promise.all([rozwiaz(m), wczytajSiec()]);
        const { kandydaci, zrodlo } = await kandydaciOsm(S, p, promien_m, limit);
        return {
          miejsce: p.etykieta, punkt: { lat: p.lat, lon: p.lon }, zrodlo_miejsca: p.zrodlo, zrodlo_dojscia: zrodlo, feedy: S.feedy,
          przystanki: kandydaci.map((k) => ({ ...opisPrzystanku(S, k.idx, k.m), dojscie_min: k.min })),
        };
      }),
  );

  narzedzie(
    "odjazdy",
    {
      title: "Odjazdy na żywo",
      description:
        "Najbliższe odjazdy z przystanku na żywo (GTFS-RT ZTP: przewidywane czasy i opóźnienia) wraz z aktualnymi komunikatami o utrudnieniach dla tych linii. Podaj nazwę przystanku (np. 'Basztowa LOT') albo miejsce z promieniem. Obejmuje kursy już będące w trasie; odległe odjazdy mogą jeszcze nie być w feedzie.",
      inputSchema: z.object({
        nazwa: z.string().min(2).optional().describe("Fragment nazwy przystanku"),
        miejsce: miejsce.optional(),
        promien_m: z.number().int().min(100).max(1000).default(400),
        limit: z.number().int().min(1).max(30).default(10),
      }),
      annotations: readOnly,
    },
    ({ nazwa, miejsce: m, promien_m, limit }) =>
      run(async () => {
        if (!nazwa && !m) throw new Error("Podaj 'nazwa' przystanku albo 'miejsce'.");
        const S = await wczytajSiec();
        const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
        let idxs: number[];
        if (m) {
          const p = await rozwiaz(m);
          idxs = przystankiBlisko(S, p.lat, p.lon, promien_m, 40).map((x) => x.idx).filter((i) => !nazwa || norm(S.przystanki[i][2]).includes(norm(nazwa)));
        } else idxs = S.przystanki.flatMap((p, i) => (norm(p[2]).includes(norm(nazwa!)) ? [i] : []));
        if (!idxs.length) throw new Error("Nie znaleziono przystanków dla podanych kryteriów.");
        const uzyte = idxs.slice(0, 60);
        const wynik = await odjazdyZPrzystankow(S, uzyte, limit);
        const feedy = [...new Set(uzyte.map((i) => S.przystanki[i][0]))];
        const k = await pobierzKomunikaty(S, feedy);
        const linie = new Set(wynik.odjazdy.map((o) => o.linia)), przyst = new Set(uzyte.map((i) => S.przystanki[i][2]));
        return { zrodlo: "ZTP Kraków, GTFS-RT TripUpdates i ServiceAlerts (na żywo)", przystankow: idxs.length, ...wynik, komunikaty: dotyczace(k.komunikaty, linie, przyst), ...(k.bledy.length ? { bledy_komunikatow: k.bledy } : {}) };
      }),
  );

  narzedzie(
    "trasa",
    {
      title: "Planer trasy komunikacją miejską",
      description:
        "Jak dojechać komunikacją miejską z A do B (współrzędne, adres albo nazwa miejsca): geokodowanie i dojście do przystanku po sieci pieszej OSM (OSRM), linie bezpośrednie i z jedną przesiadką, najbliższe odjazdy na żywo (GTFS-RT) dla pierwszego odcinka oraz komunikaty o utrudnieniach (ServiceAlerts). Czasy są szacunkami: oczekiwanie z częstotliwości kursów, jazda z mediany rozkładu.",
      inputSchema: z.object({ z: miejsce, do: miejsce, max_dojscie_m: z.number().int().min(200).max(3000).default(800).describe("Maks. dojście pieszo do przystanku; gdy brak połączenia, serwer sam poszerza do 1500 i 3000 m (wsie, stacje poza miastem)") }),
      annotations: readOnly,
    },
    ({ z: a, do: b, max_dojscie_m }) =>
      run(async () => {
        const [pa, pb, S] = await Promise.all([rozwiaz(a), rozwiaz(b), wczytajSiec()]);
        // Poza miastem przystanki są daleko od adresu: gdy nic nie znaleziono, poszerzamy promień dojścia.
        let promien = max_dojscie_m, opcje: ReturnType<typeof planuj> = [];
        let ks!: Awaited<ReturnType<typeof kandydaciPara>>["start"], kc!: Awaited<ReturnType<typeof kandydaciPara>>["cel"];
        for (const r of [max_dojscie_m, 1500, 3000].filter((x) => x >= max_dojscie_m)) {
          promien = r;
          ({ start: ks, cel: kc } = await kandydaciPara(S, pa, pb, r));
          opcje = planuj(S, ks.kandydaci, kc.kandydaci);
          if (opcje.length) break;
        }
        const rt = await uzupelnijNaZywo(S, opcje.slice(0, 5));
        const pokazane = opcje.slice(0, 5);
        const feedyOpcji = [...new Set(pokazane.flatMap((o) => o.nogi.map((n) => S.przystanki[n.wsiadanie_idx][0])))].filter(czyZtp);
        const k = feedyOpcji.length ? await pobierzKomunikaty(S, feedyOpcji) : { komunikaty: [], bledy: [] as string[] };
        const linie = new Set(pokazane.flatMap((o) => o.nogi.map((n) => n.linia)));
        const przyst = new Set(pokazane.flatMap((o) => o.nogi.flatMap((n) => [S.przystanki[n.wsiadanie_idx][2], S.przystanki[n.wysiadanie_idx][2]])));
        const bledy = [...rt.bledy, ...k.bledy];
        return {
          zrodlo: "ZTP Kraków: GTFS statyczny pobierany na żywo + GTFS-RT TripUpdates i ServiceAlerts; pociągi: rozkłady PKP PLK (mkuran.pl); dojście: OSM",
          uwaga: "Szacunek, nie gwarancja: autobusy i tramwaje liczone z częstotliwości kursów (pierwsza noga na żywo), pociągi z dokładnych godzin rozkładu PKP PLK (bez opóźnień), transfery do 200 m, maks. jedna przesiadka.",
          z: { opis: pa.etykieta, zrodlo: pa.zrodlo, lat: pa.lat, lon: pa.lon }, do: { opis: pb.etykieta, zrodlo: pb.zrodlo, lat: pb.lat, lon: pb.lon },
          odleglosc_prosta_m: Math.round(odleglosc(pa.lat, pa.lon, pb.lat, pb.lon)),
          opcji: opcje.length,
          promien_dojscia_m: promien,
          ...(bledy.length ? { bledy_realtime: bledy } : {}),
          komunikaty_o_utrudnieniach: dotyczace(k.komunikaty, linie, przyst).slice(0, 8),
          opcje: pokazane.map(({ nogi, ...o }) => ({ ...o, nogi: nogi.map(({ wsiadanie_idx, wysiadanie_idx, wzorzec, ...n }) => ({ ...n, wsiadanie_pkt: { lat: S.przystanki[wsiadanie_idx][3], lon: S.przystanki[wsiadanie_idx][4] }, wysiadanie_pkt: { lat: S.przystanki[wysiadanie_idx][3], lon: S.przystanki[wysiadanie_idx][4] } })) })),
        };
      }),
  );

  narzedzie(
    "utrudnienia",
    {
      title: "Komunikaty o utrudnieniach ZTP",
      description: "Aktualne komunikaty o utrudnieniach w komunikacji miejskiej w Krakowie (ZTP, GTFS-RT ServiceAlerts, na żywo), opcjonalnie dla jednej linii.",
      inputSchema: z.object({ linia: z.string().optional().describe("Numer linii, np. '50' lub '194'") }),
      annotations: readOnly,
    },
    ({ linia }) =>
      run(async () => {
        const S = await wczytajSiec();
        const k = await pobierzKomunikaty(S);
        const lista = linia ? k.komunikaty.filter((x) => x.linie.includes(linia)) : k.komunikaty;
        return { zrodlo: "ZTP Kraków, GTFS-RT ServiceAlerts (na żywo)", liczba: lista.length, komunikaty: lista, ...(k.bledy.length ? { bledy: k.bledy } : {}) };
      }),
  );

  narzedzie(
    "prognoza",
    {
      title: "Prognoza szeregu czasowego",
      description:
        "Deterministyczna projekcja szeregu (np. z bdl_dane lub dane_zapytaj) z przedziałami 80% i 95% oraz opisem metody. Metody: trend liniowy, wzrost wykładniczy, Holt; w trybie auto wybór po błędzie backtestu. To projekcja trendu, nie przewidywanie. Wymaga ≥3 punktów (zalecane ≥6). Liczy serwer, więc wynik jest powtarzalny.",
      inputSchema: z.object({
        serie: z.array(z.object({ x: z.number().describe("Okres, np. rok"), y: z.number().describe("Wartość") })).min(3).max(200),
        horyzont: z.number().int().min(1).max(20).default(5).describe("Liczba kroków do przodu"),
        metoda: z.enum(["auto", "liniowy", "wykladniczy", "holt"]).default("auto"),
        krok: z.number().positive().optional().describe("Długość kroku w jednostkach x (domyślnie mediana odstępów)"),
        ostatnie_punkty: z.number().int().min(3).optional().describe("Użyj tylko ostatnich N punktów (np. po załamaniu trendu)"),
        etykieta: z.string().optional().describe("Co prognozujemy, np. 'cudzoziemcy na pobyt czasowy' (tylko opis)"),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ serie, horyzont, metoda, krok, etykieta, ostatnie_punkty }) =>
      run(async () => ({ ...(etykieta ? { etykieta } : {}), ...prognoza({ serie, horyzont, metoda, krok, ostatnie_punkty }) })),
  );

  narzedzie(
    "plik_odczyt",
    {
      title: "Odczyt pliku z otwartych danych",
      description:
        "Pobiera i czyta plik CSV, XLSX lub GeoJSON/JSON z adresu https instytucji publicznych (*.gov.pl, *.krakow.pl, np. link z dane_gov albo eksport MSIP f=geojson) i zwraca tabelę z profilem kolumn (typ, braki, min/max/suma/średnia), opcjonalnie z filtrem pól, sortowaniem i agregacją po stronie serwera. Limit pliku 8 MB.",
      inputSchema: z.object({
        url: z.string().url().describe("https://api.dane.gov.pl/resources/.../file albo inny link do pliku"),
        format: z.enum(["csv", "xlsx", "geojson", "json"]).optional().describe("Domyślnie wykrywany automatycznie"),
        arkusz: z.union([z.string(), z.number().int().min(1)]).optional().describe("XLSX: nazwa lub numer arkusza (od 1)"),
        separator: z.string().max(1).optional().describe("CSV: separator (domyślnie wykrywany)"),
        pola: z.array(z.string()).optional().describe("Kolumny do zwrócenia"),
        sortuj: z.string().optional().describe("'kolumna' lub 'kolumna desc'"),
        limit: z.number().int().min(1).max(500).default(50),
        offset: z.number().int().min(0).optional(),
        grupuj_po: z.array(z.string()).optional(),
        agreguj: z.array(z.object({ fn: z.enum(["sum", "count", "avg", "min", "max"]), pole: z.string(), nazwa: z.string().optional() })).optional(),
        geometria: z.enum(["podsumowanie", "brak"]).optional().describe("GeoJSON: środek/ramka/pole obiektów (domyślnie podsumowanie)"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => plikOdczyt(args)),
  );

  narzedzie(
    "widok",
    {
      title: "Złóż własną kartę z danych",
      description:
        "Składa jedną kartę z gotowych komponentów: tekst, metryki (duże liczby), tabela, wykres (linia/słupki), mapa OSM (punkty, linie, obszary), lista, oś czasu. Nadaje się na własny układ odpowiedzi: porównanie, zestawienie z kilku źródeł, mapa z kilkoma warstwami, podsumowanie dla urzędnika lub badacza. Każde pojedyncze narzędzie renderuje własną kartę, więc to narzędzie dodaje wartość przy składaniu wyników z wielu źródeł. Dane w blokach tabela/wykres/mapa podaj wprost albo wskaż polem z zapytanie (dane_zapytaj, plik_odczyt, bdl_dane), które serwer wykona sam — wtedy liczby nie są przepisywane. Mapa z poligonami: dane_zapytaj z kontury=true i limit ≤ 200. Blok zrodlo opisuje zbiory, daty i pokrycie.",
      inputSchema: widokSchema,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => run(() => zlozWidok(args, wywolaj)),
  );

  // Tylko dla aplikacji (niewidoczne dla modelu): uproszczone kontury parków do narysowania mapy, żeby nie zalewać kontekstu.
  registerAppTool(
    server,
    "ui_kontury_parkow",
    {
      title: "Kontury parków dla mapy",
      description: "Uproszczone kontury parków (OSM) do rysowania mapy w karcie. Narzędzie dla interfejsu, nie dla modelu.",
      inputSchema: z.object({
        lp: z.array(z.number().int()).max(60).optional(),
        wokol_lp: z.number().int().optional().describe("Park centralny: dołącz sąsiadów w promieniu"),
        promien_m: z.number().int().min(100).max(3000).default(900),
      }),
      annotations: readOnly,
      _meta: { ui: { resourceUri: KARTA_URI, visibility: ["app"] } },
    } as any,
    async (args: any) => run(async () => konturyParkow(args)) as any,
  );

  return server;
}

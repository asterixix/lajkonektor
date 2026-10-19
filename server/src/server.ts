import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { addressToPoint } from "./adres.ts";
import { pozycje, szukaj } from "./katalog.ts";
import { parkGeometry } from "./parki.ts";
import { daneZapytaj, zbiorOpis } from "./zapytanie.ts";
import { statusZrodel } from "./status.ts";
import { geokodujOsm, kandydaciOsm, kandydaciPara } from "./osm.ts";
import { dotyczace, pobierzKomunikaty } from "./komunikaty.ts";
import { odleglosc, odjazdyZPrzystankow, opisPrzystanku, planuj, przystankiBlisko, uzupelnijNaZywo, wczytajSiec } from "./transport.ts";
import { bdlDane, bdlSzukaj, daneGovSzukaj, daneGovZasoby } from "./zewnetrzne.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Wspólne opakowanie: wynik jako tekst JSON (dla każdego klienta) + structuredContent; błąd jako isError.
async function run(fn: () => Promise<Record<string, unknown>>) {
  try {
    const data = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
  } catch (e) {
    return { isError: true, content: [{ type: "text" as const, text: `Błąd: ${(e as Error).message}` }] };
  }
}

const geometria = z
  .union([
    z.object({ punkt: z.object({ lat: z.number().min(49.9).max(50.2), lon: z.number().min(19.7).max(20.2) }), promien_m: z.number().min(1).max(5000).optional() }),
    z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
    z.object({ z: z.object({ id: z.string(), where: z.string().optional(), bufor_m: z.number().min(1).max(5000).optional() }) }),
  ])
  .describe(
    "Filtr przestrzenny (tylko warstwy MSIP): {punkt:{lat,lon},promien_m} | {bbox:[zach,pld,wsch,pln]} | {z:{id,where,bufor_m}} = obiekty innej warstwy (lub 'lokalne:parki_osm') z buforem",
  );

export function createServer(cf?: { colo?: string; country?: string }): McpServer {
  const server = new McpServer({ name: "lajkonektor", version: "0.2.0" });

  server.registerTool(
    "katalog_szukaj",
    {
      title: "Szukaj danych o Krakowie",
      description:
        `Szukaj w katalogu ${pozycje.length} zbiorów danych miasta Krakowa (tabele Otwartych Danych UMK i warstwy mapowe MSIP: plany miejscowe, demografia, hałas, transport, edukacja, zdrowie, zieleń i inne) po temacie lub nazwie pola. Zwraca id do użycia w zbior_opis i dane_zapytaj. ZACZNIJ OD TEGO NARZĘDZIA, gdy pytanie dotyczy danych o mieście.`,
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
        return { liczba: wyniki.length, wyniki, podpowiedz: wyniki.length ? "Użyj zbior_opis(id), by zobaczyć pola i słowniki, potem dane_zapytaj." : "Brak wyników: spróbuj innych słów lub bez filtra 'zrodlo'." };
      }),
  );

  server.registerTool(
    "zbior_opis",
    {
      title: "Opis zbioru danych",
      description: "Pełny opis zbioru z katalogu: pola i typy, aliasy, słowniki kodów, liczba rekordów, próbka danych i wskazówki do zapytań.",
      inputSchema: z.object({ id: z.string().describe("id z katalog_szukaj, np. 'msip:Planowanie/BP_MPZP/3'") }),
      annotations: readOnly,
    },
    ({ id }) => run(() => zbiorOpis(id)),
  );

  server.registerTool(
    "dane_zapytaj",
    {
      title: "Zapytaj zbiór danych",
      description:
        "Uniwersalne zapytanie do zbioru z katalogu: filtr, wybór pól, sortowanie, agregacje (sum/count/avg/min/max z grupowaniem), stronicowanie oraz filtr przestrzenny dla warstw MSIP (punkt z promieniem, ramka, albo bufor wokół obiektów innej warstwy). Liczby liczy serwer, nie model. Współrzędne WGS84.",
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
        tylko_liczba: z.boolean().optional().describe("MSIP: zwróć tylko liczbę obiektów"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => daneZapytaj(args)),
  );

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    "status_zrodel",
    {
      title: "Status źródeł danych",
      description: "Sprawdza z serwera Lajkonektora, czy źródła (Otwarte Dane UMK, MSIP, GUS BDL, ZTP) odpowiadają, i podaje lokalizację serwera. Użyj, gdy inne narzędzia zwracają błąd HTTP 5xx lub timeout.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => run(() => statusZrodel(cf)),
  );

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  const punkt = z.object({ lat: z.number().min(49.9).max(50.2), lon: z.number().min(19.7).max(20.2) });
  const adres = z.object({ ulica: z.string().min(2), numer: z.string(), kod_pocztowy: z.string().optional() });
  const nazwaMiejsca = z.object({ tekst: z.string().min(2).describe("Nazwa miejsca, np. 'Rynek Główny', 'Dworzec Główny', 'AGH' (geokodowanie OSM)") });
  const miejsce = z
    .union([punkt, adres, nazwaMiejsca])
    .describe("Miejsce: {lat,lon} | adres {ulica,numer[,kod_pocztowy]} (MSIP) | {tekst} nazwa miejsca (OpenStreetMap)");
  const rozwiaz = async (m: z.infer<typeof miejsce>) => {
    if ("lat" in m) return { lat: m.lat, lon: m.lon, etykieta: `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`, zrodlo: "współrzędne podane" };
    if ("tekst" in m) {
      const g = await geokodujOsm(m.tekst);
      if (!g) throw new Error(`Nie znaleziono miejsca w Krakowie: ${m.tekst}`);
      return { lat: g.lat, lon: g.lon, etykieta: g.nazwa, zrodlo: "OpenStreetMap (Nominatim)" };
    }
    const r = await addressToPoint(m);
    if (!r.liczba) throw new Error(`Nie znaleziono adresu: ${m.ulica} ${m.numer}. ${r.uwaga}`);
    const k = r.kandydaci[0];
    return { lat: k.lat as number, lon: k.lon as number, etykieta: `${k.ulica} ${k.numer}, ${k.kod_pocztowy} (${k.dzielnica})`, zrodlo: "MSIP Kraków (punkty adresowe)" };
  };

  server.registerTool(
    "przystanki_w_poblizu",
    {
      title: "Przystanki komunikacji w pobliżu",
      description:
        "Przystanki autobusowe, tramwajowe i aglomeracyjne (ZTP Kraków) w pobliżu miejsca: odległość i czas dojścia pieszo po sieci OSM (OSRM), linie. Miejsce: współrzędne, adres albo nazwa miejsca.",
      inputSchema: z.object({ miejsce, promien_m: z.number().int().min(100).max(1500).default(500), limit: z.number().int().min(1).max(10).default(6) }),
      annotations: readOnly,
    },
    ({ miejsce: m, promien_m, limit }) =>
      run(async () => {
        const [p, S] = await Promise.all([rozwiaz(m), wczytajSiec()]);
        const { kandydaci, zrodlo } = await kandydaciOsm(S, p, promien_m, limit);
        return {
          miejsce: p.etykieta, zrodlo_miejsca: p.zrodlo, zrodlo_dojscia: zrodlo, feedy: S.feedy,
          przystanki: kandydaci.map((k) => ({ ...opisPrzystanku(S, k.idx, k.m), dojscie_min: k.min })),
        };
      }),
  );

  server.registerTool(
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

  server.registerTool(
    "trasa",
    {
      title: "Planer trasy komunikacją miejską",
      description:
        "Jak dojechać komunikacją miejską z A do B (współrzędne, adres albo nazwa miejsca): geokodowanie i dojście do przystanku po sieci pieszej OSM (OSRM), linie bezpośrednie i z jedną przesiadką, najbliższe odjazdy na żywo (GTFS-RT) dla pierwszego odcinka oraz komunikaty o utrudnieniach (ServiceAlerts). Czasy są szacunkami: oczekiwanie z częstotliwości kursów, jazda z mediany rozkładu.",
      inputSchema: z.object({ z: miejsce, do: miejsce, max_dojscie_m: z.number().int().min(200).max(1500).default(800) }),
      annotations: readOnly,
    },
    ({ z: a, do: b, max_dojscie_m }) =>
      run(async () => {
        const [pa, pb, S] = await Promise.all([rozwiaz(a), rozwiaz(b), wczytajSiec()]);
        const { start: ks, cel: kc } = await kandydaciPara(S, pa, pb, max_dojscie_m);
        const opcje = planuj(S, ks.kandydaci, kc.kandydaci);
        const rt = await uzupelnijNaZywo(S, opcje.slice(0, 5));
        const pokazane = opcje.slice(0, 5);
        const feedyOpcji = [...new Set(pokazane.flatMap((o) => o.nogi.map((n) => S.przystanki[n.wsiadanie_idx][0])))];
        const k = feedyOpcji.length ? await pobierzKomunikaty(S, feedyOpcji) : { komunikaty: [], bledy: [] as string[] };
        const linie = new Set(pokazane.flatMap((o) => o.nogi.map((n) => n.linia)));
        const przyst = new Set(pokazane.flatMap((o) => o.nogi.flatMap((n) => [S.przystanki[n.wsiadanie_idx][2], S.przystanki[n.wysiadanie_idx][2]])));
        const bledy = [...rt.bledy, ...k.bledy];
        return {
          zrodlo: "ZTP Kraków: GTFS statyczny pobierany na żywo + GTFS-RT TripUpdates i ServiceAlerts; dojście: OSM",
          uwaga: "Szacunek, nie gwarancja: brak pełnego rozkładu, transfery do 200 m, maks. jedna przesiadka.",
          z: { opis: pa.etykieta, zrodlo: pa.zrodlo }, do: { opis: pb.etykieta, zrodlo: pb.zrodlo },
          odleglosc_prosta_m: Math.round(odleglosc(pa.lat, pa.lon, pb.lat, pb.lon)),
          opcji: opcje.length,
          ...(bledy.length ? { bledy_realtime: bledy } : {}),
          komunikaty_o_utrudnieniach: dotyczace(k.komunikaty, linie, przyst).slice(0, 8),
          opcje: pokazane.map(({ nogi, ...o }) => ({ ...o, nogi: nogi.map(({ wsiadanie_idx, wysiadanie_idx, wzorzec, ...n }) => n) })),
        };
      }),
  );

  server.registerTool(
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

  return server;
}

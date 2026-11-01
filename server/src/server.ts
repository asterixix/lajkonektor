import { McpServer } from "@modelcontextprotocol/server";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { addressToPoint } from "./adres.ts";
import { brakiTematu, migawkaKatalogu, pozycje, szukajZOcena } from "./katalog.ts";
import { konturyParkow, parkGeometry } from "./parki.ts";
import { KARTA_HTML } from "./ui/karta.generated.ts";
import { podsumuj } from "./podsumowanie.ts";
import { widokSchema, zlozWidok } from "./widok.ts";
import { daneZapytaj, zbiorOpis } from "./zapytanie.ts";
import { statusZrodel } from "./status.ts";
import { plikOdczyt } from "./plik.ts";
import { prognoza } from "./prognoza.ts";
import { kandydaciOsm, kandydaciPara, szukajMiejsc, wybierzMiejsce } from "./osm.ts";
import { dotyczace, pobierzKomunikaty } from "./komunikaty.ts";
import { odleglosc, odjazdyZPrzystankow, opisPrzystanku, planuj, przystankiBlisko, uzupelnijNaZywo, wczytajSiec } from "./transport.ts";
import { bdlDane, bdlSzukaj, daneGovSzukaj, daneGovZasoby } from "./zewnetrzne.ts";
import { czyZtp } from "./siec.ts";
import { planowanieWPunkcie } from "./planowanie.ts";
import { NAZWY_RODZAJOW, NAZWY_WSKAZNIKOW, dostepnosc, najblizszeObiekty, statystyka, wskaznikDzielnic } from "./analizy.ts";
import { WERSJA } from "./wersja.ts";
import { analizaSchema, wykonajAnalize } from "./raport.ts";
import { BladDomeny } from "./bledy.ts";
import { PUBLICZNE, stanOdpowiedzi, stronaOdpowiedzi } from "./kontrakt.ts";
import { KATEGORIE_OSM, osmObiekty } from "./overpass.ts";
import { runtime } from "./runtime.ts";
import { schematWyniku } from "./schematy.ts";
import { prezentacjaWyniku } from "../shared/prezentacja.ts";
import { ZASADY_ODPOWIEDZI } from "./instrukcje.ts";
import { eksportDanychSchema, eksportujDane } from "./eksport-danych.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Wspólne opakowanie: wynik jako tekst JSON (dla każdego klienta) + structuredContent; błąd jako isError.
async function run(fn: () => Promise<Record<string, unknown>>) {
  try {
    const data = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
  } catch (e) {
    if (e instanceof BladDomeny && e.kod === "wybor") return { content: [{ type: "text" as const, text: e.message }], structuredContent: { status: "wymaga_wyboru", ...e.dane } };
    return { isError: true, _blad: e, content: [{ type: "text" as const, text: `Błąd: ${(e as Error).message}` }] };
  }
}

// Wspólny zasób dla wyboru miejsca i bramki operacji. Odczyty nie otwierają własnych apletów.
const KARTA_URI = "ui://lajkonektor/karta-v2.html";
export const WIDOK: Record<string, string> = {
  miejsce_szukaj: "miejsca", osm_obiekty: "miejsca", operacje_szukaj: "operacje", operacja_wykonaj: "zlozony",
  analiza: "zlozony", dane_eksportuj: "eksport",
  katalog_szukaj: "katalog", zbior_opis: "opis_zbioru", dane_zapytaj: "tabela", adres_na_punkt: "adres", parki_geometria: "parki",
  bdl_szukaj: "bdl_lista", bdl_dane: "szereg", dane_gov: "dane_gov", przystanki_w_poblizu: "przystanki", odjazdy: "odjazdy",
  trasa: "trasa", utrudnienia: "komunikaty", status_zrodel: "status", prognoza: "prognoza", plik_odczyt: "plik", widok: "zlozony", wskaznik_dzielnic: "zlozony", dostepnosc: "zlozony", obiekty_w_poblizu: "zlozony", statystyka: "zlozony", planowanie_w_punkcie: "zlozony",
};

// Narzędzia opierające się na migawce katalogu (zbiory dodane po jej dacie mogą nie być widoczne).
const ZE_KATALOGU = new Set(["katalog_szukaj", "zbior_opis", "dane_zapytaj"]);

// Kontury i przebiegi do rysowania map są potrzebne karcie (structuredContent), a nie modelowi: w tekście wyniku ich nie powtarzamy.
const bezKonturow = (k: string, v: unknown) => {
  if (k === "kontury" || k === "linie_geom" || k === "_geometria") return undefined;
  // Tylko prawdziwy raport z tabelami; klucz "raport" występuje też np. w schemacie wyniku zwracanym przez operacje_szukaj.
  if (k === "raport" && v && typeof v === "object" && Array.isArray((v as any).tabele)) {
    const r = v as any;
    return { ...r, tabele: r.tabele.map((t: any) => ({ ...t, wiersze: t.wiersze.slice(0, 20), wierszy_ogolem: t.wiersze.length, podglad: t.wiersze.length > 20 })), uwaga_tekstu: "Tekst pokazuje do 20 wierszy na tabelę. Pełne tabele i eksport są w structuredContent karty." };
  }
  return v;
};

const INSTRUKCJE = `Lajkonektor: otwarte dane Krakowa (Otwarte Dane i MSIP Urzędu Miasta, GUS BDL, dane.gov.pl, rozkłady i pozycje pojazdów ZTP na żywo, OpenStreetMap). Tylko odczyt.

${ZASADY_ODPOWIEDZI}

Interfejs hybrydowy: dostępnych jest siedem narzędzi. Bezpośrednio używaj katalog_szukaj, zbior_opis, dane_zapytaj, miejsce_szukaj, osm_obiekty. Pozostałe nazwy w opisie oznaczają operacje: odkryj najwyżej trzy schematy przez operacje_szukaj(temat), a potem wywołaj operacja_wykonaj({operacja,argumenty}). Statusy: poprawna, czesciowa, pusta, niedostepna. Przy wielu trafieniach miejsca narzędzie bierze najlepsze i podaje je w uwadze; powiedz użytkownikowi, które przyjęto. Dalsze strony: powtórz to samo wywołanie z kursor_odpowiedzi=nastepny_kursor; fragmenty_json wskazują ścieżki pól. Geometria prezentacyjna jest wyłącznie w _meta karty.

Warsztat analityka: dla wieloźródłowego raportu użyj analiza. Najpierw odkryj źródła i pola; przedstaw pytanie, definicje, daty i metody. Wywołaj tryb sprawdz, pokaż plan i jego ograniczenia człowiekowi, zaczekaj na zatwierdzenie w rozmowie. Tryb wykonaj przyjmuje identyczny plan, id_planu oraz treść zatwierdzenia. Nie wpisuj zatwierdzenia za człowieka. Jeśli użytkownik prosi tylko o plan lub wyraźnie wstrzymuje pobranie danych i obliczenia, nie wywołuj trybu wykonaj ani narzędzi pobierających dane. Jest to procedura współpracy, bez uwierzytelniania zgody przez serwer. Raport i pakiet HTML/CSV/JSON pobiera się z karty; PDF przez wydruk samodzielnego HTML. Źródła, obliczenia i ograniczenia są oddzielone od interpretacji. Nie wnioskuj o wolnych miejscach z liczby miejsc, o popycie z liczby placówek, o oszczędnościach bez kosztów ani o przyczynowości z korelacji. GUS dla całego miasta nie opisuje 18 dzielnic. Brak obsługiwanej metody lub danych wymaga jawnego ograniczenia wyniku.

Zakres: źródło faktów o Krakowie, które zmieniają się w czasie albo wymagają dokładnej liczby, adresu, godziny lub przebiegu: liczby mieszkańców, placówki, ceny, plany miejscowe, hałas, odjazdy i utrudnienia, trasy, wskaźniki GUS. Wiedza modelu o tych sprawach bywa nieaktualna, a dane z narzędzi mają datę pobrania w polu _dowod.

Zbiory danych: katalog_szukaj szuka po temacie i zwraca id; zbior_opis opisuje pola i słowniki; dane_zapytaj filtruje, sortuje, grupuje i agreguje (sum/count/avg/min/max) — także filtr przestrzenny dla warstw MSIP ({punkt,promien_m}, {bbox} albo {z:{id,bufor_m}}). Pokrycie obejmuje parki, plany miejscowe, pozwolenia na budowę, hałas, działki, ludność i cudzoziemców, ceny nieruchomości, żłobki, przedszkola, szkoły, szpitale, apteki, muzea, teatry, biblioteki, parkingi i strefę płatnego parkowania, infrastrukturę rowerową, policję i wybory. Tematów bez danych (odpady i PSZOK, kina, targowiska, wypadki drogowe) katalog_szukaj nie znajdzie i zwraca je w polu brak_w_katalogu.

Adresy i miejsca: adres_na_punkt geokoduje adres i podaje dzielnicę; nazwę miejsca przyjmują trasa i przystanki_w_poblizu przez pole {tekst}. Gdy nazwa lub adres pasuje do kilku lokalizacji, narzędzie przyjmuje najlepsze trafienie i podaje je w uwadze; nie pytaj o wybór, tylko wskaż przyjęte miejsce.

Komunikacja: przystanki_w_poblizu, odjazdy (GTFS-RT na żywo), trasa (z i do: adres, nazwa miejsca albo współrzędne; dojście piesze po sieci OSM, jedna przesiadka) oraz utrudnienia. Obejmuje ZTP (autobusy, tramwaje, linie aglomeracyjne do gmin wokół Krakowa) i pociągi (Koleje Małopolskie, PolRegio, Intercity — dokładne godziny z rozkładu PKP PLK, bez opóźnień). Miejsca poza Krakowem podawaj jako {tekst}, np. 'Staniątki 15'. Czasy trasy są szacunkami (oczekiwanie z częstotliwości kursów, jazda z mediany rozkładu). Gdy źródło zwraca błąd 522, status_zrodel pokazuje colo, kraj i dostępność każdego źródła.

Szeregi GUS: bdl_szukaj znajduje wskaźnik, bdl_dane zwraca szereg; prognoza robi deterministyczną projekcję z przedziałami 80% i 95% (trend liniowy, wzrost wykładniczy, Holt) i wymaga co najmniej 3 punktów. Pliki CSV/XLSX/GeoJSON z adresów *.gov.pl i *.krakow.pl czyta plik_odczyt (limit 8 MB) z profilem kolumn i agregacją po stronie serwera.

Analizy: wskaznik_dzielnic (ranking, mapa koropletowa i profil dzielnicy), dostepnosc (standardy dostępności z planu ogólnego, pokrycie ludności usługą, białe plamy), obiekty_w_poblizu (najbliższe apteki, szkoły, toalety itd.), planowanie_w_punkcie (plan, strefa planu ogólnego i działka dla adresu), statystyka (korelacja, trend, nierówność, odstające); liczby liczy serwer.

Karty: odczyty katalogu, opisu, danych, OSM i schematów nie otwierają własnych apletów. Wybór miejsca i bramka operacji obsługują MCP Apps. Wyniki pomocnicze bramki są zwinięte; wybór i plan do zatwierdzenia pozostają widoczne. Gdy wizualizacja pomaga, odkryj widok i użyj cel=odpowiedz z najwyżej jednym blokiem wizualnym oraz źródłem z. Nie twórz dodatkowych kart dla etapów pracy. Raport i pobranie danych to oddzielne czynności wyłącznie na prośbę: analiza tworzy raport, dane_eksportuj tworzy ZIP z CSV/JSON i pochodzeniem bez narracyjnego raportu. Odczyt eksportowy ponawia zapytania; nie obiecuj identyczności z wcześniejszym wynikiem. Po przeliczeniach użyj zatwierdzonego planu, jego id i rzeczywistej deklaracji człowieka.

Nie podawaj liczb, których narzędzia nie zwróciły. Podawaj źródło, datę stanu danych tylko wtedy, gdy podaje ją źródło, oraz pokrycie (np. geometria jest tylko dla części parków). Pole _dowod.pobrano oznacza czas pobrania odpowiedzi, a odswiezono czas odświeżenia publikacji; żadna z tych wartości sama w sobie nie potwierdza daty stanu danych. Nie pisz „stan na” na podstawie daty pobrania ani migawki katalogu.

Granice wyniku: kompletne=false znaczy, że wiersze są tylko częścią wyniku (sum i liczności nie podawaj jako pełnych). Zero wierszy albo brak_pelnego_dopasowania nie dowodzi, że zjawiska nie ma: to znak, by sprawdzić filtr lub słownik w zbior_opis. Gdy dane przeczą założeniu pytania, wynik mówi o założeniu, nie o oczekiwaniu rozmówcy; przy sprzeciwie warto ponownie sprawdzić dane, a nie zmieniać liczby.`;

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

  // Wyniki zachowują dane karty i wynik tekstowy. Do wyniku dokładamy widok,
  // zapytanie (do odświeżania) i krótkie podsumowanie po polsku dla klientów bez UI.
  // Rejestr surowych handlerów: narzędzie `widok` wykonuje przez niego zapytania wskazane w blokach (`z`).
  const rejestr = new Map<string, { schema: z.ZodType; cfg: any; handler: (args: any) => Promise<any> }>();
  // Wynik narzędzia dostaje widok, zapytanie i podsumowanie. Tę samą ścieżkę używa MCP i /api/wywolaj.
  const otocz = (nazwa: string, args: unknown, sc: Record<string, unknown>) => {
    // _dowod: skąd i kiedy; w tekście dla modelu, więc da się na nim oprzeć odpowiedź o datę i pochodzenie liczb.
    const warstwy = runtime.getStore()?.warstwy;
    const dane = { status: stanOdpowiedzi(sc), podsumowanie: podsumuj(nazwa, sc), _dowod: { pobrano: new Date().toISOString(), ...(ZE_KATALOGU.has(nazwa) ? { migawka_katalogu: migawkaKatalogu } : {}) }, ...(warstwy?.length ? { warstwy: [...warstwy], uwaga_migawek: warstwy.some(w => w.archiwalne) ? "Wynik korzysta z archiwalnej migawki awaryjnej. Datę stanu i wiek sprawdź przy każdej warstwie." : undefined } : {}), ...sc };
    return { content: [{ type: "text" as const, text: JSON.stringify(dane, bezKonturow) }], structuredContent: { _widok: WIDOK[nazwa], _zapytanie: args, ...(origin ? { _kafelki: `${origin}/kafelki/{z}/{x}/{y}.png`, _raport_url: `${origin}/?raport=1` } : {}), ...dane, _prezentacja: prezentacjaWyniku(nazwa, args, dane) } };
  };
  const narzedzie = (nazwa: string, cfg: any, handler: (args: any) => Promise<any>) => {
    rejestr.set(nazwa, { schema: cfg.inputSchema, cfg: { ...cfg, outputSchema: schematWyniku(nazwa) }, handler });
  };
  const wywolaj = async (nazwa: string, argumenty: unknown): Promise<any> => {
    if (!runtime.getStore()?.warstwy) return runtime.run({ ...runtime.getStore(), warstwy: [] }, () => wywolaj(nazwa, argumenty));
    const t = rejestr.get(nazwa);
    if (!t) throw new BladDomeny("wejscie", `nieznane narzędzie ${nazwa}`);
    const p = t.schema.safeParse(argumenty);
    if (!p.success) throw new BladDomeny("wejscie", `argumenty ${nazwa}: ${p.error.issues.map((i) => `${i.path.join(".") || "(korzeń)"}: ${i.message}`).join("; ")}`);
    const r = await t.handler(p.data);
    if (r.isError) throw r._blad ?? new BladDomeny("niedostepne", String(r.content[0].text).replace(/^Błąd:\s*/, ""));
    const overeny = t.cfg.outputSchema.safeParse({ ...r.structuredContent, status: stanOdpowiedzi(r.structuredContent) });
    if (!overeny.success) throw new BladDomeny("niedostepne", "Operacja zwróciła dane niezgodne ze schematem wyjścia.");
    const dane = otocz(nazwa, p.data, r.structuredContent).structuredContent;
    return r.structuredContent.status === "wymaga_wyboru" ? { ...dane, _widok: "miejsca" } : dane;
  };

  // Komunikaty silnika analiz opisują, co poprawić w planie; bez tego bramka zamienia je na ogólne „niedostępne”.
  const bladSilnika = (e: unknown): never => { throw e instanceof BladDomeny ? e : new BladDomeny("niedostepne", `Analiza przerwana: ${(e as Error).message}`); };
  narzedzie("analiza", {
    title: "Sprawdź plan badania i wykonaj raport",
    description: "Uniwersalna analiza na dostępnych źródłach: zatwierdzany plan, łączenie tabel, agregacje, wskaźniki, statystyka, projekcje i raport z pełnymi tabelami, metodami oraz pochodzeniem. Najpierw odkryj zbiory przez katalog_szukaj i zbior_opis. W trybie sprawdz uzyskasz id_planu i plan do przedstawienia człowiekowi. Po rzeczywistym zatwierdzeniu w rozmowie użyj wykonaj z identycznym planem i treścią zatwierdzenia. Maks. 8 źródeł, 12 operacji, 5000 wierszy we wszystkich tabelach i 1 MiB wyniku. Bez zapisu raportów na serwerze. Eksport z karty: HTML, CSV, JSON; HTML drukuje się do PDF. Zatwierdzenie jest deklaracją, nie uwierzytelnionym dowodem zgody.",
    inputSchema: analizaSchema,
    annotations: readOnly,
  }, (args) => run(() => wykonajAnalize(args, wywolaj).catch(bladSilnika)));

  narzedzie("dane_eksportuj", {
    title: "Pobierz dane i opis pochodzenia",
    description: "Wyłącznie na wyraźną prośbę o pobranie danych. Tworzy pakiet CSV/JSON z odczytanymi tabelami i pochodzeniem, bez narracyjnego raportu. Prosty odczyt: z wskazuje obsługiwane źródło. Przeliczenia: podaj plan, jego id_planu i rzeczywiste zatwierdzenie, jak w analiza. Ponawia odczyt; dane mogą różnić się od wcześniejszej odpowiedzi. Wymaga kompletnego wyniku, maks. 5000 wierszy wszystkich tabel i 1 MiB. Plik ZIP pobiera się z karty; gdy host nie obsługuje pobierania, można skopiować JSON.",
    inputSchema: eksportDanychSchema,
    annotations: readOnly,
  }, (args) => run(() => eksportujDane(args, wywolaj).catch(bladSilnika)));

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
        const { wyniki: znalezione, pelne } = szukajZOcena(temat, { zrodlo, limit });
        const wyniki = znalezione.map((p) => ({
          id: p.id, zrodlo: p.zrodlo, tytul: p.tytul, geometria: p.geometria ?? undefined, dopasowanie: pelne.has(p.id) ? "pelne" : "czesciowe",
          pola: p.pola.slice(0, 14).map((f) => f.split(":")[0]), ...(p.pola.length > 14 ? { pol_razem: p.pola.length } : {}),
        }));
        const brak = brakiTematu(temat);
        const slabe = wyniki.length > 0 && !pelne.size;
        return {
          liczba: wyniki.length, wyniki, ...(brak ? { brak_w_katalogu: brak } : {}), ...(slabe ? { brak_pelnego_dopasowania: true } : {}),
          podpowiedz: !wyniki.length ? "Brak wyników: spróbuj innych słów lub bez filtra 'zrodlo'."
            : slabe ? "Żaden zbiór nie zawiera wszystkich słów tematu: wyniki są tylko podobne i mogą dotyczyć czegoś innego. Sprawdź je w zbior_opis; jeśli nie pasują, danych w katalogu nie ma."
            : "Użyj zbior_opis(id), by zobaczyć pola i słowniki, potem dane_zapytaj.",
        };
      }),
  );

  narzedzie(
    "zbior_opis",
    {
      title: "Opis zbioru danych",
      description: "Pełny opis zbioru danych miasta Krakowa z katalogu: pola i typy, aliasy, słowniki kodów (z liczbą kodów, gdy lista jest ucięta), liczba rekordów, data odświeżenia, próbka danych i wskazówki do zapytań.",
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
        "Zapytanie do zbioru danych miasta Krakowa z katalogu (np. ile żłobków jest w dzielnicy, jakie plany miejscowe obejmują działkę, ile osób mieszka w zasięgu parków): filtr, wybór pól, sortowanie, agregacje (sum/count/avg/min/max z grupowaniem), stronicowanie oraz filtr przestrzenny dla warstw MSIP (punkt z promieniem, ramka, albo bufor wokół obiektów innej warstwy). Agregacje liczy serwer, więc wynik jest powtarzalny. Wynik ma pole kompletne (false = tylko część wyniku). Współrzędne WGS84.",
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
      description: "Sprawdza z serwera Lajkonektora, czy źródła danych o Krakowie (Otwarte Dane UMK, MSIP, GUS BDL, ZTP) odpowiadają, i podaje lokalizację serwera. Użyj, gdy inne narzędzia zwracają błąd HTTP 5xx lub timeout.",
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
        "Szukaj w BDL po samej nazwie wskaźnika lub wąskiej frazie (np. „ludność ogółem” albo „stopa bezrobocia rejestrowanego”); nie doklejaj nazwy miasta, „GUS” ani „BDL” do frazy, bo wyszukiwanie może zwrócić luźno powiązane zmienne. Wynik pokazuje temat, nazwę zmiennej i jednostkę oraz zwraca id do bdl_dane. Wybierz wyłącznie zmienną, której nazwa, temat i jednostka odpowiadają pytaniu. Jeśli pierwszy wynik jest luźno powiązany, wykonaj najwyżej jedną precyzyjniejszą próbę; nie używaj innych wskaźników jako zastępstwa. Dla bezrobocia odróżniaj stopę rejestrowaną od BAEL i od liczby bezrobotnych na ofertę pracy. Zmienne miesięczne mogą mieć osobne id dla każdego miesiąca.",
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
        "Pobiera wartości wybranych zmiennych BDL w czasie dla Krakowa (domyślnie powiat m. Kraków); bez parametru lata pobiera wszystkie dostępne okresy. Zwraca temat, nazwę, jednostkę, rok i wartość. Przed analizą sprawdź, czy szereg ma wystarczająco dużo porównywalnych punktów. Dla zmiennej miesięcznej (np. osobne id dla stycznia–grudnia) pobierz to samo id w kolejnych latach, aby porównać ten sam miesiąc; nie łącz różnych miesięcy ani definicji wskaźnika w jeden trend.",
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
        if (!q) throw new BladDomeny("wejscie", "Podaj 'q' (fraza) albo 'zbior_id'.");
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
      const g = await szukajMiejsc(m.tekst);
      if (!g.length) throw new BladDomeny("wejscie", `Nie znaleziono miejsca w Krakowie ani w Małopolsce: ${m.tekst}. Spróbuj z nazwą miejscowości, np. 'Staniątki 15'.`);
      const w = wybierzMiejsce(m.tekst, g.map((x) => ({ ...x, etykieta: x.nazwa })));
      return { lat: w.lat, lon: w.lon, etykieta: w.etykieta, zrodlo: "OpenStreetMap (Nominatim)" };
    }
    const r = await addressToPoint(m);
    if (!r.liczba) {
      // Poza Krakowem punktów adresowych MSIP nie ma: próbujemy OSM.
      const g = await szukajMiejsc(`${m.ulica} ${m.numer}`);
      const w = wybierzMiejsce(`${m.ulica} ${m.numer}`, g.map((x) => ({ ...x, etykieta: x.nazwa })));
      if (w) return { lat: w.lat, lon: w.lon, etykieta: w.etykieta, zrodlo: "OpenStreetMap (Nominatim); adres spoza punktów adresowych MSIP" };
      throw new BladDomeny("wejscie", `Nie znaleziono adresu: ${m.ulica} ${m.numer}. ${r.uwaga}`);
    }
    // Ta sama ulica i numer w różnych dzielnicach lub kodach pocztowych to różne miejsca; powtórki tego samego adresu pomijamy.
    const rozne = r.kandydaci.filter((k: any, i: number, t: any[]) => t.findIndex((o) => o.ulica === k.ulica && o.numer === k.numer && o.lat === k.lat && o.lon === k.lon) === i);
    const k = wybierzMiejsce(`${m.ulica} ${m.numer}`, rozne.map((k: any) => ({ lat: k.lat as number, lon: k.lon as number, etykieta: `${k.ulica} ${k.numer}, ${k.kod_pocztowy} (${k.dzielnica})` })));
    return { ...k, zrodlo: "MSIP Kraków (punkty adresowe)" };
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
        if (!nazwa && !m) throw new BladDomeny("wejscie", "Podaj 'nazwa' przystanku albo 'miejsce'.");
        const S = await wczytajSiec();
        const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
        let idxs: number[];
        if (m) {
          const p = await rozwiaz(m);
          idxs = przystankiBlisko(S, p.lat, p.lon, promien_m, 40).map((x) => x.idx).filter((i) => !nazwa || norm(S.przystanki[i][2]).includes(norm(nazwa)));
        } else idxs = S.przystanki.flatMap((p, i) => (norm(p[2]).includes(norm(nazwa!)) ? [i] : []));
        if (!idxs.length) throw new BladDomeny("wejscie", "Nie znaleziono przystanków dla podanych kryteriów.");
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
        "Deterministyczna projekcja szeregu czasowego, np. liczby mieszkańców Krakowa czy stopy bezrobocia (z bdl_dane lub dane_zapytaj) z przedziałami 80% i 95% oraz opisem metody. Metody: trend liniowy, wzrost wykładniczy, Holt; w trybie auto wybór po błędzie backtestu. To projekcja trendu, nie przewidywanie. Wymaga ≥3 punktów (zalecane ≥6). Liczy serwer, więc wynik jest powtarzalny.",
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
        "Pobiera i czyta plik CSV, XLSX lub GeoJSON/JSON z otwartych danych o Krakowie z adresu https instytucji publicznych (*.gov.pl, *.krakow.pl, np. link z dane_gov albo eksport MSIP f=geojson) i zwraca tabelę z profilem kolumn (typ, braki, min/max/suma/średnia), opcjonalnie z filtrem pól, sortowaniem i agregacją po stronie serwera. Limit pliku 8 MB.",
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
    "wskaznik_dzielnic",
    {
      title: "Wskaźnik w przekroju dzielnic i profil dzielnicy",
      description:
        "Liczy wskaźnik dla 18 dzielnic Krakowa: wartość, miejsce w rankingu, mediana, nierówność (Gini), mapa koropletowa i wykres. Licznik i mianownik wybiera się z gotowych wskaźników (ludność wg wieku, parki, żłobki, przedszkola, szkoły, apteki, biblioteki, cena m²), np. przedszkola na 1000 dzieci 3–6 lat albo parki w m² na mieszkańca. Bez licznika zwraca profil dzielnicy (albo miasta) na tle pozostałych. Ludność to zameldowani na pobyt stały.",
      inputSchema: z.object({
        licznik: z.enum(NAZWY_WSKAZNIKOW).optional().describe("Wskaźnik w liczniku; pominięty = profil dzielnicy"),
        mianownik: z.enum(NAZWY_WSKAZNIKOW).optional().describe("Wskaźnik w mianowniku, np. ludnosc (na 10 tys. mieszkańców) albo dzieci_3_6 (na 1000 dzieci)"),
        dzielnica: z.string().optional().describe("Dzielnica do wyróżnienia lub profilu: numer 1–18 albo nazwa, np. 'VIII Dębniki'"),
        klasy: z.number().int().min(2).max(7).optional().describe("Liczba klas koloru na mapie (domyślnie 5)"),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => run(() => wskaznikDzielnic(args)),
  );

  narzedzie(
    "dostepnosc",
    {
      title: "Dostępność usług i standardy planu ogólnego",
      description:
        "Trzy tryby. (1) Z polem miejsce: czy ten adres spełnia standardy dostępności projektu planu ogólnego Krakowa (szkoła podstawowa, zieleń ≥ 3 ha i ≥ 15 ha; progi zależą od obszaru intensywnego lub ekstensywnego). (2) Bez miejsca, usluga=standardy (domyślnie): ilu mieszkańców spełnia standardy, wg dzielnic, z białymi plamami. (3) usluga=apteka, zlobek, przedszkole itd. z promieniem: jaki odsetek mieszkańców ma obiekt w zasięgu i gdzie jest największy brak. Odległości w linii prostej przeliczone na drogę dojścia ×1,3; ludność z siatki 100 m (zameldowani).",
      inputSchema: z.object({
        miejsce: miejsce.optional(),
        usluga: z.enum(["standardy", ...NAZWY_RODZAJOW]).optional(),
        promien_m: z.number().int().min(100).max(10_000).optional().describe("Zasięg usługi w metrach (domyślny zależy od rodzaju usługi)"),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ miejsce: m, usluga, promien_m }) =>
      run(async () => dostepnosc({ miejsce: m ? await rozwiaz(m) .then((p) => ({ lat: p.lat, lon: p.lon, etykieta: p.etykieta })) : undefined, usluga, promien_m })),
  );

  narzedzie(
    "obiekty_w_poblizu",
    {
      title: "Najbliższe obiekty z danych miasta",
      description:
        "Najbliższe obiekty wybranego rodzaju (apteki, szpitale, żłobki, przedszkola, szkoły, biblioteki, muzea, teatry, toalety, pitniki, parkomaty, P+R, posterunki, stacje kolejowe, punkty obsługi urzędu) względem miejsca, posortowane po odległości, z mapą. Odległość w linii prostej, czas pieszo szacowany (×1,3, 4,5 km/h).",
      inputSchema: z.object({
        miejsce,
        rodzaj: z.enum(NAZWY_RODZAJOW),
        promien_m: z.number().int().min(100).max(10_000).optional(),
        limit: z.number().int().min(1).max(20).default(8),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ miejsce: m, rodzaj, promien_m, limit }) => run(async () => { const p = await rozwiaz(m); return najblizszeObiekty({ lat: p.lat, lon: p.lon, etykieta: p.etykieta }, rodzaj, promien_m, limit); }),
  );

  narzedzie(
    "planowanie_w_punkcie",
    {
      title: "Co obowiązuje w danym miejscu (plan, strefa, ograniczenia)",
      description:
        "Zestawia dla adresu lub punktu: obowiązujący miejscowy plan (przeznaczenie, oznaczenie), strefę z projektu planu ogólnego Krakowa z parametrami (maks. intensywność, wysokość, udział zabudowy, min. powierzchnia biologicznie czynna), obszary standardów dostępności, zabudowy śródmiejskiej i uzupełnienia, program rewitalizacji, uchwałę krajobrazową, UNESCO, park kulturowy oraz działkę ewidencyjną. Dane informacyjne, nie zastępują wypisu z planu.",
      inputSchema: z.object({ miejsce }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ miejsce: m }) => run(async () => { const p = await rozwiaz(m); return planowanieWPunkcie({ lat: p.lat, lon: p.lon, etykieta: p.etykieta }); }),
  );

  narzedzie(
    "statystyka",
    {
      title: "Statystyka na liczbach z danych",
      description:
        "Deterministyczne obliczenia na liczbach: opis (średnia, mediana, kwartyle, odchylenie, histogram), korelacja (Pearson, Spearman, wartość p, prosta regresji), trend (Mann-Kendall, nachylenie Sena), wzrost (zmiana, CAGR), nierównosc (Gini, krzywa Lorenza), klasy (kwantyle, równe przedziały, Jenks), odstajace (z-score, IQR). Liczby podaje się wprost (x, y) albo wskazuje zapytanie z (dane_zapytaj, plik_odczyt, bdl_dane) i nazwy kolumn.",
      inputSchema: z.object({
        operacja: z.enum(["opis", "korelacja", "trend", "wzrost", "nierownosc", "klasy", "odstajace"]),
        x: z.array(z.number().nullable()).max(5000).optional(),
        y: z.array(z.number().nullable()).max(5000).optional().describe("Druga zmienna (korelacja), ta sama długość co x"),
        etykiety: z.array(z.union([z.string(), z.number()])).max(5000).optional().describe("Podpisy obserwacji (dzielnice, lata)"),
        czas: z.array(z.number().finite()).max(5000).optional().describe("Ściśle rosnąca numeryczna oś czasu dla trendu; nachylenie na jej jednostkę"),
        z: z.object({ narzedzie: z.enum(["dane_zapytaj", "plik_odczyt", "bdl_dane"]), argumenty: z.record(z.string(), z.unknown()) }).optional().describe("Zamiast x i y: serwer pobierze wiersze tym narzędziem"),
        kolumna_x: z.string().optional(), kolumna_y: z.string().optional(), kolumna_etykiet: z.string().optional(),
        klasy: z.number().int().min(2).max(10).optional(), metoda: z.enum(["kwantyle", "rowne", "jenks"]).optional(),
        lata: z.number().min(0.1).optional().describe("Liczba okresów dla CAGR (domyślnie liczba punktów − 1)"),
      }),
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) =>
      run(async () => {
        let { x, y, etykiety, czas } = args;
        if (args.z) {
          const r: any = await wywolaj(args.z.narzedzie, args.z.argumenty);
          const w: Record<string, any>[] = r.wiersze ?? [];
          if (!w.length) throw new BladDomeny("wejscie", "zapytanie z nie zwróciło wierszy");
          const bdl = args.z.narzedzie === "bdl_dane";
          const kx = args.kolumna_x ?? (bdl ? "wartosc" : undefined);
          if (!kx || !(kx in w[0])) throw new BladDomeny("wejscie", `Podaj kolumna_x z listy: ${Object.keys(w[0]).filter((k) => k !== "_geometria").join(", ")}`);
          x = w.map((v) => (typeof v[kx] === "number" ? v[kx] : null));
          if (args.kolumna_y) y = w.map((v) => (typeof v[args.kolumna_y!] === "number" ? v[args.kolumna_y!] : null));
          const ke = args.kolumna_etykiet ?? (bdl ? "rok" : undefined);
          if (ke) etykiety = w.map((v) => v[ke]);
          if (bdl && args.operacja === "trend" && !czas) czas = w.map((v) => Number(v.rok));
        }
        if (!x) throw new BladDomeny("wejscie", "Podaj x albo z.");
        return statystyka({ operacja: args.operacja, x, y: y ?? undefined, etykiety, czas, nazwa_x: args.kolumna_x, nazwa_y: args.kolumna_y, klasy: args.klasy, metoda: args.metoda, lata: args.lata });
      }),
  );

  narzedzie(
    "widok",
    {
      title: "Złóż własną kartę z danych",
      description:
        "Końcowa wizualizacja odpowiedzi: użyj cel=odpowiedz, najwyżej jeden blok wizualny; dodatkowy tekst może opisać ograniczenia. Tabela, wykres i mapa wymagają z ze źródłem dane_zapytaj, plik_odczyt lub bdl_dane: liczby pobiera serwer. Nowy tryb odrzuca ręczne metryki. Mapa z poligonami: dane_zapytaj z kontury=true, limit ≤ 200. Wynik zachowuje pochodzenie i kompletność odczytu. Bez celu dostępny pozostaje starszy wieloblokowy format, przeznaczony do zgodności. Nie wywołuj widok dla etapów pomocniczych ani gdy tekst wystarcza.",
      inputSchema: widokSchema,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (args) => run(() => zlozWidok(args, wywolaj)),
  );

  // Tylko dla aplikacji (niewidoczne dla modelu): uproszczone kontury parków do narysowania mapy, żeby nie zalewać kontekstu.
  narzedzie(
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

  narzedzie("miejsce_szukaj", {
    title: "Znajdź miejsce i wybierz lokalizację", description: "Wyszukuje nazwy i adresy w Krakowie i okolicach. Przy wielu trafieniach zwraca najlepsze i podaje je w uwadze, żeby odpowiedź mówiła, które miejsce przyjęto. Zachowuje tożsamość OSM, adres i kategorię.",
    inputSchema: z.object({ tekst: z.string().min(2).max(300).describe("Nazwa miejsca lub pełny adres") }), annotations: readOnly,
  }, ({ tekst }) => run(async () => {
    const kandydaci = await szukajMiejsc(tekst);
    return { zrodlo: "© OpenStreetMap contributors, ODbL; Nominatim", status: kandydaci.length ? "poprawna" : "pusta", kandydaci: kandydaci.map(x => ({ ...x, etykieta: x.nazwa })), wymaga_wyboru: false, uwaga: kandydaci.length > 1 ? `Kilka trafień; przyjęto pierwsze (najlepsze): ${kandydaci[0].nazwa}. Użyj jego lat/lon i podaj w odpowiedzi, które miejsce przyjęto.` : "Współrzędne WGS84." };
  }));
  narzedzie("osm_obiekty", {
    title: "Obiekty OpenStreetMap w pobliżu", description: "Szuka kategorii OSM w promieniu do 5 km od punktu, do 100 wyników posortowanych według odległości; migawka OSM dla Krakowa z buforem ok. 5 km, z datą stanu. Pokrycie OSM nie jest pełnym rejestrem usług.",
    inputSchema: z.object({ kategoria: z.enum(Object.keys(KATEGORIE_OSM) as [keyof typeof KATEGORIE_OSM, ...Array<keyof typeof KATEGORIE_OSM>]), miejsce, promien_m: z.number().int().min(1).max(5000).default(1000), limit: z.number().int().min(1).max(100).default(50) }), annotations: readOnly,
  }, args => run(async () => osmObiekty({ ...args, ...await rozwiaz(args.miejsce) })));
  const schematOperacji = (nazwa: string, t: { cfg: any; schema: z.ZodType }) => ({ nazwa, tytul: t.cfg.title, opis: t.cfg.description, inputSchema: z.toJSONSchema(t.schema), outputSchema: z.toJSONSchema(t.cfg.outputSchema) });
  narzedzie("operacje_szukaj", {
    title: "Znajdź operację i jej schemat", description: "Wyszukuje operacje obliczeniowe, transportowe i prezentacyjne. Zwraca najwyżej trzy pełne schematy wejścia i wyjścia. Potem użyj operacja_wykonaj.",
    inputSchema: z.object({ temat: z.string().min(2).max(300).describe("Cel, kategoria lub nazwa operacji po polsku"), offset: z.number().int().min(0).default(0) }), annotations: readOnly,
  }, ({ temat, offset }) => run(async () => {
    const slowa: string[] = temat.toLocaleLowerCase("pl").split(/\s+/).filter((s: string) => s.length > 2 && !["jak", "czy", "dla", "oraz", "jest", "przy", "się"].includes(s));
    const tagi: Record<string, string> = {
      trasa: "transport dojazd dojech podróż autobus tramwaj kolej", odjazdy: "transport autobus tramwaj odjazd przystanek", przystanki_w_poblizu: "transport przystanek autobus tramwaj", utrudnienia: "transport utrudnienia komunikacja",
      planowanie_w_punkcie: "planowanie działka mpzp zabudowa plan", dostepnosc: "dostępność usługi zieleń park szkoła", wskaznik_dzielnic: "porównanie dzielnice ranking mieszkańcy zieleń",
      dane_eksportuj: "eksport pobierz pobranie danych dane csv json zip tabele źródła przekształcenia", widok: "końcowa wizualizacja wykres tabela mapa odpowiedź", analiza: "raport badanie plan analiza zatwierdzenie",
    };
    const pasujace = [...rejestr].filter(([n]) => !["operacja_wykonaj", "operacje_szukaj", "ui_kontury_parkow"].includes(n)).map(([n,t]) => ({ n, t, score: slowa.reduce((s,w) => s + (n.includes(w) ? 10 : 0) + ((tagi[n] ?? "").includes(w) ? 5 : 0) + (`${t.cfg.title} ${t.cfg.description}`.toLocaleLowerCase("pl").includes(w) ? 1 : 0), 0) })).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.n.localeCompare(b.n));
    return { operacje: pasujace.slice(offset, offset + 3).map(x => schematOperacji(x.n, x.t)), razem: pasujace.length, nastepny_offset: offset + 3 < pasujace.length ? offset + 3 : null };
  }));
  narzedzie("operacja_wykonaj", {
    title: "Wykonaj zarejestrowaną operację", description: "Wykonuje wyłącznie operację z rejestru, walidując jej argumenty. Najpierw odkryj schemat przez operacje_szukaj. Nie przyjmuje kodu, URL funkcji ani dowolnych instrukcji.",
    inputSchema: z.object({ operacja: z.string().min(1).max(100), argumenty: z.record(z.string(), z.unknown()).default({}) }), annotations: readOnly,
  }, args => run(async () => {
    if (["operacja_wykonaj", "operacje_szukaj"].includes(args.operacja)) throw new BladDomeny("wejscie", "Nie można zagnieżdżać bramki operacji.");
    return wywolaj(args.operacja, args.argumenty);
  }));
  for (const nazwa of PUBLICZNE) {
    const t = rejestr.get(nazwa)!;
    const schema = (t.schema as z.ZodObject).extend({ kursor_odpowiedzi: z.string().max(1000).optional().describe("nastepny_kursor odpowiedzi podzielonej na fragmenty JSON; powtórz to samo zapytanie") });
    const handler = async (args: any) => {
      try {
        const { kursor_odpowiedzi, ...wejscie } = args;
        const karta = await wywolaj(nazwa, wejscie);
        const dane = await stronaOdpowiedzi(karta, (nazwa === "operacje_szukaj" ? 32 : 24) * 1024, kursor_odpowiedzi);
        return { content: [{ type: "text" as const, text: JSON.stringify(dane) }], structuredContent: dane, _meta: { karta } };
      } catch (e) {
        const b = e instanceof BladDomeny ? e : new BladDomeny("niedostepne", "Operacja lub źródło danych są niedostępne.");
        console.error(JSON.stringify({ narzedzie: nazwa, blad: b.kod }));
        const dane = { status: b.kod === "wybor" ? "wymaga_wyboru" : b.kod === "niepelne" ? "czesciowa" : "niedostepna", komunikat: b.message, ...b.dane };
        return { isError: b.kod !== "wybor", content: [{ type: "text" as const, text: JSON.stringify(dane) }], structuredContent: dane };
      }
    };
    if (nazwa === "miejsce_szukaj" || nazwa === "operacja_wykonaj") {
      registerAppTool(server, nazwa, { ...t.cfg, inputSchema: schema, outputSchema: t.cfg.outputSchema, _meta: { ui: { resourceUri: KARTA_URI } } }, handler);
    } else {
      server.registerTool(nazwa, { ...t.cfg, inputSchema: schema, outputSchema: t.cfg.outputSchema }, handler);
    }
  }
  // wywolaj: wspólny rejestr operacji także dla /api/wywolaj i planów analitycznych.
  return Object.assign(server, { wywolaj });
}

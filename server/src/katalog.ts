// Katalog źródeł (migawka z scripts/build-katalog.mjs): tabele OD i warstwy MSIP z polami. Wyszukiwanie po temacie.
import katalog from "../data/katalog.json" with { type: "json" };

export type Pozycja = (typeof katalog.pozycje)[number] & { opis?: string; geometria?: string | null; maxRecordCount?: number | null };

export const pozycje = katalog.pozycje as Pozycja[];
export const migawkaKatalogu = katalog.wygenerowano;

export const norm = (s: string) =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Nazwy bywają w CamelCase i z podkreśleniami ("OD-SrodowiskoParkiMiejskie"), więc rozbijamy je na słowa.
const words = (s: string) => norm(s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, "$1 $2").replace(/[_\-/:.]/g, " "));

const indeks = pozycje.map((p) => ({
  p,
  tytul: words(p.tytul).split(" "),
  pola: words(p.pola.map((f) => f.split(":")[0]).join(" ")).split(" "),
  opis: norm(p.opis ?? "").split(" "),
}));

// Dopasowanie słowa z zapytania do słów w nazwie: długie (≥7 liter) po rdzeniu (fleksja: "bezrobocie" ~ "bezrobotni"),
// krótkie dokładnie albo z jedną literą końcówki ("hałas" ~ "hałasu", ale "parki" nie łapie "parking").
const maSlowo = (slowa: string[], t: string) => slowa.some((w) => (t.length >= 7 ? w.startsWith(t) : w === t || (w.startsWith(t) && w.length - t.length <= 1)));

// Potoczne tematy -> słowa z nazw warstw (katalog ma nazwy urzędowe). Zwykle dopisujemy słowa (ranking słabszy niż słowa
// użytkownika), a przy wąskich tematach, w których słowa potoczne tylko przeszkadzają ("ceny mieszkań" łapały "mieszkańców"), zastępujemy.
const ALIASY: [RegExp, string, boolean?][] = [
  [/zagospodar|plan miejscow|mpzp|plan przestrz|co mozna budowac/, "przeznaczenia mpzp studium projekt planu ogolnego strefy planistyczne"],
  [/transport|komunikac|autobus|tramwaj|dojazd|mpk|ztp/, "przystanki ztp komunikacja"],
  [/bezrob|rynek pracy|praca|zatrudnien/, "bezrobotni oferty pracy"],
  [/^(?!.*cudzoziem).*(ile (ludzi|osob)|liczb[ay]? (ludnosci|mieszkancow)|ludnosc|zameldow|demograf|mieszkan(cy|cow))/, "zameldowani pobyt staly mieszkancy", true],
  [/ziele|\bpark|\blas|\bdrzew|skwer|ogrod/, "parki zielen lasy zadrzewienia"],
  [/szkol|przedszk|edukac|uczni|nauczyc/, "szkoly przedszkola edukacja placowki oswiatowe"],
  [/halas|smog|powietrze|srodowisk|zanieczyszcz|pm10|pm2/, "halas powietrze srodowisko indeks jakosci powietrza"],
  [/cen[aey]? .*(mieszk|nieruchom|lokal|m2|metr)|(mieszk|nieruchom|lokal).* cen|rejestr cen|wartosc nieruchom/, "rejestr cen mediana wartosci m2", true],
  [/parking|parkomat|parkowan|postoj|samochod/, "parkomaty strefa platnego parkowania park and ride miejsca postojowe"],
  [/rower|stojak|wavelo/, "infrastruktura rowerowa ciagi rowerowe stojaki", true],
  [/pozwolen.*bud|pozwolenie na budow/, "pozwolenia bud", true],
  [/budow|warunki zabudowy|decyzje wz|inwestycj/, "pozwolenia bud decyzje wz inwestycje"],
  [/dzialk|ewidenc|parcel|grunt/, "dzialki ewidencyjne"],
  [/budyn|kamienic|blok/, "budynki budynek"],
  [/policj|komisariat|dzielnicow(y|i|ego|ym)\b|bezpiecz|przestep|straz/, "posterunki komisariaty policji zasiegi komisariatow", true],
  [/szpital|przychodni|lekarz|apteka|zdrowi|pogotowi|sor\b|stomatolog|poradni/, "placowki sluzby zdrowia szpitale apteki opieka zdrowotna"],
  [/senior|starsz|emeryt/, "seniorow centra aktywnosci seniora"],
  [/zlob|klub rodzic|dzieci do lat 3|opieka nad dzieck/, "zlobki kluby rodzicow"],
  [/basen|plywal|boisk|stadion|sport|silown|obiekt sportow/, "obiekty sportowe basen plac sportowy sport infrastruktura"],
  [/hotel|nocleg|turyst|zwiedza|atrakcj/, "turystyka ruch turystyczny szlak"],
  [/muze|teatr|kultur|bibliotek|galeri|koncert|filharmon/, "kultura instytucje kultury muzea teatry biblioteki galerie"],
  [/woda|wodoci|kanaliz|sciek|hydrant|wodociag/, "wodociagowy kanalizacyjne przewody"],
  [/ciepl|ogrzew|mpec|kotl/, "mpec siec cieplna zrodla ciepla"],
  [/oswietl|lampa|latarni/, "maszt oswietleniowy"],
  [/telefon|gsm|antena|5g|stacje bazowe|promieniowan/, "stacje bazowe telefonii gsm ekspozymetr"],
  [/wycink|nasadzen|usuniecie drzew|drzew/, "decyzje usuniecia drzew nasadzenia posadzenia drzewo"],
  [/wybor|radni|okreg|glosowan|lokal wyborcz/, "wybory okregi wyborcze dzielnice"],
  [/urzad|zalatwic|wniosek|usluga|procedur|punkt obslugi/, "lista uslug procedur punkty obslugi urzad miasta"],
  [/zabytk|unesco|historyczn|pomnik|fontann/, "zabytki unesco pomnik fontanna"],
  [/powodz|zalew|rzeka|wisla|zagrozenie/, "mapy zagrozenia powodziowego wody powierzchniowe"],
  [/kolej|pociag|dworzec kolej|stacja kolej/, "stacje kolejowe linie kolejowe"],
  [/uczeln|student|szkol.* wyzsz|agh\b|uniwersytet/, "uczelnie szkoly wyzsze"],
  [/wynajem|lokal komunaln|zbk|mieszkania komunalne/, "lokale zbk na wynajem"],
  [/toalet|wc\b|szalet/, "toalety publiczne"],
  [/pitnik|woda pitna|kranowian/, "pitniki"],
  [/cmentarz|pogrzeb|grob/, "cmentarz"],
];

// Tematy, których w katalogu nie ma (sprawdzone na migawce): lepiej to powiedzieć, niż podsuwać dane o czymś innym.
const BRAKI: [RegExp, string][] = [
  [/dzielnicow(y|i|ego|ym)\b/, "Wykazu dzielnicowych (policjantów) i ich rejonów nie ma w katalogu miasta. Są posterunki, komisariaty i zasięgi komisariatów (Bezpieczenstwo/OC_Bezpieczeństwo)."],
  [/wavelo|rowery? miejski|wypozyczaln/, "Stacji rowerów miejskich nie ma w katalogu. Są infrastruktura rowerowa, ciągi rowerowe i stojaki ZTP."],
  [/ogrod(y|ow)? dzialkow|\brod\b/, "Rodzinnych ogrodów działkowych nie ma jako osobnej warstwy."],
  [/odpad|smiec|segregac|pszok|wywoz|harmonogram odbior/, "Harmonogramów wywozu odpadów i punktów PSZOK nie ma w otwartych danych miasta (publikuje je MPO Kraków osobno). W katalogu są tylko śmietniki z mapy zasadniczej (BDOT)."],
  [/\bkin[oa]\b|kinoteatr/, "Kin nie ma w katalogu. Instytucje kultury: muzea, teatry, biblioteki, galerie (Kultura/Miejskie_Instytucje_Kultury)."],
  [/targowisk|bazar|hala targowa/, "Targowisk nie ma w katalogu danych miasta."],
  [/wypad|kolizj|ofiar.*drog|bezpieczenstwo ruchu/, "Danych o wypadkach drogowych nie ma w katalogu (publikuje je Policja)."],
  [/piec|kopciuch|ogrzewani|wegiel/, "Rejestru źródeł ogrzewania nie ma w katalogu. Są sieć ciepłownicza MPEC i indeks jakości powietrza GIOŚ."],
  [/hulajnog|ladowark|elektromobil/, "Hulajnóg i ładowarek nie ma w katalogu danych miasta."],
];
export const brakiTematu = (temat: string): string | undefined => {
  const t = norm(temat);
  return BRAKI.find(([rx]) => rx.test(t))?.[1];
};

// Tabele OD powstają co roku (zameldowani-na-pobyt-staly-31-12-2023, ...-2024, ...-2025): wyniki z jednej rodziny idą razem, od najnowszej.
const rok = (id: string) => +(id.match(/(20\d\d)(?!.*20\d\d)/)?.[1] ?? 0);
const rodzina = (id: string) => id.replace(/\d{2}-\d{2}-\d{4}|\d{4}(-\d{4})?/g, "#");
const rodziny: [(a: Pozycja[], p: Pozycja, i: number, wszystkie: Pozycja[]) => Pozycja[], Pozycja[]] = [
  (a, p, _i, wszystkie) => {
    if (a.some((x) => rodzina(x.id) === rodzina(p.id))) return a;
    const reszta = wszystkie.filter((x) => rodzina(x.id) === rodzina(p.id));
    return [...a, ...(reszta.length > 1 ? reszta.sort((x, y) => rok(y.id) - rok(x.id)) : [p])];
  },
  [],
];

const PRZYIMKI = new Set(["na", "w", "z", "o", "do", "dla", "po", "od", "za", "ze", "we", "ich", "oraz", "jak", "jest", "czy", "gdzie", "ile", "mam", "moje"]);

// Wynik z oceną: `pelne` = id zbiorów (całych rodzin lat), w których występują wszystkie słowa tematu.
// Bez pełnego trafienia ranking pokazuje tylko podobne zbiory, które mogą dotyczyć czegoś innego.
export function szukajZOcena(temat: string, opts: { zrodlo?: "od" | "msip"; limit?: number } = {}) {
  const pelneRodziny = new Set<string>();
  const wyniki = szukaj(temat, opts, pelneRodziny);
  return { wyniki, pelne: new Set(wyniki.filter((p) => pelneRodziny.has(rodzina(p.id))).map((p) => p.id)) };
}

export function szukaj(temat: string, opts: { zrodlo?: "od" | "msip"; limit?: number } = {}, pelneRodziny?: Set<string>) {
  // Przybliżony stemming polskiej fleksji: pierwsze 7 liter ("bezrobocie" ~ "bezrobotni"; 6 liter mylilo "przedszkola" z "przedstawienia").
  const stem = (t: string) => t.slice(0, 7);
  const slowa = (s: string) => [...new Set(norm(s).split(" ").filter((t) => t.length >= 2 && !PRZYIMKI.has(t)).map(stem))];
  const nt = norm(temat);
  const trafione = ALIASY.filter(([rx]) => rx.test(nt));
  const zastap = trafione.find(([, , z]) => z);
  const wlasne = zastap ? slowa(zastap[1]) : slowa(temat);
  // Słowa z aliasów wspierają ranking, ale słabiej niż słowa użytkownika (inaczej "przedszkola" daje szkoły muzyczne).
  const dodatkowe = zastap ? [] : slowa(trafione.map(([, dodaj]) => dodaj).join(" ")).filter((t) => !wlasne.includes(t));
  if (!wlasne.length) return [];
  const punkty = (x: (typeof indeks)[number], t: string) => (maSlowo(x.tytul, t) ? 3 : 0) + (maSlowo(x.pola, t) ? 2 : 0) + (maSlowo(x.opis, t) ? 1 : 0);
  // Tabel o cudzoziemcach jest wiele i zalewały pytania o ludność ogólnie, więc bez wzmianki o cudzoziemcach ich nie premiujemy.
  const bezCudzoziemcow = !/cudzoziem|obcokraj|imigr|uchodz|ukrain/.test(nt);
  return indeks
    .filter((x) => !opts.zrodlo || x.p.zrodlo === opts.zrodlo)
    .map((x) => {
      const hity = wlasne.map((t) => punkty(x, t));
      const wszystkie = hity.every((h) => h > 0);
      const s = hity.reduce((a, b) => a + b, 0) + 0.3 * dodatkowe.reduce((a, t) => a + punkty(x, t), 0);
      const kara = bezCudzoziemcow && x.tytul.some((w) => w.startsWith("cudzoziem")) ? 0.25 : 1;
      if (wszystkie) pelneRodziny?.add(rodzina(x.p.id));
      return { p: x.p, score: (wszystkie ? s + 5 : s * 0.4) * kara };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
    .reduce<Pozycja[]>(...rodziny)
    .slice(0, opts.limit ?? 10);
}

export const znajdz = (id: string) => pozycje.find((p) => p.id === id);

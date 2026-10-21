export interface NarzedzieWiersz {
  grupa: "Dane" | "Transport" | "Miejsca";
  nazwa: string;
  opis: string;
  swiezosc: string;
  glowne: boolean;
}

// Wszystkie narzędzia serwera, pogrupowane tematycznie. Osiem głównych idzie do tabeli, reszta pod rozwijanym przyciskiem.
// Świeżość opisuje, jak często zmieniają się dane.
export const NARZEDZIA: NarzedzieWiersz[] = [
  { grupa: "Dane", nazwa: "katalog_szukaj", opis: "Znajduje zbiór po temacie, także gdy nie znasz jego nazwy.", swiezosc: "katalog co dobę", glowne: true },
  { grupa: "Dane", nazwa: "dane_zapytaj", opis: "Liczy, filtruje i grupuje wartości ze zbioru, także dla punktu na mapie.", swiezosc: "zgodnie ze zbiorem", glowne: true },
  { grupa: "Dane", nazwa: "zbior_opis", opis: "Pokazuje kolumny, słowniki, licencję i datę aktualizacji zbioru.", swiezosc: "metadane zbioru", glowne: true },
  { grupa: "Dane", nazwa: "dane_gov", opis: "Przeszukuje dane.gov.pl, także dla zbiorów spoza Krakowa.", swiezosc: "zgodnie z portalem", glowne: true },
  { grupa: "Transport", nazwa: "odjazdy", opis: "Podaje najbliższe odjazdy z przystanku wraz z opóźnieniami.", swiezosc: "co 30 sekund", glowne: true },
  { grupa: "Transport", nazwa: "trasa", opis: "Układa połączenie między dwoma miejscami z dojściem pieszo.", swiezosc: "rozkład co 30 minut", glowne: true },
  { grupa: "Transport", nazwa: "utrudnienia", opis: "Zestawia komunikaty o utrudnieniach w ruchu.", swiezosc: "na bieżąco", glowne: true },
  { grupa: "Miejsca", nazwa: "parki_geometria", opis: "Zestawia parki miejskie z danymi i konturami z OpenStreetMap.", swiezosc: "kontury z OSM", glowne: true },
  { grupa: "Dane", nazwa: "bdl_szukaj", opis: "Znajduje wskaźnik w Banku Danych Lokalnych GUS.", swiezosc: "zgodnie z GUS", glowne: false },
  { grupa: "Dane", nazwa: "bdl_dane", opis: "Zwraca szereg czasowy wskaźnika GUS dla Krakowa.", swiezosc: "zgodnie z GUS", glowne: false },
  { grupa: "Dane", nazwa: "prognoza", opis: "Projektuje trend z przedziałami 80% i 95% oraz oceną błędu.", swiezosc: "liczone przy zapytaniu", glowne: false },
  { grupa: "Dane", nazwa: "plik_odczyt", opis: "Czyta pliki CSV, XLSX i GeoJSON z domen gov.pl i krakow.pl.", swiezosc: "zgodnie z plikiem", glowne: false },
  { grupa: "Dane", nazwa: "widok", opis: "Składa jedną kartę z kilku wyników, żeby model mógł je pokazać razem.", swiezosc: "liczone przy zapytaniu", glowne: false },
  { grupa: "Dane", nazwa: "status_zrodel", opis: "Sprawdza, które źródła danych odpowiadają.", swiezosc: "przy zapytaniu", glowne: false },
  { grupa: "Transport", nazwa: "przystanki_w_poblizu", opis: "Znajduje przystanki w promieniu spaceru z czasem dojścia.", swiezosc: "rozkład co 30 minut", glowne: false },
  { grupa: "Miejsca", nazwa: "adres_na_punkt", opis: "Zamienia adres w punkt na mapie i podaje dzielnicę.", swiezosc: "punkty adresowe MSIP", glowne: false },
];

export interface NarzedzieWiersz {
  grupa: "Dane" | "Transport" | "Miejsca";
  nazwa: string;
  opis: string;
  swiezosc: string;
}

// Osiem z piętnastu narzędzi, pogrupowanych tematycznie. Świeżość opisuje, jak często zmieniają się dane.
export const NARZEDZIA: NarzedzieWiersz[] = [
  { grupa: "Dane", nazwa: "katalog_szukaj", opis: "Szuka zbiorów w katalogu Otwartych Danych i dane.gov.pl.", swiezosc: "katalog co dobę" },
  { grupa: "Dane", nazwa: "dane_zapytaj", opis: "Liczy i filtruje wartości z wybranego zbioru.", swiezosc: "zgodnie ze zbiorem" },
  { grupa: "Dane", nazwa: "zbior_opis", opis: "Pokazuje opis zbioru, kolumny, licencję i datę aktualizacji.", swiezosc: "metadane zbioru" },
  { grupa: "Dane", nazwa: "dane_gov", opis: "Przeszukuje dane.gov.pl, także dla zbiorów spoza Krakowa.", swiezosc: "zgodnie z portalem" },
  { grupa: "Transport", nazwa: "odjazdy", opis: "Podaje najbliższe odjazdy z przystanku z danych czasu rzeczywistego.", swiezosc: "co 30 sekund" },
  { grupa: "Transport", nazwa: "trasa", opis: "Układa połączenie między dwoma adresami z rozkładu ZTP.", swiezosc: "rozkład co 30 minut" },
  { grupa: "Transport", nazwa: "utrudnienia", opis: "Zestawia komunikaty o utrudnieniach w ruchu.", swiezosc: "na bieżąco" },
  { grupa: "Miejsca", nazwa: "parki_geometria", opis: "Zestawia parki miejskie z danymi i konturami z OpenStreetMap.", swiezosc: "kontury z OSM" },
];

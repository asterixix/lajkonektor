// Nazwy widoków kart. Osobny plik bez typów DOM, żeby serwer (testy) mógł sprawdzić, że każda wartość WIDOK ma kartę.
export const NAZWY_WIDOKOW = [
  "odjazdy", "trasa", "przystanki", "tabela", "plik", "szereg", "prognoza", "parki", "katalog",
  "opis_zbioru", "bdl_lista", "dane_gov", "adres", "komunikaty", "status",
] as const;
export type NazwaWidoku = (typeof NAZWY_WIDOKOW)[number];

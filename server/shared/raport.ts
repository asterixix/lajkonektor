// Wspólny kontrakt raportu serwera, kart i eksportu. Żadnego HTML ani kodu modelu.
export interface TabelaRaportu {
  id: string;
  tytul: string;
  kolumny: string[];
  wiersze: Record<string, unknown>[];
  zrodla: string[];
  uwagi: string[];
}
export interface ZrodloRaportu {
  id: string;
  nazwa: string;
  narzedzie: string;
  argumenty: Record<string, unknown>;
  pobrano: string;
  data_stanu?: string;
  url?: string;
  definicja?: string;
  jednostka?: string;
  poziom?: string;
  kompletne: boolean;
  uwagi: string[];
}
export interface RaportAnalityczny {
  wersja: "1";
  tytul: string;
  pytanie: string;
  utworzono: string;
  id_planu: string;
  plan: Record<string, unknown>;
  zatwierdzenie: string;
  tabele: TabelaRaportu[];
  /** Miary wybiera jawnie silnik. Jednostka jest wspólna dla wszystkich serii wykresu. */
  wykresy?: WykresRaportu[];
  zrodla: ZrodloRaportu[];
  metody: string[];
  ograniczenia: string[];
  wnioski: string[];
}
export interface WykresRaportu {
  tabela: string;
  tytul: string;
  rodzaj: "slupki" | "linia";
  kolumna_x: string;
  kolumny_y: string[];
  jednostka?: string;
}

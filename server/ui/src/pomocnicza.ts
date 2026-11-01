import { esc } from "./pomoc.ts";

/** Szczegóły są montowane dopiero po rozwinięciu, żeby nie rysować mapy w ukryciu. */
export function pomocnicza(dane: any): string {
  const opis = String(dane.podsumowanie || "Odczytano dane pomocnicze.");
  return `<details class="wynik-pomocniczy"><summary><span class="etykieta">DANE POMOCNICZE</span><span>${esc(opis)}</span><span class="przypis">Pokaż szczegóły</span></summary><div data-pomocnicza></div></details>`;
}

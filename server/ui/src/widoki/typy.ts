// Wspólny kontrakt widoków kart: render zwraca HTML, podlacz (opcjonalnie) wiąże zdarzenia po wstawieniu do DOM.
export interface Ctx {
  /** Wywołuje narzędzie serwera przez hosta (app.callServerTool) i zwraca structuredContent. Rzuca błąd, gdy host nie pozwala. */
  wywolaj(nazwa: string, argumenty: Record<string, unknown>): Promise<any>;
  /** Podmienia kartę na wynik nowego wywołania (np. po odświeżeniu). */
  pokaz(dane: any): void;
  /** Przechodzi do innego widoku z przyciskiem „Wróć” (np. z listy katalogu do opisu zbioru). */
  przejdz(dane: any): void;
  /** Ponownie rysuje bieżący widok (po zmianie stanu lokalnego). */
  przerysuj(): void;
  otworz(url: string): void;
  /** Przekazuje plik hostowi MCP albo pobiera lokalnie przez Blob. Rzuca błąd przy odmowie/braku obsługi. */
  pobierz?(nazwa: string, mime: string, dane: Uint8Array): Promise<void>;
  czyMoznaWolac: boolean;
  pelnyEkran?: () => void;
  wybierzMiejsce?: (tekst: string) => Promise<void>;
}

export interface Widok {
  render(d: any, c: Ctx): string;
  podlacz?(root: HTMLElement, d: any, c: Ctx): void;
}

export const stan: Record<string, any> = {}; // lokalny stan interfejsu (wybrana opcja, tryb tabeli); resetowany przy nowym wyniku

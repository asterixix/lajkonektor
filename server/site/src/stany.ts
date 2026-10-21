export type Stan =
  | { typ: "pusty" }
  | { typ: "blad"; komunikat: string }
  | { typ: "wynik"; dane: any };

// Podpowiedź po pustym wyniku: temat, który na pewno ma zbiory w katalogu.
export const PRZYKLAD_PUSTY = "przedszkola";

export function stanZapytania(dane: any | null, blad: Error | null): Stan {
  if (blad) return { typ: "blad", komunikat: blad.message };
  if (!dane || dane.brak_w_katalogu || dane.liczba === 0) return { typ: "pusty" };
  return { typ: "wynik", dane };
}

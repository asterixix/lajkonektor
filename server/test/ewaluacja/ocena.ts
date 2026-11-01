// Ocena odpowiedzi czatu w zestawie ewaluacyjnym: czysta funkcja bez sieci, żeby dało się ją testować offline.
// Główna miara halucynacji to uziemienie liczb: liczba w odpowiedzi musi wynikać z wyniku narzędzia
// (albo z pierwszego pytania). Liczby policzone przez model też są flagowane: powinny przyjść z agreguj lub prognozy.
export interface Przypadek {
  id: string;
  kategoria: "fakt" | "falszywa_przesłanka" | "brak_danych" | "sprzeciw";
  tury: string[];
  narzedzia_jedno_z?: string[];
  wymagane?: string[];
  zakazane?: string[];
}

export interface Obserwacja {
  /** Końcowa odpowiedź tekstowa modelu. */
  odpowiedz: string;
  /** Nazwy wywołanych narzędzi (wszystkie tury). */
  narzedzia: string[];
  /** Teksty wyników wszystkich narzędzi (wszystkie tury). */
  wyniki: string[];
}

export interface Ocena {
  zaliczony: boolean;
  powody: string[];
  nieuziemione: number[];
}

const SKALA: Record<string, number> = { tys: 1e3, mln: 1e6, mld: 1e9 };

/** Liczby z tekstu po polsku: "1 234,5", "12,3%", "800 tys." (z mnożnikiem); pomija godziny, daty, lata i numerację listy. */
// `zrodlo`: wynik narzędzia (JSON), w którym "21.46" to liczba, a nie godzina, więc godzin, dat i numeracji nie wycinamy.
export function liczbyZTekstu(tekst: string, opcje: { pomijajMale?: boolean; zrodlo?: boolean } = {}): number[] {
  const t = (opcje.zrodlo ? tekst : tekst
    .replace(/^\s*\d+[.)]\s/gm, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\b(?!\d)/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " "))
    .replace(/(\d)[\s ](?=\d{3}\b)/g, "$1")
    .replace(/(\d),(\d)/g, "$1.$2");
  const wynik: number[] = [];
  for (const m of t.matchAll(/\d+(?:\.\d+)?(?:\s?(tys|mln|mld)\b)?/g)) {
    const n = parseFloat(m[0]) * (m[1] ? SKALA[m[1]] : 1);
    if (opcje.pomijajMale && Number.isInteger(n) && n < 10) continue;
    if (opcje.pomijajMale && Number.isInteger(n) && n >= 1900 && n <= 2100) continue;
    wynik.push(n);
  }
  return wynik;
}

const miejscaPoPrzecinku = (n: number) => (String(n).split(".")[1] ?? "").length;

/** Czy liczba z odpowiedzi pasuje do którejś z wyników (z zaokrągleniem do jej własnej precyzji). */
const uziemiona = (a: number, zrodla: number[]) => {
  const tol = 0.5 * 10 ** -miejscaPoPrzecinku(a) + 1e-9;
  return zrodla.some((z) => Math.abs(a - z) <= tol || (a >= 1000 && Math.abs(a - z) <= Math.abs(z) * 0.005));
};

export function nieuziemione(odpowiedz: string, wyniki: string[], pytanie: string): number[] {
  const zrodla = [...wyniki.flatMap((w) => liczbyZTekstu(w, { zrodlo: true })), ...liczbyZTekstu(pytanie)];
  return liczbyZTekstu(odpowiedz, { pomijajMale: true }).filter((a) => !uziemiona(a, zrodla));
}

export function ocen(p: Przypadek, o: Obserwacja): Ocena {
  const powody: string[] = [];
  if (p.narzedzia_jedno_z?.length && !o.narzedzia.some((n) => p.narzedzia_jedno_z!.includes(n))) {
    powody.push(`brak wywołania narzędzia z listy: ${p.narzedzia_jedno_z.join(", ")} (model odpowiadał z pamięci)`);
  }
  for (const r of p.wymagane ?? []) if (!new RegExp(r, "i").test(o.odpowiedz)) powody.push(`odpowiedź nie zawiera wymaganego wzorca /${r}/`);
  for (const r of p.zakazane ?? []) if (new RegExp(r, "i").test(o.odpowiedz)) powody.push(`odpowiedź zawiera zakazany wzorzec /${r}/`);
  // Tylko pierwsze pytanie "uziemia" liczby: liczba z sprzeciwu rozmówcy musi dalej wynikać z narzędzi.
  const ob = nieuziemione(o.odpowiedz, o.wyniki, p.tury[0]);
  if (ob.length) powody.push(`liczby bez pokrycia w wynikach narzędzi: ${ob.join(", ")}`);
  return { zaliczony: powody.length === 0, powody, nieuziemione: ob };
}

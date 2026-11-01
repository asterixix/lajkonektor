// Logika klienta czatu bez React: odczyt strumienia NDJSON z /api/czat, reduktor zdarzeń i budowa historii. Testowana offline.
export interface Karta { id: string; nazwa: string; argumenty: unknown; stan: "czeka" | "ok" | "blad"; dane?: any; blad?: string }
export interface Wiadomosc {
  rola: "uzytkownik" | "asystent";
  tresc: string;
  karty: Karta[];
  laduje?: boolean;
  blad?: { komunikat: string; kod?: string };
}
export type Zdarzenie =
  | { t: "narzedzie"; id: string; nazwa: string; argumenty: unknown }
  | { t: "wynik"; id: string; nazwa: string; dane?: any; blad?: string }
  | { t: "tekst"; tresc: string }
  | { t: "blad"; kod: string; komunikat: string }
  | { t: "koniec" };

export const nowaWiadomosc = (rola: Wiadomosc["rola"], tresc: string): Wiadomosc => ({ rola, tresc, karty: [], ...(rola === "asystent" ? { laduje: true } : {}) });

/** Zastosowanie jednego zdarzenia do wiadomości asystenta. Zwraca nowy obiekt (React). */
export function zastosuj(w: Wiadomosc, z: Zdarzenie): Wiadomosc {
  switch (z.t) {
    case "narzedzie":
      return { ...w, karty: [...w.karty, { id: z.id, nazwa: z.nazwa, argumenty: z.argumenty, stan: "czeka" }] };
    case "wynik": {
      const karty = w.karty.some((k) => k.id === z.id)
        ? w.karty.map((k) => (k.id === z.id ? { ...k, stan: z.blad ? ("blad" as const) : ("ok" as const), dane: z.dane, blad: z.blad } : k))
        : [...w.karty, { id: z.id, nazwa: z.nazwa, argumenty: {}, stan: z.blad ? ("blad" as const) : ("ok" as const), dane: z.dane, blad: z.blad }];
      return { ...w, karty };
    }
    case "tekst":
      return { ...w, tresc: z.tresc };
    case "blad":
      return { ...w, blad: { komunikat: z.komunikat, kod: z.kod } };
    case "koniec":
      return { ...w, laduje: false };
  }
}

/** Zamyka wiadomość, której strumień urwał się bez zdarzenia „koniec". */
export function domknij(w: Wiadomosc, przerwano: boolean): Wiadomosc {
  const bezOdpowiedzi = !w.tresc && !w.blad;
  return {
    ...w,
    laduje: false,
    karty: w.karty.map((k) => (k.stan === "czeka" ? { ...k, stan: "blad" as const, blad: "Przerwano." } : k)),
    ...(bezOdpowiedzi ? { blad: { komunikat: przerwano ? "Zatrzymano." : "Połączenie zostało przerwane. Spróbuj ponownie.", kod: "przerwano" } } : {}),
  };
}

/** Do modelu idzie sama treść rozmowy: bez kart, błędów i pustych odpowiedzi.
 *  Wyjątek: plan analizy czekający na zatwierdzenie, bo tryb wykonaj wymaga identycznego planu i jego id. */
export function historiaDoApi(w: Wiadomosc[]): { rola: string; tresc: string }[] {
  const plan = w.flatMap((m) => m.karty).reverse().find((k) => k.dane?.tryb === "sprawdz" && k.dane?.plan && k.dane?.id_planu)?.dane;
  return w.filter((m) => m.tresc.trim() && !m.laduje).map((m) => ({
    rola: m.rola,
    tresc: plan && m.karty.some((k) => k.dane === plan) ? `${m.tresc}\n\n[Plan do zatwierdzenia, id_planu ${plan.id_planu}]\n${JSON.stringify(plan.plan)}` : m.tresc,
  }));
}

/** Czyta strumień NDJSON linia po linii. Uszkodzone linie są pomijane, żeby jedna nie psuła rozmowy. */
export async function* czytajZdarzenia(res: Response): AsyncGenerator<Zdarzenie> {
  if (!res.body) return;
  const czytnik = res.body.getReader();
  const dekoder = new TextDecoder();
  let bufor = "";
  const linia = (l: string): Zdarzenie | null => { try { const z = JSON.parse(l); return z && typeof z.t === "string" ? z : null; } catch { return null; } };
  for (;;) {
    const { done, value } = await czytnik.read();
    if (value) bufor += dekoder.decode(value, { stream: !done });
    let i: number;
    while ((i = bufor.indexOf("\n")) >= 0) {
      const z = linia(bufor.slice(0, i).trim());
      bufor = bufor.slice(i + 1);
      if (z) yield z;
    }
    if (done) break;
  }
  const reszta = linia(bufor.trim());
  if (reszta) yield reszta;
}

export interface WynikWyslania { status: number; kod?: string; blad?: string }

/** Wysyła rozmowę i przekazuje zdarzenia. Błędy HTTP (limit, brak klucza) wracają jako opis, nie wyjątek. */
export async function wyslijCzat(
  historia: { rola: string; tresc: string }[],
  naZdarzenie: (z: Zdarzenie) => void,
  sygnal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<WynikWyslania> {
  let res: Response;
  try {
    res = await fetchFn("/api/czat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wiadomosci: historia }), signal: sygnal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { status: 0, kod: "siec", blad: "Nie udało się połączyć z serwerem. Sprawdź łącze i spróbuj ponownie." };
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { kod?: string; blad?: string };
    return { status: res.status, kod: j.kod, blad: j.blad ?? "Serwer zwrócił błąd." };
  }
  for await (const z of czytajZdarzenia(res)) naZdarzenie(z);
  return { status: 200 };
}

/** Jednolinijkowy skrót argumentów wywołania narzędzia, np. `serie: [11], horyzont: 3`. Pełna wartość jest w rozwijanym podglądzie. */
export function skrotArgumentow(args: unknown, maks = 90): string {
  if (!args || typeof args !== "object") return "";
  const czesci = Object.entries(args as Record<string, unknown>).map(([k, v]) => {
    const w = typeof v === "string" ? `"${v.length > 28 ? `${v.slice(0, 27)}…` : v}"` : Array.isArray(v) ? `[${v.length}]` : v && typeof v === "object" ? "{…}" : String(v);
    return `${k}: ${w}`;
  });
  const t = czesci.join(", ");
  return t.length > maks ? `${t.slice(0, maks - 1)}…` : t;
}

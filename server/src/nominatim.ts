import type { Magazyn } from "./budzet.ts";
import { WERSJA } from "./wersja.ts";
import { czekaj } from "./runtime.ts";

// Zapytanie czekające w kolejce dłużej niż to jest pomijane: klient już zrezygnował, a nie chcemy blokować następnych.
const MAKS_OCZEKIWANIE_MS = 15_000;
// Twardy limit obsługi jednego zapytania. Zwalnia kolejkę także wtedy, gdy fetch ignoruje sygnał.
const TERMIN_OBSLUGI_MS = 10_000;
const TERMIN_ZRODLA_MS = 8_000;

function zTerminem<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<never>((_, odrzuc) => { t = setTimeout(() => odrzuc(new Error("Termin obsługi minął.")), ms); })]).finally(() => clearTimeout(t));
}

/** Jedna instancja DO w UE dla całej aplikacji. Czas startu przeżywa restart instancji. */
export class Nominatim {
  private kolejka: Promise<unknown> = Promise.resolve();
  private storage: Magazyn;
  constructor(state: { storage: Magazyn }) { this.storage = state.storage; }
  private async obsluz(request: Request): Promise<Response> {
    request.signal.throwIfAborted();
    const p = new URL(request.url).searchParams;
    const q = p.get("q"), viewbox = p.get("viewbox");
    if (!q || q.length > 300 || !["19.78,50.13,20.13,49.95", "18.9,50.5,21.5,49.2"].includes(viewbox ?? "")) return new Response("Niepoprawne zapytanie.", { status: 400 });
    const nastepne = await this.storage.get<number>("nastepne") ?? 0;
    await czekaj(Math.max(0, nastepne - Date.now()), request.signal);
    request.signal.throwIfAborted();
    await this.storage.put("nastepne", Date.now() + 1100);
    request.signal.throwIfAborted();
    const param = new URLSearchParams({ q, viewbox: viewbox!, format: "jsonv2", limit: "10", addressdetails: "1", bounded: "1", countrycodes: "pl" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${param}`, { headers: { "user-agent": `lajkonektor/${WERSJA} (+https://lajkonektor.sendyka.workers.dev)` }, signal: AbortSignal.any([request.signal, AbortSignal.timeout(TERMIN_ZRODLA_MS)]) });
    if (!res.ok) return new Response("Nominatim niedostępny.", { status: res.status });
    // DO przechowuje wyłącznie termin kolejnego startu, bez zapytań i adresów.
    return Response.json(await res.json());
  }
  fetch(request: Request): Promise<Response> {
    const wejscie = Date.now();
    const wynik = this.kolejka.then(async () => {
      if (Date.now() - wejscie > MAKS_OCZEKIWANIE_MS) return new Response("Kolejka Nominatim przeciążona.", { status: 503 });
      try { return await zTerminem(this.obsluz(request), TERMIN_OBSLUGI_MS); }
      catch (e) { if (request.signal.aborted) throw e; return new Response("Nominatim nie odpowiedział w czasie.", { status: 504 }); }
    });
    this.kolejka = wynik.catch(() => {});
    return wynik;
  }
}

// Atomowy dziennik rezerwacji w mikro-USD; adapter Cloudflare działa w jurysdykcji UE.
export const LIMIT_USD_DOMYSLNIE = 9;
export interface Magazyn {
  get<T>(klucz: string): Promise<T | undefined>;
  put(klucz: string, wartosc: unknown): Promise<void>;
}
interface Rezerwacja { id: string; miesiac: string; kwota: number; stan: "zajeta" | "rozliczona"; koszt?: number }
interface Dziennik { miesiace: Record<string, number>; rezerwacje: Record<string, Rezerwacja> }
const kolejki = new WeakMap<Magazyn, Promise<unknown>>();
function atomowo<T>(m: Magazyn, fn: () => Promise<T>): Promise<T> {
  const p = (kolejki.get(m) ?? Promise.resolve()).then(fn);
  kolejki.set(m, p.catch(() => {}));
  return p;
}
export function mikro(x: number): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 0) throw new Error("Niepoprawna kwota mikro-USD.");
  return x;
}
async function dziennik(m: Magazyn): Promise<Dziennik> {
  const d = await m.get<Dziennik>("dziennik-v2");
  if (d) return d;
  // Zachowujemy wcześniejsze wydatki; starych rezerwacji bez ID nie wolno zwalniać.
  const stary = await m.get<{ miesiac: string; wydano: number }>("stan");
  if (stary && (!/^\d{4}-\d{2}$/.test(stary.miesiac) || !Number.isFinite(stary.wydano) || stary.wydano < 0)) throw new Error("Niepoprawny stary budżet.");
  return { miesiace: stary ? { [stary.miesiac]: mikro(Math.ceil(stary.wydano * 1e6)) } : {}, rezerwacje: {} };
}
/** Kwota i limit to mikro-USD. Zero tylko sprawdza dostępność, bez tworzenia rezerwacji. */
export async function rezerwuj(m: Magazyn, kwota: number, limit: number, teraz = new Date()): Promise<{ ok: boolean; wydano: number; id?: string }> {
  mikro(kwota); mikro(limit);
  if (!limit) throw new Error("Limit musi być dodatni.");
  const miesiac = teraz.toISOString().slice(0, 7);
  return atomowo(m, async () => {
    const d = await dziennik(m), wydano = mikro(d.miesiace[miesiac] ?? 0);
    if (kwota > limit - wydano || wydano >= limit) return { ok: false, wydano };
    if (!kwota) return { ok: true, wydano };
    const id = crypto.randomUUID();
    d.rezerwacje[id] = { id, miesiac, kwota, stan: "zajeta" };
    d.miesiace[miesiac] = mikro(wydano + kwota);
    await m.put("dziennik-v2", d);
    return { ok: true, wydano: d.miesiace[miesiac], id };
  });
}
/** Wyłącznie potwierdzony koszt; ponowne identyczne rozliczenie jest idempotentne. */
export async function rozlicz(m: Magazyn, id: string, faktycznie: number): Promise<number> {
  mikro(faktycznie);
  return atomowo(m, async () => {
    const d = await dziennik(m), r = d.rezerwacje[id];
    if (!r) throw new Error("Nieznana rezerwacja.");
    if (r.stan === "rozliczona") {
      if (r.koszt !== faktycznie) throw new Error("Rezerwacja już rozliczona inną kwotą.");
      return d.miesiace[r.miesiac];
    }
    d.miesiace[r.miesiac] = mikro(d.miesiace[r.miesiac] - r.kwota + faktycznie);
    r.stan = "rozliczona"; r.koszt = faktycznie;
    await m.put("dziennik-v2", d);
    return d.miesiace[r.miesiac];
  });
}
export class Budzet {
  state: { storage: Magazyn };
  constructor(state: { storage: Magazyn }) { this.state = state; }
  async fetch(request: Request): Promise<Response> {
    try {
      const w = await request.json() as any;
      if (w.op === "rezerwuj") return Response.json(await rezerwuj(this.state.storage, w.kwota, w.limit));
      if (w.op === "rozlicz" && typeof w.id === "string") return Response.json({ wydano: await rozlicz(this.state.storage, w.id, w.faktycznie) });
      return new Response("Nieznana operacja.", { status: 400 });
    } catch { return new Response("Niepoprawne dane budżetu.", { status: 400 }); }
  }
}
export interface KlientBudzetu {
  rezerwuj(kwota: number): Promise<string | null>;
  rozlicz(id: string, faktycznie: number): Promise<void>;
}
type NamespaceBezJurysdykcji = { idFromName(n: string): unknown; get(id: unknown): { fetch(url: string, init: RequestInit): Promise<Response> } };
interface NamespaceDO extends NamespaceBezJurysdykcji { jurisdiction(j: "eu"): NamespaceBezJurysdykcji }
export function budzetZDurableObject(ns: NamespaceDO, limitUsd: number, lokalnie = false): KlientBudzetu {
  if (!Number.isFinite(limitUsd) || limitUsd <= 0 || limitUsd > LIMIT_USD_DOMYSLNIE) throw new Error("Niepoprawny limit USD (maksimum 9).");
  const limit = mikro(Math.floor(limitUsd * 1e6));
  // v2 omija zablokowane rezerwacje v1 liczone od pełnego okna kontekstu;
  // stary obiekt pozostaje zachowany, a bieżący koszt ogranicza także limit klucza Eden AI.
  const obiekt = lokalnie ? ns : ns.jurisdiction("eu"), stub = obiekt.get(obiekt.idFromName("czat-v2"));
  const wywolaj = async (dane: object) => {
    const r = await stub.fetch("https://budzet/", { method: "POST", body: JSON.stringify({ ...dane, limit }) });
    if (!r.ok) throw new Error("Budżet niedostępny.");
    return await r.json() as { ok?: boolean; id?: string };
  };
  return {
    rezerwuj: async kwota => { const r = await wywolaj({ op: "rezerwuj", kwota }); return r.ok ? r.id ?? "sprawdzenie" : null; },
    rozlicz: async (id, faktycznie) => { await wywolaj({ op: "rozlicz", id, faktycznie }); },
  };
}

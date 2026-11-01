import { BladDomeny } from "./bledy.ts";
export const PUBLICZNE = ["katalog_szukaj", "zbior_opis", "dane_zapytaj", "miejsce_szukaj", "osm_obiekty", "operacje_szukaj", "operacja_wykonaj"] as const;
export const STANY = ["poprawna", "czesciowa", "pusta", "niedostepna", "wymaga_wyboru"] as const;
const bajty = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
const geometria = new Set(["kontury", "linie_geom", "_geometria", "rings", "pierscien", "pierscienie", "kontur"]);
export function dlaModelu(d: any): any {
  if (d?.raport?.wersja === "1" && Array.isArray(d.raport.tabele)) {
    const r = d.raport;
    const uzyte = new Set<string>((r.plan.operacje ?? []).flatMap((o: any) => o.typ === "polacz" ? [o.lewe, o.prawe] : [o.z]));
    const tabele = r.tabele.filter((t: any) => !uzyte.has(t.id)).map((t: any) => ({ id: t.id, tytul: t.tytul, kolumny: t.kolumny, wiersze: t.wiersze, wierszy_ogolem: t.wiersze.length, zrodla: t.zrodla }));
    return { ...dlaModelu({ ...d, raport: undefined, bloki: undefined }), raport: dlaModelu({ ...r, tabele }), uwaga_tekstu: "Tekst zawiera pełne tabele wynikowe, w razie potrzeby stronicowane. Tabele źródłowe, pośrednie i eksport są w karcie (_meta.karta)." };
  }
  if (Array.isArray(d)) return d.map(dlaModelu);
  if (!d || typeof d !== "object") return d;
  return Object.fromEntries(Object.entries(d).filter(([k,v]) => v !== undefined && !geometria.has(k) && k !== "_kafelki" && k !== "_zapytanie").map(([k,v]) => [k, k === "inputSchema" || k === "outputSchema" ? v : dlaModelu(v)]));
}
export function stanOdpowiedzi(d: any): typeof STANY[number] {
  if (d.status && (STANY as readonly string[]).includes(d.status)) return d.status;
  if (d.wymaga_wyboru) return "wymaga_wyboru";
  if (d.kompletne === false || d.warstwy?.some((x: any) => !x.dostepna || !x.kompletne) || d.plan?.niedostepne?.length) return "czesciowa";
  if (["wiersze", "wyniki", "obiekty", "kandydaci", "przystanki", "operacje"].some(k => Array.isArray(d[k]) && !d[k].length)) return "pusta";
  return "poprawna";
}
/** Strony to kompletne fragmenty JSON z jawnymi ścieżkami. Nigdy slice() tekstu JSON. */
export async function stronaOdpowiedzi(dane: Record<string, any>, limit: number, kursor?: string): Promise<Record<string, any>> {
  const d = { ...dlaModelu(dane), status: stanOdpowiedzi(dane) };
  if (bajty(d) <= limit && !kursor) return d;
  // Czas wykonania nie zmienia tożsamości danych pomiędzy stronami.
  const stabilne = JSON.stringify(d, (k, v) => k === "pobrano" || k === "utworzono" || k === "wiek_s" ? undefined : v);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stabilne))), x => x.toString(16).padStart(2, "0")).join("");
  let offset = 0;
  if (kursor) {
    try { const c = JSON.parse(atob(kursor)); if (c.hash !== hash || !Number.isSafeInteger(c.offset) || c.offset < 0) throw Error(); offset = c.offset; }
    catch { throw new BladDomeny("wejscie", "Kursor odpowiedzi jest niepoprawny lub dane zmieniły się. Zacznij od pierwszej strony."); }
  }
  const fragmenty: { sciezka: (string | number)[]; wartosc: unknown }[] = [];
  const podziel = (v: any, sciezka: (string | number)[]) => {
    if (bajty(v) < 2000 || !v || typeof v !== "object") { fragmenty.push({ sciezka, wartosc: v }); return; }
    for (const [k,x] of Object.entries(v)) podziel(x, [...sciezka, Array.isArray(v) ? Number(k) : k]);
  };
  podziel(d, []);
  const ostrzezenia: { sciezka: (string | number)[]; wartosc: unknown }[] = [];
  const dowody = (v: any, sciezka: (string | number)[] = []) => {
    if (!v || typeof v !== "object") return;
    for (const [k,x] of Object.entries(v)) {
      if (/zrodl[oa]|źródł[oa]|uwag|ostrzez|ogranicz|_dowod|data_stanu|odswiezono|pokrycie/.test(k)) ostrzezenia.push({ sciezka: [...sciezka, k], wartosc: x });
      else dowody(x, [...sciezka, k]);
    }
  };
  dowody(d);
  const out: any = { status: "czesciowa", status_danych: d.status, format: "fragmenty_json", dowody_i_ograniczenia: ostrzezenia, fragmenty: [], nastepny_kursor: "" };
  if (bajty(out) > limit - 1024) throw new BladDomeny("niepelne", "Źródła i ostrzeżenia przekraczają limit odpowiedzi. Zawęź zapytanie.");
  let i = offset;
  for (; i < fragmenty.length; i++) {
    out.fragmenty.push(fragmenty[i]);
    out.nastepny_kursor = btoa(JSON.stringify({ hash, offset: i + 1 }));
    if (bajty(out) > limit) { out.fragmenty.pop(); break; }
  }
  if (i === offset) throw new BladDomeny("niepelne", "Pojedyncze pole przekracza limit odpowiedzi. Zawęź zapytanie.");
  out.nastepny_kursor = i < fragmenty.length ? btoa(JSON.stringify({ hash, offset: i })) : null;
  return out;
}

// Komunikaty o utrudnieniach ZTP (GTFS-RT ServiceAlerts), pobierane na żywo. Feedy są małe (setki bajtów do kilku KB).
import { decodeFeed } from "./gtfsrt.ts";
import { BAZA_ZTP, FEEDY_ZTP, czyZtp, type Feed } from "./siec.ts";
import { getBytes } from "./sources.ts";
import type { Siec } from "./transport.ts";

export interface Komunikat {
  feed: Feed;
  tytul: string;
  opis: string;
  linie: string[];
  przystanki: string[];
  od: string | null;
  do: string | null;
  testowy: boolean;
}

const tekst = (t: any): string => {
  const tr: { text?: string; language?: string }[] = t?.translation ?? [];
  return (tr.find((x) => x.language === "pl") ?? tr[0])?.text ?? "";
};
const iso = (s?: number) => (s ? new Date(s * 1000).toISOString() : null);

export async function pobierzKomunikaty(S: Siec, feedy: Feed[] = [...FEEDY_ZTP], teraz = Date.now()) {
  const komunikaty: Komunikat[] = [], bledy: string[] = [];
  const nowSek = teraz / 1000;
  await Promise.all(feedy.filter(czyZtp).map(async (f) => { // komunikaty publikuje tylko ZTP; pociągi ich w naszym źródle nie mają
    try {
      const feed = decodeFeed(await getBytes(`${BAZA_ZTP}/ServiceAlerts_${f}.pb`));
      for (const e of feed.entity ?? []) {
        const a = e.alert;
        if (!a) continue;
        const okresy: { start?: number; end?: number }[] = a.active_period ?? [];
        const aktywny = !okresy.length || okresy.some((o) => (!o.start || o.start <= nowSek) && (!o.end || o.end >= nowSek));
        if (!aktywny) continue;
        const linie = new Set<string>(), przyst = new Set<string>();
        for (const ie of a.informed_entity ?? []) {
          if (ie.route_id) { const li = S.idxL.get(`${f}:${ie.route_id}`); linie.add(li !== undefined ? S.linie[li][2] : ie.route_id); }
          if (ie.stop_id) { const pi = S.idxP.get(`${f}:${ie.stop_id}`); przyst.add(pi !== undefined ? S.przystanki[pi][2] : ie.stop_id); }
        }
        komunikaty.push({
          feed: f, tytul: tekst(a.header_text), opis: tekst(a.description_text), linie: [...linie], przystanki: [...przyst],
          od: iso(okresy[0]?.start), do: iso(okresy[0]?.end),
          testowy: /\bTEST_?\d*/i.test(tekst(a.header_text) + " " + tekst(a.description_text)),
        });
      }
    } catch (e) { bledy.push(`${f}: ${(e as Error).message}`); }
  }));
  return { komunikaty, bledy };
}

// Komunikaty dotyczące podanych linii lub przystanków albo bez wskazanego zakresu (ogólne dla całej sieci).
export const dotyczace = (k: Komunikat[], linie: Set<string>, przystanki: Set<string>) =>
  k.filter((x) => !x.testowy && (!x.linie.length && !x.przystanki.length) || x.linie.some((l) => linie.has(l)) || x.przystanki.some((p) => przystanki.has(p)));

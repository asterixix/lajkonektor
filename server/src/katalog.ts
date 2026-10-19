// Katalog źródeł (migawka z scripts/build-katalog.mjs): tabele OD i warstwy MSIP z polami. Wyszukiwanie po temacie.
import katalog from "../data/katalog.json" with { type: "json" };

export type Pozycja = (typeof katalog.pozycje)[number] & { opis?: string; geometria?: string | null; maxRecordCount?: number | null };

export const pozycje = katalog.pozycje as Pozycja[];
export const migawkaKatalogu = katalog.wygenerowano;

export const norm = (s: string) =>
  s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Nazwy bywają w CamelCase i z podkreśleniami ("OD-SrodowiskoParkiMiejskie"), więc rozbijamy je na słowa.
const words = (s: string) => norm(s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, "$1 $2").replace(/[_\-/:.]/g, " "));

const indeks = pozycje.map((p) => ({
  p,
  tytul: words(p.tytul),
  pola: words(p.pola.map((f) => f.split(":")[0]).join(" ")),
  opis: norm(p.opis ?? ""),
}));

export function szukaj(temat: string, opts: { zrodlo?: "od" | "msip"; limit?: number } = {}) {
  // Przybliżony stemming polskiej fleksji: pierwsze 6 liter ("bezrobocie" ~ "bezrobotni", "cudzoziemcy" ~ "cudzoziemiec").
  const tokens = norm(temat).split(" ").filter((t) => t.length >= 2).map((t) => t.slice(0, 6));
  if (!tokens.length) return [];
  const wyniki = indeks
    .filter((x) => !opts.zrodlo || x.p.zrodlo === opts.zrodlo)
    .map((x) => {
      let s = 0, trafione = 0;
      for (const t of tokens) {
        const hit = (x.tytul.includes(t) ? 3 : 0) + (x.pola.includes(t) ? 2 : 0) + (x.opis.includes(t) ? 1 : 0);
        if (hit) trafione++;
        s += hit;
      }
      // Wszystkie słowa zapytania powinny coś trafić; brakujące obniżają wynik.
      return { p: x.p, score: trafione === tokens.length ? s + 5 : s * 0.5 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 10);
  return wyniki.map((x) => x.p);
}

export const znajdz = (id: string) => pozycje.find((p) => p.id === id);

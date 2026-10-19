// Widok złożony (narzędzie `widok`): bloki wybrane przez model, rysowane gotowymi komponentami. Serwer już rozwiązał
// powiązania `z` (dane są w blokach), więc tu tylko wyświetlamy; żadnego HTML od modelu nie wstawiamy bez escape.
import { kafel, esc, liczba, zrodlo } from "../pomoc.ts";
import { mapa, type LiniaMapy, type Poligon, type PunktMapy } from "../mapa.ts";
import { wykres } from "../wykres.ts";
import { obiektyZWierszy } from "./dane.ts";
import type { Widok } from "./typy.ts";

const komorka = (v: unknown) => (typeof v === "number" ? liczba(v, Number.isInteger(v) ? 0 : 2) : v == null ? "" : String(v));
const tytul = (b: any) => (b.tytul ? `<h3 class="blok-tyt">${esc(b.tytul)}</h3>` : "");

const KOMPONENTY: Record<string, (b: any) => string> = {
  tekst(b) {
    const akapity = String(b.tekst).split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("");
    return b.wariant === "uwaga" || b.wariant === "informacja"
      ? `<div class="ostrzezenia"><span class="etykieta">${b.wariant === "uwaga" ? "UWAGA" : "INFO"}</span>${esc(String(b.tekst))}</div>`
      : `<div class="blok-tekst">${akapity}</div>`;
  },

  metryki: (b) => `<div class="metryki">${b.pozycje.map((p: any) => `<div><div class="et">${esc(p.etykieta)}</div><div class="liczba">${esc(komorka(p.wartosc))}</div>${p.opis ? `<div class="et">${esc(p.opis)}</div>` : ""}</div>`).join("")}</div>`,

  tabela(b) {
    const kol: string[] = b.kolumny, w: unknown[][] = b.wiersze;
    const num = kol.map((_, i) => w.every((r) => r[i] == null || typeof r[i] === "number") && w.some((r) => typeof r[i] === "number"));
    const szer = kol.map((_, i) => (num[i] ? "minmax(70px,130px)" : "minmax(100px,1fr)")).join(" ");
    const nag = kol.map((k, i) => `<div class="${num[i] ? "p" : ""}">${esc(k)}</div>`).join("");
    const rzedy = w.map((r) => `<div class="rzad" style="--kol:${szer};font-size:14px">${r.map((v, i) => `<div class="${num[i] ? "p" : ""}"${num[i] ? ' style="font-weight:900"' : ""}>${esc(komorka(v))}</div>`).join("")}</div>`).join("");
    const ucieta = b.razem > w.length ? `<div class="przypis">Pokazano ${w.length} z ${liczba(b.razem, 0)} wierszy.</div>` : "";
    return `${tytul(b)}<div class="przewijane"><div style="min-width:${kol.length * 110}px"><div class="naglowek-tabeli" style="--kol:${szer}">${nag}</div>${rzedy}</div></div>${ucieta}`;
  },

  wykres(b) {
    const p: { x: string | number; y: number }[] = b.punkty;
    const jedn = b.jednostka ? ` ${b.jednostka}` : "";
    if (b.rodzaj === "linia" && p.every((q) => typeof q.x === "number" || /^-?\d+(\.\d+)?$/.test(String(q.x)))) {
      return `${tytul(b)}${wykres({ punkty: p.map((q) => ({ x: Number(q.x), y: q.y })), jednostka: b.jednostka, opis: `Wykres liniowy: ${b.tytul ?? "seria"}, ${p.length} punktów od ${p[0].x} do ${p[p.length - 1].x}.` })}`;
    }
    const maks = Math.max(...p.map((q) => Math.abs(q.y)), 1e-9);
    return `${tytul(b)}<div class="slupki">${p.map((q) => `<div class="slupek"><div class="n">${esc(String(q.x))}</div><div class="slupek-tlo"><div style="width:${Math.max(1, Math.round((Math.abs(q.y) / maks) * 100))}%"></div></div><div class="w">${esc(liczba(q.y, 2) + jedn)}</div></div>`).join("")}</div>`;
  },

  mapa(b) {
    const poligony: Poligon[] = (b.kontury ?? []).map((o: any) => ({ rings: [o.pierscien], klasa: "bez-klika", etykieta: o.etykieta ? { tekst: o.etykieta } : undefined }));
    const linie: LiniaMapy[] = (b.linie ?? []).map((l: any) => ({ pts: l.pts, klasa: l.klasa }));
    const punkty: PunktMapy[] = (b.punkty ?? []).map((q: any) => ({ lat: q.lat, lon: q.lon, klasa: "obiekt" as const, etykieta: q.etykieta }));
    if (b.wiersze) {
      const z = obiektyZWierszy(b.wiersze, [], b.kolumna_etykiety);
      poligony.push(...z.poligony); linie.push(...z.linie); punkty.push(...z.punkty);
    }
    return `${tytul(b)}${mapa({ poligony, linie, punkty, skala: true, opis: `Mapa: ${b.tytul ?? "obiekty"}, ${poligony.length + linie.length + punkty.length} elementów.` })}`;
  },

  lista: (b) => `${tytul(b)}<ul class="pole-lista">${b.pozycje.map((p: any) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div><div style="font-weight:900;overflow-wrap:anywhere">${esc(p.tytul)}</div>${p.opis ? `<div class="szary-t" style="font-size:13px">${esc(p.opis)}</div>` : ""}</div>${p.znacznik ? `<span class="znacznik obrys" style="color:var(--lk-niebieski);border-color:var(--lk-niebieski);align-self:start">${esc(p.znacznik)}</span>` : ""}</li>`).join("")}</ul>`,

  os_czasu: (b) => `${tytul(b)}<div class="os">${b.kroki.map((k: any, i: number) => `<div class="kol"><span class="punkt"></span>${i < b.kroki.length - 1 ? '<span class="linia-kropki"></span>' : ""}</div><div class="opis"><strong>${k.czas ? esc(k.czas) + " · " : ""}${esc(k.etykieta)}</strong>${k.opis ? `<div class="mala">${esc(k.opis)}</div>` : ""}</div>`).join("")}</div>`,
};

export const zlozony: Widok = {
  render(d) {
    const bloki: any[] = d.bloki ?? [];
    const tresc = `${d.podtytul ? `<div class="podtytul">${esc(d.podtytul)}</div>` : ""}${bloki.map((b) => `<section class="blok">${(KOMPONENTY[b.typ] ?? (() => ""))(b)}</section>`).join("")}`;
    return kafel({ id: "widok", tytul: d.tytul ?? "Zestawienie", znacznik: { tekst: "ZESTAWIENIE", rodzaj: "obrys" }, tresc, zrodlo: zrodlo(d.zrodlo ?? "źródło nieznane", "Karta złożona z danych narzędzi Lajkonektora.") });
  },
};

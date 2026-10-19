// Wspólne elementy kart: ucieczka HTML, formatowanie liczb, ramka kafla (belka, treść, stopka), numer linii.
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const nf = (maks: number) => new Intl.NumberFormat("pl-PL", { maximumFractionDigits: maks });
export const liczba = (n: number | null | undefined, miejsca = 1): string => (n == null || !Number.isFinite(n) ? "–" : nf(miejsca).format(n));

export type Znacznik = { tekst: string; rodzaj?: "zielony" | "czerwony" | "atrament" | "obrys" };

export interface OpisKafla {
  id: string; // identyfikator narzędzia nad tytułem
  tytul: string;
  znacznik?: Znacznik;
  tresc: string;
  zrodlo?: string; // HTML dozwolony (budujemy go sami z escapowanych fragmentów)
  akcja?: string; // HTML przycisku po prawej w stopce
}

export const znacznik = (z?: Znacznik) => (z ? `<span class="znacznik ${z.rodzaj ?? "obrys"}">${esc(z.tekst)}</span>` : "");
export const nr = (linia: string, maly = false) => `<span class="nr${maly ? " maly" : ""}${linia.length > 3 ? " dlugi" : ""}">${esc(linia)}</span>`;

export function kafel(o: OpisKafla): string {
  return `<article class="kafel" aria-label="${esc(o.id)}: ${esc(o.tytul)}">
<header class="belka"><div class="logo" role="img" aria-label="Lajkonektor"></div>
<div class="belka-tekst"><div class="id">${esc(o.id)}</div><h1 class="tytul" style="margin:0">${esc(o.tytul)}</h1></div>${znacznik(o.znacznik)}</header>
${o.tresc}
${o.zrodlo || o.akcja ? `<footer class="stopka"><div>${o.zrodlo ?? ""}</div>${o.akcja ?? ""}</footer>` : ""}
</article>`;
}

export const zrodlo = (tekst: string, wiecej?: string) => `<strong>Źródło:</strong> ${esc(tekst)}${wiecej ? " " + esc(wiecej) : ""}`;

// Czas względny w minutach: "za 2 min".
export const minuty = (m: number) => `<span class="wartosc">${liczba(m, 0)}</span><span class="jednostka"> min</span>`;

export const komunikatyHtml = (lista: { tytul?: string; opis?: string; linie?: string[] }[] | undefined) =>
  (lista ?? []).slice(0, 4).map((k) => `<div class="komunikat" role="alert"><span class="etykieta">${k.linie?.length ? "LINIA " + esc(k.linie.join(", ")) : "SIEĆ"}</span><span>${esc([k.tytul, k.opis].filter(Boolean).join(": "))}</span></div>`).join("");

// Kolor etykiety punktualności: o czasie / opóźnienie.
export function punktualnosc(opoznienieS: number | null | undefined, hhmm: string): { tekst: string; klasa: string } {
  if (opoznienieS == null) return { tekst: hhmm, klasa: "szary-t" };
  const min = Math.round(opoznienieS / 60);
  if (min >= 2) return { tekst: `opóźnienie ${min} min, ${hhmm}`, klasa: "czerwony-t" };
  return { tekst: `o czasie, ${hhmm}`, klasa: "zielony-t" };
}

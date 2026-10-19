// Stany kart: ładowanie (szkielet), błąd (co się stało i co dalej), pusto i widok ogólny dla nieznanych wyników.
import { kafel, esc, zrodlo } from "../pomoc.ts";
import type { Ctx } from "./typy.ts";

export function ladowanie(narzedzie: string, tytul = "Pobieram dane"): string {
  const rzad = `<div class="szkielet-rzad"><div class="szkielet" style="width:38px;height:26px"></div><div class="szkielet" style="flex-grow:1;height:16px"></div><div class="szkielet" style="width:46px;height:20px"></div></div>`;
  return kafel({
    id: narzedzie, tytul,
    tresc: `<div style="padding:16px;display:flex;flex-direction:column;gap:18px" role="status" aria-label="Ładowanie: ${esc(narzedzie)}">${rzad}${rzad}${rzad}${rzad}</div>`,
    zrodlo: "Dane pobierane są na żywo ze źródeł publicznych, zwykle w kilka sekund.",
  });
}

// Komunikat błędu: kod HTTP (jeśli jest) wyciągamy z tekstu, resztę tłumaczymy na „co dalej”.
export function blad(narzedzie: string, tekst: string, c: Ctx): string {
  const kod = /HTTP (\d{3})/.exec(tekst)?.[1] ?? (/timeout|przekroczono|abort/i.test(tekst) ? "timeout" : "");
  const dalej =
    kod === "522" || kod === "timeout" ? "Serwer źródła nie odpowiada na połączenia z tego regionu albo jest przeciążony. Sprawdź status źródeł i spróbuj za chwilę."
    : kod === "404" ? "Nie ma takiego zasobu. Sprawdź identyfikator albo adres."
    : /Nieznany zbiór/.test(tekst) ? "Znajdź poprawny identyfikator narzędziem katalog_szukaj."
    : "Sprawdź parametry zapytania i spróbuj ponownie.";
  return kafel({
    id: narzedzie, tytul: "Nie udało się pobrać danych", znacznik: { tekst: "BŁĄD", rodzaj: "czerwony" },
    tresc: `<div class="blad" role="alert">${kod ? `<div class="kod">${esc(kod)}</div>` : ""}<div class="tr">${esc(tekst.replace(/^Błąd( źródła danych)?:\s*/, "")).slice(0, 220)}</div><div class="co">${esc(dalej)}</div><div class="akcje"><button class="przycisk" data-status ${c.czyMoznaWolac ? "" : "disabled"}>Sprawdź status źródeł</button></div></div>`,
    zrodlo: zrodlo("Lajkonektor.", "Błędy źródeł to zwykle chwilowa niedostępność, nie problem z zapytaniem."),
  });
}

export function ogolny(narzedzie: string, dane: unknown): string {
  const t = JSON.stringify(dane, null, 1) ?? "";
  return kafel({ id: narzedzie, tytul: "Wynik narzędzia", znacznik: { tekst: "SUROWE DANE", rodzaj: "obrys" }, tresc: `<pre class="mono przewijane" style="margin:0;padding:12px 16px;font-size:12px;white-space:pre-wrap">${esc(t.slice(0, 6000))}${t.length > 6000 ? "\n…" : ""}</pre>`, zrodlo: "Brak dedykowanego widoku dla tego narzędzia." });
}

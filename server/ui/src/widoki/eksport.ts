import { kafel, esc, zrodlo } from "../pomoc.ts";
import { nazwaPakietuDanych, pakietDanychZIP } from "../../../shared/eksport-danych.ts";
import type { Widok } from "./typy.ts";

export const eksport: Widok = {
  render(d) {
    const p = d.pakiet_danych;
    const tabele = p.tabele.map((t: any) => `<li>${esc(t.tytul)} — ${t.wiersze.length} wierszy (${t.rodzaj === "przeliczona" ? "po przeliczeniu" : "odczytana"})</li>`).join("");
    return kafel({ id: "dane_eksportuj", tytul: p.tytul, znacznik: { tekst: "DANE", rodzaj: "obrys" },
      tresc: `<div class="raport-karta"><p>Ponownie odczytano dane ze źródeł. Mogą różnić się od wcześniejszej odpowiedzi.</p><ul>${tabele}</ul></div><div class="raport-akcje" role="group" aria-label="Pobierz dane"><button class="przycisk zolty" data-dane="zip">Pobierz dane ZIP</button><button class="przycisk obrys" data-dane="json">JSON</button></div><p class="raport-komunikat" role="status" aria-live="polite" data-dane-status></p><div class="raport-awaryjny" data-dane-awaryjny hidden><p>Skopiuj JSON i zapisz jako plik .json do samodzielnej analizy.</p><button class="przycisk obrys" data-dane-kopiuj>Kopiuj JSON</button><label>Dane JSON<textarea data-dane-json readonly rows="6" spellcheck="false"></textarea></label></div><div class="raport-karta"><details><summary>Źródła, daty i przekształcenia</summary><ul>${p.zrodla.map((s: any) => `<li>${esc(s.nazwa)}; pobrano: ${esc(s.pobrano)}${s.data_stanu ? `; data stanu: ${esc(s.data_stanu)}` : "; data stanu niepodana"}${s.definicja ? `; ${esc(s.definicja)}` : ""}</li>`).join("")}</ul><p>${p.metody.map(esc).join(" · ")}</p><ul>${p.ograniczenia.map((s: string) => `<li>${esc(s)}</li>`).join("")}</ul></details></div>`,
      zrodlo: zrodlo(d.zrodlo ?? "Źródła opisano w pakiecie.", "ZIP zawiera CSV, JSON oraz opis pochodzenia i przekształceń."),
    });
  },
  podlacz(root, d, c) {
    const p = d.pakiet_danych;
    const status = root.querySelector<HTMLElement>("[data-dane-status]")!;
    const pole = root.querySelector<HTMLTextAreaElement>("[data-dane-json]")!;
    root.querySelectorAll<HTMLButtonElement>("[data-dane]").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      status.textContent = "Przygotowywanie danych…";
      try {
        if (!c.pobierz) throw new Error("Ten klient nie obsługuje pobierania plików.");
        const zip = b.dataset.dane === "zip";
        await c.pobierz(nazwaPakietuDanych(p).replace(/\.zip$/i, zip ? ".zip" : ".json"), zip ? "application/zip" : "application/json", zip ? pakietDanychZIP(p) : new TextEncoder().encode(JSON.stringify(p, null, 2)));
        status.textContent = "Przekazano dane do pobrania. Sprawdź pobrane pliki w kliencie.";
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : "Nie udało się pobrać danych.";
        root.querySelector<HTMLElement>("[data-dane-awaryjny]")!.hidden = false;
        pole.value = JSON.stringify(p, null, 2);
      } finally { b.disabled = false; }
    }));
    root.querySelector("[data-dane-kopiuj]")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(pole.value); status.textContent = "Skopiowano dane JSON."; }
      catch { pole.focus(); pole.select(); status.textContent = "Zaznaczono JSON. Skopiuj go skrótem Ctrl+C lub poleceniem Kopiuj."; }
    });
  },
};

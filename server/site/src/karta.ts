import type { Ctx } from "../../ui/src/widoki/typy.ts";

/** Pobranie pliku wygenerowanego w przeglądarce (Blob), bez wysyłania danych na serwer. */
export function pobierzPlik(nazwa: string, mime: string, dane: Uint8Array | string) {
  const url = URL.createObjectURL(new Blob([typeof dane === "string" ? dane : Uint8Array.from(dane).buffer], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = nazwa; a.hidden = true;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
}

// Kontekst dla kart w stronie: ta sama powierzchnia co w iframe MCP Apps, bez App.connect().
export function utworzCtx(o: {
  wywolaj: (nazwa: string, args: Record<string, unknown>) => Promise<any>;
  otworz: (url: string) => void;
  onZmiana: (dane: any) => void;
}): Ctx {
  let ostatnie: any = null;
  const ctx: Ctx = {
    wywolaj: o.wywolaj,
    pokaz(dane) { ostatnie = dane; o.onZmiana(dane); },
    przejdz(dane) { ostatnie = dane; o.onZmiana(dane); },
    // Bez wcześniejszego pokaz/przejdz (np. przełącznik Tabela/Słupki) przerysowuje bieżące dane karty.
    przerysuj() { o.onZmiana(ostatnie); },
    otworz: o.otworz,
    pobierz: async (nazwa, mime, dane) => pobierzPlik(nazwa, mime, dane),
    czyMoznaWolac: true,
    pelnyEkran: undefined,
    wybierzMiejsce: async () => {}, // wybór przekazuje zdarzenie z karty przez Shadow DOM
  };
  return ctx;
}

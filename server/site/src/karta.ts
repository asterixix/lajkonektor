import type { Ctx } from "../../ui/src/widoki/typy.ts";

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
    przerysuj() { if (ostatnie) o.onZmiana(ostatnie); },
    otworz: o.otworz,
    czyMoznaWolac: true,
    pelnyEkran: undefined,
  };
  return ctx;
}

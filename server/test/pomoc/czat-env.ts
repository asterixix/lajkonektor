import { Budzet } from "../../src/budzet.ts";
import { MODEL_DOMYSLNY } from "../../src/czat.ts";
/** Wyłącznie atrapa offline; nie jest potwierdzeniem warunków dostawcy. */
export function envCzatu() {
  const m = new Map<string, unknown>();
  const d = new Budzet({ storage: { get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined, put: async (k, v) => { m.set(k, structuredClone(v)); } } });
  const ns: any = { jurisdiction: () => ns, idFromName: () => "test", get: () => ({ fetch: (u: string, i: RequestInit) => d.fetch(new Request(u, i)) }) };
  return { EDEN_AI_API_KEY: "atrapa-offline", EDEN_AI_URL: "https://api.edenai.run/v3/chat/completions", BUDZET: ns, CZAT_POLITYKA: JSON.stringify({ model: MODEL_DOMYSLNY, endpoint: "https://api.edenai.run/v3/chat/completions", kontekst: 200_000, wyjscie: 4000, wejscieMikroZaMilion: 110_000, wyjscieMikroZaMilion: 550_000, oplataMikro: 1000, europaPotwierdzona: true, przedplata10BezDoladowania: true, dowod: "ATrapa testowa offline, bez dowodu produkcyjnego", waznaDo: "2099-01-01" }) };
}

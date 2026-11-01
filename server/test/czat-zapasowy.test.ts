import { test } from "node:test";
import assert from "node:assert/strict";
import { EDEN_URL, MODEL_DOMYSLNY, MODEL_ZAPASOWY, wolajEdenAi, type PolitykaCeny } from "../src/czat.ts";
const cena = { kontekst: 1_000_000, wyjscie: 4000, wejscieMikroZaMilion: 120_000, wyjscieMikroZaMilion: 600_000, oplataMikro: 0 };
const polityka = (): PolitykaCeny => ({ ...cena, model: MODEL_DOMYSLNY, zapasowy: { ...cena, model: MODEL_ZAPASOWY, endpoint: EDEN_URL, europaPotwierdzona: true, zdrPotwierdzone: true, dowod: "Atrapa testowa polityki, nie dowód produkcyjny", waznaDo: "2099-01-01T00:00:00Z" } });
test("fallback: po trzech błędach osobna rezerwacja i wyłącznie zatwierdzony model UE", async () => {
  const modele: string[] = [], rezerwacje: number[] = [];
  const f = (async (_url: any, init: any) => { modele.push(JSON.parse(init.body).model); return modele.length < 4 ? new Response("", { status: 503 }) : Response.json({ choices: [{ message: { content: "OK" } }] }); }) as typeof fetch;
  const budzet = { rezerwuj: async (kwota: number) => { rezerwacje.push(kwota); return "id"; }, rozlicz: async () => {} };
  await wolajEdenAi({ EDEN_AI_URL: EDEN_URL }, f, 1000, 0, undefined, budzet, polityka())({ model: MODEL_DOMYSLNY, max_tokens: 4000 });
  assert.deepEqual(modele, [MODEL_DOMYSLNY, MODEL_DOMYSLNY, MODEL_DOMYSLNY, MODEL_ZAPASOWY]);
  assert.equal(rezerwacje.length, 4);
});
test("fallback: odmowa autoryzacji lub brak budżetu nie uruchamia innego modelu", async () => {
  let n = 0;
  const f = (async () => { n++; return new Response("", { status: 403 }); }) as typeof fetch;
  const b = { rezerwuj: async () => "id", rozlicz: async () => {} };
  await assert.rejects(wolajEdenAi({ EDEN_AI_URL: EDEN_URL }, f, 1000, 0, undefined, b, polityka())({ model: MODEL_DOMYSLNY, max_tokens: 4000 }));
  assert.equal(n, 1);
  await assert.rejects(wolajEdenAi({ EDEN_AI_URL: EDEN_URL }, f, 1000, 0, undefined, { ...b, rezerwuj: async () => null }, polityka())({ model: MODEL_DOMYSLNY, max_tokens: 4000 }));
  assert.equal(n, 1);
});
test("fallback: nieznany model, globalny endpoint lub brak potwierdzenia ZDR są odrzucane", () => {
  for (const zmiana of [{ model: "inny/model@eu" }, { endpoint: "https://api.edenai.run/v3/chat/completions" }, { zdrPotwierdzone: false }, { waznaDo: "2020-01-01" }]) {
    const p = polityka(); Object.assign(p.zapasowy!, zmiana);
    assert.throws(() => wolajEdenAi({ EDEN_AI_URL: EDEN_URL }, fetch, 1000, 0, undefined, undefined, p));
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Budzet, rezerwuj, rozlicz, type Magazyn } from "../src/budzet.ts";
import { obsluzCzat, wolajEdenAi, zBudzetem } from "../src/czat.ts";
const magazyn = (): Magazyn => {
  const m = new Map<string, unknown>();
  return { get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined, put: async (k, v) => void m.set(k, structuredClone(v)) };
};
const paz = new Date("2026-10-31T23:59:59Z"), lis = new Date("2026-11-01T00:00:01Z");
test("budżet: jednokrotne rozliczenie dotyczy miesiąca rezerwacji", async () => {
  const m = magazyn(), a = await rezerwuj(m, 1_000_000, 9_000_000, paz);
  await rezerwuj(m, 8_000_000, 9_000_000, lis);
  await rozlicz(m, a.id!, 0); await rozlicz(m, a.id!, 0);
  assert.equal((await rezerwuj(m, 0, 9_000_000, lis)).wydano, 8_000_000);
  assert.equal((await rezerwuj(m, 0, 9_000_000, paz)).wydano, 0);
  await assert.rejects(rozlicz(m, a.id!, 1), /rozliczon/);
});
test("budżet: odrzuca niepoprawne mikro-USD i obce rozliczenia", async () => {
  const m = magazyn();
  for (const x of [-1, NaN, Infinity, 0.5, "1", null]) {
    await assert.rejects(rezerwuj(m, x as number, 9_000_000));
    await assert.rejects(rezerwuj(m, 1, x as number));
  }
  await assert.rejects(rozlicz(m, "obca", 0));
});
test("budżet: równoległe rezerwacje nie przekraczają limitu", async () => {
  const m = magazyn(), r = await Promise.all(Array.from({ length: 20 }, () => rezerwuj(m, 1_000_000, 9_000_000, paz)));
  assert.equal(r.filter(x => x.ok).length, 9);
  assert.equal(new Set(r.filter(x => x.ok).map(x => x.id)).size, 9);
});
const p = { model: "test", kontekst: 200_000, wyjscie: 4000, wejscieMikroZaMilion: 110_000, wyjscieMikroZaMilion: 550_000, oplataMikro: 1000 };
test("budżet: błąd i brak usage zachowują rezerwację", async () => {
  const rezerwacje: number[] = [], rozliczenia: unknown[] = [];
  const k = { rezerwuj: async (kwota: number) => { rezerwacje.push(kwota); return "r"; }, rozlicz: async (...x: unknown[]) => { rozliczenia.push(x); } };
  await assert.rejects(zBudzetem(async () => { throw new Error("timeout"); }, k, p)({ model: "test", max_tokens: 4000 }), /timeout/);
  await zBudzetem(async () => ({}), k, p)({ model: "test", max_tokens: 4000 });
  assert.deepEqual(rozliczenia, []); assert.deepEqual(rezerwacje, [3_204, 3_204]);
});
test("Eden: każda próba HTTP ma własną rezerwację", async () => {
  let n = 0, rezerwacje = 0;
  const k = { rezerwuj: async () => String(++rezerwacje), rozlicz: async () => {} };
  const f = (async () => ++n < 3 ? new Response("", { status: 503 }) : Response.json({})) as typeof fetch;
  await wolajEdenAi({}, f, 1000, 0, undefined, k, p)({ model: "test", max_tokens: 4000 });
  assert.equal(rezerwacje, 3);
});
test("czat: brak bindingu i lokalne obejście na produkcji blokują model", async () => {
  for (const env of [{ EDEN_AI_API_KEY: "test" }, { EDEN_AI_API_KEY: "test", BUDZET_LOKALNIE: "1" }]) {
    let n = 0;
    const r = await obsluzCzat(new Request("https://x.test/api/czat", { method: "POST", body: JSON.stringify({ wiadomosci: [{ rola: "uzytkownik", tresc: "x" }] }) }), {
      env, ip: "", mcp: { lista: async () => [], wywolaj: async () => { throw Error(); } }, waitUntil: () => {}, fetchFn: (async () => { n++; return Response.json({}); }) as typeof fetch,
    });
    assert.equal(r.status, 503); assert.equal(n, 0);
  }
});
test("Durable Object: niepoprawne JSON i kwota dają 400", async () => {
  const d = new Budzet({ storage: magazyn() });
  for (const body of ["{", JSON.stringify({ op: "rezerwuj", kwota: -1, limit: 9 })]) assert.equal((await d.fetch(new Request("https://budzet/", { method: "POST", body }))).status, 400);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { utworzCtx } from "../../site/src/karta.ts";

test("pokaz i przejdz wola onZmiana z danymi", () => {
  const seen: any[] = [];
  const ctx = utworzCtx({ wywolaj: async () => ({}), otworz: () => {}, onZmiana: (d) => seen.push(d) });
  ctx.pokaz({ a: 1 });
  ctx.przejdz({ b: 2 });
  assert.deepEqual(seen, [{ a: 1 }, { b: 2 }]);
});

test("wywolaj przekazuje do API i zwraca wynik", async () => {
  const ctx = utworzCtx({ wywolaj: async (n, a) => ({ n, a }), otworz: () => {}, onZmiana: () => {} });
  assert.deepEqual(await ctx.wywolaj("x", { y: 1 }), { n: "x", a: { y: 1 } });
});

test("otworz przekazuje adres do callbacku", () => {
  const otw: string[] = [];
  const ctx = utworzCtx({ wywolaj: async () => ({}), otworz: (u) => otw.push(u), onZmiana: () => {} });
  ctx.otworz("https://example.test/a");
  assert.deepEqual(otw, ["https://example.test/a"]);
});

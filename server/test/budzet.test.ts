import { test } from "node:test";
import assert from "node:assert/strict";
import { rezerwuj, rozlicz, type Magazyn } from "../src/budzet.ts";
const magazyn = (): Magazyn => {
  const m = new Map<string, unknown>();
  return { get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined, put: async (k,v) => { m.set(k, structuredClone(v)); } };
};
test("rezerwacja: dokładnie do limitu i odmowa po wyczerpaniu", async () => {
  const m = magazyn();
  assert.equal((await rezerwuj(m, 8_000_000, 9_000_000)).ok, true);
  assert.equal((await rezerwuj(m, 2_000_000, 9_000_000)).ok, false);
  const r = await rezerwuj(m, 1_000_000, 9_000_000);
  assert.equal(r.ok, true); assert.equal((await rezerwuj(m, 0, 9_000_000)).ok, false);
  assert.equal(await rozlicz(m, r.id!, 250_000), 8_250_000);
});
test("migracja: zachowuje wcześniejszy wydatek USD", async () => {
  const m = magazyn();
  await m.put("stan", { miesiac: "2026-10", wydano: 8 });
  assert.equal((await rezerwuj(m, 2_000_000, 9_000_000, new Date("2026-10-25"))).ok, false);
});

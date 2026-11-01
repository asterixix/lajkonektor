import { test } from "node:test";
import assert from "node:assert/strict";
import { miejsca } from "../src/widoki/miejsca.ts";
import type { Ctx } from "../src/widoki/typy.ts";
const d = { status: "wymaga_wyboru", kandydaci: [{ nazwa: "Test", lat: 50.06, lon: 19.93 }] };
const ctx: Ctx = { wywolaj: async () => ({}), pokaz() {}, przejdz() {}, przerysuj() {}, otworz() {}, czyMoznaWolac: true };
test("wybór miejsca zależy od obsługi wiadomości, a nie narzędzi hosta", () => {
  assert.doesNotMatch(miejsca.render(d, ctx), /data-wybor/);
  assert.match(miejsca.render(d, { ...ctx, czyMoznaWolac: false, wybierzMiejsce: async () => {} }), /data-wybor/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { BladApi, wywolajApi } from "../../site/src/api.ts";

test("blad sieci zamienia sie na komunikat po polsku", async () => {
  await assert.rejects(
    () => wywolajApi("katalog_szukaj", { temat: "przedszkola", limit: 1 }, async () => { throw new Error("offline"); }),
    (e: any) => e instanceof BladApi && /Nie udało się połączyć/.test(e.message) && e.status === 0,
  );
});

test("kod 400 zwraca blad z komunikatem serwera", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ blad: "Brakuje pola nazwa." }), { status: 400 });
  await assert.rejects(
    () => wywolajApi("katalog_szukaj", { temat: "", limit: 1 }, fetchFn as any),
    (e: any) => e instanceof BladApi && /Brakuje pola nazwa/.test(e.message) && e.status === 400,
  );
});

test("200 zwraca JSON", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ _widok: "katalog", liczba: 0 }), { status: 200 });
  const wynik = await wywolajApi("katalog_szukaj", { temat: "przedszkola", limit: 1 }, fetchFn as any);
  assert.equal(wynik._widok, "katalog");
});

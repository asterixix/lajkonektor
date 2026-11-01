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

test("pobieranie w stronie przekazuje dokładne bajty do lokalnego Blob i zwalnia URL", async (t) => {
  let blob: Blob | undefined, klik = false, usunieto = false, zwolniono = "", pozniej: (() => void) | undefined;
  const a = { href: "", download: "", hidden: false, click() { klik = true; }, remove() { usunieto = true; } };
  const poprzedniDokument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const poprzednieOkno = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => a, body: { appendChild() {} } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout(f: () => void) { pozniej = f; } } });
  t.after(() => {
    if (poprzedniDokument) Object.defineProperty(globalThis, "document", poprzedniDokument); else delete (globalThis as any).document;
    if (poprzednieOkno) Object.defineProperty(globalThis, "window", poprzednieOkno); else delete (globalThis as any).window;
  });
  t.mock.method(URL, "createObjectURL", (b: Blob) => { blob = b; return "blob:lokalny-raport"; });
  t.mock.method(URL, "revokeObjectURL", (u: string) => { zwolniono = u; });
  const ctx = utworzCtx({ wywolaj: async () => { throw new Error("eksport nie może wywołać API"); }, otworz: () => {}, onZmiana: () => {} });
  const bufor = new Uint8Array([99, 1, 2, 3, 99]);
  await ctx.pobierz!("raport.zip", "application/zip", bufor.subarray(1, 4));
  assert.equal(blob!.type, "application/zip"); assert.deepEqual([...new Uint8Array(await blob!.arrayBuffer())], [1, 2, 3]);
  assert.equal(a.download, "raport.zip"); assert.equal(a.href, "blob:lokalny-raport"); assert.ok(klik && usunieto);
  assert.equal(zwolniono, ""); pozniej!(); assert.equal(zwolniono, "blob:lokalny-raport");
});

test("przerysuj odświeża kartę także bez wcześniejszego pokaz (przełącznik Tabela/Słupki)", () => {
  let razy = 0;
  const ctx = utworzCtx({ wywolaj: async () => ({}), otworz: () => {}, onZmiana: () => { razy++; } });
  ctx.przerysuj();
  assert.equal(razy, 1);
});

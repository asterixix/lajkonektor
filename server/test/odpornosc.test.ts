import { test } from "node:test";
import assert from "node:assert/strict";
import { rozne } from "../src/osm.ts";
import { arcgisWszystkie } from "../src/sources.ts";
import { zMigawka } from "../src/migawki.ts";
import { Nominatim } from "../src/nominatim.ts";
import { runtime } from "../src/runtime.ts";
import { szukajMiejsc } from "../src/osm.ts";

test("Nominatim: anulowane żądanie nie odpytuje usługi", async () => {
  let wywolania = 0;
  const d = new Nominatim({ storage: { get: async () => undefined, put: async () => {} } });
  const ac = new AbortController(); ac.abort();
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { wywolania++; return Response.json([]); }) as typeof fetch;
  try {
    await assert.rejects(d.fetch(new Request("https://nominatim.internal/?q=test&viewbox=19.78,50.13,20.13,49.95", { signal: ac.signal })));
    assert.equal(wywolania, 0);
  } finally { globalThis.fetch = orig; }
});

test("Nominatim: zawieszony fetch nie blokuje kolejki dłużej niż termin obsługi", async () => {
  const d = new Nominatim({ storage: { get: async () => undefined, put: async () => {} } });
  const orig = globalThis.fetch; let n = 0;
  globalThis.fetch = (async () => (++n === 1 ? new Promise(() => {}) : Response.json([]))) as typeof fetch;
  const url = "https://nominatim.internal/?q=test&viewbox=18.9,50.5,21.5,49.2";
  try {
    const t0 = Date.now();
    assert.equal((await d.fetch(new Request(url))).status, 504);
    assert.equal((await d.fetch(new Request(url))).status, 200);
    assert.ok(Date.now() - t0 < 14_000);
  } finally { globalThis.fetch = orig; }
});

test("OSM: obiekty z migawki bez sieci, posortowane według odległości, z datą stanu i zasięgiem", async () => {
  const { osmObiekty } = await import("../src/overpass.ts");
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("osm_obiekty nie może wołać sieci"); }) as typeof fetch;
  try {
    const r = osmObiekty({ kategoria: "apteki", lat: 50.0717, lon: 20.0377, promien_m: 801, limit: 5 });
    assert.ok(r.obiekty.length > 0 && r.obiekty.length <= 5);
    assert.ok(r.obiekty.every((o, i, l) => o.odleglosc_m <= 801 && (i === 0 || l[i - 1].odleglosc_m <= o.odleglosc_m)));
    assert.match(String(r.data_stanu), /^\d{4}-\d{2}-\d{2}/);
    const daleko = osmObiekty({ kategoria: "apteki", lat: 49.62, lon: 20.69, promien_m: 1000, limit: 5 });
    assert.equal(daleko.kompletne, false);
    assert.ok(daleko.uwagi.some((u) => u.includes("poza zasięg")));
  } finally { globalThis.fetch = orig; }
});

test("Nominatim: dwa konteksty Workera korzystają ze wspólnego koordynatora i trwałego terminu", async () => {
  const m = new Map<string, unknown>(), momenty: number[] = [];
  const storage = { get: async <T>(k: string) => m.get(k) as T | undefined, put: async (k: string, v: unknown) => { m.set(k,v); } };
  const d = new Nominatim({ storage });
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => { momenty.push(Date.now()); return Response.json([{ lat: "50.06", lon: "19.93", osm_id: 1, osm_type: "node", display_name: "Test" }]); }) as typeof fetch;
  try {
    await Promise.all(["test globalny a", "test globalny b"].map(tekst => runtime.run({ produkcja: true, nominatim: d }, () => szukajMiejsc(tekst))));
    const poRestarcie = new Nominatim({ storage });
    await runtime.run({ produkcja: true, nominatim: poRestarcie }, () => szukajMiejsc("test globalny c"));
    assert.equal(momenty.length, 3); assert.ok(momenty[1] - momenty[0] >= 1000); assert.ok(momenty[2] - momenty[1] >= 1000);
    assert.deepEqual([...m.keys()], ["nastepne"]);
  } finally { globalThis.fetch = orig; }
});

test("dwa pobliskie obiekty pozostają osobno; powtórzenie ID znika", () => {
  const a = { lat: 50.06, lon: 19.93, nazwa: "Akademik", osm_typ: "node", osm_id: 1 };
  const b = { ...a, lon: 19.9301, nazwa: "Klub", osm_id: 2 };
  assert.deepEqual(rozne([a, b, { ...a }]).map(x => x.nazwa), ["Akademik", "Klub"]);
});
test("MSIP: stronicuje i wykrywa powtarzaną stronę", async () => {
  let n = 0;
  const f = async () => ++n === 1 ? { features: [{ attributes: { OBJECTID: 1 } }], exceededTransferLimit: true } : { features: [{ attributes: { OBJECTID: 2 } }] };
  const r = await arcgisWszystkie("https://x/0", {}, f);
  assert.equal(r.features.length, 2); assert.equal(r.kompletne, true);
  await assert.rejects(arcgisWszystkie("https://x/0", {}, async () => ({ features: [{ attributes: { OBJECTID: 1 } }], exceededTransferLimit: true })), /stronicowan/);
});
test("migawki: awaryjna ma jawny wiek; starsza niż 24 h jest odrzucona", async () => {
  const m = new Map<string, string>();
  const r2 = { put: async (k: string, v: string) => { m.set(k, v); }, get: async (k: string) => m.has(k) ? { json: async () => JSON.parse(m.get(k)!) } : null };
  const t = Date.parse("2026-10-25T00:00:00Z");
  await zMigawka(r2, "test", async () => ({ features: [], data_stanu: "2026-10-01" }), t);
  const awaria = async (): Promise<any> => { throw Error("awaria"); };
  const r = await zMigawka(r2, "test", awaria, t + 1000);
  assert.equal(r._migawka.archiwalne, true); assert.equal(r._migawka.wiek_s, 1); assert.equal(r._migawka.data_stanu, "2026-10-01");
  await assert.rejects(zMigawka(r2, "test", awaria, t + 86_400_001), /awaria/);
});

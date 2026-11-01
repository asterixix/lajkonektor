import { test } from "node:test";
import assert from "node:assert/strict";
import { rozne, szukajMiejsc, wybierzMiejsce } from "../src/osm.ts";
import { createServer } from "../src/server.ts";

test("adres z kilkoma dopasowaniami: nigdy nie pyta o wybór, przyjmuje pierwsze z adnotacją", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ features: [1, 2].map(n => ({ attributes: { nazwa_ulicy: "Testowa", numer_adresowy: "1", kod_pocztowy: `30-00${n}`, nazwa_dzielnicy: "I" }, geometry: { x: 19.93 + n / 10000, y: 50.06 } })) })) as typeof fetch;
  try {
    const r = await (createServer() as any).wywolaj("adres_na_punkt", { ulica: "Testowa", numer: "1" });
    assert.equal(r.status, "poprawna"); assert.equal(r.wymaga_wyboru, false); assert.equal(r.kandydaci.length, 2); assert.match(r.uwaga, /przyjęto pierwsze/);
    const w = wybierzMiejsce("Testowa 1", [{ etykieta: "A", lat: 50, lon: 19.9 }, { etykieta: "B", lat: 50.1, lon: 19.9 }]);
    assert.match(w.etykieta, /^A \(wybrano automatycznie najlepsze z 2/);
    assert.equal(wybierzMiejsce("Testowa 1", [{ etykieta: "A", lat: 50, lon: 19.9 }]).etykieta, "A");
  } finally { globalThis.fetch = orig; }
});

test("szukajMiejsc: słowo „ulica/ul.” nie trafia do Nominatim", async () => {
  const orig = globalThis.fetch; const q: string[] = [];
  globalThis.fetch = (async (u: any) => { q.push(new URL(String(u)).searchParams.get("q")!); return Response.json([]); }) as typeof fetch;
  try { await szukajMiejsc("ulica Karmelicka testowa, Kraków"); await szukajMiejsc("ul.Długa testowa 5"); assert.deepEqual(q, ["Karmelicka testowa, Kraków", "Długa testowa 5"]); }
  finally { globalThis.fetch = orig; }
});

const m = (lat: number, lon: number, nazwa = "x") => ({ lat, lon, nazwa });

test("rozne: różne pobliskie miejsca zostają osobno", () => {
  const wynik = rozne([m(50.0662, 19.9368, "a"), m(50.0662, 19.9387, "b"), m(50.0648, 19.9442, "c")]);
  assert.deepEqual(wynik.map((x) => x.nazwa), ["a", "b", "c"]);
});

test("Nominatim: zapytania idą kolejno, w odstępie co najmniej sekundy (polityka 1 zapytanie/s)", async () => {
  const oryginal = globalThis.fetch;
  const momenty: number[] = [];
  globalThis.fetch = (async () => {
    momenty.push(Date.now());
    return Response.json([{ lat: "50.06", lon: "19.93", display_name: "Miejsce, Kraków, Polska" }]);
  }) as typeof fetch;
  try {
    const [a, b] = await Promise.all([szukajMiejsc("kolejka testowa jeden"), szukajMiejsc("kolejka testowa dwa")]);
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(momenty.length, 2);
    assert.ok(momenty[1] - momenty[0] >= 1000, `odstęp ${momenty[1] - momenty[0]} ms`);
  } finally {
    globalThis.fetch = oryginal;
  }
});

test("szukajMiejsc: jedno zapytanie, Kraków ma pierwszeństwo, błąd HTTP nie jest traktowany jak brak wyniku", async () => {
  const oryginal = globalThis.fetch;
  let wywolania = 0;
  const wiersz = (lat: string, lon: string, id: number) => ({ lat, lon, osm_id: id, osm_type: "node", display_name: `m${id}` });
  globalThis.fetch = (async () => { wywolania++; return Response.json([wiersz("49.90", "20.50", 1), wiersz("50.06", "19.93", 2)]); }) as typeof fetch;
  try {
    assert.deepEqual((await szukajMiejsc("preferencja krakowa testowa")).map(x => x.osm_id), [2]);
    assert.equal(wywolania, 1);
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(szukajMiejsc("zapasowe miejsce testowe"), /Nominatim HTTP 503/);
  } finally {
    globalThis.fetch = oryginal;
  }
});

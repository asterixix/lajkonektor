// Testy transportu: część offline (syntetyczna sieć, dekoder protobuf, parser GTFS) i część na żywych danych ZTP/OSM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { decodeFeed } from "../src/gtfsrt.ts";
import { zbudujSiecFeedu, type SiecFeedu } from "../src/siec.ts";
import { naZywo } from "./na-zywo.ts";import { kandydaciSzacunek, liniaKursu, odleglosc, planuj, polaczSiec, przystankiBlisko, warszawa, wczytajSiec, uzupelnijNaZywo } from "../src/transport.ts";
import { dotyczace, pobierzKomunikaty } from "../src/komunikaty.ts";
import { geokodujOsm, kandydaciPara } from "../src/osm.ts";
import { addressToPoint } from "../src/adres.ts";

// --- pomocnicze: minimalny koder protobuf do budowy feedu testowego
const varint = (n: number) => { const o: number[] = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const tag = (f: number, w: number) => varint((f << 3) | w);
const ld = (f: number, b: number[]) => [...tag(f, 2), ...varint(b.length), ...b];
const str = (f: number, s: string) => ld(f, [...new TextEncoder().encode(s)]);
const vi = (f: number, n: number) => [...tag(f, 0), ...varint(n)];

// --- syntetyczna sieć: L1: A-B-C, L2: C2-D (C2 100 m od C), L3 bezpośrednio A-D
const stop = (feed: "A", id: string, nazwa: string, lat: number, lon: number): SiecFeedu["przystanki"][number] => [feed, id, nazwa, lat, lon, ""];
const wd = (n: number) => Array(24).fill(n);
function syntetyczna() {
  const feed: SiecFeedu = {
    feed: "A", wersja: "t", last_modified: null, zbudowano: "t", dni_wzorcowe: { wd: "", sa: "", su: "" },
    przystanki: [
      stop("A", "A", "Start", 50.0, 19.9), stop("A", "B", "Środek", 50.01, 19.92), stop("A", "C", "Węzeł", 50.02, 19.94),
      stop("A", "C2", "Węzeł 2", 50.0209, 19.94), stop("A", "D", "Cel", 50.03, 19.96),
    ],
    linie: [["A", "1", "1", "Linia 1", 3], ["A", "2", "2", "Linia 2", 3], ["A", "3", "3", "Linia 3", 3]],
    wzorce: [
      [0, 0, "Węzeł", [0, 1, 2], [0, 6, 12], wd(6), wd(0), wd(0)],
      [1, 0, "Cel", [3, 4], [0, 8], wd(6), wd(0), wd(0)],
      [2, 0, "Cel bezpośrednio", [0, 4], [0, 40], wd(1), wd(0), wd(0)], // rzadka linia (co 60 min), ale bezpośrednia
    ],
  };
  return polaczSiec([feed]);
}
const poniedzialek19 = new Date("2026-10-19T17:00:00Z"); // 19:00 w Warszawie, dzień roboczy

test("warszawa(): strefa i typ dnia", () => {
  const w = warszawa(poniedzialek19);
  assert.equal(w.hhmm, "19:00");
  assert.equal(w.dzien, "wd");
  assert.equal(warszawa(new Date("2026-10-24T10:00:00Z")).dzien, "sa");
  assert.equal(warszawa(new Date("2026-10-25T10:00:00Z")).dzien, "su");
});

test("dekoder GTFS-RT: nagłówek, kurs, route_id i czasy przystanków", () => {
  const stu = (stopId: string, time: number) => ld(2, [...ld(2, vi(2, time)), ...str(4, stopId)]);
  const trip = ld(1, [...str(1, "kurs_1"), ...str(5, "126"), ...vi(6, 1)]);
  const tu = ld(3, [...trip, ...stu("S1", 1792431590), ...stu("S2", 1792431650)]);
  const encja = ld(2, [...str(1, "e1"), ...tu]);
  const buf = new Uint8Array([...ld(1, vi(3, 1792431600)), ...encja]);
  const f = decodeFeed(buf);
  assert.equal(f.header?.timestamp, 1792431600);
  const t = f.entity![0].trip_update;
  assert.equal(t.trip.trip_id, "kurs_1");
  assert.equal(t.trip.route_id, "126");
  assert.equal(t.stop_time_update.length, 2);
  assert.equal(t.stop_time_update[1].stop_id, "S2");
  assert.equal(t.stop_time_update[1].arrival.time, 1792431650);
});

test("parser GTFS: wzorce, mediana czasu, kursy na godzinę i typ dnia", () => {
  const zip = zipSync({
    "stops.txt": strToU8("stop_id,stop_name,stop_lat,stop_lon,location_type\nS1,\"Start, przy rondzie\",50.0,19.9,0\nS2,Środek,50.01,19.92,0\nS3,Cel,50.02,19.94,0\n"),
    "routes.txt": strToU8("route_id,route_short_name,route_long_name,route_type\nR1,7,Siódemka,3\n"),
    "trips.txt": strToU8("route_id,service_id,trip_id,trip_headsign,direction_id\nR1,WD,T1,Cel,0\nR1,WD,T2,Cel,0\nR1,SO,T3,Cel,0\n"),
    "stop_times.txt": strToU8(
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
      "T1,08:00:00,08:00:00,S1,1\nT1,08:05:00,08:05:00,S2,2\nT1,08:12:00,08:12:00,S3,3\n" +
      "T2,08:30:00,08:30:00,S1,1\nT2,08:36:00,08:36:00,S2,2\nT2,08:42:00,08:42:00,S3,3\n" +
      "T3,09:00:00,09:00:00,S1,1\nT3,09:05:00,09:05:00,S2,2\nT3,09:11:00,09:11:00,S3,3\n"),
    "calendar.txt": strToU8(`service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,0,0,20200101,20991231\nSO,0,0,0,0,0,1,0,20200101,20991231\n`),
    "calendar_dates.txt": strToU8("service_id,date,exception_type\n"),
    "feed_info.txt": strToU8("feed_version\nwersja_testowa\n"),
  });
  const s = zbudujSiecFeedu("A", zip, { last_modified: "x" });
  assert.equal(s.przystanki.length, 3);
  assert.equal(s.przystanki[0][2], "Start, przy rondzie", "przecinek w cudzysłowie");
  assert.equal(s.wzorce.length, 1, "trzy kursy o tych samych przystankach to jeden wzorzec");
  const w = s.wzorce[0];
  assert.deepEqual(w[3], [0, 1, 2]);
  assert.deepEqual(w[4], [0, 5, 12], "mediana minut skumulowanych (próbki 5, 6, 5 min na pierwszym odcinku -> 5)");
  assert.equal(w[5][8], 2, "dzień roboczy: 2 kursy o 8:xx");
  assert.equal(w[6][9], 1, "sobota: 1 kurs o 9:xx");
  assert.equal(w[7].reduce((a: number, b: number) => a + b, 0), 0, "niedziela: brak");
  assert.equal(s.wersja, "wersja_testowa");
});

test("planer: linia bezpośrednia i przesiadka, dojście wliczone, brak duplikatów", () => {
  const S = syntetyczna();
  const start = { lat: 50.0, lon: 19.9 }, cel = { lat: 50.03, lon: 19.96 };
  const opcje = planuj(S, kandydaciSzacunek(S, start, 400, 5), kandydaciSzacunek(S, cel, 400, 5), { teraz: poniedzialek19 });
  assert.ok(opcje.length >= 2);
  const bez = opcje.find((o) => o.rodzaj === "bezposrednia")!;
  assert.equal(bez.nogi[0].linia, "3");
  assert.equal(bez.nogi[0].jazda_min, 40);
  const prz = opcje.find((o) => o.rodzaj === "z przesiadką")!;
  assert.deepEqual(prz.nogi.map((n) => n.linia), ["1", "2"]);
  assert.equal(prz.nogi[0].jazda_min, 12);
  assert.ok(prz.przesiadka && prz.przesiadka.dojscie_min >= 1, "przesiadka między przystankami oddalonymi o ~100 m");
  assert.ok(prz.czas_min < bez.czas_min, "przesiadka szybsza od rzadkiej linii bezpośredniej");
  assert.equal(new Set(opcje.map((o) => o.nogi.map((n) => n.linia).join(">"))).size, opcje.length, "bez duplikatów");
});

test("planer: o godzinie bez kursów linia jest niedostępna, nie liczona jako natychmiastowa", () => {
  const S = syntetyczna();
  const noc = new Date("2026-10-19T00:30:00Z");
  const start = { lat: 50.0, lon: 19.9 }, cel = { lat: 50.03, lon: 19.96 };
  // wd(...) ma kursy w każdej godzinie, więc sprawdzamy sobotę (kursów 0)
  const sobota = new Date("2026-10-24T10:00:00Z");
  assert.equal(planuj(S, kandydaciSzacunek(S, start, 400, 5), kandydaciSzacunek(S, cel, 400, 5), { teraz: sobota }).length, 0);
  assert.ok(planuj(S, kandydaciSzacunek(S, start, 400, 5), kandydaciSzacunek(S, cel, 400, 5), { teraz: noc }).length > 0);
});

test("przystankiBlisko: sortowanie po odległości i promień", () => {
  const S = syntetyczna();
  const r = przystankiBlisko(S, 50.0, 19.9, 2500, 10);
  assert.equal(S.przystanki[r[0].idx][1], "A");
  assert.ok(r.every((x, i, a) => i === 0 || a[i - 1].m <= x.m));
  assert.equal(przystankiBlisko(S, 50.0, 19.9, 50, 10).length, 1);
  assert.ok(Math.abs(odleglosc(50, 19.9, 50.01, 19.9) - 1112) < 5);
});

test("liniaKursu: autobus po route_id, tramwaj po mapie kursów statycznych", () => {
  const S = syntetyczna();
  const k = { feed: "A" as const, trip_id: "x", route_id: "2", kier: 0, aktualizacje: [{ stop: 3, t: 1, opoznienie: 0 }, { stop: 4, t: 2, opoznienie: 0 }] };
  assert.deepEqual(liniaKursu(S, k, 0), { numer: "2", kierunek: "Cel" });
  S.kursLinia.set("A:tram_1", 0 * 2 + 0);
  const kt = { feed: "A" as const, trip_id: "tram_1", aktualizacje: [{ stop: 0, t: 1, opoznienie: 0 }, { stop: 1, t: 2, opoznienie: 0 }] };
  assert.equal(liniaKursu(S, kt, 0)?.numer, "1");
});

test("komunikaty: komunikaty testowe ZTP są oznaczone i pomijane w dopasowaniu", () => {
  const k = [
    { feed: "T" as const, tytul: "Ogólny tekst specjalny", opis: "TEST_1 EBBLO", linie: [], przystanki: [], od: null, do: null, testowy: true },
    { feed: "A" as const, tytul: "Objazd", opis: "Linia 50 jedzie objazdem", linie: ["50"], przystanki: [], od: null, do: null, testowy: false },
    { feed: "A" as const, tytul: "Inne", opis: "Linia 99", linie: ["99"], przystanki: [], od: null, do: null, testowy: false },
  ];
  const d = dotyczace(k, new Set(["50"]), new Set());
  assert.equal(d.length, 1);
  assert.equal(d[0].tytul, "Objazd");
});

// --- na żywo (ZTP, OSM, MSIP): wolniejsze, wymagają internetu
naZywo("na żywo: sieć z czterech feedów (autobusy, tramwaje, aglomeracja, pociągi)", { timeout: 240_000 }, async () => {
  const S = await wczytajSiec();
  assert.ok(S.przystanki.length > 3500 && S.wzorce.length > 300);
  assert.deepEqual(Object.keys(S.feedy).sort(), ["A", "K", "M", "T"]);
  assert.ok(S.przystanki.some((p) => p[0] === "K" && p[2] === "Kraków Główny"), "stacje kolejowe z rozkładów PKP PLK");
  assert.ok(S.wzorce.some((w) => w[8]?.wd.length), "pociągi mają dokładne odjazdy");
  assert.ok(S.feedy.A.last_modified, "Last-Modified z serwera ZTP");
});

naZywo("na żywo: trasa Łojasiewicza 4 -> Basztowa 20 (OSM dojście, GTFS-RT, komunikaty)", { timeout: 240_000 }, async () => {
  const S = await wczytajSiec();
  const a = (await addressToPoint({ ulica: "Łojasiewicza", numer: "4" })).kandydaci[0];
  const b = (await addressToPoint({ ulica: "Basztowa", numer: "20" })).kandydaci[0];
  const { start, cel } = await kandydaciPara(S, a, b, 800);
  assert.ok(start.kandydaci.length > 0 && cel.kandydaci.length > 0);
  const opcje = planuj(S, start.kandydaci, cel.kandydaci);
  assert.ok(opcje.length >= 1, "powinna istnieć co najmniej jedna opcja");
  assert.ok(opcje[0].czas_min > 10 && opcje[0].czas_min < 120, `czas ${opcje[0].czas_min} min`);
  // Publiczne feedy bywają chwilowo wolne przy równoległych testach: jedno ponowienie.
  let rt = await uzupelnijNaZywo(S, opcje.slice(0, 3));
  if (rt.bledy.length) rt = await uzupelnijNaZywo(S, opcje.slice(0, 3));
  assert.deepEqual(rt.bledy, [], "feedy RT bez błędów");
  let k = await pobierzKomunikaty(S);
  if (k.bledy.length) k = await pobierzKomunikaty(S);
  assert.deepEqual(k.bledy, []);
});

naZywo("na żywo: geokodowanie OSM nazwy miejsca w Krakowie", { timeout: 60_000 }, async () => {
  const g = await geokodujOsm("Rynek Główny");
  assert.ok(g && Math.abs(g.lat - 50.0615) < 0.01 && Math.abs(g.lon - 19.937) < 0.01);
  assert.equal(await geokodujOsm("zzzxxxnieistniejace miejsce 123"), null);
});

naZywo("na żywo: geokodowanie miejscowości poza Krakowem (gmina Niepołomice)", { timeout: 60_000 }, async () => {
  const g = await geokodujOsm("Staniątki 15");
  assert.ok(g && Math.abs(g.lat - 50.013) < 0.02 && Math.abs(g.lon - 20.19) < 0.05, JSON.stringify(g));
});


// Pociągi (feed K z rozkładów PKP PLK): filtr obszaru, dokładne odjazdy w planerze i na tablicy odjazdów. Offline, syntetyczny GTFS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { zbudujSiecFeedu } from "../src/siec.ts";
import { kandydaciSzacunek, odjazdyRozkladowe, planuj, polaczSiec } from "../src/transport.ts";

const KRAKOW = { lat: 50.0686, lon: 19.9478 }, TARNOW = { lat: 50.0124, lon: 20.9856 };
const wtorek = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+02:00`); // wtorek, czas letni

function siecK() {
  const zip = zipSync({
    "stops.txt": strToU8(`stop_id,stop_name,stop_lat,stop_lon,location_type\nKR,Kraków Główny,${KRAKOW.lat},${KRAKOW.lon},0\nTA,Tarnów,${TARNOW.lat},${TARNOW.lon},0\nWA,Warszawa Centralna,52.2285,21.0033,0\n`),
    "routes.txt": strToU8("route_id,route_short_name,route_long_name,route_type\nR1,R1,Regio,2\nR2,,Tylko nazwa długa,2\n"),
    "trips.txt": strToU8("route_id,service_id,trip_id,trip_headsign,direction_id\nR1,WD,T1,Warszawa,0\nR1,WD,T2,Warszawa,0\nR1,WD,T3,Warszawa,1\nR2,WD,T4,Tarnów,0\n"),
    "stop_times.txt": strToU8(
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n" +
      "T1,08:00:00,08:00:00,KR,1\nT1,09:10:00,09:10:00,TA,2\nT1,12:00:00,12:00:00,WA,3\n" +
      "T2,12:00:00,12:00:00,KR,1\nT2,13:10:00,13:10:00,TA,2\nT2,16:00:00,16:00:00,WA,3\n" +
      "T3,07:00:00,07:00:00,WA,1\nT3,08:00:00,08:00:00,KR,2\nT3,09:00:00,09:00:00,TA,3\n" + // zaczyna poza obszarem
      "T4,10:00:00,10:00:00,TA,1\nT4,11:00:00,11:00:00,WA,2\n"), // tylko jeden przystanek w obszarze: wzorzec do odrzucenia
    "calendar.txt": strToU8("service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWD,1,1,1,1,1,1,1,20200101,20991231\n"),
    "feed_info.txt": strToU8("feed_version\nk\n"),
  });
  return zbudujSiecFeedu("K", zip, { last_modified: null });
}

test("feed K: przystanki spoza Małopolski odpadają, pociąg zaczynający poza obszarem dostaje odjazd z pierwszego zachowanego przystanku", () => {
  const f = siecK();
  assert.deepEqual(f.przystanki.map((p) => p[2]).sort(), ["Kraków Główny", "Tarnów"], "Warszawy nie ma");
  assert.equal(f.wzorce.length, 2, "R1 w obie strony; T4 ma 1 przystanek w obszarze");
  const tam = f.wzorce.find((w) => w[1] === 0)!, wstecz = f.wzorce.find((w) => w[1] === 1)!;
  assert.deepEqual(tam[4], [0, 70], "minuty liczone od pierwszego zachowanego przystanku");
  assert.deepEqual(tam[8]!.wd, [480, 720], "08:00 i 12:00, bez duplikatów");
  assert.deepEqual(wstecz[8]!.wd, [480], "T3 wyjeżdża z Krakowa o 08:00, nie z Warszawy o 07:00");
  assert.equal(f.linie[1][2], "Tylko nazwa długa", "brak route_short_name: nazwa długa");
});

test("planer: pociąg ma dokładne odjazdy, czekanie liczone do najbliższego, a po ostatnim kursie linia znika", () => {
  const S = polaczSiec([siecK()]);
  const start = kandydaciSzacunek(S, KRAKOW, 300, 3), cel = kandydaciSzacunek(S, TARNOW, 300, 3);
  const o = planuj(S, start, cel, { teraz: wtorek("07:30") });
  assert.equal(o[0].nogi[0].odjazd_wg_rozkladu, "08:00");
  assert.equal(o[0].czekanie_min, 30 - o[0].dojscie_start.min, "czekamy do 08:00 po dojściu na stację");
  assert.equal(o[0].zrodlo_czasu, "rozkład pociągu (dokładny odjazd)");
  const poludnie = planuj(S, start, cel, { teraz: wtorek("09:00") });
  assert.equal(poludnie[0].nogi[0].odjazd_wg_rozkladu, "12:00", "08:00 już odjechał");
  assert.equal(planuj(S, start, cel, { teraz: wtorek("13:00") }).length, 0, "po ostatnim kursie");
  assert.equal(planuj(S, start, cel, { teraz: wtorek("01:00") }).length, 0, "pierwszy pociąg za więcej niż 6 h");
});

test("tablica odjazdów: pociągi z rozkładu z oznaczeniem źródła, bez ostatniego przystanku trasy", () => {
  const S = polaczSiec([siecK()]);
  const kr = S.przystanki.findIndex((p) => p[2] === "Kraków Główny"), ta = S.przystanki.findIndex((p) => p[2] === "Tarnów");
  const odj = odjazdyRozkladowe(S, [kr], 5, wtorek("07:30").getTime());
  assert.deepEqual(odj.map((x) => [x.odjazd, x.za_min]), [["08:00", 30], ["08:00", 30], ["12:00", 270]]);
  assert.ok(odj.every((x) => x.zrodlo.startsWith("rozkład") && x.opoznienie_s === null));
  const wTarnowie = odjazdyRozkladowe(S, [ta], 5, wtorek("07:30").getTime());
  assert.ok(wTarnowie.every((x) => x.kierunek === "Warszawa"), "z Tarnowa tylko kursy w kierunku zachowanym; kończące bieg odpadają");
});

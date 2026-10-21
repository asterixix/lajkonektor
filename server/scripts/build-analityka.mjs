// Migawki do analiz: granice 18 dzielnic, ludność dzielnic wg grup wieku (szereg miesięczny) i siatka Hex 100 m z liczbą
// zameldowanych na pobyt stały (środki sześciokątów). Uruchom: node --experimental-strip-types scripts/build-analityka.mjs
// Zapis: data/dzielnice.json, data/ludnosc-dzielnic.json, data/hex100.json. Dane z Miejskiego Systemu Informacji Przestrzennej.
import { writeFileSync } from "node:fs";
import { arcgisQuery } from "../src/sources.ts";
import { znajdz } from "../src/katalog.ts";
import { centroid, uprosc, zaokragl } from "../src/geo.ts";

const url = (id) => znajdz(id).url;
const OBSZARY = url("msip:Demografia/Elud_Obszary/1"), DZ = url("msip:Demografia/Elud_Dz/0"), HEX = url("msip:Demografia/Elud_Hex100/1");

// 1) najnowsza data stanu
const ost = await arcgisQuery(DZ, { where: "1=1", outFields: "na_dzien_txt", returnGeometry: "false", orderByFields: "na_dzien_kod DESC", resultRecordCount: "1" });
const data = ost.features[0].attributes.na_dzien_txt;
console.log("stan na", data);

// 2) granice dzielnic (18), uproszczone do ok. 15 m
const gran = await arcgisQuery(OBSZARY, { where: "1=1", outFields: "id_dzielni,nazwa_peln", returnGeometry: "true", outSR: "4326", geometryPrecision: "6" });
const dzielnice = gran.features.map((f) => ({
  id: f.attributes.id_dzielni, nazwa: f.attributes.nazwa_peln,
  rings: f.geometry.rings.map((r) => zaokragl(uprosc(r, 0.00015), 5)),
})).sort((a, b) => a.id - b.id);
console.log("dzielnice", dzielnice.length, dzielnice.map((d) => `${d.id} ${d.nazwa}`).join(" | "));
writeFileSync(new URL("../data/dzielnice.json", import.meta.url), JSON.stringify({ zrodlo: "MSIP, Demografia/Elud_Obszary", dzielnice }));

// 3) ludność dzielnic wg grup wieku, cały szereg miesięczny (do prognoz kohortowych)
const POLA = ["k_ogolem", "m_ogolem", "r_ogolem", "r_0_2", "r_3_6", "r_7_14", "r_15_18", "r_19_24", "r_25_34", "r_35_44", "r_45_59_64", "r_60_65_79", "r_po_80"];
const lud = await arcgisQuery(DZ, { where: "1=1", outFields: ["id_dz", "nazwa_dz", "na_dzien_txt", ...POLA].join(","), returnGeometry: "false", orderByFields: "na_dzien_kod", resultRecordCount: "2000" });
const wiersze = lud.features.map((f) => f.attributes);
console.log("ludność dzielnic: wierszy", wiersze.length, "dat", new Set(wiersze.map((w) => w.na_dzien_txt)).size);
writeFileSync(new URL("../data/ludnosc-dzielnic.json", import.meta.url), JSON.stringify({ zrodlo: "MSIP, Demografia/Elud_Dz (zameldowani na pobyt stały)", pola: ["id_dz", "data", ...POLA], wiersze: wiersze.map((w) => [w.id_dz, w.na_dzien_txt, ...POLA.map((p) => w[p])]) }));

// 4) siatka Hex 100 m z ostatniego stanu: środek i liczba zameldowanych
const hexy = [];
for (let offset = 0; ; offset += 1000) {
  const r = await arcgisQuery(HEX, { where: `na_dzien_txt = '${data}'`, outFields: "grid_id,r_ogolem", returnGeometry: "true", outSR: "4326", geometryPrecision: "6", resultOffset: String(offset), resultRecordCount: "1000", orderByFields: "objectid" });
  for (const f of r.features) { const c = centroid(f.geometry.rings); hexy.push([+c.lon.toFixed(5), +c.lat.toFixed(5), f.attributes.r_ogolem ?? 0]); }
  console.log("hex", hexy.length);
  if (r.features.length < 1000 && !r.exceededTransferLimit) break;
  if (!r.features.length) break;
}
const suma = hexy.reduce((a, h) => a + h[2], 0);
console.log("hexów", hexy.length, "ludność", suma);
writeFileSync(new URL("../data/hex100.json", import.meta.url), JSON.stringify({ zrodlo: "MSIP, Demografia/Elud_Hex100 (zameldowani na pobyt stały, siatka 100 m)", stan: data, pola: ["lon", "lat", "ludnosc"], hexy }));

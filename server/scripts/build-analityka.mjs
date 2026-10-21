// Migawki do analiz: granice 18 dzielnic, ludność dzielnic wg grup wieku (szereg miesięczny) i siatka Hex 100 m z liczbą
// zameldowanych na pobyt stały, typem strefy standardów dostępności oraz odległościami do szkoły podstawowej i zieleni.
// Uruchom: node --experimental-strip-types scripts/build-analityka.mjs   (kilka minut; wymaga internetu)
// Zapis: data/dzielnice.json, data/ludnosc-dzielnic.json, data/hex100.json. Dane z Miejskiego Systemu Informacji Przestrzennej.
import { writeFileSync } from "node:fs";
import { arcgisQuery } from "../src/sources.ts";
import { znajdz } from "../src/katalog.ts";
import { centroid, uprosc, zaokragl, metry, odlegloscDoObszaru, wObszarze, ringAreaHa } from "../src/geo.ts";

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
console.log("dzielnice", dzielnice.length);
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
  if (r.features.length < 1000 && !r.exceededTransferLimit) break;
  if (!r.features.length) break;
}
console.log("hexów", hexy.length, "ludność", hexy.reduce((a, h) => a + h[2], 0));

// 5) strefy standardów dostępności z projektu planu ogólnego (Obszar Intensywny / Ekstensywny): typ obszaru dla każdego hexa
const PLAN = "msip:Planowanie/BP_Projekt_planu_ogolnego";
async function wszystkie(id, where, pola, maxOffset) {
  const out = [];
  for (let offset = 0; ; offset += 500) {
    const r = await arcgisQuery(url(id), { where, outFields: pola, returnGeometry: "true", outSR: "4326", maxAllowableOffset: String(maxOffset), geometryPrecision: "5", resultOffset: String(offset), resultRecordCount: "500", orderByFields: "objectid" });
    out.push(...r.features.filter((f) => f.geometry?.rings));
    if (r.features.length < 500 && !r.exceededTransferLimit) break;
    if (!r.features.length) break;
  }
  return out;
}
const bb = (rings) => { const p = rings.flat(); return [Math.min(...p.map((x) => x[0])), Math.min(...p.map((x) => x[1])), Math.max(...p.map((x) => x[0])), Math.max(...p.map((x) => x[1]))]; };
const strefy = (await wszystkie(PLAN + "/2", "1=1", "nazwa", 0.0002)).map((f) => ({ typ: f.attributes.nazwa === "Obszar Intensywny" ? 1 : 2, rings: f.geometry.rings, b: bb(f.geometry.rings) }));
console.log("strefy standardów", strefy.length, "intensywne", strefy.filter((z) => z.typ === 1).length);
for (const h of hexy) {
  const z = strefy.find((q) => h[0] >= q.b[0] && h[0] <= q.b[2] && h[1] >= q.b[1] && h[1] <= q.b[3] && wObszarze(h[0], h[1], q.rings));
  h.push(z ? z.typ : 0);
}

// 6) najbliższa publiczna szkoła podstawowa (odległość w linii prostej, m)
const szk = await arcgisQuery(url("msip:Edukacja/EK_PLACOWKI/1"), { where: "typ_pl = 'Szkoła podstawowa' AND publiczn = 'publiczna' AND kat_uczn <> 'Dorośli'", outFields: "nz_pl", returnGeometry: "true", outSR: "4326", resultRecordCount: "1000" });
const szkoly = szk.features.filter((f) => f.geometry).map((f) => [f.geometry.x, f.geometry.y]);
console.log("szkoły podstawowe publiczne", szkoly.length);
for (const h of hexy) h.push(Math.round(Math.min(...szkoly.map((q) => metry(h[1], h[0], q[1], q[0])))));

// 7) odległość do granicy najbliższego obszaru zieleni (strefy SN i SO z planu ogólnego) o powierzchni >= 3 ha i >= 15 ha
const ziel = (await wszystkie(PLAN + "/3", "symbol IN ('SN','SO')", "symbol", 0.0002)).map((f) => ({ ha: f.geometry.rings.reduce((a, r) => a + ringAreaHa(r), 0), rings: f.geometry.rings, b: bb(f.geometry.rings) }));
const z3 = ziel.filter((z) => z.ha >= 3), z15 = ziel.filter((z) => z.ha >= 15);
console.log("zieleń SN/SO", ziel.length, ">=3 ha", z3.length, ">=15 ha", z15.length);
const najblizsza = (lon, lat, lista) => {
  let min = 99999;
  for (const q of lista) {
    // pomijamy obszary, których obwiednia jest dalej niż dotychczasowe minimum
    const dx = Math.max(q.b[0] - lon, 0, lon - q.b[2]) * 111320 * Math.cos((lat * Math.PI) / 180), dy = Math.max(q.b[1] - lat, 0, lat - q.b[3]) * 110540;
    if (Math.hypot(dx, dy) > min) continue;
    const d = odlegloscDoObszaru(lat, lon, q.rings);
    if (d < min) min = d;
  }
  return Math.round(Math.min(min, 99999));
};
for (const h of hexy) h.push(najblizsza(h[0], h[1], z3), najblizsza(h[0], h[1], z15));

writeFileSync(new URL("../data/hex100.json", import.meta.url), JSON.stringify({
  zrodlo: "MSIP, Demografia/Elud_Hex100 (zameldowani na pobyt stały, siatka 100 m) oraz projekt planu ogólnego (strefy standardów, strefy zieleni i otwarte), Edukacja/EK_PLACOWKI",
  stan: data,
  pola: ["lon", "lat", "ludnosc", "strefa_standardow (1=intensywny, 2=ekstensywny, 0=brak)", "m_do_szkoly_podstawowej", "m_do_zieleni_3ha", "m_do_zieleni_15ha"],
  hexy,
}));
console.log("zapisano");

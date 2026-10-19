// Buduje przeszukiwalny katalog źródeł: tabele OD API (WSO2/DAB) i warstwy MSIP (ArcGIS REST) z polami.
// Uruchom: node scripts/build-katalog.mjs   (zapis: data/katalog.json). Dzięki temu model znajduje dane po temacie.
import { writeFileSync, mkdirSync } from "node:fs";

const UA = "lajkonektor-build/0.1 (konkurs Open Data App Krakow)";
const OD = "https://api.um.krakow.pl";
const MSIP = "https://msip3.um.krakow.pl/server/rest/services";
const get = async (u) => (await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) })).json();

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = { blad: String(e.message) }; } }
  }));
  return out;
}

// --- OD: tabele
const apis = (await get(`${OD}/api/am/devportal/v3/apis?limit=100`)).list;
const od = (await pool(apis, 6, async (a) => {
  const sw = await get(`${OD}/api/am/devportal/v3/apis/${a.id}/swagger`);
  const base = sw.servers?.[0]?.url;
  const tables = Object.keys(sw.paths).filter((p) => !p.includes("{") && p !== "/metadata");
  const meta = (await get(`${base}/metadata`)).value ?? [];
  const out = [];
  for (const t of tables) {
    const row = (await get(`${base}${t}?$first=1`)).value?.[0] ?? {};
    const m = meta.find((x) => x.object_name?.toLowerCase() === t.slice(1).replace(/-/g, "_").toLowerCase()) ?? {};
    out.push({
      id: `od:${a.name}${t}`, zrodlo: "od", api: a.name, url: `${base}${t}`, tytul: `${a.name} / ${t.slice(1)}`,
      pola: Object.entries(row).map(([k, v]) => `${k}:${typeof v}`), wiersze: m.number_of_rows ?? null, odswiezono: m.last_refresh ?? null,
    });
  }
  return out;
})).flat().filter((x) => x && !x.blad);

// --- MSIP: warstwy
const root = await get(`${MSIP}?f=json`);
const folders = root.folders ?? [];
const svcs = (await pool(folders, 8, async (f) => (await get(`${MSIP}/${f}?f=json`)).services?.map((s) => ({ name: s.name, type: s.type })) ?? [])).flat()
  .filter((s) => ["MapServer", "FeatureServer"].includes(s.type));
const layers = (await pool(svcs, 8, async (s) => {
  const u = `${MSIP}/${s.name}/${s.type}`;
  const j = await get(`${u}?f=json`);
  const ls = (j.layers ?? []).filter((l) => !l.subLayerIds?.length);
  return Promise.all(ls.map(async (l) => {
    const d = await get(`${u}/${l.id}?f=json`);
    return {
      id: `msip:${s.name}/${l.id}`, zrodlo: "msip", url: `${u}/${l.id}`, tytul: `${s.name} / ${d.name ?? l.name}`,
      opis: (d.description || j.serviceDescription || "").slice(0, 300), geometria: d.geometryType?.replace("esriGeometry", "") ?? null,
      pola: (d.fields ?? []).filter((f) => !["geom", "shape", "Shape", "SHAPE"].includes(f.name)).map((f) => `${f.name}:${f.type.replace("esriFieldType", "")}`),
      maxRecordCount: d.maxRecordCount ?? null,
    };
  }));
})).flat().filter((x) => x && !x.blad && x.pola?.length);

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const katalog = { wygenerowano: new Date().toISOString().slice(0, 10), pozycje: [...od, ...layers] };
writeFileSync(new URL("../data/katalog.json", import.meta.url), JSON.stringify(katalog));
console.log({ od_tabele: od.length, msip_uslugi: svcs.length, msip_warstwy: layers.length, bajty: JSON.stringify(katalog).length });

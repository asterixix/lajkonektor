// Buduje migawkę geometrii parków: tabela OD (78 parków, bez geometrii) + poligony OSM dopasowane po nazwie.
// Uruchom: node scripts/build-parki-osm.mjs   (zapis: data/parki-osm.json, dane OSM na licencji ODbL)
// Overpass jest publiczny i bywa przeciążony, więc robimy to raz, a nie w czasie działania serwera.
import { writeFileSync, mkdirSync } from "node:fs";

const UA = "lajkonektor-build/0.1 (konkurs Open Data App Krakow; artur@sendyka.dev)";
const BBOX = "49.95,19.78,50.13,20.13";
const OD = "https://api.um.krakow.pl/opendata-srodowisko-parki-miejskie/v1/parki-miejskie-powierzchnia";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { if (i === tries - 1) throw e; await sleep(4000 * 2 ** i); }
  }
}

const od = (await retry(async () => (await fetch(OD, { headers: { "user-agent": UA } })).json())).value;
const nm = (k, v) => `nwr["name"]["${k}"~"^(${v})$"](${BBOX});`;
const q = `[out:json][timeout:180];(${nm("leisure", "park|common|garden|nature_reserve|recreation_ground")}${nm("landuse", "recreation_ground|village_green|forest|meadow|grass")}${nm("natural", "wood|grassland|wetland|scrub")}${nm("boundary", "protected_area|national_park")});out tags geom;`;
const osm = (await retry(async () => {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(190_000),
  });
  if (!res.ok) throw new Error("Overpass HTTP " + res.status);
  return res.json();
})).elements;

// Pole w ha z pierścienia lon/lat (rzutowanie lokalne równoodległościowe, wystarczy dla Krakowa).
function ringAreaHa(pts) {
  const k = Math.cos((50.06 * Math.PI) / 180) * 111320, m = 110540;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * k * y2 * m - x2 * k * y1 * m;
  }
  return Math.abs(a) / 2 / 10000;
}
const closed = (g) => g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon;
const toRing = (g) => g.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]);

// Zszywa otwarte odcinki (członki relacji) w zamknięte pierścienie po wspólnych końcach.
function stitch(ways) {
  const key = (p) => `${p.lat},${p.lon}`;
  const rings = [], pool = ways.map((w) => w.slice());
  while (pool.length) {
    let cur = pool.pop();
    for (let grew = true; grew && !closed(cur);) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], a = key(cur[0]), b = key(cur.at(-1));
        if (key(w[0]) === b) cur = cur.concat(w.slice(1));
        else if (key(w.at(-1)) === b) cur = cur.concat(w.slice(0, -1).reverse());
        else if (key(w.at(-1)) === a) cur = w.concat(cur.slice(1));
        else if (key(w[0]) === a) cur = w.slice(1).reverse().concat(cur);
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

// Pierścienie zewnętrzne: way = 1 pierścień; relacja = zszyte członki "outer" (niedomknięte oznaczamy jako partial).
function outerRings(e) {
  if (e.type === "way") return closed(e.geometry ?? []) ? { rings: [toRing(e.geometry)], partial: false } : { rings: [], partial: true };
  const outer = (e.members ?? []).filter((m) => m.role === "outer" && m.geometry).map((m) => m.geometry);
  const rings = stitch(outer);
  const used = rings.reduce((n, r) => n + r.length, 0), all = outer.reduce((n, g) => n + g.length, 0);
  return { rings: rings.map(toRing), partial: used < all * 0.9 };
}

const norm = (s) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter((t) => t && !["park", "im", "imienia", "prof", "gen", "pil", "ul", "przy", "krakowski", "miejski"].includes(t));
const jac = (a, b) => { const A = new Set(a), B = new Set(b); const i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i || 1); };

const cands = osm.map((e) => {
  const { rings, partial } = outerRings(e);
  const area = rings.reduce((s, r) => s + ringAreaHa(r.map(([x, y]) => [x, y])), 0);
  return { id: `${e.type}/${e.id}`, nazwa: e.tags.name, rings, partial, area_ha: +area.toFixed(2), tokens: norm(e.tags.name) };
});

const out = od.map((p) => {
  const t = norm(p.Nazwa);
  const scoredAll = cands.map((c) => ({ c, s: jac(t, c.tokens) })).filter((x) => x.s >= 0.5);
  const scored = scoredAll.filter((x) => x.c.rings.length)
    .map((x) => ({ ...x, r: x.c.area_ha / p.Powierzchnia_ha }))
    .sort((a, b) => b.s - a.s || Math.abs(Math.log(a.r)) - Math.abs(Math.log(b.r)));
  const best = scored[0];
  const base = { lp: p.Lp, nazwa_od: p.Nazwa, typ: p.Typ, dzielnica: p.Dzielnica, powierzchnia_od_ha: +p.Powierzchnia_ha.toFixed(2) };
  if (!best) return { ...base, osm: null, zgodnosc: scoredAll.length ? "brak (OSM ma obiekt, ale bez domkniętego poligonu)" : "brak (nie znaleziono w OSM po nazwie)" };
  const ok = best.r > 0.5 && best.r < 2;
  return {
    ...base,
    osm: { id: best.c.id, nazwa: best.c.nazwa, area_ha: best.c.area_ha, niepelna_geometria: best.c.partial, rings: best.c.rings },
    zgodnosc: ok ? "nazwa+powierzchnia" : "nazwa (powierzchnia OSM różni się >2x)",
  };
});

// Jeden obiekt OSM może opisywać tylko jeden park z tabeli OD. Przy konflikcie (np. "Planty" dla Plant Krakowskich i
// Bieńczyckich) zostaje park o powierzchni najbliższej powierzchni obiektu OSM, reszta traci dopasowanie.
const wgOsm = Object.groupBy(out.filter((p) => p.osm), (p) => p.osm.id);
for (const grupa of Object.values(wgOsm)) {
  if (grupa.length < 2) continue;
  const blad = (p) => Math.abs(Math.log(p.osm.area_ha / p.powierzchnia_od_ha));
  grupa.sort((a, b) => blad(a) - blad(b));
  for (const p of grupa.slice(1)) { p.osm = null; p.zgodnosc = "brak (kontur OSM przypisany do innego parku)"; }
}

mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
writeFileSync(new URL("../data/parki-osm.json", import.meta.url), JSON.stringify({
  zrodlo: "Tabela: Otwarte Dane Miasta Krakowa (parki miejskie). Geometria: © współtwórcy OpenStreetMap, ODbL.",
  wygenerowano: new Date().toISOString().slice(0, 10),
  parki: out,
}));
const by = Object.groupBy(out, (p) => p.zgodnosc);
console.log({ od: od.length, osm_kandydaci: cands.length, ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.length])) });
for (const p of out.filter((x) => x.zgodnosc.startsWith("brak"))) console.log("BRAK:", p.nazwa_od, p.powierzchnia_od_ha, "|", p.zgodnosc);
for (const p of out.filter((x) => x.zgodnosc.startsWith("nazwa (")))
  console.log("ROZJAZD:", p.nazwa_od, p.powierzchnia_od_ha, "ha vs OSM", p.osm.area_ha, p.osm.nazwa);

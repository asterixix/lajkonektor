// Geometria parków: migawka zbudowana skryptem scripts/build-parki-osm.mjs (OSM, ODbL) i dołączona do Workera.
import snapshot from "../data/parki-osm.json" with { type: "json" };

type Ring = [number, number][];
type Park = (typeof snapshot.parki)[number];

// Środek ciężkości największego pierścienia (rzutowanie lokalne), do pokazania punktu na mapie.
function centroid(rings: Ring[]): { lat: number; lon: number } {
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  const k = Math.cos((50.06 * Math.PI) / 180);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const f = x1 * k * y2 - x2 * k * y1;
    a += f; cx += (x1 * k + x2 * k) * f; cy += (y1 + y2) * f;
  }
  return a === 0
    ? { lat: ring[0][1], lon: ring[0][0] }
    : { lat: +(cy / (3 * a)).toFixed(6), lon: +(cx / (3 * a) / k).toFixed(6) };
}

const bbox = (rings: Ring[]) => {
  const pts = rings.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export function parkGeometry(opts: { nazwa?: string; dzielnica?: string; tylko_z_geometria?: boolean }) {
  const n = opts.nazwa?.toLowerCase(), d = opts.dzielnica?.toLowerCase();
  const all = snapshot.parki as Park[];
  const withGeom = all.filter((p) => p.osm);
  const rows = all
    .filter((p) => (!n || p.nazwa_od.toLowerCase().includes(n)) && (!d || p.dzielnica.toLowerCase().includes(d)) && (!opts.tylko_z_geometria || p.osm))
    .slice(0, 100)
    .map((p) => ({
      lp: p.lp, nazwa: p.nazwa_od, typ: p.typ, dzielnica: p.dzielnica, powierzchnia_od_ha: p.powierzchnia_od_ha,
      zgodnosc: p.zgodnosc,
      osm: p.osm && {
        id: p.osm.id, nazwa: p.osm.nazwa, powierzchnia_osm_ha: p.osm.area_ha, niepelna_geometria: p.osm.niepelna_geometria,
        srodek: centroid(p.osm.rings as Ring[]), bbox: bbox(p.osm.rings as Ring[]),
      },
    }));
  const haOd = all.reduce((s, p) => s + p.powierzchnia_od_ha, 0);
  const haGeom = withGeom.reduce((s, p) => s + p.powierzchnia_od_ha, 0);
  return {
    zrodlo: snapshot.zrodlo,
    migawka: snapshot.wygenerowano,
    uwaga:
      "Geometria pochodzi z OSM i dotyczy tylko części parków z tabeli OD. Pole 'zgodnosc' mówi, czy dopasowanie potwierdza powierzchnia. Parki bez geometrii nie wchodzą do analiz przestrzennych.",
    pokrycie: {
      parki_z_geometria: withGeom.length,
      parki_ogolem: all.length,
      udzial_powierzchni_proc: +((100 * haGeom) / haOd).toFixed(1),
    },
    liczba: rows.length,
    parki: rows,
  };
}

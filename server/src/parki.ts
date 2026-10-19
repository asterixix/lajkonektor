// Geometria parków: migawka zbudowana skryptem scripts/build-parki-osm.mjs (OSM, ODbL) i dołączona do Workera.
import snapshot from "../data/parki-osm.json" with { type: "json" };
import { bbox, centroid, clockwise, uprosc, zaokragl, type Ring } from "./geo.ts";

type Park = (typeof snapshot.parki)[number];

export const PARKI_OSM_ID = "lokalne:parki_osm";

// Wszystkie dopasowane pierścienie parków, do użycia jako obszar w zapytaniach przestrzennych.
export function parkiRings(): Ring[] {
  return (snapshot.parki as Park[]).flatMap((p) => (p.osm?.rings as Ring[] | undefined) ?? []).map(clockwise);
}

// Ile parków z tabeli OD ma dopasowaną geometrię (do komunikatów o pokryciu).
export function pokrycieParkow() {
  const all = snapshot.parki as Park[];
  return { z: all.filter((p) => p.osm).length, razem: all.length };
}

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

// Uproszczone kontury do narysowania mapy w karcie (ok. 3 m tolerancji, 5 miejsc po przecinku).
export function konturyParkow(opts: { lp?: number[]; wokol_lp?: number; promien_m?: number }) {
  const all = (snapshot.parki as Park[]).filter((p) => p.osm);
  let wybrane = all;
  if (opts.wokol_lp !== undefined) {
    const c = all.find((p) => p.lp === opts.wokol_lp);
    if (c) {
      const sc = centroid(c.osm!.rings as Ring[]), r = opts.promien_m ?? 900;
      const kx = 111320 * Math.cos((sc.lat * Math.PI) / 180);
      wybrane = all.filter((p) => {
        const s = centroid(p.osm!.rings as Ring[]);
        return p.lp === c.lp || Math.hypot((s.lon - sc.lon) * kx, (s.lat - sc.lat) * 110540) <= r;
      });
    }
  } else if (opts.lp?.length) wybrane = all.filter((p) => opts.lp!.includes(p.lp));
  return {
    liczba: wybrane.length,
    parki: wybrane.map((p) => ({
      lp: p.lp, nazwa: p.nazwa_od, dzielnica: p.dzielnica, powierzchnia_od_ha: p.powierzchnia_od_ha, powierzchnia_osm_ha: p.osm!.area_ha,
      rings: (p.osm!.rings as Ring[]).map((r) => zaokragl(uprosc(r, 0.00003))),
    })),
  };
}

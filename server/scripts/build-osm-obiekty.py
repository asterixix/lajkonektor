"""Buduje migawkę obiektów OSM dla osm_obiekty z ekstraktu Geofabrik (dane OSM na licencji ODbL).

Publiczny overpass-api.de od 11.2026 nie obsługuje użycia automatycznego, a pozostałe instancje są niestabilne,
więc serwer czyta lokalną migawkę zamiast odpytywać Overpass w czasie działania.

Uruchom (z server/): pip install osmium
  python scripts/build-osm-obiekty.py <malopolskie-latest.osm.pbf>
  (plik: https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf)
Zapis: data/osm-obiekty.json
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import osmium

# Kraków z buforem ok. 5 km: zasięg największego promienia osm_obiekty.
BBOX = (19.72, 49.92, 20.29, 50.17)  # zachód, południe, wschód, północ
KATEGORIE = {  # musi odpowiadać KATEGORIE_OSM w src/overpass.ts
    "akademiki": ("building", "dormitory"), "uczelnie": ("amenity", "university"), "biblioteki": ("amenity", "library"),
    "apteki": ("amenity", "pharmacy"), "szkoly": ("amenity", "school"), "przedszkola": ("amenity", "kindergarten"),
    "parki": ("leisure", "park"), "przystanki": ("public_transport", "platform"), "toalety": ("amenity", "toilets"),
    "wodopoje": ("amenity", "drinking_water"),
}
ADRES = ("addr:street", "addr:place", "addr:housenumber", "addr:postcode", "addr:city")


def kategoria(tags):
    for k, (klucz, wartosc) in KATEGORIE.items():
        if tags.get(klucz) == wartosc:
            return k
    return None


class Zbieracz(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.wynik = {k: [] for k in KATEGORIE}

    def dodaj(self, typ, oid, lat, lon, tags):
        k = kategoria(tags)
        if not k or not (BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]):
            return
        adres = {a: tags[a] for a in ADRES if a in tags}
        self.wynik[k].append([typ, oid, round(lat, 6), round(lon, 6), tags.get("name"), adres or None])

    def node(self, n):
        if n.tags and n.location.valid():
            self.dodaj("n", n.id, n.location.lat, n.location.lon, n.tags)

    def way(self, w):
        if not w.tags or not kategoria(w.tags):
            return
        pts = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
        if pts:
            self.dodaj("w", w.id, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), w.tags)

    def area(self, a):
        # Zamknięte drogi obsługuje way(); tu tylko multipoligony z relacji.
        if a.from_way() or not kategoria(a.tags):
            return
        pts = [(nd.lat, nd.lon) for ring in a.outer_rings() for nd in ring if nd.location.valid()]
        if pts:
            self.dodaj("r", a.orig_id(), sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), a.tags)


def main(pbf):
    naglowek = osmium.io.Reader(pbf, osmium.osm.osm_entity_bits.NOTHING).header()
    stan = naglowek.get("osmosis_replication_timestamp") or None
    z = Zbieracz()
    z.apply_file(pbf, locations=True)
    for lista in z.wynik.values():
        lista.sort(key=lambda o: (o[0], o[1]))
    dane = {
        "wygenerowano": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_stanu": stan,
        "zrodlo": "© OpenStreetMap contributors, ODbL; ekstrakt Geofabrik malopolskie",
        "bbox": list(BBOX),
        "pola": ["typ", "osm_id", "lat", "lon", "nazwa", "adres"],
        "kategorie": z.wynik,
    }
    cel = Path(__file__).resolve().parent.parent / "data" / "osm-obiekty.json"
    cel.write_text(json.dumps(dane, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(cel, stan, {k: len(v) for k, v in z.wynik.items()})


if __name__ == "__main__":
    main(sys.argv[1])

import { TRESC } from "../tresc.ts";

const ZRODLA: [string, string][] = [
  ["Otwarte Dane Krakowa", "https://otwartedane.um.krakow.pl"],
  ["GUS, Bank Danych Lokalnych", "https://bdl.stat.gov.pl"],
  ["dane.gov.pl", "https://dane.gov.pl"],
  ["ZTP Kraków", "https://ztp.krakow.pl"],
  ["OpenStreetMap", "https://www.openstreetmap.org/copyright"],
];

export function Stopka() {
  const t = TRESC.stopka;
  return (
    <footer className="stopka">
      <div className="stopka-siatka">
        <div>
          <h2>Lajkonektor</h2>
          <p>{t.opis}</p>
          <p>{t.osm}</p>
        </div>
        <div>
          <h2>{t.zrodla}</h2>
          <ul>{ZRODLA.map(([nazwa, url]) => <li key={url}><a href={url}>{nazwa}</a></li>)}</ul>
        </div>
        <div>
          <h2>Na stronie</h2>
          <ul>
            <li><a href="#podlaczenie">Podłączenie</a></li>
            <li><a href="#dla-miasta">Dla miasta</a></li>
            <li><a href="#ograniczenia">Ograniczenia prototypu</a></li>
          </ul>
        </div>
      </div>
      <p className="stopka-uwaga">{t.niezalezny}</p>
    </footer>
  );
}

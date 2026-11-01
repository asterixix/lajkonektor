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
          <p><a href="https://commons.wikimedia.org/wiki/File:Krak%C3%B3w_dzielnice_blank.svg">{t.tlo}</a></p>
        </div>
        <div>
          <h2>{t.zrodla}</h2>
          <ul>{ZRODLA.map(([nazwa, url]) => <li key={url}><a href={url}>{nazwa}</a></li>)}</ul>
        </div>
        <div>
          <h2>Na stronie</h2>
          <ul>
            <li><a href="#podlaczenie">Podłączenie</a></li>
            <li><a href="#zrodla">Źródła i ograniczenia</a></li>
            <li><a href="#dalej">Rozwój</a></li>
          </ul>
        </div>
      </div>
      <p className="stopka-uwaga">{t.niezalezny}</p>
    </footer>
  );
}

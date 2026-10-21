import { NARZEDZIA, type NarzedzieWiersz } from "../narzedzia.ts";
import { TRESC } from "../tresc.ts";
import { Pojawia } from "./Pojawia.tsx";

function Tabela({ wiersze, etykieta }: { wiersze: NarzedzieWiersz[]; etykieta: string }) {
  return (
    <div className="tabela-kontener" tabIndex={0} role="region" aria-label={etykieta}>
      <table>
        <thead>
          <tr><th scope="col">Grupa</th><th scope="col">Narzędzie</th><th scope="col">Co daje</th><th scope="col">Świeżość</th></tr>
        </thead>
        <tbody>
          {wiersze.map((n) => (
            <tr key={n.nazwa}>
              <td>{n.grupa}</td>
              <td><code>{n.nazwa}</code></td>
              <td>{n.opis}</td>
              <td>{n.swiezosc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabelaNarzedzi() {
  return (
    <section id="narzedzia" className="sekcja t-szare" aria-labelledby="narzedzia-tytul">
      <div className="wnetrze">
        <h2 id="narzedzia-tytul">{TRESC.rozkladNarzedzi.naglowek}</h2>
        <p className="lead">{TRESC.rozkladNarzedzi.opis}</p>
        <Pojawia>
          <Tabela wiersze={NARZEDZIA.filter((n) => n.glowne)} etykieta="Główne narzędzia, tabela przewijana w poziomie" />
          <details className="reszta">
            <summary>{TRESC.rozkladNarzedzi.reszta}</summary>
            <Tabela wiersze={NARZEDZIA.filter((n) => !n.glowne)} etykieta="Pozostałe narzędzia, tabela przewijana w poziomie" />
          </details>
        </Pojawia>
      </div>
    </section>
  );
}

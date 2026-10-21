import { NARZEDZIA } from "../narzedzia.ts";
import { TRESC } from "../tresc.ts";

export function TabelaNarzedzi() {
  return (
    <section id="narzedzia" aria-labelledby="narzedzia-tytul">
      <h2 id="narzedzia-tytul">{TRESC.rozkladNarzedzi.naglowek}</h2>
      <p>{TRESC.rozkladNarzedzi.opis}</p>
      <div className="tabela-kontener" tabIndex={0} role="region" aria-label="Tabela narzędzi, przewijana w poziomie">
        <table>
          <thead>
            <tr><th scope="col">Grupa</th><th scope="col">Narzędzie</th><th scope="col">Co zwraca</th><th scope="col">Świeżość</th></tr>
          </thead>
          <tbody>
            {NARZEDZIA.map((n) => (
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
    </section>
  );
}

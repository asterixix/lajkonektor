import { NARZEDZIA, type NarzedzieWiersz } from "../narzedzia.ts";
import { TRESC } from "../tresc.ts";

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

// Pełny katalog i opis mechanizmu, pokazywane w rozwijanym bloku sekcji „Źródła i ograniczenia”.
export function KatalogNarzedzi() {
  return (
    <>
      <p>{TRESC.rozkladNarzedzi.opis}</p>
      <Tabela wiersze={NARZEDZIA} etykieta="Pełny katalog, tabela przewijana w poziomie" />
      <div className="technika">
            <h3>Co dzieje się pod spodem?</h3>
            <ol className="technika-kroki"><li><strong>AI wybiera działanie</strong><p>Klient odkrywa siedem narzędzi MCP. Schematy szczegółowych operacji pobiera dopiero wtedy, gdy ich potrzebuje.</p></li><li><strong>Serwer sprawdza i liczy</strong><p>Waliduje argumenty, odpytuje API, pobiera kolejne strony danych i wykonuje obliczenia. Geometria trafia do karty, a model dostaje lżejszy wynik.</p></li><li><strong>Ty sprawdzasz odpowiedź</strong><p>Model wyjaśnia wynik. Karta pokazuje źródła, daty i ograniczenia; raport możesz zachować razem z danymi.</p></li></ol>
            <h3>Zabezpieczenia i granice</h3>
            <ul className="technika-zasady"><li>Tylko odczyt publicznych źródeł. Brak zapisu do rejestrów i wykonywania dowolnego kodu.</li><li>Walidacja schematów, limity czasu, liczby wierszy i rozmiaru odpowiedzi. Niepełne dane nie udają pełnego wyniku.</li><li>Niejednoznaczny adres wymaga Twojego wyboru. Serwer nie wybiera po cichu pierwszego trafienia.</li><li>Czat ma limit kosztu i kontrolę pochodzenia żądania; limity IP są przybliżone. Publiczny MCP korzysta z modelu i zasad klienta użytkownika.</li></ul>
            <div className="technologie" aria-label="Technologie używane w prototypie"><p><strong>Cloudflare Workers</strong><br/>Warstwa uruchomieniowa, koordynacja i migawki danych.</p><p><strong>Eden AI</strong><br/>Brama do modelu używanego przez czat demonstracyjny.</p></div>
            <p className="zrodlo">Własny klient MCP korzysta z Twojego modelu; czat demo rozlicza model osobno.</p>
          </div>
    </>
  );
}

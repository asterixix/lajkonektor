import { PasekUlatwien } from "./PasekUlatwien.tsx";

const MENU: [string, string][] = [
  ["#demo", "Demo"],
  ["#jak", "Jak to działa"],
  ["#mieszkancy", "Mieszkańcy"],
  ["#dlaczego", "Dlaczego"],
  ["#narzedzia", "Narzędzia"],
  ["#dla-miasta", "Dla miasta"],
  ["#podlaczenie", "Podłącz"],
  ["#dalej", "Rozwój"],
];

export function Naglowek() {
  return (
    <>
      <header>
        <PasekUlatwien />
        <div className="marka-wiersz">
          <a className="marka" href="#demo" aria-label="Lajkonektor, początek strony">
            <img src="/logo.png" alt="" width="56" height="56" />
            <span>
              <span className="marka-nazwa">Lajkonektor</span>
              <span className="marka-opis">konektor otwartych danych Krakowa dla AI</span>
            </span>
          </a>
        </div>
      </header>
      <nav className="menu" aria-label="Główna">
        <ul>
          {MENU.map(([href, tekst]) => <li key={href}><a href={href}>{tekst}</a></li>)}
        </ul>
      </nav>
    </>
  );
}

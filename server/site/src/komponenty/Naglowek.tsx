import { useEffect, useState } from "react";
import { List, X } from "@phosphor-icons/react";
import { PasekUlatwien } from "./PasekUlatwien.tsx";

const MENU: [string, string][] = [
  ["demo", "Czat"],
  ["jak", "Jak to działa"],
  ["zrodla", "Źródła i ograniczenia"],
  ["podlaczenie", "Podłącz"],
  ["dalej", "Rozwój"],
];

// Bieżąca sekcja: ta, która przecina pas tuż pod paskiem menu. IntersectionObserver zamiast nasłuchu przewijania.
function useBiezacaSekcja(): string {
  const [biezaca, setBiezaca] = useState(MENU[0][0]);
  useEffect(() => {
    const obs = new IntersectionObserver((wpisy) => {
      for (const w of wpisy) if (w.isIntersecting) setBiezaca(w.target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    for (const [id] of MENU) { const el = document.getElementById(id); if (el) obs.observe(el); }
    return () => obs.disconnect();
  }, []);
  return biezaca;
}

export function Naglowek() {
  const biezaca = useBiezacaSekcja();
  const [otwarte, setOtwarte] = useState(false);
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
        <button type="button" className="menu-przelacz" aria-expanded={otwarte} aria-controls="menu-lista" onClick={() => setOtwarte(!otwarte)}>
          {otwarte ? <X size={20} weight="bold" aria-hidden="true" /> : <List size={20} weight="bold" aria-hidden="true" />} Menu
        </button>
        <ul id="menu-lista" data-otwarte={otwarte}>
          {MENU.map(([id, tekst]) => (
            <li key={id}><a href={`#${id}`} aria-current={biezaca === id ? "location" : undefined} onClick={() => setOtwarte(false)}>{tekst}</a></li>
          ))}
        </ul>
      </nav>
    </>
  );
}

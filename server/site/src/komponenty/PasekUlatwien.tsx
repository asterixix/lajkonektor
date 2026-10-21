import { useEffect, useState } from "react";
import { TRESC } from "../tresc.ts";

const ROZMIARY = [112.5, 125, 137.5];
const KLUCZ = "lk-ulatwienia";

function odczyt(): { rozmiar: number; kontrast: boolean } {
  try {
    const j = JSON.parse(localStorage.getItem(KLUCZ) ?? "{}");
    return { rozmiar: ROZMIARY.includes(j.rozmiar) ? j.rozmiar : ROZMIARY[0], kontrast: j.kontrast === true };
  } catch {
    return { rozmiar: ROZMIARY[0], kontrast: false };
  }
}

// Ułatwienia jak na krakow.pl: rozmiar tekstu (rem) i tryb wysokiego kontrastu. Stan zapamiętany w przeglądarce, jeśli ta pozwala.
export function PasekUlatwien() {
  const [{ rozmiar, kontrast }, ustaw] = useState(odczyt);

  useEffect(() => {
    document.documentElement.style.fontSize = `${rozmiar}%`;
    if (kontrast) document.documentElement.dataset.kontrast = "wysoki";
    else delete document.documentElement.dataset.kontrast;
    try { localStorage.setItem(KLUCZ, JSON.stringify({ rozmiar, kontrast })); } catch { /* tryb prywatny */ }
  }, [rozmiar, kontrast]);

  const nazwy = ["standardowy", "większy", "największy"];
  return (
    <div className="ulatwienia">
      <div className="ulatwienia-grupa" role="group" aria-label="Ułatwienia dostępu">
        <span>Ułatwienia dostępu:</span>
        {ROZMIARY.map((r, i) => (
          <button key={r} type="button" aria-pressed={r === rozmiar} aria-label={`Rozmiar tekstu ${nazwy[i]}`} style={{ fontSize: `${0.9 + i * 0.2}rem` }} onClick={() => ustaw({ rozmiar: r, kontrast })}>A</button>
        ))}
        <button type="button" aria-pressed={!kontrast} aria-label="Kontrast standardowy" onClick={() => ustaw({ rozmiar, kontrast: false })}>A</button>
        <button type="button" className="kontrast-wysoki" aria-pressed={kontrast} aria-label="Kontrast wysoki" onClick={() => ustaw({ rozmiar, kontrast: true })}>A</button>
      </div>
      <span className="ulatwienia-niezalezny">{TRESC.niezalezny}</span>
    </div>
  );
}

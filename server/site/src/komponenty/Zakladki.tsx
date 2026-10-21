import type { KeyboardEvent, ReactNode } from "react";

// Zakładki z klawiaturą jak we wzorcu ARIA: strzałki zmieniają kartę, Home i End skaczą na początek i koniec.
export function Zakladki({ idBazowe, etykieta, pozycje, aktywna, onZmiana, children }: {
  idBazowe: string;
  etykieta: string;
  pozycje: { id: string; etykieta: string }[];
  aktywna: string;
  onZmiana: (id: string) => void;
  children: ReactNode;
}) {
  function klawisz(e: KeyboardEvent, i: number) {
    const n = pozycje.length;
    const cel = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (cel < 0) return;
    e.preventDefault();
    onZmiana(pozycje[cel].id);
    document.getElementById(`${idBazowe}-tab-${pozycje[cel].id}`)?.focus();
  }
  return (
    <>
      <div role="tablist" aria-label={etykieta} className="zakladki">
        {pozycje.map((p, i) => (
          <button
            key={p.id}
            id={`${idBazowe}-tab-${p.id}`}
            type="button"
            role="tab"
            aria-selected={p.id === aktywna}
            aria-controls={`${idBazowe}-panel`}
            tabIndex={p.id === aktywna ? 0 : -1}
            onClick={() => onZmiana(p.id)}
            onKeyDown={(e) => klawisz(e, i)}
          >
            {p.etykieta}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${idBazowe}-panel`} aria-labelledby={`${idBazowe}-tab-${aktywna}`}>
        {children}
      </div>
    </>
  );
}

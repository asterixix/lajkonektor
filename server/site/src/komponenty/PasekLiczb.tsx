import { TRESC } from "../tresc.ts";

export function PasekLiczb() {
  return (
    <div className="pasek-liczb">
      <ul>
        {TRESC.pasek.map((p) => (
          <li key={p.opis}>
            <strong>{p.liczba}</strong>
            <span>{p.opis}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

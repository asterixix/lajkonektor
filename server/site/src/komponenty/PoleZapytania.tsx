import { useId, useState, type FormEvent } from "react";
import { wywolajApi } from "../api.ts";
import { PRZYKLAD_PUSTY } from "../stany.ts";

// Pole na żywo: deterministyczne katalog_szukaj, zero kosztu modelu.
export function PoleZapytania({ onWynik, onBlad }: { onWynik: (d: any) => void; onBlad: (e: Error) => void }) {
  const id = useId();
  const opisId = `${id}-opis`;
  const [temat, setTemat] = useState("");
  const [blad, setBlad] = useState<string | null>(null);

  async function wyslij(e: FormEvent) {
    e.preventDefault();
    const t = temat.trim();
    if (!t) { setBlad("Wpisz temat, na przykład: " + PRZYKLAD_PUSTY + "."); return; }
    setBlad(null);
    try {
      onWynik(await wywolajApi("katalog_szukaj", { temat: t, limit: 6 }));
    } catch (err) {
      onBlad(err as Error);
    }
  }

  return (
    <form onSubmit={wyslij} className="pole-zapytania" noValidate>
      <label htmlFor={id}>Szukaj w 1200 zbiorach danych</label>
      <div className="pole-zapytania-wiersz">
        <input id={id} type="text" value={temat} onChange={(e) => setTemat(e.target.value)} aria-describedby={blad ? opisId : undefined} aria-invalid={blad ? true : undefined} autoComplete="off" />
        <button type="submit">Szukaj</button>
      </div>
      {blad && <p id={opisId} role="alert">{blad}</p>}
    </form>
  );
}

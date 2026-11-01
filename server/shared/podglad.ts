// Adres osobnej podstrony podglądu zbioru. Zapytanie jest w części # adresu: przeglądarka nie wysyła jej na serwer,
// a strona sama ponownie pobiera dane. Nic nie jest zapisywane; podgląd jest tymczasowy.
export type WidokPodgladu = "opis" | "dane" | "mapa";
export interface Podglad { id: string; widok: WidokPodgladu }

const WIDOKI: WidokPodgladu[] = ["opis", "dane", "mapa"];
// Identyfikatory z katalogu: od:API/zasob albo msip:Grupa/Usluga/numer.
const ID = /^(od|msip):[\w\-./]{3,200}$/;

export function adresPodgladu(origin: string, p: Podglad): string {
  return `${origin}/?podglad=1#${new URLSearchParams({ id: p.id, widok: p.widok })}`;
}

export function odczytajPodglad(hash: string): Podglad | null {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  const id = q.get("id") ?? "", widok = q.get("widok") as WidokPodgladu;
  return ID.test(id) && !id.includes("..") && WIDOKI.includes(widok) ? { id, widok } : null;
}

/** Argumenty odczytu do karty podglądu. Mapa ma uproszczone kontury do rysowania; pełną geometrię daje eksport GIS. */
export function argumentyPodgladu(p: Podglad): { nazwa: string; argumenty: Record<string, unknown> } {
  if (p.widok === "opis") return { nazwa: "zbior_opis", argumenty: { id: p.id } };
  return { nazwa: "dane_zapytaj", argumenty: p.widok === "mapa" ? { id: p.id, limit: 200, kontury: true } : { id: p.id, limit: 1000 } };
}

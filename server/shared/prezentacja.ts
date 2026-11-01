/** Rola karty nadawana przez serwer. Nie steruje interfejsem hosta MCP. */
export interface PrezentacjaWyniku {
  rola: "pomocnicza" | "koncowa" | "wybor" | "zatwierdzenie";
}

export function prezentacjaWyniku(nazwa: string, argumenty: any, wynik: any): PrezentacjaWyniku {
  if (wynik.status === "wymaga_wyboru" || wynik.wymaga_wyboru) return { rola: "wybor" };
  // Bramkę klasyfikujemy na podstawie zwalidowanej operacji, nie metadanych źródła.
  if (nazwa === "operacja_wykonaj") return prezentacjaWyniku(argumenty.operacja, argumenty.argumenty, wynik);
  if (nazwa === "analiza") return { rola: argumenty.tryb === "sprawdz" ? "zatwierdzenie" : "koncowa" };
  if (nazwa === "dane_eksportuj" || nazwa === "widok" && argumenty.cel === "odpowiedz") return { rola: "koncowa" };
  return { rola: "pomocnicza" };
}

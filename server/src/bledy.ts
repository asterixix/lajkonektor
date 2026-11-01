export class BladDomeny extends Error {
  kod: "wejscie" | "niedostepne" | "niepelne" | "wybor";
  dane?: Record<string, unknown>;
  constructor(kod: BladDomeny["kod"], komunikat: string, dane?: Record<string, unknown>) {
    super(komunikat); this.kod = kod; this.dane = dane;
  }
}

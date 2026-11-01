import { z } from "zod";
import { analizaSchema, hashPlanuAnalizy, materializujPlanDanych, planDanychSchema, zrodloDanychSchema } from "./raport.ts";
import { LIMIT_DANYCH, pakietDanychJSON, type PakietDanych } from "../shared/eksport-danych.ts";

const odczytSchema = z.object({
  z: zrodloDanychSchema.describe("Zaufane źródło i dokładne argumenty odczytu; bez wklejania tabel. Dane zostaną pobrane ponownie, w pełnych stronach."),
  tytul: z.string().trim().min(2).max(120).optional().describe("Nazwa pobieranego pakietu danych"),
}).strict();
const planEksportuSchema = z.object({
  plan: planDanychSchema,
  id_planu: z.string().regex(/^[a-f0-9]{64}$/).describe("Id dokładnego planu sprawdzonego operacją analiza w trybie sprawdz"),
  zatwierdzenie: z.string().trim().min(2).max(1000).describe("Rzeczywista deklaracja zatwierdzenia planu w rozmowie; nie twórz jej za użytkownika"),
}).strict();
export const eksportDanychSchema = z.union([odczytSchema, planEksportuSchema]);
type Wywolaj = (narzedzie: string, argumenty: unknown) => Promise<any>;

/** Eksport odczytu nie uruchamia raportu. Obliczenia korzystają z tego samego planu, limitów i zatwierdzenia co analiza. */
export async function eksportujDane(args: unknown, wywolaj: Wywolaj) {
  const a = eksportDanychSchema.parse(args);
  const ograniczenia = ["Eksport ponawia pobranie źródeł lub odczyt zaufanej migawki. Nie jest kopią ani potwierdzeniem identyczności wcześniejszej odpowiedzi."];
  const p = "z" in a ? planDanychSchema.parse({
    tytul: a.tytul ?? "Dane do własnej analizy", pytanie: "Pobranie danych do własnej analizy", zrodla: [{ id: "dane", ...a.z }], operacje: [],
  }) : analizaSchema.parse({ tryb: "wykonaj", ...a }).plan;
  if (!("z" in a)) {
    if (await hashPlanuAnalizy(p) !== a.id_planu) throw Error("Identyfikator id_planu nie zgadza się z aktualnym planem; ponów sprawdzenie i zatwierdzenie.");
    ograniczenia.push("Zatwierdzenie planu w rozmowie jest deklaracją, nie uwierzytelnionym dowodem zgody. Wyniki obliczeń nie są interpretacją modelu.");
  }
  const dane = await materializujPlanDanych(p, wywolaj, ograniczenia);
  const odczytane = new Set(p.zrodla.map(s => s.id));
  const pakiet: PakietDanych = {
    format: "lajkonektor-dane", wersja: "1", tytul: p.tytul, utworzono: new Date().toISOString(), odczyt: "ponowiony",
    tabele: dane.tabele.map(t => ({ ...t, rodzaj: odczytane.has(t.id) ? "odczytana" : "przeliczona", kompletne: true })),
    zrodla: dane.zrodla, metody: dane.metody, ograniczenia: [...new Set(dane.ograniczenia)],
    ...("z" in a ? {} : { plan: p, id_planu: a.id_planu, zatwierdzenie: a.zatwierdzenie }),
  };
  pakietDanychJSON(pakiet);
  const wynik = { tytul: p.tytul, zrodlo: dane.zrodla.map(s => s.nazwa).join("; "), kompletne: true as const, pakiet_danych: pakiet };
  if (new TextEncoder().encode(JSON.stringify(wynik)).byteLength > LIMIT_DANYCH) throw Error("Eksport przekracza limit 1 MiB wyniku; zawęź odczyt lub plan. Wyniku nie ucięto.");
  return wynik;
}

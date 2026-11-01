// Rejestr widoków: nazwa z pola `_widok` wyniku narzędzia → karta. Typ wymusza kartę dla każdej nazwy z nazwy.ts.
import { odjazdy, trasa, przystanki } from "./transport.ts";
import { tabela, plik, szereg, prognoza, parki, katalog, opisZbioru, bdlLista, daneGov, adres, komunikaty, status } from "./dane.ts";
import { zlozony } from "./zlozony.ts";
import { miejsca, operacje } from "./miejsca.ts";
import { eksport } from "./eksport.ts";
import type { NazwaWidoku } from "./nazwy.ts";
import type { Widok } from "./typy.ts";

export const WIDOKI: Record<NazwaWidoku, Widok> = {
  odjazdy, trasa, przystanki, tabela, plik, szereg, prognoza, parki, katalog,
  opis_zbioru: opisZbioru, bdl_lista: bdlLista, dane_gov: daneGov, adres, komunikaty, status, zlozony, miejsca, operacje, eksport,
};

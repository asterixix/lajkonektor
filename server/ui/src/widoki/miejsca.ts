import { esc, kafel, zrodlo } from "../pomoc.ts";
import { mapa } from "../mapa.ts";
import type { Widok } from "./typy.ts";
export const miejsca: Widok = {
  render(d, c) {
    const kandydaci = d.kandydaci ?? d.obiekty ?? [];
    return kafel({ id: "miejsce_szukaj", tytul: d.status === "wymaga_wyboru" ? "Wybierz lokalizację" : "Miejsca w OpenStreetMap", tresc: `<p>${esc(d.uwaga ?? "Wybierz miejsce z listy; numer odpowiada oznaczeniu na mapie.")}</p>${kandydaci.length ? mapa({ opis: "Kandydaci lokalizacji", punkty: kandydaci.filter((x: any) => Number.isFinite(x.lat) && Number.isFinite(x.lon)).map((x: any, i: number) => ({ lat: x.lat, lon: x.lon, etykieta: `${i + 1}. ${x.etykieta ?? x.nazwa}` })) }) : "<p>Brak wyników.</p>"}<ol>${kandydaci.map((x: any, i: number) => `<li><p><strong>${esc(x.etykieta ?? x.nazwa)}</strong><br>${esc(x.kategoria ?? "")}<br><span class="mono">${esc(x.lat)}, ${esc(x.lon)}</span></p>${c.wybierzMiejsce ? `<button class="przycisk obrys" data-wybor="${i}">Wybieram to miejsce</button>` : ""}</li>`).join("")}</ol>`, zrodlo: zrodlo(d.zrodlo ?? "© OpenStreetMap contributors, ODbL") });
  },
  podlacz(root, d, c) {
    root.querySelectorAll<HTMLButtonElement>("[data-wybor]").forEach(b => { b.onclick = async () => {
      const x = (d.kandydaci ?? d.obiekty ?? [])[Number(b.dataset.wybor)];
      if (!c.wybierzMiejsce) return;
      const tekst = `Wybieram ${x.etykieta ?? x.nazwa}: lat ${x.lat}, lon ${x.lon}. Użyj tych współrzędnych do poprzedniego pytania.`;
      try {
        await c.wybierzMiejsce(tekst);
        root.dispatchEvent(new CustomEvent("lajkonektor:wybor", { detail: tekst, bubbles: true, composed: true }));
        b.textContent = "Wybrano"; b.disabled = true;
      } catch { b.textContent = "Wpisz współrzędne w rozmowie"; }
    }; });
  },
};
export const operacje: Widok = {
  render(d) { return kafel({ id: "operacje_szukaj", tytul: "Dostępne operacje", zrodlo: zrodlo("Rejestr operacji Lajkonektora"), tresc: `<ul>${(d.operacje ?? []).map((o: any) => `<li><strong>${esc(o.tytul)}</strong><p>${esc(o.opis)}</p><details><summary>Schemat operacji ${esc(o.nazwa)}</summary><pre>${esc(JSON.stringify({ wejscie: o.inputSchema, wyjscie: o.outputSchema }, null, 2))}</pre></details></li>`).join("")}</ul>` }); },
};

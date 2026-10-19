// Widoki transportu: odjazdy na żywo, trasa (opcje i oś czasu) i przystanki w pobliżu.
import { kafel, esc, liczba, nr, komunikatyHtml, punktualnosc, zrodlo } from "../pomoc.ts";
import { mapa } from "../mapa.ts";
import { stan, type Ctx, type Widok } from "./typy.ts";

const hhmm = (ts?: number) => (ts ? new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date(ts * 1000)) : "");
// Do tytułu karty: „prof. Stanisława Łojasiewicza 4, 30-348 (Dzielnica VIII Dębniki)” → „prof. Stanisława Łojasiewicza 4”,
// „Dworzec Główny Tunel 01, Antresola, Wesoła” → „Dworzec Główny Tunel 01”, „15, Staniątki, gmina Niepołomice” → „Staniątki 15”.
const krotko = (opis?: string) => {
  const cz = (opis ?? "?").replace(/,\s*\d{2}-\d{3}.*$/, "").split(",").map((x) => x.trim());
  return /^\d+\w?$/.test(cz[0]) && cz[1] ? `${cz[1]} ${cz[0]}` : cz[0];
};
const najnowszy = (o?: Record<string, number>) => (o ? Math.max(0, ...Object.values(o)) : 0);

// --- odjazdy
export const odjazdy: Widok = {
  render(d) {
    const lista: any[] = d.odjazdy ?? [];
    const przystanki = [...new Set(lista.map((x) => x.przystanek))];
    const tytul = d._zapytanie?.nazwa ?? (przystanki.length === 1 ? przystanki[0] : przystanki[0] ? `${przystanki[0]} i okolica` : "Odjazdy");
    const ts = najnowszy(d.czas_feedu);
    const rozklad = (x: any) => String(x.zrodlo ?? "").startsWith("rozkład"); // pociągi: godzina z rozkładu, bez opóźnień
    const zywo = lista.some((x) => !rozklad(x)) && !(d.bledy?.length);
    const wiersze = lista.map((x) => {
      const p = rozklad(x) ? { tekst: `${x.odjazd} wg rozkładu`, klasa: "szary-t" } : punktualnosc(x.opoznienie_s, x.odjazd);
      return `<div class="rzad" style="--kol:72px minmax(0,1fr) 88px"><div>${nr(x.linia)}</div><div style="font-size:16px;line-height:1.3">${esc(x.kierunek || "kierunek nieznany")}<div class="mala ${p.klasa}">${esc(p.tekst)}${przystanki.length > 1 ? " · " + esc(x.przystanek) : ""}</div></div><div class="p"><span class="wartosc">${liczba(x.za_min, 0)}</span><span class="jednostka"> min</span></div></div>`;
    }).join("");
    const tresc = `${komunikatyHtml(d.komunikaty)}
${lista.length ? `<div><div class="naglowek-tabeli" style="--kol:72px minmax(0,1fr) 88px"><div>Linia</div><div>Kierunek</div><div class="p">Za</div></div>${wiersze}</div>` : `<div class="puste"><div class="tr" style="font-size:17px;font-weight:900">Brak odjazdów w feedzie.</div><div class="szary-t">Feed GTFS-RT zawiera kursy już będące w trasie. Odległe odjazdy mogą się jeszcze nie pojawić.</div></div>`}
${d.bledy?.length ? `<div class="ostrzezenia"><span class="etykieta">UWAGA</span>${esc(d.bledy.join("; "))}</div>` : ""}`;
    return kafel({
      id: "odjazdy", tytul, znacznik: zywo ? { tekst: "NA ŻYWO", rodzaj: "zielony" } : lista.length ? { tekst: "ROZKŁAD", rodzaj: "atrament" } : { tekst: "BRAK DANYCH", rodzaj: "atrament" }, tresc,
      zrodlo: zrodlo("ZTP Kraków, GTFS-RT" + (ts ? `, stan ${hhmm(ts)}.` : ".") + (lista.some(rozklad) ? " Pociągi: rozkład PKP PLK (mkuran.pl), bez opóźnień." : ""), "Kursy jeszcze niewyjechane mogą nie być w feedzie."),
      akcja: d._zapytanie ? `<button class="przycisk" data-odswiez>Odśwież</button>` : "",
    });
  },
  podlacz(root, d, c) {
    const b = root.querySelector<HTMLButtonElement>("[data-odswiez]");
    if (!b) return;
    b.disabled = !c.czyMoznaWolac;
    b.onclick = async () => {
      b.disabled = true; b.textContent = "Pobieram…";
      try { c.pokaz(await c.wywolaj("odjazdy", d._zapytanie)); } catch { b.textContent = "Nie udało się"; setTimeout(() => c.przerysuj(), 1600); }
    };
  },
};

// --- trasa
const etykietaOpcji = (o: any) => (o.nogi?.length ? o.nogi.map((n: any) => n.linia).join(" + ") : "?");

export const trasa: Widok = {
  render(d) {
    const opcje: any[] = d.opcje ?? [];
    if (!opcje.length) {
      return kafel({ id: "trasa", tytul: `${krotko(d.z?.opis)} → ${krotko(d.do?.opis)}`, znacznik: { tekst: "BRAK POŁĄCZENIA", rodzaj: "czerwony" }, tresc: `<div class="puste"><div class="tr" style="font-size:17px;font-weight:900">Nie znaleziono połączenia do jednej przesiadki.</div><div class="szary-t">Zwiększ dozwolone dojście do przystanku albo sprawdź inne miejsca. Odległość w linii prostej: ${liczba(d.odleglosc_prosta_m, 0)} m.</div></div>`, zrodlo: zrodlo("ZTP Kraków, rozkład (GTFS) i OSM.") });
    }
    const ix = Math.min(stan.opcja ?? 0, opcje.length - 1);
    const o = opcje[ix];
    const kafleOpcji = `<div class="kafle2" style="grid-template-columns:repeat(${Math.min(3, opcje.length)},minmax(0,1fr))">${opcje.slice(0, 3).map((x, i) => `<button data-opcja="${i}" aria-pressed="${i === ix}"><div class="et">${esc(x.rodzaj === "bezposrednia" ? "Linia " + etykietaOpcji(x) : "Z przesiadką " + etykietaOpcji(x))}</div><div class="liczba">${liczba(x.czas_min, 0)} min</div></button>`).join("")}</div>`;

    const wiersze: string[] = [];
    const dojscie = (tytul: string, opis: string) => `<div class="kol"><span class="punkt"></span><span class="linia-kropki"></span></div><div class="opis"><strong>${esc(tytul)}</strong><div class="mala">${esc(opis)}</div></div>`;
    wiersze.push(dojscie(`Dojście ${o.dojscie_start.min} min`, `${liczba(o.dojscie_start.m, 0)} m do przystanku ${o.dojscie_start.przystanek}${o.czekanie_pierwsza_noga_min != null ? `, potem czekanie ${o.czekanie_pierwsza_noga_min} min` : ""}`));
    o.nogi.forEach((n: any, i: number) => {
      wiersze.push(`<div class="kol">${nr(n.linia)}<span class="linia-pelna"></span></div><div class="opis"><strong>${esc(n.wsiadanie)} do ${esc(n.wysiadanie)}</strong><div class="mala">kierunek ${esc(n.kierunek)} · ${n.przystankow} ${n.przystankow === 1 ? "przystanek" : "przystanków"} · ${n.jazda_min} min${n.odjazd_wg_rozkladu ? ` · odjazd ${esc(n.odjazd_wg_rozkladu)} wg rozkładu` : ""}</div></div>`);
      if (i < o.nogi.length - 1 && o.przesiadka) wiersze.push(dojscie("Przesiadka", `${esc(o.przesiadka.przystanek)}, dojście ${o.przesiadka.dojscie_min} min`));
    });
    wiersze.push(`<div class="kol"><span class="punkt"></span></div><div class="opis"><strong>Dojście ${o.dojscie_cel.min} min</strong><div class="mala">${liczba(o.dojscie_cel.m, 0)} m z przystanku ${esc(o.dojscie_cel.przystanek)} do celu</div></div>`);
    const zywe = o.najblizsze_odjazdy_na_zywo as any[] | undefined;
    const zywoBlok = zywe?.length ? `<div class="ostrzezenia"><span class="etykieta">NA ŻYWO</span>najbliższe odjazdy pierwszej linii: ${zywe.map((x) => `${esc(x.odjazd)} (za ${x.za_min} min${x.opoznienie_s ? `, opóźnienie ${Math.round(x.opoznienie_s / 60)} min` : ""})`).join(", ")}</div>` : "";

    // Schemat: punkty i odcinki między przystankami (bez przebiegu ulic), dojścia kropkowane.
    const pts = [o.dojscie_start, ...o.nogi.flatMap((n: any) => [n.wsiadanie_pkt, n.wysiadanie_pkt]), o.dojscie_cel];
    const ma = d.z?.lat != null && d.do?.lat != null && o.nogi.every((n: any) => n.wsiadanie_pkt && n.wysiadanie_pkt);
    const mapaHtml = ma ? mapa({
      szer: 640, skala: true, przypis: "Schemat odcinków, nie przebieg tras",
      opis: `Schemat trasy: z ${d.z.opis} do ${d.do.opis}`,
      linie: [
        { klasa: "pieszo", pts: [[d.z.lon, d.z.lat], [o.nogi[0].wsiadanie_pkt.lon, o.nogi[0].wsiadanie_pkt.lat]] },
        ...o.nogi.map((n: any) => ({ klasa: "jazda" as const, pts: [[n.wsiadanie_pkt.lon, n.wsiadanie_pkt.lat], [n.wysiadanie_pkt.lon, n.wysiadanie_pkt.lat]] as [number, number][] })),
        { klasa: "pieszo", pts: [[o.nogi[o.nogi.length - 1].wysiadanie_pkt.lon, o.nogi[o.nogi.length - 1].wysiadanie_pkt.lat], [d.do.lon, d.do.lat]] },
      ],
      punkty: [
        { lat: d.z.lat, lon: d.z.lon, klasa: "start", etykieta: "Start" },
        ...o.nogi.flatMap((n: any) => [{ lat: n.wsiadanie_pkt.lat, lon: n.wsiadanie_pkt.lon, klasa: "przystanek" as const }, { lat: n.wysiadanie_pkt.lat, lon: n.wysiadanie_pkt.lon, klasa: "przystanek" as const }]),
        { lat: d.do.lat, lon: d.do.lon, klasa: "cel", etykieta: "Cel" },
      ],
    }) : "";
    void pts;
    const tresc = `${komunikatyHtml(d.komunikaty_o_utrudnieniach)}${kafleOpcji}${zywoBlok}<div class="os">${wiersze.join("")}</div>${mapaHtml}`;
    return kafel({
      id: "trasa", tytul: `${krotko(d.z?.opis)} → ${krotko(d.do?.opis)}`, znacznik: { tekst: o.najblizsze_odjazdy_na_zywo?.length ? "NA ŻYWO" : "ROZKŁAD", rodzaj: o.najblizsze_odjazdy_na_zywo?.length ? "zielony" : "atrament" }, tresc,
      zrodlo: zrodlo(`rozkład ZTP Kraków, dojście: ${o.dojscie_start.zrodlo}.`, `Czas to szacunek (${o.zrodlo_czasu}), nie gwarancja.`),
    });
  },
  podlacz(root, _d, c) {
    root.querySelectorAll<HTMLButtonElement>("[data-opcja]").forEach((b) => { b.onclick = () => { stan.opcja = +b.dataset.opcja!; c.przerysuj(); }; });
  },
};

// --- przystanki w pobliżu
export const przystanki: Widok = {
  render(d) {
    const lista: any[] = d.przystanki ?? [];
    const promien = d._zapytanie?.promien_m ?? 500;
    const skala = Math.max(promien, ...lista.map((x) => x.odleglosc_m ?? 0), 1);
    const wiersze = lista.map((x) => `<div class="rzad" style="--kol:minmax(0,1fr) 150px"><div><div style="font-size:16px;font-weight:900">${esc(x.nazwa)}${x.slupek ? ` <span class="szary-t" style="font-weight:700;font-size:13px">${esc(x.slupek)}</span>` : ""}</div><div style="display:flex;gap:4px;padding-top:6px;flex-wrap:wrap">${(x.linie ?? []).slice(0, 14).map((l: string) => nr(l, true)).join("")}${(x.linie?.length ?? 0) > 14 ? `<span class="szary-t" style="font-size:12px;align-self:center">+${x.linie.length - 14}</span>` : ""}</div></div><div><div style="font-size:20px;font-weight:900;line-height:1">${x.dojscie_min} min</div><div class="szary-t" style="font-size:12px;padding-top:2px">${liczba(x.odleglosc_m, 0)} m</div><div class="pasek-tlo"><div style="width:${Math.min(100, Math.round(((x.odleglosc_m ?? 0) / skala) * 100))}%"></div></div></div></div>`).join("");
    const mapaHtml = lista.length && lista.every((x) => x.lat != null) ? mapa({
      szer: 640, skala: true, min_wys: 200, przypis: "Pozycje przystanków z GTFS ZTP",
      opis: `Mapa przystanków w pobliżu: ${lista.map((x) => x.nazwa).join(", ")}`,
      punkty: [...(d.punkt ? [{ lat: d.punkt.lat, lon: d.punkt.lon, klasa: "start" as const, etykieta: "Tu" }] : []), ...lista.map((x) => ({ lat: x.lat, lon: x.lon, klasa: "przystanek" as const, etykieta: x.nazwa }))],
    }) : "";
    const tresc = `${mapaHtml}${lista.length ? `<div><div class="naglowek-tabeli" style="--kol:minmax(0,1fr) 150px"><div>Przystanek i linie</div><div>Dojście pieszo</div></div>${wiersze}</div>` : `<div class="puste"><div style="font-size:17px;font-weight:900">Brak przystanków w tym promieniu.</div><div class="szary-t">Zwiększ promień wyszukiwania.</div></div>`}`;
    return kafel({
      id: "przystanki_w_poblizu", tytul: `${d.miejsce ? krotko(d.miejsce) : "Okolica"}, promień ${liczba(promien, 0)} m`, znacznik: { tekst: `${lista.length} ${lista.length === 1 ? "przystanek" : "przystanków"}`, rodzaj: "obrys" }, tresc,
      zrodlo: zrodlo("ZTP Kraków (przystanki, linie), czas dojścia:", `${d.zrodlo_dojscia ?? "szacunek"}. Pasek skaluje się do ${liczba(skala, 0)} m.`),
    });
  },
};

export const widokiTransportu = { odjazdy, trasa, przystanki };
void ({} as Ctx);

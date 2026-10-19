// Widoki danych: wynik zapytania (tabela/słupki), plik, szereg GUS, prognoza, parki z mapą, katalog, opis zbioru,
// lista BDL, dane.gov.pl, adres, komunikaty ZTP i status źródeł.
import { kafel, esc, liczba, nr, zrodlo } from "../pomoc.ts";
import { mapa, type Poligon, type Ring } from "../mapa.ts";
import { wykres } from "../wykres.ts";
import { stan, type Ctx, type Widok } from "./typy.ts";

const jestLiczba = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const tekstKomorki = (v: unknown): string =>
  v == null ? "" : typeof v === "object" ? ((v as any).srodek ? `${(v as any).srodek.lat}, ${(v as any).srodek.lon}` : (v as any).lat != null ? `${(v as any).lat}, ${(v as any).lon}` : JSON.stringify(v)) : String(v);

// --- tabela (dane_zapytaj, plik_odczyt)
function opisZapytania(a: any): string {
  if (!a) return "";
  const cz: string[] = [];
  if (a.filtr) cz.push(`filtr: ${a.filtr}`);
  if (a.grupuj_po?.length) cz.push(`grupuj_po: ${a.grupuj_po.join(", ")}`);
  if (a.agreguj?.length) cz.push(`agreguj: ${a.agreguj.map((x: any) => `${x.fn}(${x.pole})`).join(", ")}`);
  if (a.geometria) cz.push("filtr przestrzenny");
  if (a.sortuj) cz.push(`sortuj: ${a.sortuj}`);
  return cz.join(" · ");
}

function tabelaTresc(d: any, plik: boolean): { tresc: string; liczbaWierszy: number } {
  const wiersze: Record<string, any>[] = d.wiersze ?? [];
  if (!wiersze.length) return { tresc: `<div class="puste"><div style="font-size:17px;font-weight:900">Zapytanie nie zwróciło wierszy.</div><div class="szary-t">Sprawdź filtr i nazwy pól albo użyj zbior_opis, żeby zobaczyć kolumny.</div></div>`, liczbaWierszy: 0 };
  const kolumny: string[] = d.kolumny ?? Object.keys(wiersze[0]).filter((k) => k !== "_geometria");
  const kol = kolumny.slice(0, 8);
  const numeryczne = kol.filter((k) => wiersze.every((w) => w[k] == null || jestLiczba(w[k])) && wiersze.some((w) => jestLiczba(w[k])));
  const kategorie = kol.filter((k) => !numeryczne.includes(k));
  const moznaSlupki = numeryczne.length > 0 && kategorie.length > 0 && wiersze.length <= 40;
  const tryb = moznaSlupki && stan.tryb === "slupki" ? "slupki" : "tabela";
  const wybrana = numeryczne.includes(stan.metryka) ? stan.metryka : numeryczne[0];

  const sortKol: string | undefined = stan.sortKol, sortDir: number = stan.sortDir ?? 1;
  const dane = sortKol ? wiersze.slice().sort((a, b) => (a[sortKol] == null ? 1 : b[sortKol] == null ? -1 : a[sortKol] > b[sortKol] ? sortDir : a[sortKol] < b[sortKol] ? -sortDir : 0)) : wiersze;

  const przelacznik = moznaSlupki ? `<div class="przelacznik" role="group" aria-label="Widok"><button data-tryb="tabela" aria-pressed="${tryb === "tabela"}">Tabela</button><button data-tryb="slupki" aria-pressed="${tryb === "slupki"}">Słupki</button></div>` : "";
  const metryki = tryb === "slupki" && numeryczne.length > 1 ? `<div class="przelacznik" role="group" aria-label="Wartość">${numeryczne.slice(0, 4).map((k) => `<button data-metryka="${esc(k)}" aria-pressed="${k === wybrana}">${esc(k)}</button>`).join("")}</div>` : "";
  const pasek = `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-bottom:1px solid var(--lk-szary-linia)"><div class="mono szary-t" style="font-size:12px;min-width:0;overflow-wrap:anywhere">${esc(opisZapytania(d._zapytanie) || (plik ? `${d.format}${d.arkusze?.length ? ` · arkusz: ${d.arkusze[0]}` : ""}` : "bez filtra"))}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${metryki}${przelacznik}</div></div>`;

  let ciało: string;
  if (tryb === "slupki") {
    const maks = Math.max(...dane.map((w) => Math.abs(w[wybrana] ?? 0)), 1e-9);
    ciało = `<div class="slupki">${dane.map((w) => `<div class="slupek"><div class="n">${esc(kategorie.map((k) => w[k]).join(" · "))}</div><div class="slupek-tlo"><div style="width:${Math.max(1, Math.round((Math.abs(w[wybrana] ?? 0) / maks) * 100))}%"></div></div><div class="w">${esc(liczba(w[wybrana], 2))}</div></div>`).join("")}</div>`;
  } else {
    const szer = kol.map((k) => (numeryczne.includes(k) ? "minmax(70px,120px)" : "minmax(90px,1fr)")).join(" ");
    ciało = `<div class="przewijane"><div style="min-width:${Math.max(0, kol.length * 110)}px"><div class="naglowek-tabeli" style="--kol:${szer}">${kol.map((k) => `<button data-sort="${esc(k)}" class="${numeryczne.includes(k) ? "p" : ""}" aria-label="Sortuj po ${esc(k)}">${esc(k)}${sortKol === k ? (sortDir > 0 ? " ▲" : " ▼") : ""}</button>`).join("")}</div>${dane.slice(0, 200).map((w) => `<div class="rzad" style="--kol:${szer};font-size:14px">${kol.map((k) => `<div class="${numeryczne.includes(k) ? "p" : ""}" style="${numeryczne.includes(k) ? "font-weight:900" : ""}">${esc(numeryczne.includes(k) ? liczba(w[k], 2) : tekstKomorki(w[k]))}</div>`).join("")}</div>`).join("")}</div></div>`;
  }
  let profil = "";
  if (plik && d.kolumny_profil?.length) {
    // Profil tylko kolumn widocznych w tabeli, żeby przy szerokim pliku nie zajmował pół karty.
    const widoczne = d.kolumny_profil.filter((p: any) => kol.includes(p.nazwa));
    profil = `<div class="profil" aria-label="Profil kolumn">${(widoczne.length ? widoczne : d.kolumny_profil).slice(0, 8).map((p: any) => `<span title="${esc(p.nazwa)}">${esc(String(p.nazwa).slice(0, 26))}: ${esc(p.typ)}${p.puste ? `, puste ${p.puste}` : ""}${p.typ === "liczba" ? `, ${liczba(p.min, 2)}–${liczba(p.max, 2)}` : ""}</span>`).join("")}</div>`;
  }
  return { tresc: `${pasek}${profil}${ciało}`, liczbaWierszy: wiersze.length };
}

const tytulZbioru = (id?: string) => (id ?? "Wynik zapytania").split("/").pop()!.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function podlaczTabele(root: HTMLElement, c: Ctx) {
  root.querySelectorAll<HTMLButtonElement>("[data-tryb]").forEach((b) => { b.onclick = () => { stan.tryb = b.dataset.tryb; c.przerysuj(); }; });
  root.querySelectorAll<HTMLButtonElement>("[data-metryka]").forEach((b) => { b.onclick = () => { stan.metryka = b.dataset.metryka; c.przerysuj(); }; });
  root.querySelectorAll<HTMLButtonElement>("[data-sort]").forEach((b) => { b.onclick = () => { const k = b.dataset.sort!; stan.sortDir = stan.sortKol === k ? -(stan.sortDir ?? 1) : 1; stan.sortKol = k; c.przerysuj(); }; });
}

export const tabela: Widok = {
  render(d) {
    const { tresc, liczbaWierszy } = tabelaTresc(d, false);
    return kafel({
      id: "dane_zapytaj", tytul: tytulZbioru(d.zbior), znacznik: { tekst: `${liczbaWierszy} ${liczbaWierszy === 1 ? "wiersz" : "wierszy"}`, rodzaj: "obrys" }, tresc,
      zrodlo: zrodlo(d.zrodlo ?? "źródło nieznane", (d.uwagi ?? []).join(" ") + (d.nastepny_kursor ? " Są kolejne strony (kursor)." : "") + " Sumy i agregacje liczy serwer, nie model."),
    });
  },
  podlacz: (r, _d, c) => podlaczTabele(r, c),
};

export const plik: Widok = {
  render(d) {
    const { tresc, liczbaWierszy } = tabelaTresc(d, true);
    return kafel({
      id: "plik_odczyt", tytul: d.nazwa_pliku ?? String(d.zrodlo ?? "Plik").split("/").pop() ?? "Plik", znacznik: { tekst: `${String(d.format).toUpperCase()} · ${liczba(d.wierszy_w_pliku, 0)} wierszy`, rodzaj: "obrys" }, tresc,
      zrodlo: zrodlo(`${d.zrodlo}, ${d.rozmiar_kb} KB.`, `Pokazano ${liczbaWierszy} z ${liczba(d.wierszy_w_wyniku ?? d.wierszy_w_pliku, 0)}. ${(d.uwagi ?? []).join(" ")}`),
    });
  },
  podlacz: (r, _d, c) => podlaczTabele(r, c),
};

// --- szereg GUS (bdl_dane)
const etykieta = (x: any): string => [x.temat, x.nazwa].filter(Boolean).join(": ");
export const szereg: Widok = {
  render(d) {
    const w: any[] = d.wiersze ?? [];
    if (!w.length) return kafel({ id: "bdl_dane", tytul: "Brak wartości", znacznik: { tekst: "PUSTO", rodzaj: "atrament" }, tresc: `<div class="puste"><div style="font-size:17px;font-weight:900">Brak danych dla podanych zmiennych i lat.</div><div class="szary-t">${esc(d.uwaga ?? "Sprawdź id zmiennej narzędziem bdl_szukaj.")}</div></div>`, zrodlo: zrodlo("GUS, Bank Danych Lokalnych.") });
    const zm = [...new Set(w.map((x) => x.zmienna_id))];
    const wyb = zm.includes(stan.zmienna) ? stan.zmienna : zm[0];
    const s = w.filter((x) => x.zmienna_id === wyb).sort((a, b) => a.rok - b.rok);
    const jedn = s[0].jednostka_miary;
    const ost = s[s.length - 1], poprz = s[s.length - 2];
    const maks = s.reduce((a, p) => (p.wartosc > a.wartosc ? p : a)), min = s.reduce((a, p) => (p.wartosc < a.wartosc ? p : a));
    const rokiMaks = s.filter((p) => p.wartosc === maks.wartosc).map((p) => p.rok).join(" i "), rokiMin = s.filter((p) => p.wartosc === min.wartosc).map((p) => p.rok).join(" i ");
    const dz = poprz ? ost.wartosc - poprz.wartosc : null;
    const fmtJ = (v: number) => liczba(v, 2) + (jedn === "%" ? "%" : jedn ? " " + jedn : "");
    const opis = dz == null ? `${ost.rok}` : `${ost.rok}<br>${dz === 0 ? "bez zmiany" : `o ${liczba(Math.abs(dz), 2)} ${jedn === "%" ? "pkt proc." : jedn || ""} ${dz > 0 ? "więcej" : "mniej"}`} niż w ${poprz.rok}`;
    const wybor = zm.length > 1 ? `<div style="padding:10px 16px 0;display:flex;gap:8px;flex-wrap:wrap">${zm.slice(0, 6).map((z) => `<button class="przycisk obrys" style="min-height:32px;padding:4px 10px;font-size:12px" data-zmienna="${z}" aria-pressed="${z === wyb}">${esc(etykieta(w.find((x) => x.zmienna_id === z)) || z)}</button>`).join("")}</div>` : "";
    const tresc = `${wybor}<div class="duza"><div class="liczba">${esc(fmtJ(ost.wartosc))}</div><div class="opis">${opis}</div></div>${wykres({ punkty: s.map((p) => ({ x: p.rok, y: p.wartosc })), jednostka: jedn, opis: `Wykres liniowy: ${etykieta(s[0]) || "szereg"} od ${s[0].rok} do ${ost.rok}. Maksimum ${fmtJ(maks.wartosc)} w ${rokiMaks}, minimum ${fmtJ(min.wartosc)} w ${rokiMin}, ostatnia wartość ${fmtJ(ost.wartosc)}.` })}
<div class="kafle3" style="margin-top:8px;border-top:1px solid var(--lk-szary-linia)"><div><div class="et">Maksimum</div><div class="liczba">${esc(fmtJ(maks.wartosc))}</div><div class="et">${rokiMaks}</div></div><div><div class="et">Minimum</div><div class="liczba">${esc(fmtJ(min.wartosc))}</div><div class="et">${rokiMin}</div></div><div><div class="et">Obserwacji</div><div class="liczba">${s.length}</div><div class="et">${s[0].rok}-${ost.rok}</div></div></div>`;
    return kafel({
      id: "bdl_dane", tytul: etykieta(s[0]) || "Szereg GUS", znacznik: { tekst: d.jednostka ?? "Kraków", rodzaj: "obrys" }, tresc,
      zrodlo: zrodlo(`GUS, Bank Danych Lokalnych, zmienna ${wyb}.`, "Brak wartości w roku oznacza brak publikacji dla tej jednostki."),
    });
  },
  podlacz(root, _d, c) { root.querySelectorAll<HTMLButtonElement>("[data-zmienna]").forEach((b) => { b.onclick = () => { stan.zmienna = +b.dataset.zmienna!; c.przerysuj(); }; }); },
};

// --- prognoza
export const prognoza: Widok = {
  render(d) {
    const hist: { x: number; y: number }[] = d.serie ?? [];
    const prog: any[] = d.prognoza ?? [];
    const ost = prog[prog.length - 1];
    const wykresHtml = hist.length ? wykres({
      punkty: hist, prognoza: prog.map((p) => ({ x: p.x, y: p.wartosc, d80: p.dolna_80, g80: p.gorna_80, d95: p.dolna_95, g95: p.gorna_95 })),
      opis: `Wykres: historia ${hist[0].x}-${hist[hist.length - 1].x} i prognoza do ${ost?.x} metodą ${d.metoda}. Wartość końcowa ${liczba(ost?.wartosc, 2)}, przedział 95% od ${liczba(ost?.dolna_95, 2)} do ${liczba(ost?.gorna_95, 2)}.`,
    }) : "";
    const ostrz = d.ostrzezenia?.length ? `<div class="ostrzezenia">${d.ostrzezenia.map((o: string) => `<div style="padding:2px 0"><span class="etykieta">UWAGA</span>${esc(o)}</div>`).join("")}</div>` : "";
    const j = d.jakosc ?? {};
    const tresc = `<div class="kafle3"><div><div class="et">Metoda</div><div class="liczba" style="font-size:18px">${esc(d.metoda)}</div></div><div><div class="et">Błąd backtestu (MAE)</div><div class="liczba">${j.backtest_mae == null ? "–" : liczba(j.backtest_mae, 2)}</div></div><div><div class="et">Punktów w serii</div><div class="liczba">${j.punktow ?? "–"}</div></div></div>
${wykresHtml}<div class="szary-t" style="padding:4px 16px 10px;font-size:12px">Linia przerywana: prognoza. Pasma: przedział 80% (ciemniejsze) i 95%.</div>
${ostrz}
<div><div class="naglowek-tabeli" style="--kol:70px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)"><div>Okres</div><div class="p">Prognoza</div><div class="p">Przedział 80%</div><div class="p">Przedział 95%</div></div>${prog.map((p) => `<div class="rzad" style="--kol:70px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);font-size:14px"><div style="font-weight:900">${p.x}</div><div class="p" style="font-weight:900">${liczba(p.wartosc, 2)}</div><div class="p">${liczba(p.dolna_80, 2)}–${liczba(p.gorna_80, 2)}</div><div class="p">${liczba(p.dolna_95, 2)}–${liczba(p.gorna_95, 2)}</div></div>`).join("")}</div>`;
    return kafel({
      id: "prognoza", tytul: d.etykieta ?? "Projekcja szeregu", znacznik: { tekst: "PROJEKCJA", rodzaj: "atrament" }, tresc,
      zrodlo: zrodlo(d.opis_metody ?? "", d.uwaga ?? ""),
    });
  },
};

// --- parki (mapa z konturami, wybór parku)
type Park = { lp: number; nazwa: string; dzielnica: string; powierzchnia_od_ha: number; powierzchnia_osm_ha?: number | null; rings?: Ring[]; zgodnosc?: string; osm?: any };

export const parki: Widok = {
  render(d) {
    const lista: Park[] = (d.parki ?? []).map((p: any) => ({ ...p, powierzchnia_osm_ha: p.osm?.powierzchnia_osm_ha }));
    const kontury: Map<number, Park> = stan.kontury ?? new Map();
    const pok = d.pokrycie ?? {};
    if (!lista.length) return kafel({ id: "parki_geometria", tytul: "Brak parków", znacznik: { tekst: "PUSTO", rodzaj: "atrament" }, tresc: `<div class="puste"><div style="font-size:17px;font-weight:900">Nie znaleziono parku o takiej nazwie lub w tej dzielnicy.</div></div>`, zrodlo: zrodlo("Otwarte Dane UMK i OpenStreetMap.") });
    const wybrany = lista.find((p) => p.lp === stan.park) ?? lista[0];
    const jeden = lista.length === 1;
    // Poligony: pobrane kontury (jeśli host pozwolił) albo awaryjnie prostokąty z ramek.
    const poligony: Poligon[] = [];
    const zKontur = [...kontury.values()];
    if (zKontur.length) {
      for (const p of zKontur) poligony.push({ id: String(p.lp), rings: p.rings ?? [], klasa: p.lp === wybrany.lp ? "zaznaczony" : lista.some((x) => x.lp === p.lp) ? "" : "sasiad", etykieta: { tekst: p.nazwa.replace(/^Park (im\. )?/, ""), glowna: p.lp === wybrany.lp, priorytet: lista.some((x) => x.lp === p.lp) ? 2 : 4 } });
    } else {
      for (const p of lista) if (p.osm?.bbox) { const [w, s, e, n] = p.osm.bbox; poligony.push({ id: String(p.lp), rings: [[[w, s], [e, s], [e, n], [w, n]]], klasa: p.lp === wybrany.lp ? "zaznaczony" : "", etykieta: { tekst: p.nazwa.replace(/^Park (im\. )?/, ""), glowna: p.lp === wybrany.lp } }); }
    }
    const mapaHtml = poligony.length ? mapa({ szer: 640, poligony, skala: true, min_wys: 240, opis: `Mapa konturów parków${jeden ? ` wokół: ${wybrany.nazwa}` : ""}. Zaznaczony: ${wybrany.nazwa}.`, przypis: "Kontury: współtwórcy OpenStreetMap, ODbL" }) : `<div class="puste"><div class="szary-t">Dla tego parku brak konturu w danych (patrz pokrycie poniżej).</div></div>`;
    const zgod = (z?: string) => (!z ? "brak konturu" : z.startsWith("nazwa+") ? "nazwa i powierzchnia" : z.startsWith("nazwa") ? "tylko nazwa" : z);
    const szczegoly = `<div class="kafle3"><div><div class="et">Tabela miasta</div><div class="liczba">${liczba(wybrany.powierzchnia_od_ha, 2)} ha</div></div><div><div class="et">OpenStreetMap</div><div class="liczba">${wybrany.powierzchnia_osm_ha == null ? "–" : liczba(wybrany.powierzchnia_osm_ha, 2) + " ha"}</div></div><div><div class="et">Dopasowanie</div><div style="font-size:16px;font-weight:900;line-height:1.5">${esc(zgod(wybrany.zgodnosc))}</div></div></div>`;
    const reszta = (lista.length > 1 ? lista : zKontur.filter((p) => p.lp !== wybrany.lp).slice(0, 5)) as Park[];
    const tabelaH = reszta.length ? `<div><div class="naglowek-tabeli" style="--kol:minmax(0,1fr) 100px 90px"><div>${lista.length > 1 ? "Parki (kliknij, by zaznaczyć)" : "Pozostałe w kadrze"}</div><div class="p">Tabela, ha</div><div class="p">OSM, ha</div></div>${reszta.slice(0, 12).map((p) => `<button class="rzad" data-park="${p.lp}" style="--kol:minmax(0,1fr) 100px 90px;width:100%;border:0;border-bottom:1px solid var(--lk-szary-linia);background:${p.lp === wybrany.lp ? "var(--lk-szary-tlo)" : "#fff"};text-align:left;font:inherit;padding:0;cursor:pointer" aria-pressed="${p.lp === wybrany.lp}"><div style="padding:9px 8px 9px 16px;font-weight:700">${esc(p.nazwa)}${p.lp === wybrany.lp ? ' <span class="znacznik atrament" style="padding:1px 6px;font-size:11px;margin-left:6px">ZAZNACZONY</span>' : ""}</div><div class="p" style="padding:9px 8px">${liczba(p.powierzchnia_od_ha, 2)}</div><div class="p" style="padding:9px 16px 9px 8px">${p.powierzchnia_osm_ha == null ? "–" : liczba(p.powierzchnia_osm_ha, 2)}</div></button>`).join("")}</div>` : "";
    return kafel({
      id: "parki_geometria", tytul: jeden ? wybrany.nazwa : "Parki Krakowa", znacznik: { tekst: jeden ? wybrany.dzielnica : `${lista.length} parków`, rodzaj: "obrys" },
      tresc: `${mapaHtml}${szczegoly}${tabelaH}`,
      zrodlo: `<strong>Pokrycie:</strong> kontur ma ${pok.parki_z_geometria ?? "?"} z ${pok.parki_ogolem ?? "?"} parków (${pok.udzial_powierzchni_proc ?? "?"}% powierzchni). Źródło: Otwarte Dane UMK i OpenStreetMap, migawka z ${esc(d.migawka ?? "")}.`,
    });
  },
  podlacz(root, d, c) {
    root.querySelectorAll<HTMLElement>("[data-park]").forEach((b) => { b.onclick = () => { stan.park = +b.dataset.park!; c.przerysuj(); }; });
    root.querySelectorAll<SVGPathElement>("path.park[data-id]").forEach((p) => { p.onclick = () => { stan.park = +p.dataset.id!; c.przerysuj(); }; });
    // Kontury pobieramy raz (narzędzie dostępne tylko dla aplikacji); do tego czasu rysujemy ramki z wyniku.
    if (!stan.konturyPobrane && c.czyMoznaWolac) {
      stan.konturyPobrane = true;
      const lp = (d.parki ?? []).filter((p: any) => p.osm).map((p: any) => p.lp);
      const jeden = (d.parki ?? []).length === 1 && lp.length === 1;
      if (!lp.length) return;
      c.wywolaj("ui_kontury_parkow", jeden ? { wokol_lp: lp[0], promien_m: 900 } : { lp }).then((r) => {
        const m = new Map<number, Park>();
        for (const p of r.parki ?? []) m.set(p.lp, p);
        stan.kontury = m;
        c.przerysuj();
      }).catch(() => { /* zostaje mapa z ramek */ });
    }
  },
};

// --- listy: katalog, opis zbioru, BDL, dane.gov.pl, adres
export const katalog: Widok = {
  render(d) {
    const w: any[] = d.wyniki ?? [];
    const tresc = w.length ? `<ul class="pole-lista" style="padding:0">${w.map((x) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div><div style="font-weight:900;overflow-wrap:anywhere">${esc(String(x.tytul).split(" / ").pop())}</div><div class="mono szary-t" style="font-size:12px;overflow-wrap:anywhere">${esc(x.id)}</div><div class="szary-t" style="font-size:13px;padding-top:2px">${esc((x.pola ?? []).slice(0, 8).join(", "))}${x.pol_razem ? ` (+${x.pol_razem - 8})` : ""}</div></div><div><span class="znacznik obrys" style="color:var(--lk-niebieski);border-color:var(--lk-niebieski)">${x.zrodlo === "msip" ? "MAPA" : "TABELA"}</span></div></li>`).join("")}</ul>` : `<div class="puste"><div style="font-size:17px;font-weight:900">Brak zbiorów dla tych słów.</div><div class="szary-t">${esc(d.podpowiedz ?? "Spróbuj innych słów kluczowych.")}</div></div>`;
    return kafel({ id: "katalog_szukaj", tytul: "Zbiory danych o Krakowie", znacznik: { tekst: `${w.length} wyników`, rodzaj: "obrys" }, tresc, zrodlo: zrodlo("katalog 1 203 zbiorów: Otwarte Dane UMK i warstwy MSIP.", "Użyj zbior_opis(id), a potem dane_zapytaj.") });
  },
};

export const opisZbioru: Widok = {
  render(d) {
    const pola: string[] = d.pola ?? [];
    const probka: any[] = d.probka ?? [];
    const liczbaObj = d.liczba_obiektow ?? d.wiersze;
    const tresc = `<div class="kafle3"><div><div class="et">Rodzaj</div><div class="liczba" style="font-size:18px">${d.zrodlo === "msip" ? "Warstwa mapy" : "Tabela"}</div></div><div><div class="et">${d.zrodlo === "msip" ? "Obiektów" : "Wierszy"}</div><div class="liczba">${liczba(liczbaObj, 0)}</div></div><div><div class="et">Pól</div><div class="liczba">${pola.length}</div></div></div>
<ul class="pole-lista przewijane" style="max-height:300px">${pola.map((p) => { const [n, t] = p.split(":"); return `<li><span style="font-weight:700;overflow-wrap:anywhere">${esc(n)}${d.aliasy?.[n] ? ` <span class="szary-t" style="font-weight:400">(${esc(d.aliasy[n])})</span>` : ""}</span><span class="mono szary-t" style="font-size:12px;text-align:right">${esc(t ?? "")}</span></li>`; }).join("")}</ul>
${probka.length ? `<div class="profil" style="border-top:1px solid var(--lk-szary-linia)"><span>Próbka: ${esc(JSON.stringify(probka[0]).slice(0, 180))}…</span></div>` : ""}`;
    return kafel({ id: "zbior_opis", tytul: String(d.tytul ?? d.id).split(" / ").pop()!, znacznik: { tekst: d.zrodlo === "msip" ? "MSIP" : "OD", rodzaj: "obrys" }, tresc, zrodlo: `<strong>Id:</strong> <span class="mono">${esc(d.id)}</span>. ${esc(d.jak_pytac ?? "")}` });
  },
};

export const bdlLista: Widok = {
  render(d) {
    const w: any[] = d.zmienne ?? [];
    const tresc = w.length ? `<ul class="pole-lista">${w.map((x) => `<li style="grid-template-columns:minmax(0,1fr) 90px"><div><div style="font-weight:700;overflow-wrap:anywhere">${esc(x.nazwa)}</div><div class="szary-t" style="font-size:12px">temat ${esc(x.temat)}${x.jednostka_miary ? ` · ${esc(x.jednostka_miary)}` : ""}</div></div><div class="mono" style="text-align:right;font-weight:700">${esc(x.id)}</div></li>`).join("")}</ul>` : `<div class="puste"><div style="font-size:17px;font-weight:900">Brak zmiennych dla tej nazwy.</div></div>`;
    return kafel({ id: "bdl_szukaj", tytul: "Wskaźniki GUS dla Krakowa", znacznik: { tekst: `${w.length} z ${liczba(d.razem_w_bdl, 0)}`, rodzaj: "obrys" }, tresc, zrodlo: zrodlo("GUS, Bank Danych Lokalnych.", d.uwaga ?? "") });
  },
};

export const daneGov: Widok = {
  render(d, c) {
    const w: any[] = d.zbiory ?? d.zasoby ?? [];
    const jestZasoby = !!d.zasoby;
    const tresc = w.length ? `<ul class="pole-lista">${w.map((x) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div><div style="font-weight:900;overflow-wrap:anywhere">${esc(x.tytul)}</div>${x.opis ? `<div class="szary-t" style="font-size:13px">${esc(String(x.opis).slice(0, 160))}</div>` : ""}<div class="szary-t" style="font-size:12px">${esc((x.formaty ?? [x.format]).filter(Boolean).join(", "))}</div></div><div>${(x.url ?? x.link) && c.czyMoznaWolac ? `<button class="przycisk obrys" data-url="${esc(x.url ?? x.link)}" style="min-height:32px;padding:4px 10px;font-size:12px">Otwórz</button>` : ""}</div></li>`).join("")}</ul>` : `<div class="puste"><div style="font-size:17px;font-weight:900">Brak wyników.</div></div>`;
    return kafel({ id: "dane_gov", tytul: jestZasoby ? `Pliki zbioru ${d.zbior}` : "Zbiory z dane.gov.pl", znacznik: { tekst: `${w.length}${d.razem ? ` z ${liczba(d.razem, 0)}` : ""}`, rodzaj: "obrys" }, tresc, zrodlo: zrodlo("dane.gov.pl, Portal Danych Otwartych.") });
  },
  podlacz(root, _d, c) { root.querySelectorAll<HTMLButtonElement>("[data-url]").forEach((b) => { b.onclick = () => c.otworz(b.dataset.url!); }); },
};

export const adres: Widok = {
  render(d) {
    const k: any[] = d.kandydaci ?? [];
    if (!k.length) return kafel({ id: "adres_na_punkt", tytul: "Nie znaleziono adresu", znacznik: { tekst: "BRAK", rodzaj: "czerwony" }, tresc: `<div class="puste"><div class="szary-t">${esc(d.uwaga ?? "")}</div></div>`, zrodlo: zrodlo("MSIP Kraków, punkty adresowe.") });
    const a = k[0];
    const tresc = `<dl class="kluczowe"><dt>Adres</dt><dd style="font-weight:900;font-size:18px">${esc(a.ulica)} ${esc(a.numer)}</dd><dt>Kod pocztowy</dt><dd>${esc(a.kod_pocztowy)}</dd><dt>Dzielnica</dt><dd>${esc(a.dzielnica)}</dd><dt>Współrzędne</dt><dd class="mono">${a.lat?.toFixed(5)}, ${a.lon?.toFixed(5)}</dd></dl>${k.length > 1 ? `<div class="ostrzezenia"><span class="etykieta">UWAGA</span>${k.length} dopasowań: ${esc(k.slice(1).map((x) => `${x.ulica} ${x.numer}, ${x.kod_pocztowy}`).join("; "))}</div>` : ""}`;
    return kafel({ id: "adres_na_punkt", tytul: `${a.ulica} ${a.numer}`, znacznik: { tekst: a.kod_pocztowy, rodzaj: "obrys" }, tresc, zrodlo: zrodlo("MSIP Kraków, punkty adresowe.", d.uwaga ?? "") });
  },
};

// --- komunikaty ZTP i status źródeł
export const komunikaty: Widok = {
  render(d) {
    const w: any[] = d.komunikaty ?? [];
    const realne = w.filter((x) => !x.testowy), testowe = w.filter((x) => x.testowy);
    const tresc = realne.length || testowe.length ? `${realne.map((x) => `<div class="komunikat" role="alert"><span class="etykieta">${x.linie?.length ? "LINIA " + esc(x.linie.join(", ")) : "SIEĆ"}</span><span><strong>${esc(x.tytul)}</strong> ${esc(x.opis)}</span></div>`).join("")}${testowe.length ? `<div class="komunikat"><span class="etykieta" style="background:var(--lk-szary-tekst)">TESTOWE</span><span class="szary-t">${testowe.length} komunikat${testowe.length === 1 ? "" : "y"} testow${testowe.length === 1 ? "y" : "e"} ZTP pominięto jako nieistotne.</span></div>` : ""}` : `<div class="puste"><div style="font-size:17px;font-weight:900">Brak aktywnych komunikatów o utrudnieniach.</div><div class="szary-t">ZTP nie opublikowało teraz żadnych komunikatów dla ${d._zapytanie?.linia ? "linii " + esc(d._zapytanie.linia) : "sieci"}.</div></div>`;
    return kafel({ id: "utrudnienia", tytul: d._zapytanie?.linia ? `Linia ${d._zapytanie.linia}` : "Utrudnienia w komunikacji", znacznik: realne.length ? { tekst: `${realne.length} aktywne`, rodzaj: "czerwony" } : { tekst: "BRAK", rodzaj: "zielony" }, tresc, zrodlo: zrodlo("ZTP Kraków, GTFS-RT ServiceAlerts, na żywo.") });
  },
};

export const status: Widok = {
  render(d, c) {
    const t: any[] = d.testy ?? [];
    const zle = t.filter((x) => x.blad || x.status >= 400).length;
    const wiersze = t.map((x) => `<div class="rzad" style="--kol:minmax(0,1fr) 84px 90px"><div class="mono" style="font-size:14px;padding:13px 8px 13px 16px">${esc(x.host)}</div><div><span class="znacznik ${x.blad || x.status >= 400 ? "czerwony" : "zielony"}" style="padding:3px 8px;border:0">${esc(x.blad ? "BŁĄD" : x.status)}</span></div><div class="p" style="font-size:14px;padding-right:16px">${liczba(x.ms, 0)} ms</div></div>`).join("");
    return kafel({
      id: "status_zrodel", tytul: "Źródła danych", znacznik: zle ? { tekst: `${zle} NIE ODPOWIADA`, rodzaj: "czerwony" } : { tekst: "WSZYSTKIE ODPOWIADAJĄ", rodzaj: "zielony" },
      tresc: `<div><div class="naglowek-tabeli" style="--kol:minmax(0,1fr) 84px 90px"><div>Serwer</div><div>Status</div><div class="p">Czas</div></div>${wiersze}</div>`,
      zrodlo: `<strong>Test z serwera Lajkonektora (${esc(d.worker?.colo ?? "?")}, ${esc(d.worker?.kraj ?? "?")}).</strong> ${esc(d.uwaga ?? "")}`,
      akcja: `<button class="przycisk" data-ponow ${c.czyMoznaWolac ? "" : "disabled"}>Sprawdź ponownie</button>`,
    });
  },
  podlacz(root, _d, c) {
    const b = root.querySelector<HTMLButtonElement>("[data-ponow]");
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = "Sprawdzam…"; try { c.pokaz(await c.wywolaj("status_zrodel", {})); } catch { c.przerysuj(); } };
  },
};

void nr;

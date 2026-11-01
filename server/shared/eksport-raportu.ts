// Ten sam zapis danych dla karty, lokalnego czytnika i pakietu do udostępnienia.
import { strToU8, zipSync } from "fflate";
import type { RaportAnalityczny, TabelaRaportu, WykresRaportu } from "./raport.ts";

export const LIMIT_RAPORTU = 8 * 1024 * 1024;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const tekst = (v: unknown): string => v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
const obiekt = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
function wymagaj(warunek: unknown, opis: string): asserts warunek { if (!warunek) throw new Error(`Niepoprawny raport: ${opis}.`); }
const napis = (v: unknown) => typeof v === "string" && v.length <= 20000;
const napisy = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 1000 && v.every(napis);
const identyfikator = (k: string) => /(^|_)id$|^id_|^objectid$|^fid$|^oid$/i.test(k);
const formatLiczby = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 });
const wartoscHTML = (v: unknown) => typeof v === "number" ? formatLiczby.format(v) : tekst(v);
const etykieta = (k: string) => k.replace(/_/g, " ");

/** Import nie wywołuje sieci. Limit rozmiaru, głębokości i liczby komórek ogranicza pracę przeglądarki. */
export function wczytajRaport(json: string): RaportAnalityczny {
  wymagaj(typeof json === "string" && new TextEncoder().encode(json).length <= LIMIT_RAPORTU, "plik przekracza 8 MiB");
  let r: any;
  try { r = JSON.parse(json); } catch { throw new Error("Plik nie zawiera poprawnego JSON raportu."); }
  let elementy = 0;
  function sprawdz(v: any, glebokosc = 0) {
    wymagaj(++elementy <= 500000 && glebokosc <= 20, "zbyt złożona struktura");
    if (typeof v === "string") wymagaj(napis(v), "tekst przekracza 20 tys. znaków");
    if (typeof v === "number") wymagaj(Number.isFinite(v), "liczba poza zakresem");
    if (v && typeof v === "object") for (const k of Object.keys(v)) {
      wymagaj(!["__proto__", "prototype", "constructor"].includes(k), "niedozwolony klucz");
      sprawdz(v[k], glebokosc + 1);
    }
  }
  sprawdz(r);
  wymagaj(obiekt(r) && r.wersja === "1", "nieobsługiwana wersja");
  for (const k of ["tytul", "pytanie", "utworzono", "id_planu", "zatwierdzenie"]) wymagaj(napis(r[k]) && r[k].length > 0, `brak pola ${k}`);
  wymagaj(Number.isFinite(Date.parse(r.utworzono)), "data utworzenia");
  wymagaj(obiekt(r.plan), "plan musi być obiektem");
  for (const k of ["metody", "ograniczenia", "wnioski"]) wymagaj(napisy(r[k]), `lista ${k}`);
  wymagaj(Array.isArray(r.zrodla) && r.zrodla.length <= 100, "lista źródeł (maks. 100)");
  const zrodla = new Set<string>();
  for (const z of r.zrodla) {
    wymagaj(obiekt(z), "źródło musi być obiektem");
    for (const k of ["id", "nazwa", "narzedzie", "pobrano"]) wymagaj(napis(z[k]) && z[k].length > 0, `pole źródła ${k}`);
    wymagaj(!zrodla.has(z.id), "powtórzony identyfikator źródła"); zrodla.add(z.id);
    wymagaj(obiekt(z.argumenty) && typeof z.kompletne === "boolean" && napisy(z.uwagi), "metadane źródła");
    for (const k of ["data_stanu", "url", "definicja", "jednostka", "poziom"]) wymagaj(z[k] === undefined || napis(z[k]), `pole źródła ${k}`);
  }
  wymagaj(Array.isArray(r.tabele) && r.tabele.length <= 100, "lista tabel (maks. 100)");
  const identyfikatory = new Set<string>();
  let wiersze = 0, komorki = 0;
  for (const t of r.tabele) {
    wymagaj(obiekt(t) && napis(t.id) && t.id.length > 0 && napis(t.tytul), "identyfikator i tytuł tabeli");
    wymagaj(!identyfikatory.has(t.id), "powtórzony identyfikator tabeli"); identyfikatory.add(t.id);
    wymagaj(napisy(t.kolumny) && t.kolumny.length <= 100 && new Set(t.kolumny).size === t.kolumny.length && (t.kolumny.length > 0 || Array.isArray(t.wiersze) && t.wiersze.length === 0), "kolumny tabeli (1–100, bez powtórzeń; tabela pusta może nie mieć schematu)");
    wymagaj(Array.isArray(t.wiersze) && t.wiersze.every(obiekt), "wiersze tabeli");
    wiersze += t.wiersze.length; komorki += t.wiersze.length * t.kolumny.length;
    wymagaj(wiersze <= 50000 && komorki <= 200000, "maks. 50 tys. wierszy i 200 tys. komórek");
    wymagaj(napisy(t.zrodla) && t.zrodla.every((id: string) => zrodla.has(id)) && napisy(t.uwagi), "powiązania tabeli ze źródłami");
  }
  wymagaj(r.wykresy === undefined || Array.isArray(r.wykresy) && r.wykresy.length <= 100, "lista jawnych wykresów");
  for (const w of r.wykresy ?? []) {
    wymagaj(obiekt(w) && napis(w.tabela) && napis(w.tytul) && ["slupki", "linia"].includes(w.rodzaj), "opis wykresu");
    const t = r.tabele.find((t: TabelaRaportu) => t.id === w.tabela) as TabelaRaportu | undefined;
    wymagaj(t && napis(w.kolumna_x) && t.kolumny.includes(w.kolumna_x), "tabela lub oś X wykresu nie istnieje");
    wymagaj(napisy(w.kolumny_y) && w.kolumny_y.length >= 1 && w.kolumny_y.length <= 4 && new Set(w.kolumny_y).size === w.kolumny_y.length, "wykres wymaga 1–4 unikalnych miar Y");
    wymagaj(w.jednostka === undefined || napis(w.jednostka), "jednostka wykresu");
    wymagaj(w.kolumny_y.length === 1 || typeof w.jednostka === "string" && w.jednostka.trim().length > 0, "wiele miar wymaga jawnej wspólnej jednostki");
    for (const k of w.kolumny_y) {
      wymagaj(t.kolumny.includes(k) && k !== w.kolumna_x && !identyfikator(k), "Y musi wskazywać miarę, a nie identyfikator lub oś X");
      wymagaj(t.wiersze.every((r) => r[k] == null || typeof r[k] === "number" && Number.isFinite(r[k])), "miara wykresu musi być liczbą lub brakiem danych");
    }
    if (w.rodzaj === "linia") wymagaj(t.wiersze.every((r) => r[w.kolumna_x] == null || typeof r[w.kolumna_x] === "number" || typeof r[w.kolumna_x] === "string" && String(r[w.kolumna_x]).trim() !== "" && Number.isFinite(Number(r[w.kolumna_x]))), "linia wymaga liczbowej osi X");
  }
  return r as RaportAnalityczny;
}

export function raportJSON(raport: RaportAnalityczny): string {
  const json = JSON.stringify(raport);
  wczytajRaport(json);
  return json;
}

/** Nazwy nie zawierają ścieżek; numer tabeli w ZIP zapobiega kolizjom po normalizacji. */
export function nazwaPliku(nazwa: string): string {
  const n = nazwa.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return n && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n) ? n : "raport";
}

export function tabelaCSV(t: TabelaRaportu): string {
  const komorka = (v: unknown): string => {
    let s = typeof v === "number" ? String(v).replace(".", ",") : tekst(v);
    // Liczby ujemne pozostają liczbami. Formuły i znaki sterujące w tekstach dostają apostrof.
    if (typeof v !== "number" && /^[\s\u0000-\u001f]*[=+\-@\t\r\n]/u.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [t.kolumny.map(komorka).join(";"), ...t.wiersze.map((r) => t.kolumny.map((k) => komorka(r[k])).join(";"))].join("\r\n") + "\r\n";
}

/** Tylko jawne HTTP(S); dane nigdy nie są pobierane podczas renderowania raportu. */
export function bezpiecznyURL(v: string | undefined): string | undefined {
  if (!v || /[\u0000-\u0020\u007f]/.test(v)) return;
  try { const u = new URL(v); if (["https:", "http:"].includes(u.protocol) && !u.username && !u.password) return u.href; } catch { /* opis pozostaje tekstem */ }
}

function lista(nazwa: string, wpisy: string[]): string {
  return `<section><h2>${esc(nazwa)}</h2>${wpisy.length ? `<ul>${wpisy.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "<p>Nie podano.</p>"}</section>`;
}

const KOLORY = ["#0063af", "#735419", "#92294f", "#35744b"];

/** Brak metadanych oznacza brak wykresu. Żadna kolumna nie jest zgadywana jako miara. */
function wykresRaportu(t: TabelaRaportu, opis: WykresRaportu, nr: number): string {
  const limit = opis.rodzaj === "linia" ? 200 : 30;
  const w = t.wiersze.slice(0, limit), ys = opis.kolumny_y;
  const liczby = w.flatMap((r) => ys.map((k) => r[k]).filter((v): v is number => typeof v === "number"));
  if (!liczby.length) return `<p>${esc(opis.tytul)}: brak wartości do wykresu.</p>`;
  const maks = Math.max(1, ...liczby.map(Math.abs));
  const ograniczenie = t.wiersze.length > limit ? ` Wykres pokazuje pierwszych ${limit} wierszy; pełne dane są w tabeli i CSV.` : "";
  const braki = w.some((r) => r[opis.kolumna_x] == null || ys.some((k) => r[k] == null));
  const legenda = ys.map((k, i) => `<span style="color:${KOLORY[i]}">${esc(etykieta(k))} (${i + 1})</span>`).join(" · ");
  const podpis = `${legenda}${opis.jednostka ? ` · jednostka: ${esc(opis.jednostka)}` : ""}.${ograniczenie}${braki ? " Brakujące wartości pominięto; nie są zerami. Linia ma przerwy w brakujących punktach." : ""}`;
  let elementy: string, wysokosc: number;
  if (opis.rodzaj === "slupki") {
    wysokosc = 32 + w.length * ys.length * 28;
    elementy = `<line x1="365" x2="365" y1="20" y2="${wysokosc}" stroke="currentColor"/>` + w.flatMap((r, i) => ys.map((k, j) => {
      const v = r[k]; if (typeof v !== "number" || r[opis.kolumna_x] == null) return "";
      const y = 25 + (i * ys.length + j) * 28, szer = Math.abs(v) / maks * 135;
      const label = `${tekst(r[opis.kolumna_x])}${ys.length > 1 ? ` (${j + 1})` : ""}`;
      return `<g><title>${esc(label)}, ${esc(etykieta(k))}: ${esc(wartoscHTML(v))}</title><text x="4" y="${y + 14}">${esc(label.slice(0, 28))}</text><rect x="${v < 0 ? 365 - szer : 365}" y="${y}" width="${szer}" height="18" fill="${KOLORY[j]}"/><text x="508" y="${y + 14}">${esc(wartoscHTML(v))}</text></g>`;
    })).join("");
  } else {
    wysokosc = 310;
    const xwartosci = w.map((r) => r[opis.kolumna_x]).filter((v) => v != null).map(Number);
    if (!xwartosci.length) return `<p>${esc(opis.tytul)}: brak osi czasu.</p>`;
    const xskala = Math.max(1, ...xwartosci.map(Math.abs)), xmin = Math.min(...xwartosci) / xskala, xmax = Math.max(...xwartosci) / xskala;
    const ymin = Math.min(0, ...liczby) / maks, ymax = Math.max(0, ...liczby) / maks;
    const px = (v: number) => 75 + (v / xskala - xmin) / (xmax - xmin || 1) * 465;
    const py = (v: number) => 255 - (v / maks - ymin) / (ymax - ymin || 1) * 220;
    elementy = `<path d="M75 30V255H550" fill="none" stroke="currentColor"/><text x="3" y="38">${esc(wartoscHTML(Math.max(0, ...liczby)))}</text><text x="3" y="255">${esc(wartoscHTML(Math.min(0, ...liczby)))}</text><text x="75" y="280">${esc(wartoscHTML(Math.min(...xwartosci)))}</text><text x="540" y="280" text-anchor="end">${esc(wartoscHTML(Math.max(...xwartosci)))}</text>`;
    elementy += ys.map((k, j) => {
      let ciag = "", punkty = "", trwa = false;
      for (const r of w) {
        const v = r[k], x = r[opis.kolumna_x];
        if (typeof v !== "number" || x == null) { trwa = false; continue; }
        const sx = px(Number(x)), sy = py(v);
        ciag += `${trwa ? "L" : "M"}${sx} ${sy}`; trwa = true;
        punkty += `<circle cx="${sx}" cy="${sy}" r="3" fill="${KOLORY[j]}"><title>${esc(tekst(x))}, ${esc(etykieta(k))}: ${esc(wartoscHTML(v))}</title></circle>`;
      }
      return `<path data-seria="${esc(k)}" d="${ciag}" fill="none" stroke="${KOLORY[j]}" stroke-width="2"${j ? ` stroke-dasharray="${j * 3} 3"` : ""}/>${punkty}`;
    }).join("");
  }
  return `<figure><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${wysokosc}" role="img" aria-labelledby="wykres-${nr}"><title id="wykres-${nr}">${esc(opis.tytul)} — oś X: ${esc(etykieta(opis.kolumna_x))}; miary: ${esc(ys.map(etykieta).join(", "))}. Wartości w tabeli.</title>${elementy}</svg><figcaption>${podpis}</figcaption></figure>`;
}

function operacje(r: RaportAnalityczny): Record<string, any>[] {
  return Array.isArray(r.plan.operacje) ? r.plan.operacje.filter(obiekt) : [];
}

function tabelaHTML(t: TabelaRaportu, kolumny = t.kolumny): string {
  if (!kolumny.length) return "<p>Tabela nie zawiera danych ani schematu kolumn.</p>";
  return `<div class="raport-tabela" tabindex="0" role="region" aria-label="Tabela: ${esc(t.tytul)}"><table><caption>${esc(t.tytul)}</caption><thead><tr>${kolumny.map((k) => `<th scope="col">${esc(etykieta(k))}</th>`).join("")}</tr></thead><tbody>${t.wiersze.map((w) => `<tr>${kolumny.map((k) => `<td>${esc(wartoscHTML(w[k]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function glowneKolumny(r: RaportAnalityczny, t: TabelaRaportu): string[] {
  if (t.kolumny.length <= 6) return t.kolumny;
  // Jawne wyniki operacji i osie wykresów mają pierwszeństwo przed technicznymi polami łączeń.
  const osie = (r.wykresy ?? []).filter((w) => w.tabela === t.id).flatMap((w) => [w.kolumna_x, ...w.kolumny_y]);
  const wyniki = operacje(r).flatMap((o) => typeof o.nazwa === "string" ? [o.nazwa] : o.typ === "agreguj" && Array.isArray(o.miary) ? o.miary.filter(obiekt).map((m) => m.nazwa).filter((k) => typeof k === "string") : o.typ === "projekcja" && o.id === t.id ? ["x", "wartosc", "dolna_95", "gorna_95"] : []);
  const nazwy = t.kolumny.filter((k) => /(^|_)(nazwa|dzielnica|rok|data|x)$/.test(k) && !identyfikator(k));
  const wybrane = [...new Set([...nazwy, ...osie, ...wyniki])].filter((k) => t.kolumny.includes(k));
  if (!wybrane.length) wybrane.push(...t.kolumny.filter((k) => !identyfikator(k)));
  return wybrane.slice(0, 6);
}

function tabeleRaportu(r: RaportAnalityczny): string {
  const uzyte = new Set(operacje(r).flatMap((o) => [o.z, o.lewe, o.prawe].filter((k) => typeof k === "string")));
  const koncowe = r.tabele.filter((t) => !uzyte.has(t.id)), posrednie = r.tabele.filter((t) => uzyte.has(t.id));
  const pokaz = (t: TabelaRaportu, pelna = false) => {
    const kol = pelna ? t.kolumny : glowneKolumny(r, t), okrojona = kol.length < t.kolumny.length;
    return `<section><h2>${esc(t.tytul)}</h2>${(r.wykresy ?? []).map((w, i) => w.tabela === t.id ? wykresRaportu(t, w, i) : "").join("")}${okrojona ? `<p class="raport-zakres">Widok główny pokazuje ${kol.length} z ${t.kolumny.length} kolumn. Pozostałe pola są w rozwijanych danych poniżej. CSV i JSON zawierają wszystkie kolumny z pełną precyzją.</p>` : ""}${tabelaHTML(t, kol)}${okrojona ? `<details class="raport-szczegoly"><summary>Wszystkie kolumny tabeli (${t.kolumny.length})</summary>${tabelaHTML(t)}</details>` : ""}<p>Źródła tabeli: ${esc(t.zrodla.join(", ") || "nie wskazano")}.</p>${t.uwagi.map((u) => `<p>${esc(u)}</p>`).join("")}</section>`;
  };
  return `${koncowe.map((t) => pokaz(t)).join("")}${posrednie.length ? `<details class="raport-szczegoly"><summary>Dane źródłowe i kroki obliczeń (${posrednie.length} tabel)</summary><p>Te tabele są domyślnie zwinięte i pomijane w wydruku. CSV i JSON zachowują wszystkie dane.</p>${posrednie.map((t) => pokaz(t, true)).join("")}</details>` : ""}`;
}

/** Bez skryptów, obrazów, map i surowego HTML wejścia. Można użyć w Shadow DOM i w samodzielnym dokumencie. */
export function trescRaportu(r: RaportAnalityczny): string {
  const ograniczenia = [...new Set([...r.ograniczenia, ...r.tabele.flatMap((t) => t.uwagi)])];
  return `<div class="raport-tresc"><p>${esc(r.pytanie)}</p><dl><dt>Utworzono</dt><dd>${esc(r.utworzono)}</dd><dt>Identyfikator planu</dt><dd>${esc(r.id_planu)}</dd><dt>Zatwierdzenie</dt><dd>${esc(r.zatwierdzenie)}</dd></dl><p>Zapis zatwierdzenia jest deklaracją z rozmowy, a nie uwierzytelnionym dowodem zgody.</p>${lista("Wnioski", r.wnioski)}<p>Liczby w widoku są zaokrąglone do 3 miejsc po przecinku. Pełna precyzja pozostaje w CSV i JSON.</p>${tabeleRaportu(r)}${lista("Metody", r.metody)}${lista("Ograniczenia", ograniczenia)}<section><h2>Źródła i pochodzenie danych</h2><p>Czas pobrania nie jest datą stanu danych. Brak wierszy nie dowodzi braku zjawiska.</p>${r.zrodla.map((z) => {
    const url = bezpiecznyURL(z.url);
    return `<section class="raport-zrodlo"><h3>${esc(z.id)} · ${esc(z.nazwa)}</h3><dl><dt>Narzędzie</dt><dd>${esc(z.narzedzie)}</dd><dt>Pobrano</dt><dd>${esc(z.pobrano)}</dd><dt>Data stanu</dt><dd>${esc(z.data_stanu ?? "nie podano")}</dd><dt>Kompletność</dt><dd>${z.kompletne ? "Pełna w zadeklarowanym zakresie" : "Dane niepełne — nie przedstawiać sum jako pełnych"}</dd>${[ ["Definicja", z.definicja], ["Jednostka", z.jednostka], ["Poziom agregacji", z.poziom] ].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${z.url ? `<p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(z.url)}</a>` : esc(z.url)}</p>` : ""}<details open><summary>Argumenty pobrania</summary><pre>${esc(JSON.stringify(z.argumenty, null, 2))}</pre></details>${z.uwagi.map((u) => `<p>${esc(u)}</p>`).join("")}</section>`;
  }).join("")}</section><details><summary>Plan analizy</summary><pre>${esc(JSON.stringify(r.plan, null, 2))}</pre></details></div>`;
}

export const STYL_RAPORTU = `.raport-tresc{overflow-wrap:anywhere;line-height:1.55}.raport-tresc h2{font-size:1.25em;margin-top:1.5em}.raport-tresc h3{font-size:1.05em}.raport-tresc dl{display:grid;grid-template-columns:minmax(100px,170px) minmax(0,1fr);gap:4px 16px}.raport-tresc dt{font-weight:bold}.raport-tresc dd{margin:0}.raport-tresc pre{white-space:pre-wrap;font-size:.85em}.raport-tresc figure{margin:1em 0;max-width:750px}.raport-tresc svg{width:100%;height:auto;font:13px system-ui;color:inherit}.raport-tresc svg text{fill:currentColor}.raport-tresc figcaption{font-size:.85em}.raport-tabela{overflow:auto}.raport-tresc table{border-collapse:collapse;width:100%;font-size:.9em}.raport-tresc caption{text-align:left;font-weight:bold;padding:8px 0}.raport-tresc th,.raport-tresc td{padding:8px;text-align:left;border:1px solid #767676;vertical-align:top}.raport-zrodlo{border-top:1px solid #767676;padding-top:8px}.raport-tresc summary{cursor:pointer;font-weight:bold}`;

export function raportHTML(raport: RaportAnalityczny): string {
  const r = wczytajRaport(raportJSON(raport));
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${esc(r.tytul)}</title><style>body{max-width:1000px;margin:32px auto;padding:0 20px;font-family:system-ui,sans-serif;background:#fff;color:#071f32}a{color:#0063af}button{padding:12px;font:inherit;cursor:pointer}${STYL_RAPORTU}@media print{@page{margin:15mm}body{max-width:none;margin:0;padding:0;font-size:10pt}.bez-druku{display:none!important}.raport-tabela{overflow:visible}.raport-tresc table{table-layout:fixed}.raport-szczegoly:not([open]){display:none!important}thead{display:table-header-group}tr,figure,.raport-zrodlo{break-inside:avoid}a{color:inherit}pre{white-space:pre-wrap}svg{max-height:200mm}h2,h3{break-after:avoid}}</style></head><body><div class="bez-druku"><button type="button" onclick="window.print()">Drukuj / zapisz jako PDF</button><p>W oknie wydruku wybierz „Zapisz jako PDF”. Raport działa bez połączenia z siecią. Wydruk obejmuje wyniki końcowe i metadane; rozwinięcie danych źródłowych lub wszystkich kolumn dołączy je do wydruku.</p></div><main><h1>${esc(r.tytul)}</h1>${trescRaportu(r)}</main></body></html>`;
}

export function pakietRaportu(raport: RaportAnalityczny): Uint8Array {
  const json = raportJSON(raport);
  const pliki: Record<string, Uint8Array> = {
    "raport.json": strToU8(json), "raport.html": strToU8(raportHTML(raport)),
    "README.txt": strToU8(`Lajkonektor — raport analityczny\n\nOtwórz raport.html w przeglądarce. Przycisk „Drukuj / zapisz jako PDF” otwiera wydruk; wybierz zapis jako PDF. Raport, tabele i wykresy działają offline i nie wymagają konta.\n\nraport.json można ponownie otworzyć w lokalnym czytniku raportów strony Lajkonektora. Import nie wysyła pliku na serwer.\n\nCSV: UTF-8 z BOM, separator średnik, przecinek dziesiętny. Teksty przypominające formuły mają ochronny apostrof. Pełne oryginalne wartości są w JSON.\n\nPlan: ${raport.id_planu}\nZatwierdzenie: ${raport.zatwierdzenie}\nZapis zatwierdzenia to deklaracja z rozmowy, a nie uwierzytelniony dowód zgody.\n\nŹródła, daty, metody, kompletność i ograniczenia zawiera raport.html i raport.json. Czas pobrania nie jest datą stanu danych.\n`),
  };
  raport.tabele.forEach((t, i) => { pliki[`tabele/${String(i + 1).padStart(3, "0")}-${nazwaPliku(t.id)}.csv`] = strToU8(tabelaCSV(t)); });
  return zipSync(pliki, { level: 6 });
}

export function plikRaportu(r: RaportAnalityczny, format: "zip" | "json" | "html"): { nazwa: string; mime: string; dane: Uint8Array } {
  const nazwa = `${nazwaPliku(r.tytul)}.${format}`;
  return format === "zip" ? { nazwa, mime: "application/zip", dane: pakietRaportu(r) }
    : { nazwa, mime: format === "json" ? "application/json" : "text/html;charset=utf-8", dane: strToU8(format === "json" ? raportJSON(r) : raportHTML(r)) };
}

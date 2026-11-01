import { BladDomeny } from "./bledy.ts";
// Deterministyczna projekcja szeregu czasowego z przedziałami niepewności i opisem metody.
// Metody: trend liniowy (OLS), wzrost wykładniczy (OLS na logarytmach), Holt (wygładzanie wykładnicze z trendem).
// Dla "auto" wybieramy metodę o najmniejszym błędzie MAE w backteście z przesuwanym początkiem (na ostatnich punktach).
// To projekcja trendu, nie przewidywanie: zakłada, że historyczny wzorzec będzie się utrzymywał.

export interface Punkt { x: number; y: number }
export type Metoda = "liniowy" | "wykladniczy" | "holt";

// Kwantyle rozkładu t-Studenta (dwustronnie 80% i 95%) dla df = 1..30; powyżej: rozkład normalny.
const T80 = [0, 3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383, 1.372, 1.363, 1.356, 1.35, 1.345, 1.341, 1.337, 1.333, 1.33, 1.328, 1.325, 1.323, 1.321, 1.319, 1.318, 1.316, 1.315, 1.314, 1.313, 1.311, 1.31];
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
const t80 = (df: number) => (df >= 1 && df <= 30 ? T80[df] : 1.2816);
const t95 = (df: number) => (df >= 1 && df <= 30 ? T95[df] : 1.96);

interface Przedzial { wartosc: number; d80: number; g80: number; d95: number; g95: number }
interface Model {
  prognozuj: (x: number) => Przedzial;
  parametry: Record<string, number | string>;
  r2?: number;
}

const srednia = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const mediana = (a: number[]) => { const s = a.slice().sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// OLS y = a + b x z przedziałem predykcji; `transform` pozwala dopasować log(y).
function ols(pts: Punkt[], wykladniczy: boolean): Model {
  const n = pts.length;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => (wykladniczy ? Math.log(p.y) : p.y));
  const xb = srednia(xs), yb = srednia(ys);
  const sxx = xs.reduce((s, x) => s + (x - xb) ** 2, 0);
  const b = xs.reduce((s, x, i) => s + (x - xb) * (ys[i] - yb), 0) / sxx;
  const a = yb - b * xb;
  const sse = xs.reduce((s, x, i) => s + (ys[i] - (a + b * x)) ** 2, 0);
  const sst = ys.reduce((s, y) => s + (y - yb) ** 2, 0);
  const df = n - 2;
  const s = df > 0 ? Math.sqrt(sse / df) : 0;
  const poj = (z: number, x: number) => {
    const se = s * Math.sqrt(1 + 1 / n + (x - xb) ** 2 / sxx);
    const dolna = a + b * x - z * se, gorna = a + b * x + z * se;
    return wykladniczy ? [Math.exp(dolna), Math.exp(gorna)] : [dolna, gorna];
  };
  return {
    prognozuj: (x) => {
      const [d80, g80] = poj(t80(df), x), [d95, g95] = poj(t95(df), x);
      return { wartosc: wykladniczy ? Math.exp(a + b * x) : a + b * x, d80, g80, d95, g95 };
    },
    r2: sst === 0 ? 1 : 1 - sse / sst,
    parametry: wykladniczy
      ? { wzrost_na_krok_proc: +((Math.exp(b * 1) - 1) * 100).toFixed(3), odchylenie_reszt_log: +s.toFixed(5), stopnie_swobody: df }
      : { nachylenie_na_jednostke_x: +b.toFixed(5), wyraz_wolny: +a.toFixed(5), odchylenie_reszt: +s.toFixed(5), stopnie_swobody: df },
  };
}

// Holt: poziom i trend wygładzane wykładniczo; alfa i beta dobierane siatką przez minimalizację błędu jednokrokowego.
function holt(pts: Punkt[], krok: number): Model {
  const y = pts.map((p) => p.y);
  let najlepszy = { sse: Infinity, alfa: 0.5, beta: 0.3, l: 0, t: 0, blad: [] as number[] };
  for (let ai = 1; ai <= 20; ai++) for (let bi = 1; bi <= 20; bi++) {
    const alfa = ai / 20, beta = bi / 20;
    let l = y[0], t = y[1] - y[0], sse = 0;
    const blad: number[] = [];
    for (let i = 1; i < y.length; i++) {
      const przew = l + t;
      const e = y[i] - przew;
      blad.push(e);
      sse += e * e;
      const lNowy = alfa * y[i] + (1 - alfa) * przew;
      t = beta * (lNowy - l) + (1 - beta) * t;
      l = lNowy;
    }
    if (sse < najlepszy.sse - 1e-12) najlepszy = { sse, alfa, beta, l, t, blad };
  }
  const sd = Math.sqrt(najlepszy.sse / Math.max(1, najlepszy.blad.length - 2));
  const xOst = pts[pts.length - 1].x;
  return {
    prognozuj: (x) => {
      const h = Math.max(1, Math.round((x - xOst) / krok));
      const wartosc = najlepszy.l + najlepszy.t * h;
      // Przybliżony przedział: błąd jednokrokowy rośnie z pierwiastkiem z horyzontu (uproszczenie).
      const se = sd * Math.sqrt(h);
      return { wartosc, d80: wartosc - 1.2816 * se, g80: wartosc + 1.2816 * se, d95: wartosc - 1.96 * se, g95: wartosc + 1.96 * se };
    },
    parametry: { alfa: najlepszy.alfa, beta: najlepszy.beta, poziom_koncowy: +najlepszy.l.toFixed(4), trend_na_krok: +najlepszy.t.toFixed(4), odchylenie_bledu_jednokrokowego: +sd.toFixed(5) },
  };
}

function dopasuj(m: Metoda, pts: Punkt[], krok: number): Model {
  if (m === "liniowy") return ols(pts, false);
  if (m === "wykladniczy") return ols(pts, true);
  return holt(pts, krok);
}

// Backtest z przesuwanym początkiem: prognoza o jeden krok do przodu dla ostatnich `m` punktów.
function backtest(m: Metoda, pts: Punkt[], krok: number, minTrening: number) {
  const bledy: number[] = [], proc: number[] = [];
  const m0 = Math.min(3, pts.length - minTrening);
  for (let i = pts.length - m0; i < pts.length; i++) {
    const trening = pts.slice(0, i);
    if (trening.length < minTrening) continue;
    const przew = dopasuj(m, trening, krok).prognozuj(pts[i].x).wartosc;
    bledy.push(Math.abs(przew - pts[i].y));
    if (pts[i].y !== 0) proc.push(Math.abs((przew - pts[i].y) / pts[i].y) * 100);
  }
  return { mae: bledy.length ? srednia(bledy) : NaN, mape: proc.length ? srednia(proc) : NaN, testy: bledy.length };
}

const OPISY: Record<Metoda, string> = {
  liniowy: "Trend liniowy (metoda najmniejszych kwadratów): stały przyrost na jednostkę czasu; przedział predykcji z rozkładu t-Studenta (n-2 stopni swobody).",
  wykladniczy: "Wzrost wykładniczy (regresja liniowa na logarytmach): stała procentowa zmiana na krok; wymaga wartości dodatnich; przedział liczony na skali logarytmicznej i przeliczony z powrotem.",
  holt: "Wygładzanie wykładnicze Holta (poziom i trend): nowsze obserwacje ważą więcej niż starsze; parametry alfa i beta dobrane siatką przez minimalizację błędu jednokrokowego; przedział przybliżony (błąd rośnie z pierwiastkiem z horyzontu).",
};

const r = (v: number) => +v.toFixed(3);

export function prognoza(opts: { serie: Punkt[]; horyzont: number; metoda?: Metoda | "auto"; krok?: number; ostatnie_punkty?: number }) {
  let pts = opts.serie.slice().sort((a, b) => a.x - b.x);
  const wszystkich = pts.length;
  // Ucięcie historii do ostatnich N punktów (np. po załamaniu trendu), nie mniej niż 3.
  if (opts.ostatnie_punkty && opts.ostatnie_punkty >= 3 && opts.ostatnie_punkty < pts.length) pts = pts.slice(-opts.ostatnie_punkty);
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new BladDomeny("wejscie", "Seria zawiera wartości nieliczbowe (NaN/Infinity).");
  if (new Set(pts.map((p) => p.x)).size !== pts.length) throw new BladDomeny("wejscie", "Seria ma powtórzone okresy (x).");
  if (pts.length < 3) throw new BladDomeny("wejscie", "Za krótka seria: potrzeba co najmniej 3 punktów (zalecane ≥ 6).");
  if (!Number.isInteger(opts.horyzont) || opts.horyzont < 1 || opts.horyzont > 20) throw new BladDomeny("wejscie", "Horyzont musi być liczbą całkowitą 1-20 kroków.");

  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const krok = opts.krok ?? mediana(dx);
  const rownomierna = dx.every((d) => Math.abs(d - krok) <= Math.abs(krok) * 0.01);
  const ostrz: string[] = [];
  if (pts.length < 6) ostrz.push(`Krótka seria (${pts.length} punktów): przedziały są bardzo szerokie, a trend mało wiarygodny.`);
  if (!rownomierna) ostrz.push("Okresy nie są równo oddalone: pominięto metodę Holta, a OLS używa rzeczywistych wartości x.");
  if (opts.horyzont > pts.length / 2) ostrz.push("Horyzont prognozy jest dłuższy niż połowa długości serii: ekstrapolacja jest ryzykowna.");

  const dostepne: Metoda[] = ["liniowy"];
  if (pts.every((p) => p.y > 0)) dostepne.push("wykladniczy"); else ostrz.push("Wartości niedodatnie: pominięto model wykładniczy.");
  if (rownomierna && pts.length >= 4) dostepne.push("holt");

  const minTrening = 3;
  const porownanie = dostepne.map((m) => ({ metoda: m, ...backtest(m, pts, krok, m === "holt" ? 4 : minTrening) }));
  let wybrana: Metoda;
  if (opts.metoda && opts.metoda !== "auto") {
    if (!dostepne.includes(opts.metoda)) throw new BladDomeny("wejscie", `Metoda '${opts.metoda}' niedostępna dla tej serii (dostępne: ${dostepne.join(", ")}).`);
    wybrana = opts.metoda;
  } else {
    const kand = porownanie.filter((p) => Number.isFinite(p.mae));
    // Wybór najmniejszego MAE; remis lub brak backtestu → najprostszy model (liniowy).
    wybrana = kand.length ? kand.reduce((a, b) => (b.mae < a.mae - 1e-9 ? b : a)).metoda : "liniowy";
    if (!kand.length) ostrz.push("Za mało punktów na backtest: wybrano trend liniowy.");
  }

  const model = dopasuj(wybrana, pts, krok);
  const xOst = pts[pts.length - 1].x;
  const wyniki = Array.from({ length: opts.horyzont }, (_, i) => {
    const x = +(xOst + (i + 1) * krok).toFixed(6);
    const p = model.prognozuj(x);
    return { x, wartosc: r(p.wartosc), dolna_80: r(p.d80), gorna_80: r(p.g80), dolna_95: r(p.d95), gorna_95: r(p.g95) };
  });
  const ost = wyniki[wyniki.length - 1];
  const szer = (ost.gorna_95 - ost.dolna_95) / Math.max(Math.abs(ost.wartosc), 1e-9);
  if (szer > 1) ostrz.push("Przedział 95% na końcu horyzontu jest szerszy niż sama wartość: prognoza jest praktycznie niezdecydowana.");

  const bt = porownanie.find((p) => p.metoda === wybrana)!;
  if (Number.isFinite(bt.mape) && bt.mape > 10) ostrz.push(`Duży błąd w backteście (MAPE ${r(bt.mape)}%): model słabo opisuje dane, traktuj prognozę jako orientacyjną.`);
  // Kierunek prognozy a trend z ostatnich punktów (np. po załamaniu szeregu).
  const ogon = pts.slice(-Math.min(5, pts.length));
  if (ogon.length >= 4) {
    const xb = srednia(ogon.map((p) => p.x)), yb = srednia(ogon.map((p) => p.y));
    const nach = ogon.reduce((a, p) => a + (p.x - xb) * (p.y - yb), 0) / ogon.reduce((a, p) => a + (p.x - xb) ** 2, 0);
    const ruch = wyniki[0].wartosc - pts[pts.length - 1].y;
    if (nach * ruch < 0 && Math.abs(ruch) > 0.02 * Math.abs(pts[pts.length - 1].y)) ostrz.push(`Prognoza idzie w przeciwnym kierunku niż trend z ostatnich ${ogon.length} punktów: jeśli seria zmieniła charakter, użyj parametru ostatnie_punkty.`);
  }
  return {
    metoda: wybrana,
    opis_metody: OPISY[wybrana],
    wybor: opts.metoda && opts.metoda !== "auto" ? "wskazana przez użytkownika" : "automatyczny: najmniejszy błąd MAE w backteście z przesuwanym początkiem (remis: model liniowy)",
    parametry: model.parametry,
    jakosc: {
      punktow: pts.length,
      ...(pts.length < wszystkich ? { punktow_w_serii: wszystkich } : {}),
      ...(model.r2 !== undefined ? { r2: r(model.r2) } : {}),
      backtest_mae: Number.isFinite(bt.mae) ? r(bt.mae) : null,
      backtest_mape_proc: Number.isFinite(bt.mape) ? r(bt.mape) : null,
      backtest_testow: bt.testy,
    },
    porownanie_metod: porownanie.map((p) => ({ metoda: p.metoda, backtest_mae: Number.isFinite(p.mae) ? r(p.mae) : null })),
    serie: pts,
    ostatni_punkt: pts[pts.length - 1],
    krok,
    prognoza: wyniki,
    ...(ostrz.length ? { ostrzezenia: ostrz } : {}),
    uwaga: "Projekcja trendu z danych historycznych, nie przewidywanie: nie uwzględnia zdarzeń zewnętrznych (polityka, migracje, kryzysy). Przedziały opisują niepewność statystyczną modelu, nie ryzyko zmiany reżimu.",
  };
}

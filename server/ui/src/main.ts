// Aplikacja MCP Apps Lajkonektora: jedna paczka dla wszystkich narzędzi. Wynik narzędzia niesie pole `_widok`,
// po którym wybieramy kartę. Bez wsparcia UI w kliencie użytkownik dostaje ten sam wynik jako tekst (content).
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import { konfiguracja } from "./mapa.ts";
import { WIDOKI } from "./widoki/rejestr.ts";
import { ladowanie, blad, ogolny } from "./widoki/stany.ts";
import { stan, type Ctx, type Widok } from "./widoki/typy.ts";
import { WERSJA } from "../../src/wersja.ts";

const korzen = document.getElementById("app")!;
const app = new App({ name: "Lajkonektor", version: WERSJA });

let biezace: { dane: any; widok: string } | null = null;
const historia: any[] = []; // widoki sprzed przejścia z karty (np. z listy katalogu do opisu zbioru)
let mozeWolac = true;

const ctx: Ctx = {
  async wywolaj(nazwa, argumenty) {
    const r = await app.callServerTool({ name: nazwa, arguments: argumenty });
    const tekst = (r.content as any[] | undefined)?.find((x) => x.type === "text")?.text ?? "";
    if (r.isError) throw new Error(tekst || "Błąd narzędzia");
    return r.structuredContent ?? JSON.parse(tekst);
  },
  pokaz(dane) { rysuj(dane); },
  przejdz(dane) { if (biezace) historia.push(biezace.dane); Object.keys(stan).forEach((k) => delete stan[k]); rysuj(dane); },
  przerysuj() { if (biezace) rysuj(biezace.dane, true); },
  otworz(url) { void app.openLink({ url }); },
  get czyMoznaWolac() { return mozeWolac; },
  pelnyEkran: undefined,
};

function rysuj(dane: any, zachowajStan = false) {
  if (!zachowajStan && biezace && biezace.dane !== dane) { /* stan zostaje przy odświeżeniu tego samego widoku */ }
  const nazwa: string = dane?._widok ?? "";
  konfiguracja.kafelki = dane?._kafelki;
  const w = (WIDOKI as Record<string, Widok>)[nazwa];
  korzen.innerHTML = w ? w.render(dane, ctx) : ogolny(nazwa || "wynik", dane);
  biezace = { dane, widok: nazwa };
  w?.podlacz?.(korzen, dane, ctx);
  if (historia.length) {
    korzen.querySelector(".belka")?.insertAdjacentHTML("afterend", '<div class="wroc"><button class="przycisk obrys" data-wroc>← Wróć</button></div>');
    korzen.querySelector<HTMLButtonElement>("[data-wroc]")!.onclick = () => { Object.keys(stan).forEach((k) => delete stan[k]); rysuj(historia.pop()); };
  }
}

function pokazBlad(narzedzie: string, tekst: string) {
  korzen.innerHTML = blad(narzedzie, tekst, ctx);
  korzen.querySelector<HTMLButtonElement>("[data-status]")?.addEventListener("click", async () => {
    try { rysuj(await ctx.wywolaj("status_zrodel", {})); } catch { /* host nie zezwala */ }
  });
}

const nazwaNarzedzia = () => (app.getHostContext() as any)?.toolInfo?.tool?.name ?? "lajkonektor";

// Handlery rejestrujemy przed connect(), żeby nie przegapić pierwszego wyniku.
app.ontoolinput = () => { Object.keys(stan).forEach((k) => delete stan[k]); korzen.innerHTML = ladowanie(nazwaNarzedzia()); };
app.ontoolresult = (wynik) => {
  Object.keys(stan).forEach((k) => delete stan[k]);
  historia.length = 0;
  const tekst = (wynik.content as any[] | undefined)?.find((x) => x.type === "text")?.text ?? "";
  if (wynik.isError) return pokazBlad(nazwaNarzedzia(), tekst);
  let dane: any = wynik.structuredContent;
  if (!dane && tekst) { try { dane = JSON.parse(tekst); } catch { /* zwykły tekst */ } }
  if (!dane) return pokazBlad(nazwaNarzedzia(), tekst || "Narzędzie nie zwróciło danych.");
  rysuj(dane);
};
app.ontoolcancelled = () => pokazBlad(nazwaNarzedzia(), "Wywołanie narzędzia zostało anulowane.");
app.onhostcontextchanged = (c: any) => {
  if (c?.theme) applyDocumentTheme(c.theme);
  const si = c?.safeAreaInsets;
  if (si) document.body.style.padding = `${si.top}px ${si.right}px ${si.bottom}px ${si.left}px`;
};
app.onteardown = async () => ({});

korzen.innerHTML = ladowanie("lajkonektor");
app.connect().then(() => {
  const c = app.getHostContext() as any;
  // Motyw hosta ustawia color-scheme dokumentu; przy rozbieżności przeglądarka maluje pod kartą nieprzezroczyste białe tło.
  if (c?.theme) applyDocumentTheme(c.theme);
  // Host bez uprawnień do wywołań narzędzi z aplikacji: przyciski odświeżania będą wyłączone.
  mozeWolac = true;
  if (c?.availableDisplayModes?.includes("fullscreen")) {
    ctx.pelnyEkran = () => { void app.requestDisplayMode({ mode: c.displayMode === "fullscreen" ? "inline" : "fullscreen" }); };
  }
}).catch(() => { korzen.innerHTML = blad("lajkonektor", "Nie udało się połączyć z klientem.", ctx); });

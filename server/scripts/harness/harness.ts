// Harness hosta MCP Apps do oglądania kart w przeglądarce: renderuje ui/dist/karta.html w sandboxowanym iframe i wysyła
// do niego prawdziwe wyniki narzędzi (fixtury). Wywołania narzędzi z karty (odświeżanie, kontury parków) idą do serwera MCP.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

const lista = document.getElementById("lista") as HTMLSelectElement;
const szer = document.getElementById("szer") as HTMLSelectElement;
const scena = document.getElementById("scena")!;
const log = document.getElementById("log")!;
const FIXTURY = ["odjazdy", "odjazdy_puste", "trasa", "przystanki", "parki_jordana", "parki_wszystkie", "tabela_parki", "plik_xlsx", "szereg", "prognoza", "katalog", "opis_zbioru", "bdl_lista", "dane_gov", "adres", "komunikaty", "status", "blad_522", "mapa_msip", "widok_zlozony", "katalog_brak", "trasa_pociag", "trasa_wies", "odjazdy_pociagi", "wskaznik_dzielnic", "profil_dzielnicy", "dostepnosc_standardy", "dostepnosc_apteki", "dostepnosc_punkt", "obiekty_apteki", "statystyka_korelacja", "planowanie_telimeny", "planowanie_rynek"];
const stanyDodatkowe = ["ladowanie"];
for (const f of [...FIXTURY, ...stanyDodatkowe]) lista.add(new Option(f, f));

const dz = (t: string) => { log.textContent = `${new Date().toLocaleTimeString("pl-PL")} ${t}\n` + (log.textContent ?? "").slice(0, 800); };

async function mcp(nazwa: string, argumenty: unknown) {
  const r = await fetch("/proxy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: nazwa, arguments: argumenty } }) });
  const t = await r.text();
  const m = t.match(/data: (\{.*\})/);
  return JSON.parse(m ? m[1] : t).result;
}

let html = "";
async function pokaz(nazwa: string) {
  if (!html) html = await (await fetch("/karta.html")).text();
  scena.innerHTML = "";
  const iframe = document.createElement("iframe");
  // Jak w prawdziwych hostach: bez allow-same-origin. Z ?same=1 dodajemy je tylko po to, żeby z konsoli zajrzeć do DOM karty.
  iframe.setAttribute("sandbox", location.search.includes("same=1") ? "allow-scripts allow-same-origin" : "allow-scripts");
  iframe.style.cssText = `width:${szer.value}px;height:200px;border:0;background:transparent;display:block`;
  iframe.srcdoc = html;
  scena.appendChild(iframe);

  const bridge = new AppBridge(null, { name: "Harness", version: "1.0.0" }, { openLinks: {}, serverTools: {}, logging: {} }, {
    hostContext: { theme: "light", displayMode: "inline", availableDisplayModes: ["inline"], toolInfo: { id: "t1", tool: { name: nazwa === "ladowanie" ? "odjazdy" : nazwa, inputSchema: { type: "object" } } } } as any,
  });
  bridge.onsizechange = (rozmiar) => { dz(`rozmiar ${JSON.stringify(rozmiar)}`); if (rozmiar.height) iframe.style.height = `${Math.ceil(rozmiar.height)}px`; };
  bridge.oncalltool = async (params: any) => { dz(`app → ${params.name} ${JSON.stringify(params.arguments).slice(0, 80)}`); return await mcp(params.name, params.arguments); };
  bridge.onopenlink = async ({ url }: any) => { dz(`openLink ${url}`); return {}; };
  bridge.oninitialized = async () => {
    dz(`zainicjowano: ${nazwa}`);
    bridge.sendToolInput({ arguments: {} });
    if (nazwa === "ladowanie") return;
    await new Promise((r) => setTimeout(r, 400));
    const f = await (await fetch(`/fixtury/${nazwa}.json`)).json();
    // Kafelki OSM przez lokalny proxy harnessu (jak na serwerze); ?kafelki=URL podmienia szablon adresu (np. wdrożony serwer).
    f._kafelki = new URLSearchParams(location.search).get("kafelki") ?? `${location.origin}/kafelki/{z}/{x}/{y}.png`;
    if (f.isError) bridge.sendToolResult({ isError: true, content: [{ type: "text", text: f.tekst }] });
    else bridge.sendToolResult({ content: [{ type: "text", text: JSON.stringify(f) }], structuredContent: f });
  };
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
}

lista.onchange = () => { location.hash = lista.value; void pokaz(lista.value); };
szer.onchange = () => void pokaz(lista.value);
const start = location.hash.slice(1) || "odjazdy";
lista.value = [...FIXTURY, ...stanyDodatkowe].includes(start) ? start : "odjazdy";
void pokaz(lista.value);

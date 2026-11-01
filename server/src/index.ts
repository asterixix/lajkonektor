import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.ts";
import { statusZrodel } from "./status.ts";
import { wczytajSiec } from "./transport.ts";
import { kafelek } from "./kafelki.ts";
import { obsluzWywolanie } from "./api.ts";
import { mcpPrzezHandler, obsluzCzat, type EnvCzat } from "./czat.ts";
import { limitMinutowy } from "./limit.ts";
import { eksportGeoJSON } from "./geojson.ts";
import { chcePrzegladarka, stronaMcp, stronaZdrowia, zapiszPomiar } from "./strony.ts";

// Durable Object z budżetem czatu musi być eksportowany z modułu wejściowego Workera.
export { Budzet } from "./budzet.ts";
import { zCache } from "./sources.ts";
import { WERSJA } from "./wersja.ts";
import { runtime } from "./runtime.ts";
export { Nominatim } from "./nominatim.ts";

// Publiczny serwer tylko do odczytu, więc CORS otwarty (klienci przeglądarkowi, MCP Inspector).
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export default {
  async fetch(request: Request, env: EnvCzat = {}, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS" && pathname !== "/api/wywolaj" && pathname !== "/api/czat") return new Response(null, { status: 204, headers: CORS });
    // Handler per żądanie (bezstanowy), żeby narzędzie status_zrodel znało colo/kraj bieżącego żądania.
    const e = env as any;
    // Lokalny workerd nie obsługuje jurysdykcji; BUDZET_LOKALNIE=1 tylko w .dev.vars, produkcja zawsze UE.
    const ns = String(e.BUDZET_LOKALNIE) === "1" ? e.NOMINATIM : e.NOMINATIM?.jurisdiction("eu");
    const rt = { sygnal: request.signal, produkcja: true, migawki: e.MIGAWKI, nominatim: ns?.get(ns.idFromName("globalny")) };
    return runtime.run(rt, async () => {
    if (pathname === "/mcp" && chcePrzegladarka(request)) return stronaMcp(url.origin);
    if (pathname === "/mcp") return withCors(await createMcpHandler(() => createServer((request as any).cf, url.origin)).fetch(request));
    if (pathname === "/api/wywolaj") {
      const serwer = createServer((request as any).cf, url.origin) as any;
      return obsluzWywolanie(request, { wywolaj: serwer.wywolaj, ip: request.headers.get("cf-connecting-ip") ?? "" });
    }
    if (pathname === "/api/czat") {
      // Czat płaci za każde żądanie, więc tylko ze strony z tego samego adresu: obca strona nie zleci pytań w przeglądarkach odwiedzających (bez CORS preflight przejdzie 405).
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return new Response("Zabronione", { status: 403 });
      const handler = createMcpHandler(() => createServer((request as any).cf, url.origin));
      return obsluzCzat(request, { env, ip: request.headers.get("cf-connecting-ip") ?? "", mcp: mcpPrzezHandler(handler), waitUntil: (p) => ctx?.waitUntil(p) });
    }
    if (pathname.startsWith("/kafelki/")) return kafelek(pathname, request.headers.get("cf-connecting-ip") ?? "");
    if (pathname === "/diag") {
      // Każde wywołanie to 5 zapytań do serwerów miasta, GUS i ZTP, więc wynik trzymamy 60 s i limitujemy IP. /mcp celowo bez limitu po IP: klienci AI łączą się ze wspólnych adresów dostawców.
      if (await limitMinutowy("diag", request.headers.get("cf-connecting-ip") ?? "", 10)) return new Response("Za dużo zapytań. Spróbuj za minutę.", { status: 429, headers: { ...CORS, "retry-after": "60" } });
      return Response.json(await statusZrodel((request as any).cf), { headers: CORS });
    }
    if (pathname === "/api/geojson" && request.method === "GET") {
      // Cała warstwa to wiele zapytań do MSIP, więc niski limit na IP.
      if (await limitMinutowy("geojson", request.headers.get("cf-connecting-ip") ?? "", 5)) return new Response("Za dużo pobrań. Spróbuj za minutę.", { status: 429, headers: { "retry-after": "60" } });
      return eksportGeoJSON(url.searchParams.get("id") ?? "");
    }
    if (pathname === "/health" && chcePrzegladarka(request)) {
      // Strona sprawdza źródła (cache 60 s), więc limit jak /diag.
      if (await limitMinutowy("diag", request.headers.get("cf-connecting-ip") ?? "", 10)) return new Response("Za dużo zapytań. Spróbuj za minutę.", { status: 429, headers: { "retry-after": "60" } });
      const czat = await obsluzCzat(new Request(`${url.origin}/api/czat`), { env, ip: "", mcp: { lista: async () => [], wywolaj: async () => ({ tekst: "", blad: true }) }, waitUntil: () => {} }).then((r) => r.json() as Promise<{ dostepny?: boolean }>);
      return stronaZdrowia(e.MIGAWKI, czat.dostepny === true);
    }
    if (pathname === "/health") return Response.json({ ok: true, name: "lajkonektor", version: WERSJA }, { headers: CORS });
    // Strona pod "/" to pliki statyczne z binding assets; tu trafiają tylko nieznane ścieżki.
    return new Response("Nie ma takiej strony.", { status: 404 });
    });
  },
  // Co 30 min sprawdza, czy ZTP opublikował nowy GTFS, i buduje sieć z wyprzedzeniem, żeby pierwsze pytanie użytkownika nie czekało ~13 s.
  // Przy okazji zapisuje pomiar dostępności źródeł dla strony /health.
  async scheduled(_event: unknown, env: any, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(wczytajSiec().catch(() => {}));
    ctx.waitUntil(zapiszPomiar(env?.MIGAWKI).catch(() => {}));
  },
};

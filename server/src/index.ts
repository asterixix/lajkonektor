import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.ts";
import { statusZrodel } from "./status.ts";
import { wczytajSiec } from "./transport.ts";
import { kafelek } from "./kafelki.ts";
import { WERSJA } from "./wersja.ts";

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
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    // Handler per żądanie (bezstanowy), żeby narzędzie status_zrodel znało colo/kraj bieżącego żądania.
    if (pathname === "/mcp") return withCors(await createMcpHandler(() => createServer((request as any).cf, new URL(request.url).origin)).fetch(request));
    if (pathname.startsWith("/kafelki/")) return kafelek(pathname);
    if (pathname === "/diag") return Response.json(await statusZrodel((request as any).cf), { headers: CORS });
    if (pathname === "/health") return Response.json({ ok: true, name: "lajkonektor", version: WERSJA }, { headers: CORS });
    return new Response("Lajkonektor: serwer MCP z otwartymi danymi Krakowa. Endpoint: /mcp", { status: 200 });
  },
  // Co 30 min sprawdza, czy ZTP opublikował nowy GTFS, i buduje sieć z wyprzedzeniem, żeby pierwsze pytanie użytkownika nie czekało ~13 s.
  async scheduled(_event: unknown, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(wczytajSiec().catch(() => {}));
  },
};

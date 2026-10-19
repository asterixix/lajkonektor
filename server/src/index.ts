import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.ts";

const mcp = createMcpHandler(() => createServer());

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
    if (pathname === "/mcp") return withCors(await mcp.fetch(request));
    if (pathname === "/health") return Response.json({ ok: true, name: "lajkonektor", version: "0.1.0" }, { headers: CORS });
    return new Response("Lajkonektor: serwer MCP z otwartymi danymi Krakowa. Endpoint: /mcp", { status: 200 });
  },
};

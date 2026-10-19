// Serwer harnessu kart MCP Apps: node scripts/harness/serve.mjs  (port 8788). Proxy /proxy przekazuje JSON-RPC do MCP_URL
// (domyślnie lokalny `wrangler dev` na 8799; ustaw MCP_URL=https://lajkonektor.sendyka.workers.dev/mcp dla wdrożenia).
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { build } from "esbuild";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer as nowySerwerMcp } from "../../src/server.ts";
import { kafelek } from "../../src/kafelki.ts";

// Serwer MCP działa w tym samym procesie (bez wrangler dev), więc harness uruchamiaj przez: node --experimental-strip-types scripts/harness/serve.mjs
const handler = createMcpHandler(() => nowySerwerMcp());

const korzen = new URL("../../", import.meta.url);
const MCP_URL = process.env.MCP_URL; // opcjonalnie: przekaż do wdrożonego serwera zamiast lokalnego
const bundle = (await build({ entryPoints: [new URL("harness.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], bundle: true, format: "iife", platform: "browser", write: false, target: "es2022", logLevel: "error" })).outputFiles[0].text;
const index = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>Harness kart Lajkonektora</title>
<style>body{margin:0;font:14px system-ui;background:#e9e9e9}header{display:flex;gap:12px;align-items:center;padding:10px 16px;background:#222;color:#fff}select{font:inherit;padding:4px}#scena{padding:24px;display:flex;justify-content:center}#log{white-space:pre;font:11px ui-monospace,monospace;padding:6px 16px;color:#444;max-height:90px;overflow:hidden}</style>
<header><strong>Harness MCP Apps</strong><select id="lista"></select><label>szerokość <select id="szer"><option>360</option><option>520</option><option selected>680</option></select></label></header>
<div id="scena"></div><div id="log"></div><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></html>`;

createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const wyslij = (typ, tresc, kod = 200) => { res.writeHead(kod, { "content-type": typ }); res.end(tresc); };
  try {
    if (u.pathname === "/") return wyslij("text/html; charset=utf-8", index);
    if (u.pathname.startsWith("/kafelki/")) { console.log("tile", u.pathname, req.headers["sec-fetch-dest"], req.headers.origin, req.headers["sec-fetch-site"]); const r = await kafelek(u.pathname); res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer())); }
    if (u.pathname === "/karta.html") return wyslij("text/html; charset=utf-8", readFileSync(new URL("ui/dist/karta.html", korzen)));
    if (u.pathname.startsWith("/fixtury/")) {
      const p = new URL(`test/fixtury/${u.pathname.split("/").pop()}`, korzen);
      return existsSync(p) ? wyslij("application/json", readFileSync(p)) : wyslij("text/plain", "brak", 404);
    }
    if (u.pathname === "/proxy" && req.method === "POST") {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const r = MCP_URL
        ? await fetch(MCP_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body })
        : await handler.fetch(new Request("https://lajkonektor.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body }));
      return wyslij("text/plain; charset=utf-8", await r.text());
    }
    wyslij("text/plain", "nie ma", 404);
  } catch (e) { wyslij("text/plain", String(e), 500); }
}).listen(8788, () => console.log(`harness: http://localhost:8788  (MCP: ${MCP_URL ?? "lokalny, w procesie"})`));

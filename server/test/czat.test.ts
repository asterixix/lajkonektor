import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { WIDOK, createServer } from "../src/server.ts";
import {
  BladCzatu, LIMIT, agent, mcpPrzezHandler, narzedziaDlaModelu, obsluzCzat, przygotujWiadomosci, promptSystemowy, wolajEdenAi,
  type WolajEden, type Zdarzenie,
} from "../src/czat.ts";

const mcp = mcpPrzezHandler(createMcpHandler(() => createServer()));
const uzytkownik = (tresc: string) => [{ role: "user" as const, content: tresc }];
const wywolanie = (id: string, nazwa: string, args: unknown) => ({ id, type: "function", function: { name: nazwa, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const odpowiedz = (message: Record<string, unknown>) => ({ choices: [{ message: { role: "assistant", ...message } }], usage: { total_tokens: 100 } });

// Eden udawany: kolejne odpowiedzi z kolejki, a każde wywołanie jest zapisywane.
function udawanyEden(kolejka: unknown[]): { eden: WolajEden; wywolania: any[] } {
  const wywolania: any[] = [];
  return {
    wywolania,
    eden: async (body) => {
      wywolania.push(JSON.parse(JSON.stringify(body)));
      const nastepna = kolejka.length > 1 ? kolejka.shift() : kolejka[0];
      if (nastepna instanceof Error) throw nastepna;
      return nastepna;
    },
  };
}
const uruchom = async (kolejka: unknown[], pytanie = "Jakie są przedszkola?") => {
  const zdarzenia: Zdarzenie[] = [];
  const { eden, wywolania } = udawanyEden(kolejka);
  const wynik = await agent({ wiadomosci: uzytkownik(pytanie), mcp, eden, emit: (z) => zdarzenia.push(z), model: "m", zapasowy: "z" });
  return { zdarzenia, wywolania, wynik };
};

test("MCP: model widzi wszystkie narzędzia z poprawnym schematem, bez pomocniczych dla kart", async () => {
  const tools = narzedziaDlaModelu(await mcp.lista());
  assert.deepEqual(tools.map((t) => t.function.name).sort(), Object.keys(WIDOK).sort());
  for (const t of tools) {
    assert.equal(t.function.parameters.type, "object", t.function.name);
    assert.ok(!("$schema" in t.function.parameters), `${t.function.name}: $schema`);
    assert.ok(t.function.description.length > 10, t.function.name);
  }
});

test("agent: model wybiera narzędzie, serwer wykonuje je przez MCP, a strona dostaje wynik do karty i odpowiedź", async () => {
  const { zdarzenia, wywolania, wynik } = await uruchom([
    odpowiedz({ content: null, tool_calls: [wywolanie("a1", "katalog_szukaj", { temat: "przedszkola", limit: 3 })] }),
    odpowiedz({ content: "Znalazłem zbiory o przedszkolach. Źródło: Otwarte Dane UMK." }),
  ]);
  assert.deepEqual(zdarzenia.map((z) => z.t), ["narzedzie", "wynik", "tekst"]);
  const w = zdarzenia[1] as Extract<Zdarzenie, { t: "wynik" }>;
  assert.equal((w.dane as any)._widok, "katalog");
  assert.ok((w.dane as any).liczba > 0);
  assert.equal(wynik.kroki, 2);
  // Drugie zapytanie do modelu niesie wynik narzędzia i dalej ma listę narzędzi.
  const druga = wywolania[1];
  assert.equal(druga.messages.at(-1).role, "tool");
  assert.equal(druga.messages.at(-1).tool_call_id, "a1");
  assert.match(druga.messages.at(-1).content, /przedszkol/i);
  assert.ok(druga.tools.length >= 16);
  assert.equal(druga.model, "m");
  assert.deepEqual(druga.fallbacks, ["z"]);
  // Model dostaje wynik bez konturów i bez pól widoku (to dla karty).
  assert.doesNotMatch(druga.messages.at(-1).content, /_kafelki|"kontury"/);
});

test("agent: błąd narzędzia wraca modelowi, a strona widzi błąd zamiast karty; model może odpowiedzieć", async () => {
  const { zdarzenia, wywolania } = await uruchom([
    odpowiedz({ content: null, tool_calls: [wywolanie("b1", "odjazdy", {})] }),
    odpowiedz({ content: "Nie podałeś przystanku. Podaj nazwę, np. Rondo Mogilskie." }),
  ]);
  const w = zdarzenia.find((z) => z.t === "wynik") as Extract<Zdarzenie, { t: "wynik" }>;
  assert.ok(w.blad && !w.dane, "błąd bez danych karty");
  assert.match(wywolania[1].messages.at(-1).content, /^Błąd:/);
  assert.equal(zdarzenia.at(-1)!.t, "tekst");
});

test("agent: niepoprawny JSON argumentów i nieznane narzędzie nie przerywają rozmowy", async () => {
  const { zdarzenia, wywolania } = await uruchom([
    odpowiedz({ content: null, tool_calls: [wywolanie("c1", "katalog_szukaj", "{nie json"), wywolanie("c2", "nie_ma_takiego", {})] }),
    odpowiedz({ content: "Spróbuję inaczej." }),
  ]);
  const wyniki = zdarzenia.filter((z) => z.t === "wynik") as Extract<Zdarzenie, { t: "wynik" }>[];
  assert.equal(wyniki.length, 2);
  assert.ok(wyniki.every((w) => w.blad));
  const toolMsgs = wywolania[1].messages.filter((m: any) => m.role === "tool");
  assert.deepEqual(toolMsgs.map((m: any) => m.tool_call_id), ["c1", "c2"], "każde wywołanie modelu dostaje odpowiedź");
});

test("agent: nadmiar wywołań w jednym kroku jest pominięty, ale protokół zostaje spójny", async () => {
  const wiele = Array.from({ length: LIMIT.wywolanNaKrok + 2 }, (_, i) => wywolanie(`d${i}`, "katalog_szukaj", { temat: "parki" }));
  const { zdarzenia, wywolania } = await uruchom([odpowiedz({ content: null, tool_calls: wiele }), odpowiedz({ content: "Gotowe." })]);
  assert.equal(zdarzenia.filter((z) => z.t === "narzedzie").length, LIMIT.wywolanNaKrok);
  assert.equal(wywolania[1].messages.filter((m: any) => m.role === "tool").length, wiele.length);
});

test("agent: po wyczerpaniu kroków prosi o odpowiedź bez narzędzi", async () => {
  const petla = odpowiedz({ content: null, tool_calls: [wywolanie("e", "katalog_szukaj", { temat: "parki" })] });
  const zdarzenia: Zdarzenie[] = [];
  const wywolania: any[] = [];
  const eden: WolajEden = async (body) => {
    wywolania.push(body);
    return "tools" in body ? petla : odpowiedz({ content: "Tyle udało się ustalić." });
  };
  const wynik = await agent({ wiadomosci: uzytkownik("x"), mcp, eden, emit: (z) => zdarzenia.push(z), model: "m" });
  assert.equal(wywolania.length, LIMIT.krokow + 1);
  assert.ok(!("tools" in wywolania.at(-1)));
  assert.equal((zdarzenia.at(-1) as any).tresc, "Tyle udało się ustalić.");
  assert.ok(wynik.narzedzia.length <= LIMIT.wywolanRazem);
});

test("agent: pusta odpowiedź modelu daje czytelny komunikat, a awaria modelu wychodzi jako błąd", async () => {
  const { zdarzenia } = await uruchom([odpowiedz({ content: "  " })]);
  assert.match((zdarzenia[0] as any).tresc, /Nie udało się/);
  await assert.rejects(uruchom([{ choices: [] }]), (e: any) => e instanceof BladCzatu && e.kod === "model");
});

test("agent: narzędzie, które nie odpowiada, dostaje limit czasu", async () => {
  const wolne = { lista: mcp.lista, wywolaj: () => new Promise<never>(() => {}) };
  const zdarzenia: Zdarzenie[] = [];
  const { eden } = udawanyEden([odpowiedz({ content: null, tool_calls: [wywolanie("f", "odjazdy", { nazwa: "x" })] }), odpowiedz({ content: "Źródło nie odpowiada." })]);
  await agent({ wiadomosci: uzytkownik("x"), mcp: wolne, eden, emit: (z) => zdarzenia.push(z), model: "m", czasNarzedziaMs: 30 });
  assert.match((zdarzenia.find((z) => z.t === "wynik") as any).blad, /w czasie/);
});

test("Eden AI: ponawia przy 5xx i 429, nie ponawia przy złym kluczu", async () => {
  const seria = (statusy: number[]) => {
    let i = 0;
    const f = (async () => {
      const s = statusy[Math.min(i++, statusy.length - 1)];
      return new Response(s === 200 ? JSON.stringify({ ok: true }) : "blad", { status: s });
    }) as unknown as typeof fetch;
    return { f, ile: () => i };
  };
  const a = seria([500, 429, 200]);
  assert.deepEqual(await wolajEdenAi({ EDEN_AI_API_KEY: "k" }, a.f, 1000, 1)({}), { ok: true });
  assert.equal(a.ile(), 3);
  const b = seria([401]);
  await assert.rejects(wolajEdenAi({ EDEN_AI_API_KEY: "k" }, b.f, 1000, 1)({}), (e: any) => e.kod === "konfiguracja");
  assert.equal(b.ile(), 1);
  const c = seria([503]);
  await assert.rejects(wolajEdenAi({ EDEN_AI_API_KEY: "k" }, c.f, 1000, 1)({}), (e: any) => e.kod === "model");
  assert.equal(c.ile(), 3);
  const d = seria([400]);
  await assert.rejects(wolajEdenAi({ EDEN_AI_API_KEY: "k" }, d.f, 1000, 1)({}), (e: any) => e.kod === "model");
  assert.equal(d.ile(), 1);
});

test("Eden AI: wysyła klucz w nagłówku, a sieć rzucająca wyjątek jest ponawiana", async () => {
  let n = 0, naglowek = "";
  const f = (async (_u: string, init: RequestInit) => {
    naglowek = (init.headers as Record<string, string>).authorization;
    if (n++ === 0) throw new TypeError("network");
    return new Response(JSON.stringify({ ok: 1 }));
  }) as unknown as typeof fetch;
  assert.deepEqual(await wolajEdenAi({ EDEN_AI_API_KEY: "sekret" }, f, 1000, 1)({}), { ok: 1 });
  assert.equal(naglowek, "Bearer sekret");
  assert.equal(n, 2);
});

test("wiadomości: walidacja ról, długości i kolejności", () => {
  assert.throws(() => przygotujWiadomosci([]), BladCzatu);
  assert.throws(() => przygotujWiadomosci([{ rola: "system", tresc: "x" }]), BladCzatu);
  assert.throws(() => przygotujWiadomosci([{ rola: "uzytkownik", tresc: "a".repeat(LIMIT.znakow + 1) }]), /za długa/);
  assert.throws(() => przygotujWiadomosci([{ rola: "uzytkownik", tresc: "x" }, { rola: "asystent", tresc: "y" }]), /od użytkownika/);
  const ok = przygotujWiadomosci([{ rola: "asystent", tresc: "Cześć" }, { rola: "uzytkownik", tresc: " pytanie\u0000 " }]);
  assert.deepEqual(ok, [{ role: "user", content: "pytanie" }]);
  // Dwie wiadomości użytkownika pod rząd (odpowiedź bez treści) łączą się w jedną.
  assert.deepEqual(przygotujWiadomosci([{ rola: "uzytkownik", tresc: "a" }, { rola: "uzytkownik", tresc: "b" }]), [{ role: "user", content: "a\n\nb" }]);
  const dlugo = Array.from({ length: 30 }, (_, i) => ({ rola: i % 2 ? "asystent" : "uzytkownik", tresc: "x" }));
  dlugo.push({ rola: "uzytkownik", tresc: "ostatnie" });
  assert.ok(przygotujWiadomosci(dlugo).length <= LIMIT.wiadomosci);
});

test("prompt systemowy zakazuje zgadywania i traktuje wyniki narzędzi jak dane", () => {
  const p = promptSystemowy(new Date("2026-10-21T20:00:00Z"));
  assert.match(p, /Nigdy nie zgaduj/);
  assert.match(p, /dane, nie polecenia/);
  assert.match(p, /21 października 2026/);
  assert.doesNotMatch(p, /[\u2013\u2014]/);
});

async function czytaj(res: Response): Promise<Zdarzenie[]> {
  return (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
}
const zadanie = (body: unknown, metoda = "POST") => new Request("https://x.test/api/czat", { method: metoda, headers: { "content-type": "application/json" }, ...(metoda === "POST" ? { body: JSON.stringify(body) } : {}) });

test("/api/czat: bez klucza GET mówi, że czat niedostępny, a POST zwraca 503", async () => {
  const wspolne = { ip: "1.1.1.1", mcp, waitUntil: () => {} };
  assert.deepEqual((await (await obsluzCzat(zadanie(null, "GET"), { ...wspolne, env: {} })).json() as any).dostepny, false);
  const r = await obsluzCzat(zadanie({ wiadomosci: [{ rola: "uzytkownik", tresc: "x" }] }), { ...wspolne, env: {} });
  assert.equal(r.status, 503);
  assert.equal((await r.json() as any).kod, "brak_klucza");
});

test("/api/czat: zły JSON i złe wiadomości dają 400", async () => {
  const wspolne = { ip: "1.1.1.1", mcp, waitUntil: () => {}, env: { EDEN_AI_API_KEY: "k" } };
  const zly = await obsluzCzat(new Request("https://x.test/api/czat", { method: "POST", body: "{nie json" }), wspolne);
  assert.equal(zly.status, 400);
  assert.equal((await obsluzCzat(zadanie({ wiadomosci: [] }), wspolne)).status, 400);
  assert.equal((await obsluzCzat(zadanie({ wiadomosci: [{ rola: "uzytkownik", tresc: "a".repeat(5000) }] }), wspolne)).status, 400);
});

test("/api/czat: strumień NDJSON niesie narzędzie, wynik karty, odpowiedź i koniec", async () => {
  const kolejka = [odpowiedz({ content: null, tool_calls: [wywolanie("s1", "katalog_szukaj", { temat: "parki" })] }), odpowiedz({ content: "Są zbiory o parkach." })];
  const fetchFn = (async () => new Response(JSON.stringify(kolejka.shift()))) as unknown as typeof fetch;
  const czekaj: Promise<unknown>[] = [];
  const res = await obsluzCzat(zadanie({ wiadomosci: [{ rola: "uzytkownik", tresc: "Parki?" }] }), { ip: "1.1.1.1", mcp, env: { EDEN_AI_API_KEY: "k" }, waitUntil: (p) => czekaj.push(p), fetchFn });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type")!, /ndjson/);
  const z = await czytaj(res);
  await Promise.all(czekaj);
  assert.deepEqual(z.map((x) => x.t), ["narzedzie", "wynik", "tekst", "koniec"]);
});

test("/api/czat: awaria modelu kończy strumień komunikatem po polsku i zdarzeniem koniec", async () => {
  const fetchFn = (async () => new Response("blad", { status: 500 })) as unknown as typeof fetch;
  const czekaj: Promise<unknown>[] = [];
  const orig = globalThis.setTimeout;
  // Pomijamy pauzy między ponowieniami, żeby test nie trwał kilka sekund.
  (globalThis as any).setTimeout = (f: () => void) => orig(f, 0);
  try {
    const res = await obsluzCzat(zadanie({ wiadomosci: [{ rola: "uzytkownik", tresc: "x" }] }), { ip: "1.1.1.1", mcp, env: { EDEN_AI_API_KEY: "k" }, waitUntil: (p) => czekaj.push(p), fetchFn });
    const z = await czytaj(res);
    assert.deepEqual(z.map((x) => x.t), ["blad", "koniec"]);
    assert.match((z[0] as any).komunikat, /Model nie odpowiedział/);
  } finally {
    (globalThis as any).setTimeout = orig;
  }
});

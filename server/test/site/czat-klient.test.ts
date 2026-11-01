import { test } from "node:test";
import assert from "node:assert/strict";
import { czytajZdarzenia, domknij, historiaDoApi, nowaWiadomosc, skrotArgumentow, wyslijCzat, zastosuj, type Zdarzenie } from "../../site/src/czatKlient.ts";

const strumien = (kawalki: string[], status = 200) =>
  new Response(new ReadableStream({ start(c) { for (const k of kawalki) c.enqueue(new TextEncoder().encode(k)); c.close(); } }), { status });
const zbierz = async (res: Response) => { const o: Zdarzenie[] = []; for await (const z of czytajZdarzenia(res)) o.push(z); return o; };

test("strumień NDJSON: linie rozcięte w połowie, uszkodzone linie i brak końcowego znaku nowej linii", async () => {
  const z = await zbierz(strumien(['{"t":"narzedzie","id":"1","nazwa":"odjazdy","argumenty":{}}\n{"t":"te', 'kst","tresc":"Za 3 min"}\nśmieci\n{"t":"koniec"}']));
  assert.deepEqual(z.map((x) => x.t), ["narzedzie", "tekst", "koniec"]);
  assert.equal((z[1] as any).tresc, "Za 3 min");
});

test("reduktor: narzędzie, wynik, odpowiedź i koniec składają wiadomość z kartami", () => {
  let w = nowaWiadomosc("asystent", "");
  w = zastosuj(w, { t: "narzedzie", id: "a", nazwa: "katalog_szukaj", argumenty: { temat: "parki" } });
  assert.equal(w.karty[0].stan, "czeka");
  w = zastosuj(w, { t: "wynik", id: "a", nazwa: "katalog_szukaj", dane: { _widok: "katalog" } });
  assert.equal(w.karty[0].stan, "ok");
  w = zastosuj(w, { t: "narzedzie", id: "b", nazwa: "odjazdy", argumenty: {} });
  w = zastosuj(w, { t: "wynik", id: "b", nazwa: "odjazdy", blad: "Podaj nazwę." });
  assert.equal(w.karty[1].stan, "blad");
  w = zastosuj(w, { t: "tekst", tresc: "Gotowe." });
  w = zastosuj(w, { t: "koniec" });
  assert.equal(w.laduje, false);
  assert.equal(w.tresc, "Gotowe.");
  // Wynik bez wcześniejszego wywołania nie ginie.
  assert.equal(zastosuj(nowaWiadomosc("asystent", ""), { t: "wynik", id: "z", nazwa: "x", dane: {} }).karty.length, 1);
});

test("domknięcie przerwanego strumienia: komunikat, a oczekujące karty dostają błąd", () => {
  let w = zastosuj(nowaWiadomosc("asystent", ""), { t: "narzedzie", id: "a", nazwa: "trasa", argumenty: {} });
  const przerwana = domknij(w, false);
  assert.equal(przerwana.laduje, false);
  assert.equal(przerwana.karty[0].stan, "blad");
  assert.match(przerwana.blad!.komunikat, /przerwane/);
  assert.match(domknij(w, true).blad!.komunikat, /Zatrzymano/);
  w = zastosuj(w, { t: "tekst", tresc: "Mam odpowiedź." });
  assert.equal(domknij(w, false).blad, undefined, "odpowiedź z treścią nie dostaje błędu");
});

test("historia do modelu: tylko treść rozmowy, bez trwających i pustych wiadomości", () => {
  const u = nowaWiadomosc("uzytkownik", "Pytanie");
  const a = { ...nowaWiadomosc("asystent", "Odpowiedź"), laduje: false };
  const pusta = { ...nowaWiadomosc("asystent", ""), laduje: false, blad: { komunikat: "x" } };
  const trwa = nowaWiadomosc("asystent", "częściowa");
  assert.deepEqual(historiaDoApi([u, a, pusta, trwa]), [{ rola: "uzytkownik", tresc: "Pytanie" }, { rola: "asystent", tresc: "Odpowiedź" }]);
});

test("historia do modelu: plan analizy czekający na zatwierdzenie wraca z id i JSON planu", () => {
  const plan = { tytul: "T", zrodla: [] };
  const a = { ...nowaWiadomosc("asystent", "Plan gotowy."), laduje: false, karty: [{ id: "1", nazwa: "operacja_wykonaj", argumenty: {}, stan: "ok" as const, dane: { tryb: "sprawdz", id_planu: "abc", plan } }] };
  const [, h] = historiaDoApi([nowaWiadomosc("uzytkownik", "Raport"), a]);
  assert.equal(h.tresc, `Plan gotowy.\n\n[Plan do zatwierdzenia, id_planu abc]\n${JSON.stringify(plan)}`);
});

test("wysyłka: błąd HTTP wraca jako opis z kodem, sieć jako komunikat po polsku, a zdarzenia są przekazywane", async () => {
  const zdarz: string[] = [];
  const ok = await wyslijCzat([{ rola: "uzytkownik", tresc: "x" }], (z) => zdarz.push(z.t), undefined, (async () => strumien(['{"t":"tekst","tresc":"a"}\n{"t":"koniec"}\n'])) as unknown as typeof fetch);
  assert.equal(ok.status, 200);
  assert.deepEqual(zdarz, ["tekst", "koniec"]);
  const brak = await wyslijCzat([], () => {}, undefined, (async () => new Response(JSON.stringify({ kod: "brak_klucza", blad: "Czat nie jest skonfigurowany." }), { status: 503 })) as unknown as typeof fetch);
  assert.deepEqual(brak, { status: 503, kod: "brak_klucza", blad: "Czat nie jest skonfigurowany." });
  const siec = await wyslijCzat([], () => {}, undefined, (async () => { throw new TypeError("fail"); }) as unknown as typeof fetch);
  assert.equal(siec.kod, "siec");
  await assert.rejects(wyslijCzat([], () => {}, undefined, (async () => { throw Object.assign(new Error("a"), { name: "AbortError" }); }) as unknown as typeof fetch), /a/);
});

test("skrót argumentów: tablice i obiekty są zwinięte, a długie teksty ucięte", () => {
  assert.equal(skrotArgumentow({ serie: Array.from({ length: 11 }, () => ({ x: 1, y: 2 })), horyzont: 3, metoda: "auto" }), 'serie: [11], horyzont: 3, metoda: "auto"');
  assert.equal(skrotArgumentow({ z: { tekst: "AGH" } }), "z: {…}");
  assert.match(skrotArgumentow({ temat: "a".repeat(80) }), /"a{27}…"/);
  assert.ok(skrotArgumentow(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))).length <= 90);
  assert.equal(skrotArgumentow(null), "");
});

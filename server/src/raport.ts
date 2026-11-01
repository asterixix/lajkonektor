// Ograniczony plan danych: źródła są pobierane raz, a liczby liczy wyłącznie kod serwera.
import { z } from "zod";
import { DATY_LUDNOSCI, DZIELNICE, OSTATNIA_DATA, ZRODLO_LUDNOSCI, dzielnicaId, dzielnicaPunktu, ludnosc } from "./analityka.ts";
import { NAZWY_WSKAZNIKOW, statystyka } from "./analizy.ts";
import { sprawdzUrl } from "./plik.ts";
import { pozycje, znajdz } from "./katalog.ts";
import { prognoza } from "./prognoza.ts";
import type { RaportAnalityczny, TabelaRaportu, ZrodloRaportu } from "../shared/raport.ts";

const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/).describe("Unikalna nazwa źródła lub operacji w planie");
const pole = z.string().min(1).max(120).refine((s) => !["__proto__", "constructor", "prototype"].includes(s), "Zastrzeżona nazwa kolumny");
const tekst = z.string().min(1).max(500);
const polaLudnosci = z.enum(["r_ogolem", "k_ogolem", "m_ogolem", "r_0_2", "r_3_6", "r_7_14", "r_15_18", "r_19_24", "r_25_34", "r_35_44", "r_45_59_64", "r_60_65_79", "r_po_80"]);
const lokalneArgs = z.object({ pola: z.array(polaLudnosci).min(1).max(14).default(["r_ogolem"]), data: z.string().optional() }).strict();
const miaryZrodla = z.array(z.object({ fn: z.enum(["sum", "count", "avg", "min", "max"]), pole, nazwa: pole.optional() }).strict()).max(10);
const wyborZrodla = { pola: z.array(pole).max(30).optional(), sortuj: z.string().max(500).optional(), grupuj_po: z.array(pole).max(10).optional(), agreguj: miaryZrodla.optional() };
const punkt = z.object({ lat: z.number().min(49.9).max(50.2), lon: z.number().min(19.7).max(20.2) }).strict();
const filtrZrodla = z.string().max(2000).refine((s) => !/;|--|\/\*|\b(select|insert|update|delete|drop|union|execute)\b/i.test(s), "Dozwolony jest tylko ograniczony filtr WHERE/OData, bez instrukcji SQL");
// Węższy, jawny podzbiór argumentów źródeł. Wykonanie dodatkowo waliduje je we wspólnym rejestrze MCP.
const argsZrodel = {
  dane_zapytaj: z.object({ id: z.string().min(1).max(300), ...wyborZrodla, filtr: filtrZrodla.optional(), limit: z.number().int().min(1).max(1000).optional(), offset: z.literal(0).optional(), geometria: z.union([z.object({ punkt, promien_m: z.number().min(1).max(5000).optional() }).strict(), z.object({ bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }).strict(), z.object({ z: z.object({ id: z.string().max(300), where: filtrZrodla.optional(), bufor_m: z.number().min(1).max(5000).optional() }).strict() }).strict()]).optional(), zwroc_geometrie: z.boolean().optional(), kontury: z.boolean().optional(), tylko_liczba: z.boolean().optional() }).strict(),
  plik_odczyt: z.object({ url: z.string().url().max(2000), ...wyborZrodla, format: z.enum(["csv", "xlsx", "geojson", "json"]).optional(), arkusz: z.union([z.string().max(120), z.number().int().min(1)]).optional(), separator: z.string().max(1).optional(), limit: z.number().int().min(1).max(500).optional(), offset: z.literal(0).optional(), geometria: z.enum(["podsumowanie", "brak"]).optional() }).strict(),
  bdl_dane: z.object({ zmienne: z.array(z.number().int().positive()).min(1).max(20), jednostka: z.string().min(1).max(100).optional(), lata: z.array(z.number().int()).max(40).optional() }).strict(),
  wskaznik_dzielnic: z.object({ licznik: z.enum(NAZWY_WSKAZNIKOW), mianownik: z.enum(NAZWY_WSKAZNIKOW).optional(), dzielnica: z.string().max(120).optional(), klasy: z.number().int().min(2).max(7).optional() }).strict(),
  ludnosc_dzielnic: lokalneArgs,
};
const sourceSchema = z.object({
  id, nazwa: tekst.optional(),
  narzedzie: z.enum(["dane_zapytaj", "plik_odczyt", "bdl_dane", "wskaznik_dzielnic", "ludnosc_dzielnic"]).describe("Wyłącznie zaufane narzędzia odczytu; lokalna ludność z migawki serwera"),
  argumenty: z.record(z.string(), z.unknown()).describe("Argumenty istniejącego narzędzia; bez wklejania liczb lub wykonywalnego kodu"),
  definicja: tekst.optional(), data_stanu: z.string().min(1).max(120).optional(), jednostka: tekst.optional(), poziom: tekst.optional(),
  dzielnica_pole: pole.optional().describe("Kolumna z numerem lub pełną nazwą dzielnicy; serwer doda dzielnica_id, nierozpoznane wartości pozostawi null"),
  dzielnica_z_geometrii: z.boolean().optional().describe("Jawne przypisanie dzielnicy z geometrii MSIP. Przy sprzeczności z polem tekstowym używa geometrii i zgłasza konflikt; bez punktu pozostawia null"),
}).strict();
const operacjaSchema = z.discriminatedUnion("typ", [
  z.object({ id, typ: z.literal("agreguj"), z: id, grupuj_po: z.array(pole).max(10).default([]), miary: z.array(z.object({ pole: pole.optional(), fn: z.enum(["sum", "count", "avg", "min", "max"]), nazwa: pole }).strict()).min(1).max(10) }).strict(),
  z.object({ id, typ: z.literal("polacz"), lewe: id, prawe: id, klucz_lewy: pole, klucz_prawy: pole, prefiks_prawy: z.string().min(1).max(30).default("p_"), kardynalnosc: z.enum(["1:1", "wiele:1"]).default("1:1"), uzasadnienie_roznic: tekst.optional() }).strict(),
  z.object({ id, typ: z.literal("wskaznik"), z: id, licznik: pole, mianownik: pole, nazwa: pole, mnoznik: z.number().finite().positive().default(1), jednostka: tekst }).strict(),
  z.object({ id, typ: z.literal("statystyka"), z: id, operacja: z.enum(["opis", "korelacja", "trend", "wzrost", "nierownosc", "klasy", "odstajace"]), x: pole, y: pole.optional(), etykieta: pole.optional(), czas: pole.optional(), lata: z.number().positive().optional(), klasy: z.number().int().min(2).max(10).optional(), metoda: z.enum(["kwantyle", "rowne", "jenks"]).optional() }).strict(),
  z.object({ id, typ: z.literal("projekcja"), z: id, x: pole, y: pole, horyzont: z.number().int().min(1).max(20), metoda: z.enum(["auto", "liniowy", "wykladniczy", "holt"]).optional(), krok: z.number().positive().optional(), ostatnie_punkty: z.number().int().min(3).max(5000).optional() }).strict(),
]);

const planSchema = z.object({
  tytul: z.string().min(2).max(120), pytanie: z.string().min(2).max(1000),
  zrodla: z.array(sourceSchema).min(1).max(8), operacje: z.array(operacjaSchema).max(12),
  ograniczenia: z.array(tekst).max(20).default([]),
}).strict().superRefine((p, ctx) => {
  const znane = new Set<string>();
  for (const [i, s] of p.zrodla.entries()) {
    if (znane.has(s.id)) ctx.addIssue({ code: "custom", path: ["zrodla", i, "id"], message: "Id musi być unikalne" });
    znane.add(s.id);
    const a = s.argumenty;
    const argumenty = argsZrodel[s.narzedzie].safeParse(a);
    if (!argumenty.success) ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: `Argumenty ${s.narzedzie}: ${argumenty.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}` });
    if (s.narzedzie === "dane_zapytaj" && (typeof a.id !== "string" || !a.id)) ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: "dane_zapytaj wymaga id zbioru" });
    if (s.narzedzie === "plik_odczyt" && (typeof a.url !== "string" || !/^https:\/\//.test(a.url))) ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: "plik_odczyt wymaga adresu HTTPS" });
    if (s.narzedzie === "plik_odczyt" && typeof a.url === "string") {
      try { sprawdzUrl(new URL(a.url), true); } catch { ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty", "url"], message: "Pierwszy adres pliku musi należeć do dozwolonej instytucji publicznej (HTTPS gov.pl lub krakow.pl)" }); }
    }
    if (s.narzedzie === "wskaznik_dzielnic" && typeof a.licznik !== "string") ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: "Wybierz licznik wskaźnika; profil dzielnicy nie jest tabelą" });
    if (s.dzielnica_z_geometrii && (s.narzedzie !== "dane_zapytaj" || !String(a.id).startsWith("msip:"))) ctx.addIssue({ code: "custom", path: ["zrodla", i, "dzielnica_z_geometrii"], message: "Przypisanie z geometrii wymaga warstwy MSIP" });
    if (s.narzedzie === "ludnosc_dzielnic") {
      const r = lokalneArgs.safeParse(a);
      if (!r.success || (r.data.data && !DATY_LUDNOSCI.includes(r.data.data))) ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: "Nieprawidłowe pola lub data lokalnej migawki ludności" });
    }
    if (a.offset != null && a.offset !== 0 || a.kursor != null) ctx.addIssue({ code: "custom", path: ["zrodla", i, "argumenty"], message: "Analiza pobiera całość; początkowy offset/kursor nie jest dozwolony" });
  }
  for (const [i, o] of p.operacje.entries()) {
    const refs = o.typ === "polacz" ? [o.lewe, o.prawe] : [o.z];
    if (refs.some((r) => !znane.has(r))) ctx.addIssue({ code: "custom", path: ["operacje", i], message: "Operacja może wskazywać tylko wcześniejsze źródło lub operację" });
    if (znane.has(o.id)) ctx.addIssue({ code: "custom", path: ["operacje", i, "id"], message: "Id musi być unikalne" });
    znane.add(o.id);
    if (o.typ === "agreguj" && (new Set([...o.grupuj_po, ...o.miary.map((m) => m.nazwa)]).size !== o.grupuj_po.length + o.miary.length || o.miary.some((m) => m.fn !== "count" && !m.pole))) ctx.addIssue({ code: "custom", path: ["operacje", i], message: "Agregacja wymaga unikalnych nazw i kolumn liczbowych" });
    if (o.typ === "statystyka" && o.operacja === "korelacja" && !o.y) ctx.addIssue({ code: "custom", path: ["operacje", i], message: "Korelacja wymaga kolumny y" });
  }
});

export const analizaSchema = z.object({
  tryb: z.enum(["sprawdz", "wykonaj"]).describe("Najpierw sprawdź plan i przedstaw go człowiekowi; wykonaj dopiero po deklaracji zatwierdzenia"),
  plan: planSchema,
  id_planu: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Id zwrócone przez sprawdz dla dokładnie tego samego planu"),
  zatwierdzenie: z.string().trim().min(2).max(1000).optional().describe("Treść zatwierdzenia w rozmowie; to deklaracja, nie dowód tożsamości lub zgody"),
}).strict().superRefine((a, ctx) => {
  if (a.tryb === "wykonaj" && (!a.id_planu || !a.zatwierdzenie)) ctx.addIssue({ code: "custom", path: ["zatwierdzenie"], message: "Wykonanie wymaga id_planu oraz jawnego zatwierdzenia planu" });
});
export type PlanAnalizy = z.infer<typeof planSchema>;
type Zrodlo = z.infer<typeof sourceSchema>;
type Operacja = z.infer<typeof operacjaSchema>;
type Wiersz = Record<string, unknown>;
type Wywolaj = (narzedzie: string, argumenty: unknown) => Promise<any>;
interface Tabela extends TabelaRaportu { meta: Map<string, { jednostka?: string; data_stanu?: string; poziom?: string }>; }
type WykresRaportu = { tabela: string; tytul: string; rodzaj: "slupki" | "linia"; kolumna_x: string; kolumny_y: string[]; jednostka?: string };
const MAX_WIERSZY = 5000, MAX_BAJTOW = 1024 * 1024;
const unikat = <T>(xs: T[]) => [...new Set(xs)];
const bajty = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
function limit(v: unknown, wierszy?: number) {
  if (wierszy != null && wierszy > MAX_WIERSZY) throw new Error("Analiza przekracza limit 5000 wierszy; zawęź plan lub agreguj w źródle.");
  if (bajty(v) > MAX_BAJTOW) throw new Error("Analiza przekracza limit 1 MiB wyniku; zawęź plan. Wyniku nie ucięto.");
}
function kanoniczny(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(kanoniczny).join(",")}]`;
  return `{${Object.keys(v).filter((k) => (v as Wiersz)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${kanoniczny((v as Wiersz)[k])}`).join(",")}}`;
}
async function hash(p: PlanAnalizy) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kanoniczny(p)));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export { planSchema as planDanychSchema, hash as hashPlanuAnalizy };
/** Ten sam ograniczony odczyt co w planie, bez deklaracji zatwierdzenia i bez operacji obliczeniowych. */
export const zrodloDanychSchema = sourceSchema.pick({ narzedzie: true, argumenty: true }).superRefine((s, ctx) => {
  const r = planSchema.safeParse({ tytul: "Odczyt danych", pytanie: "Pobranie danych do własnej analizy", zrodla: [{ id: "dane", ...s }], operacje: [] });
  if (!r.success) for (const issue of r.error.issues) ctx.addIssue({ code: "custom", path: issue.path.slice(2), message: issue.message });
});
function rozpakuj(r: any): Record<string, any> {
  if (!r || typeof r !== "object") throw new Error("Źródło zwróciło nieprawidłowy wynik.");
  if (r.isError) throw new Error(String(r.content?.[0]?.text ?? "Błąd źródła"));
  return r.structuredContent ?? r;
}
function uwagi(r: Record<string, any>): string[] {
  return [...(Array.isArray(r.uwagi) ? r.uwagi.filter((x: unknown) => typeof x === "string") : []), ...(typeof r.uwaga === "string" ? [r.uwaga] : []), ...(Array.isArray(r.ostrzezenia) ? r.ostrzezenia : [])];
}
function kolumny(rows: Wiersz[]) { return unikat(rows.flatMap(Object.keys)).filter((k) => k !== "_geometria"); }
function kolumna(t: Tabela, k: string) {
  if (!t.kolumny.includes(k)) throw new Error(`${t.id}: brak kolumny '${k}'. Dostępne: ${t.kolumny.join(", ")}`);
}
function liczba(v: unknown, k: string): number | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Kolumna '${k}' zawiera wartość nieliczbową; braków nie zastępuj zerem.`);
  return v;
}
function wynikLiczbowy(n: number) {
  if (!Number.isFinite(n)) throw new Error("Obliczenie przekracza zakres liczb skończonych.");
  return n;
}

async function sprawdzMetadane(p: PlanAnalizy, wywolaj: Wywolaj) {
  const opis = new Map<string, any>();
  const wyniki: Wiersz[] = [];
  for (const s of p.zrodla) {
    if (s.narzedzie === "dane_zapytaj") {
      const key = String(s.argumenty.id);
      if (!opis.has(key)) opis.set(key, rozpakuj(await wywolaj("zbior_opis", { id: key })));
      const r = opis.get(key);
      const pola = (r.pola ?? []).map((f: any) => typeof f === "string" ? f.split(":")[0] : f.nazwa ?? f.name);
      if (pola.length) {
        const wybrane = Array.isArray(s.argumenty.pola) ? s.argumenty.pola : [];
        const grupy = Array.isArray(s.argumenty.grupuj_po) ? s.argumenty.grupuj_po : [];
        const miary = Array.isArray(s.argumenty.agreguj) ? s.argumenty.agreguj.map((x: any) => x.pole).filter((x: unknown) => x !== "*") : [];
        for (const f of [...wybrane, ...grupy, ...miary]) if (!pola.includes(f)) throw new Error(`${s.id}: metadane nie zawierają pola '${f}'.`);
      }
      wyniki.push({ id: s.id, narzedzie: s.narzedzie, pola, url: r.url, data_stanu: s.data_stanu ?? null, uwagi: ["Data pobrania metadanych nie jest datą stanu danych."] });
    } else wyniki.push({ id: s.id, narzedzie: s.narzedzie, data_stanu: s.narzedzie === "ludnosc_dzielnic" ? (s.argumenty.data ?? OSTATNIA_DATA) : s.data_stanu ?? null, uwagi: ["Pełną tabelę i jej kolumny sprawdzimy podczas wykonania."] });
  }
  return wyniki;
}

async function pobierz(s: Zrodlo, wywolaj: Wywolaj): Promise<{ rows: Wiersz[]; r: Record<string, any>; notatki: string[] }> {
  if (s.narzedzie === "ludnosc_dzielnic") {
    const a = lokalneArgs.parse(s.argumenty), data = a.data ?? OSTATNIA_DATA;
    return { rows: DZIELNICE.map((d) => ({ id: d.id, nazwa: d.nazwa, data, ...Object.fromEntries(a.pola.map((k) => [k, ludnosc(d.id, k, data)])) })), r: { kompletne: true, zrodlo: ZRODLO_LUDNOSCI, data_stanu: data, definicja: "Zameldowani na pobyt stały; liczba osób według grup wieku, nie wszyscy faktyczni mieszkańcy.", jednostka: "osób", poziom: "dzielnica" }, notatki: [] };
  }
  if (s.narzedzie === "bdl_dane" && (s.argumenty.zmienne as number[]).length > 1) {
    // Adapter BDL nie przekazuje kursora API; pojedyncza zmienna eliminuje paginację listy zmiennych.
    const czesci: Awaited<ReturnType<typeof pobierz>>[] = [];
    for (const zmienna of unikat(s.argumenty.zmienne as number[])) czesci.push(await pobierz({ ...s, argumenty: { ...s.argumenty, zmienne: [zmienna] } }, wywolaj));
    const rows = czesci.flatMap((c) => c.rows);
    limit(rows, rows.length);
    return { rows, r: czesci[0].r, notatki: unikat(czesci.flatMap((c) => c.notatki)) };
  }
  const rows: Wiersz[] = [], notatki: string[] = [];
  let args: Wiersz = { ...s.argumenty };
  if (s.narzedzie === "dane_zapytaj" || s.narzedzie === "plik_odczyt") args.limit = 50;
  if (s.dzielnica_z_geometrii) args.zwroc_geometrie = true;
  let pierwszy: Record<string, any> | undefined;
  const kroki = new Set<string>(), identyfikatory = new Map<string, Set<string>>();
  const oidKatalogu = s.narzedzie === "dane_zapytaj" ? znajdz(String(s.argumenty.id))?.pola.find((f) => /:OID$/i.test(f))?.split(":")[0] : undefined;
  for (let strona = 0; strona <= MAX_WIERSZY; strona++) {
    const key = kanoniczny(args);
    if (kroki.has(key)) throw new Error(`${s.id}: pętla paginacji lub powtórzony kursor.`);
    kroki.add(key);
    const r = rozpakuj(await wywolaj(s.narzedzie, args));
    pierwszy ??= r;
    const page: Wiersz[] = s.narzedzie === "wskaznik_dzielnic" ? r.wskaznik?.dzielnice : r.wiersze;
    if (!Array.isArray(page) || page.some((w) => w == null || typeof w !== "object" || Array.isArray(w))) throw new Error(`${s.id}: źródło nie zwróciło tabeli wierszy.`);
    const notes = uwagi(r); notatki.push(...notes);
    if (notes.some((u) => /przycięt|wczytano maksymalnie|przekrocz.*limit.*źródł|20.?000/i.test(u))) throw new Error(`${s.id}: źródło przycięło wynik; nie można potwierdzić kompletności. Zawęź zapytanie.`);
    // Jednakowe wartości wybranych kolumn mogą opisywać różne rekordy. Sprawdzamy tylko rzeczywiste OID,
    // potwierdzone przez katalog lub metadane źródła, a nie arbitralne pole „id” ani hash projekcji.
    const oid = typeof r.objectIdFieldName === "string" ? r.objectIdFieldName : oidKatalogu;
    if (oid) {
      const znane = identyfikatory.get(oid) ?? new Set<string>();
      for (const w of page) {
        const v = w[oid];
        if (typeof v !== "string" && typeof v !== "number") continue;
        const key = `${typeof v}:${String(v)}`;
        if (znane.has(key)) throw new Error(`${s.id}: paginacja powtarza rzeczywisty identyfikator obiektu '${oid}'.`);
        znane.add(key);
      }
      identyfikatory.set(oid, znane);
    }
    rows.push(...page);
    limit(rows, rows.length);
    if (r.nastepny_kursor != null) {
      if (!page.length || typeof r.nastepny_kursor !== "string") throw new Error(`${s.id}: wadliwy kursor paginacji.`);
      args = { ...args, kursor: r.nastepny_kursor }; continue;
    }
    if (s.narzedzie === "plik_odczyt") {
      if (!Number.isInteger(r.wierszy_w_wyniku) || r.wierszy_w_wyniku < rows.length) throw new Error(`${s.id}: brak wiarygodnej liczby wierszy pliku.`);
      if (rows.length < r.wierszy_w_wyniku) {
        if (!page.length) throw new Error(`${s.id}: paginacja pliku nie posuwa się naprzód.`);
        args = { ...args, offset: rows.length }; continue;
      }
      if (r.kompletne === false) throw new Error(`${s.id}: niepełne źródło pliku.`);
    } else if (r.kompletne === false) {
      // MSIP sygnalizuje dalszą stronę jawnie. Inne kompletne=false może oznaczać obciętą agregację.
      const next = notes.map((u) => u.match(/(?:ponów z |kolejne wiersze:.*)offset=(\d+)/i)).find(Boolean);
      const lokalneStrony = notes.some((u) => /limit i offset zastosowano po pobraniu/i.test(u));
      if (s.narzedzie === "dane_zapytaj" && String(args.id).startsWith("msip:") && (next || lokalneStrony) && page.length) {
        const offset = next ? Number(next[1]) : Number(args.offset ?? 0) + page.length;
        if (offset !== Number(args.offset ?? 0) + page.length) throw new Error(`${s.id}: nieciągła paginacja MSIP.`);
        args = { ...args, offset }; continue;
      }
      throw new Error(`${s.id}: niepełne źródło (kompletne=false), brak bezpiecznej dalszej paginacji.`);
    } else if (s.narzedzie === "dane_zapytaj" && r.kompletne !== true) throw new Error(`${s.id}: źródło nie potwierdza kompletności.`);
    return { rows, r: pierwszy, notatki: unikat(notatki) };
  }
  throw new Error(`${s.id}: przekroczono limit kroków paginacji.`);
}

function zgodnosc(l: Tabela, p: Tabela, uzasadnienie?: string) {
  const notes: string[] = [];
  for (const k of ["data_stanu", "poziom"] as const) {
    const a = unikat([...l.meta.values()].map((m) => m[k]).filter(Boolean)), b = unikat([...p.meta.values()].map((m) => m[k]).filter(Boolean));
    if (a.length && b.length && kanoniczny(a.slice().sort()) !== kanoniczny(b.slice().sort())) {
      if (!uzasadnienie) throw new Error(`Brak porównywalności: różne ${k} (${a.join(", ")} / ${b.join(", ")}); sprawdź dane albo uzasadnij różnice w planie.`);
      notes.push(`Różne ${k}: ${a.join(", ")} / ${b.join(", ")}. Uzasadnienie w planie: ${uzasadnienie}`);
    }
  }
  return notes;
}
function klucz(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "number" && typeof v !== "string") throw new Error("Klucz łączenia musi być tekstem lub liczbą.");
  return `${typeof v}:${String(v)}`;
}
function czystaTabela(t: Tabela): TabelaRaportu { const { meta: _, ...reszta } = t; return reszta; }
function adresZrodla(s: Zrodlo, r: Record<string, any>): string | undefined {
  if (typeof r.url === "string") return r.url;
  if (typeof s.argumenty.url === "string") return s.argumenty.url;
  if (typeof r.zrodlo === "string" && /^https:\/\//.test(r.zrodlo)) return r.zrodlo;
  if (s.narzedzie === "dane_zapytaj") return znajdz(String(s.argumenty.id))?.url;
  if (s.narzedzie === "ludnosc_dzielnic") return znajdz("msip:Demografia/Elud_Dz/0")?.url;
  if (s.narzedzie === "bdl_dane") {
    const unit = r.jednostka_id ?? ({ powiat: "011212161000", gmina: "011212161011", podregion: "011212100000" } as Record<string, string>)[String(s.argumenty.jednostka ?? "powiat")] ?? s.argumenty.jednostka;
    const params = new URLSearchParams({ lang: "pl", format: "json" });
    for (const v of s.argumenty.zmienne as number[]) params.append("var-id", String(v));
    for (const rok of (s.argumenty.lata as number[] | undefined) ?? []) params.append("year", String(rok));
    return `https://bdl.stat.gov.pl/api/v1/data/by-unit/${encodeURIComponent(String(unit))}?${params}`;
  }
  if (s.narzedzie === "wskaznik_dzielnic") {
    const opis = String(r.zrodlo ?? "");
    return pozycje.find((p) => opis.includes(p.id.replace(/^[^:]+:/, "").replace(/\/\d+$/, "")))?.url ?? "https://msip.um.krakow.pl/";
  }
  return undefined;
}

function oblicz(o: Operacja, dane: Map<string, Tabela>, metody: string[], ograniczenia: string[], wykresy: Wiersz[], wykresyRaportu: WykresRaportu[]): Tabela {
  const t = dane.get(o.typ === "polacz" ? o.lewe : o.z)!;
  const wynik: Tabela = { id: o.id, tytul: o.id, kolumny: [], wiersze: [], zrodla: t.zrodla.slice(), uwagi: t.uwagi.slice(), meta: new Map(t.meta) };
  switch (o.typ) {
    case "agreguj": {
      for (const k of [...o.grupuj_po, ...o.miary.flatMap((m) => m.pole ? [m.pole] : [])]) kolumna(t, k);
      const grupy = new Map<string, Wiersz[]>();
      for (const w of t.wiersze) { const key = kanoniczny(o.grupuj_po.map((k) => w[k] ?? null)); if (!grupy.has(key)) grupy.set(key, []); grupy.get(key)!.push(w); }
      if (!t.wiersze.length && !o.grupuj_po.length) grupy.set("[]", []);
      wynik.wiersze = [...grupy.values()].map((rows) => {
        const r = Object.fromEntries(o.grupuj_po.map((k) => [k, rows[0]?.[k] ?? null]));
        for (const m of o.miary) {
          if (m.fn === "count") { r[m.nazwa] = m.pole ? rows.filter((w) => w[m.pole!] != null).length : rows.length; continue; }
          const xs = rows.map((w) => liczba(w[m.pole!], m.pole!));
          if (!xs.length || xs.some((v) => v == null)) { r[m.nazwa] = null; continue; }
          const ns = xs as number[];
          r[m.nazwa] = wynikLiczbowy(m.fn === "sum" ? ns.reduce((a, b) => a + b, 0) : m.fn === "avg" ? ns.reduce((a, b) => a + b, 0) / ns.length : m.fn === "min" ? Math.min(...ns) : Math.max(...ns));
        }
        return r;
      });
      wynik.kolumny = [...o.grupuj_po, ...o.miary.map((m) => m.nazwa)];
      wynik.meta = new Map([...o.grupuj_po.map((k) => [k, t.meta.get(k) ?? {}] as const), ...o.miary.map((m) => [m.nazwa, { ...t.meta.get(m.pole ?? ""), ...(m.fn === "count" ? { jednostka: "wierszy" } : {}) }] as const)]);
      if (wynik.wiersze.some((w) => o.miary.some((m) => w[m.nazwa] == null))) wynik.uwagi.push("Agregaty z brakującymi wartościami są null; nieznanych wartości nie potraktowano jak zero.");
      metody.push(`${o.id}: agregacja po ${o.grupuj_po.join(", ") || "całym zbiorze"}: ${o.miary.map((m) => `${m.nazwa}=${m.fn}(${m.pole ?? "wiersz"})`).join(", ")}. Brak wartości unieważnia agregat liczbowy; count liczy znane wartości albo wiersze.`);
      break;
    }
    case "polacz": {
      const p = dane.get(o.prawe)!; kolumna(t, o.klucz_lewy); kolumna(p, o.klucz_prawy);
      wynik.uwagi.push(...p.uwagi, ...zgodnosc(t, p, o.uzasadnienie_roznic)); wynik.zrodla = unikat([...t.zrodla, ...p.zrodla]);
      const leweTypy = unikat(t.wiersze.map((w) => w[o.klucz_lewy]).filter((v) => v != null).map((v) => typeof v));
      const praweTypy = unikat(p.wiersze.map((w) => w[o.klucz_prawy]).filter((v) => v != null).map((v) => typeof v));
      if (leweTypy.length > 1 || praweTypy.length > 1 || leweTypy.length && praweTypy.length && leweTypy[0] !== praweTypy[0]) throw new Error(`${o.id}: niezgodny typ klucza łączenia; nie konwertujemy typów automatycznie.`);
      const prawa = new Map<string, Wiersz>(), lewa = new Set<string>();
      for (const w of p.wiersze) { const k = klucz(w[o.klucz_prawy]); if (k == null) continue; if (prawa.has(k)) throw new Error(`${o.id}: duplikat prawego klucza; naruszona kardynalność ${o.kardynalnosc}.`); prawa.set(k, w); }
      const rightNames = p.kolumny.map((k) => `${o.prefiks_prawy}${k}`);
      if (rightNames.some((k) => t.kolumny.includes(k) || ["__proto__", "constructor", "prototype"].includes(k))) throw new Error(`${o.id}: kolizja nazw kolumn po łączeniu.`);
      let braki = 0, puste = 0; const trafione = new Set<string>();
      wynik.wiersze = t.wiersze.map((w) => {
        const k = klucz(w[o.klucz_lewy]);
        if (k != null && lewa.has(k) && o.kardynalnosc === "1:1") throw new Error(`${o.id}: duplikat lewego klucza; naruszona kardynalność 1:1.`);
        if (k != null) lewa.add(k); else puste++;
        const match = k == null ? undefined : prawa.get(k); if (!match) braki++; else trafione.add(k!);
        return { ...w, ...Object.fromEntries(p.kolumny.map((c) => [`${o.prefiks_prawy}${c}`, match?.[c] ?? null])) };
      });
      wynik.kolumny = [...t.kolumny, ...rightNames];
      p.kolumny.forEach((k) => wynik.meta.set(`${o.prefiks_prawy}${k}`, p.meta.get(k) ?? {}));
      wynik.uwagi.push(`Łączenie lewe: brak dopasowania dla ${braki} wierszy lewych (w tym puste klucze: ${puste}); niewykorzystane klucze prawe: ${prawa.size - trafione.size}. Null nie jest zerem.`);
      metody.push(`${o.id}: left join ${o.lewe}.${o.klucz_lewy} = ${o.prawe}.${o.klucz_prawy}, kardynalność ${o.kardynalnosc}; zgodność typów i duplikaty sprawdzono. Prefiks kolumn prawych: ${o.prefiks_prawy}.`);
      break;
    }
    case "wskaznik": {
      kolumna(t, o.licznik); kolumna(t, o.mianownik);
      if (t.kolumny.includes(o.nazwa)) throw new Error(`${o.id}: kolizja nazwy wskaźnika '${o.nazwa}'.`);
      const l = t.meta.get(o.licznik), m = t.meta.get(o.mianownik);
      for (const k of ["data_stanu", "poziom"] as const) if (l?.[k] && m?.[k] && l[k] !== m[k] && !t.uwagi.some((u) => u.startsWith(`Różne ${k}:`))) throw new Error(`${o.id}: niezgodne ${k} licznika i mianownika.`);
      let braki = 0;
      wynik.wiersze = t.wiersze.map((w) => { const a = liczba(w[o.licznik], o.licznik), b = liczba(w[o.mianownik], o.mianownik); const v = a == null || b == null || b === 0 ? null : wynikLiczbowy(a / b * o.mnoznik); if (v == null) braki++; return { ...w, [o.nazwa]: v }; });
      wynik.kolumny = [...t.kolumny, o.nazwa]; wynik.meta.set(o.nazwa, { ...l, jednostka: o.jednostka });
      wynik.uwagi.push(`Wskaźnik ${o.nazwa}: ${braki} braków wyniku (brak licznika/mianownika lub mianownik równy zero). Jednostka wyniku zadeklarowana w planie: ${o.jednostka}.`);
      metody.push(`${o.id}: ${o.nazwa} = ${o.licznik} / ${o.mianownik} × ${o.mnoznik} [${o.jednostka}]; zero w mianowniku lub brak daje null.`);
      const label = t.kolumny.includes("nazwa") ? "nazwa" : t.kolumny.includes("id") ? "id" : undefined;
      if (label) wykresyRaportu.push({ tabela: o.id, tytul: o.id, rodzaj: "slupki", kolumna_x: label, kolumny_y: [o.nazwa], jednostka: o.jednostka });
      if (label && wynik.wiersze.length <= 200) wykresy.push({ typ: "wykres", tytul: o.id, rodzaj: "slupki", jednostka: o.jednostka, punkty: wynik.wiersze.filter((w) => typeof w[o.nazwa] === "number").map((w) => ({ x: w[label] ?? "", y: w[o.nazwa] })) });
      break;
    }
    case "statystyka": {
      for (const k of [o.x, o.y, o.etykieta, o.czas].filter((k): k is string => !!k)) kolumna(t, k);
      const x = t.wiersze.map((w) => liczba(w[o.x], o.x)), y = o.y ? t.wiersze.map((w) => liczba(w[o.y!], o.y!)) : undefined;
      const czas = o.czas ? t.wiersze.map((w) => { const n = liczba(w[o.czas!], o.czas!); if (n == null) throw new Error(`${o.id}: brak współrzędnej osi czasu.`); return n; }) : undefined;
      const labels = o.etykieta ? t.wiersze.map((w) => String(w[o.etykieta!] ?? "")) : undefined;
      const r = statystyka({ operacja: o.operacja, x, y, etykiety: labels, nazwa_x: o.x, nazwa_y: o.y, klasy: o.klasy, metoda: o.metoda, lata: o.lata, ...(czas ? { czas } : {}) });
      const { tytul, zrodlo: _, bloki, ...wartosci } = r;
      wynik.tytul = tytul; wynik.wiersze = Object.entries(wartosci).map(([miara, wartosc]) => ({ miara, wartosc })); wynik.kolumny = ["miara", "wartosc"];
      // Tabela statystyki zawiera zagnieżdżone miary, bez jawnych kolumn serii; nie zgadujemy wykresu.
      wynik.uwagi.push("Statystyka pomija braki; korelacja używa tylko kompletnych par. Korelacja nie dowodzi przyczynowości; dzielnice mogą być zależne przestrzennie.");
      if (!czas && o.operacja === "trend") wynik.uwagi.push("Nie wskazano osi czasu: trend opisuje kolejność wierszy w równych odstępach, nie zmianę roczną.");
      metody.push(`${o.id}: statystyka ${o.operacja} na kolumnie ${o.x}${o.y ? ` oraz ${o.y}` : ""}${o.czas ? `; oś czasu ${o.czas}` : ""}; użyto wspólnej implementacji narzędzia statystyka.`);
      break;
    }
    case "projekcja": {
      kolumna(t, o.x); kolumna(t, o.y);
      const serie = t.wiersze.map((w) => ({ x: liczba(w[o.x], o.x), y: liczba(w[o.y], o.y) }));
      const pelne = serie.filter((v): v is { x: number; y: number } => v.x != null && v.y != null);
      const r = prognoza({ serie: pelne, horyzont: o.horyzont, metoda: o.metoda, krok: o.krok, ostatnie_punkty: o.ostatnie_punkty });
      wynik.wiersze = r.prognoza; wynik.kolumny = kolumny(wynik.wiersze);
      wynik.uwagi.push(...(r.ostrzezenia ?? []), r.uwaga, `Pominięte niekompletne pary czasu/wartości: ${serie.length - pelne.length}.`);
      metody.push(`${o.id}: projekcja ${r.metoda}; ${r.opis_metody}; ${r.wybor}. Jakość: ${JSON.stringify(r.jakosc)}. Parametry: ${JSON.stringify(r.parametry)}. Krok: ${r.krok}; horyzont: ${o.horyzont}.`);
      wykresyRaportu.push({ tabela: o.id, tytul: `${o.id}: projekcja`, rodzaj: "linia", kolumna_x: "x", kolumny_y: ["wartosc"], ...(t.meta.get(o.y)?.jednostka ? { jednostka: t.meta.get(o.y)!.jednostka } : {}) });
      wykresy.push({ typ: "wykres", tytul: `${o.id}: projekcja`, rodzaj: "linia", punkty: r.prognoza.map((p) => ({ x: p.x, y: p.wartosc })) });
      break;
    }
  }
  ograniczenia.push(...wynik.uwagi);
  limit(czystaTabela(wynik), wynik.wiersze.length);
  return wynik;
}

/** Wspólne pobranie pełnych tabel i obliczenia. Wywołujący zatwierdza plan, jeśli zawiera analizę. */
export async function materializujPlanDanych(plan: PlanAnalizy, wywolaj: Wywolaj, ograniczeniaPoczatkowe: string[] = []) {
  const p = planSchema.parse(plan);
  limit(p);
  const dane = new Map<string, Tabela>(), zrodla: ZrodloRaportu[] = [], metody: string[] = [], ograniczenia = [...p.ograniczenia, ...ograniczeniaPoczatkowe], wykresy: Wiersz[] = [];
  const wykresyRaportu: WykresRaportu[] = [];
  const wywolania = new Map<string, Promise<any>>();
  const odczyt: Wywolaj = async (narzedzie, argumenty) => {
    const key = kanoniczny({ narzedzie, argumenty });
    if (!wywolania.has(key)) wywolania.set(key, wywolaj(narzedzie, argumenty));
    return wywolania.get(key)!;
  };
  const cache = new Map<string, Awaited<ReturnType<typeof pobierz>>>();
  for (const s of p.zrodla) {
    const key = kanoniczny({ narzedzie: s.narzedzie, argumenty: s.argumenty, dzielnica_z_geometrii: s.dzielnica_z_geometrii ?? false });
    if (!cache.has(key)) cache.set(key, await pobierz(s, odczyt));
    const { rows, r, notatki } = cache.get(key)!;
    const data_stanu = typeof r.data_stanu === "string" ? r.data_stanu : s.data_stanu;
    if (r.data_stanu && s.data_stanu && r.data_stanu !== s.data_stanu) throw new Error(`${s.id}: data stanu źródła różni się od zatwierdzonego planu.`);
    const bdlUnits = s.narzedzie === "bdl_dane" ? unikat(rows.map((w) => w.jednostka_miary).filter((u): u is string => typeof u === "string" && !!u)) : [];
    if (bdlUnits.length > 1) throw new Error(`${s.id}: różne jednostki BDL w jednym źródle; rozdziel zmienne w planie.`);
    const jednostkaZrodla = s.narzedzie === "wskaznik_dzielnic" ? r.wskaznik?.jednostka : s.narzedzie === "bdl_dane" ? bdlUnits[0] : r.jednostka;
    if (typeof jednostkaZrodla === "string" && s.jednostka && jednostkaZrodla !== s.jednostka) throw new Error(`${s.id}: jednostka źródła '${jednostkaZrodla}' różni się od zatwierdzonej '${s.jednostka}'.`);
    const unit = typeof jednostkaZrodla === "string" ? jednostkaZrodla : s.jednostka;
    const poziom = typeof r.poziom === "string" ? r.poziom : s.poziom;
    const notes = [...notatki];
    if (!rows.length) notes.push("Zero wierszy nie dowodzi braku zjawiska: sprawdź filtr, zakres i słownik źródła.");
    if (!data_stanu) notes.push("Nieznana data stanu danych; czas pobrania jej nie zastępuje.");
    if (!unit) notes.push("Jednostka miary nie została potwierdzona dla źródła.");
    if (!poziom) notes.push("Poziom agregacji źródła nie został potwierdzony.");
    if (!s.definicja && !r.definicja) notes.push("Definicja miary nie została opisana w planie ani przez źródło.");
    let wiersze = rows.map((w) => Object.fromEntries(Object.entries(w).filter(([k]) => k !== "_geometria")));
    if (s.dzielnica_pole || s.dzielnica_z_geometrii) {
      if (s.dzielnica_pole && wiersze.length && !kolumny(wiersze).includes(s.dzielnica_pole)) throw new Error(`${s.id}: brak kolumny dzielnicy '${s.dzielnica_pole}'.`);
      if (wiersze.some((w) => Object.hasOwn(w, "dzielnica_id"))) throw new Error(`${s.id}: kolizja kolumny dzielnica_id.`);
      let nierozpoznane = 0, konflikty = 0, brakGeometrii = 0;
      wiersze = wiersze.map((w, i) => {
        const opis = s.dzielnica_pole ? dzielnicaId(w[s.dzielnica_pole]) : null;
        const g = rows[i]._geometria as { lat?: number; lon?: number; srodek?: { lat?: number; lon?: number } } | undefined;
        const punkt = g?.srodek ?? g;
        const przestrzenny = punkt && typeof punkt.lat === "number" && typeof punkt.lon === "number" && Number.isFinite(punkt.lat) && Number.isFinite(punkt.lon) ? dzielnicaPunktu(punkt.lat, punkt.lon) : null;
        if (s.dzielnica_z_geometrii && przestrzenny == null) brakGeometrii++;
        if (s.dzielnica_z_geometrii && s.dzielnica_pole && (opis !== przestrzenny || opis == null && w[s.dzielnica_pole] != null)) konflikty++;
        const d = s.dzielnica_z_geometrii ? przestrzenny : opis;
        if (d == null) nierozpoznane++;
        return { ...w, dzielnica_id: d };
      });
      notes.push(`Normalizacja dzielnic (${s.dzielnica_z_geometrii ? "geometria MSIP" : `pole '${s.dzielnica_pole}'`}): nierozpoznane rekordy ${nierozpoznane}; zachowano je z dzielnica_id=null, bez zgadywania. Konflikty opisu z geometrią: ${konflikty}; brak punktu w dzielnicach: ${brakGeometrii}.`);
    }
    const cols = kolumny(wiersze);
    const meta = new Map(cols.map((k) => [k, { jednostka: unit, data_stanu, poziom }]));
    const url = adresZrodla(s, r);
    if (!url) notes.push("Źródło nie podało adresu publikacji; bibliografia wymaga jego uzupełnienia.");
    zrodla.push({ id: s.id, nazwa: s.nazwa ?? String(r.zrodlo ?? s.narzedzie), narzedzie: s.narzedzie, argumenty: s.argumenty, pobrano: typeof r._dowod?.pobrano === "string" ? r._dowod.pobrano : new Date().toISOString(), data_stanu, url, definicja: r.definicja ?? s.definicja, jednostka: unit, poziom, kompletne: true, uwagi: notes });
    dane.set(s.id, { id: s.id, tytul: s.nazwa ?? s.id, kolumny: cols, wiersze, zrodla: [s.id], uwagi: notes, meta });
    metody.push(`${s.id}: odczyt ${s.narzedzie}, ${wiersze.length} wierszy; paginację źródeł tabelarycznych zakończono przed obliczeniami. Argumenty odczytu zachowano w bibliografii.`);
    ograniczenia.push(...notes);
  }
  for (const o of p.operacje) dane.set(o.id, oblicz(o, dane, metody, ograniczenia, wykresy, wykresyRaportu));
  const tabele = [...dane.values()].map(czystaTabela);
  limit(tabele, tabele.reduce((n, t) => n + t.wiersze.length, 0));
  return { tabele, zrodla, metody, ograniczenia, wykresy, wykresyRaportu };
}

/** Zwraca dane dla wspólnego opakowania MCP/API; raport zostaje w structuredContent. */
export async function wykonajAnalize(args: unknown, wywolaj: Wywolaj): Promise<Record<string, unknown>> {
  const a = analizaSchema.parse(args), p = a.plan;
  limit(p);
  const id_planu = await hash(p);
  const deklaracja = "Zatwierdzenie planu w rozmowie jest deklaracją, nie uwierzytelnionym dowodem zgody. Interpretację modelu należy wyraźnie oddzielić od wyników obliczeń.";
  if (a.tryb === "sprawdz") {
    const metadane = await sprawdzMetadane(p, wywolaj);
    return { tryb: "sprawdz", id_planu, plan: p, metadane, wymagane_zatwierdzenie: true, tytul: p.tytul, podtytul: "Plan do zatwierdzenia w rozmowie", zrodlo: "Metadane źródeł; pełna analiza nie została wykonana", bloki: [{ typ: "tekst", tekst: `${p.pytanie}\n\nŹródła: ${p.zrodla.map((s) => s.id).join(", ")}. Operacje: ${p.operacje.map((o) => `${o.id} (${o.typ})`).join(", ") || "odczyt tabel"}.\n\n${deklaracja}` }], uwagi: [deklaracja, "Brak daty stanu, definicji, jednostki lub poziomu ogranicza porównywalność; metadane wejściowe są deklaracją planu, nie niezależnym potwierdzeniem."] };
  }
  if (a.id_planu !== id_planu) throw new Error("Identyfikator id_planu nie zgadza się z aktualnym planem; ponów sprawdzenie i zatwierdzenie.");
  const { tabele, zrodla, metody, ograniczenia, wykresy, wykresyRaportu } = await materializujPlanDanych(p, wywolaj, [deklaracja]);
  // Podgląd może zawierać tylko część tabel/wierszy; pełne dane zostają w raporcie i eksporcie.
  const widoczne = tabele.slice(-Math.min(4, tabele.length));
  const bloki: Wiersz[] = widoczne.map((t) => ({ typ: "tabela", tytul: t.tytul, kolumny: t.kolumny.slice(0, 10), wiersze: t.wiersze.slice(0, 200).map((w) => t.kolumny.slice(0, 10).map((k) => w[k] == null ? null : typeof w[k] === "object" ? JSON.stringify(w[k]) : w[k])), razem: t.wiersze.length }));
  bloki.push(...wykresy.slice(-Math.max(0, 7 - bloki.length)).map((b) => ({ ...b, ...(typeof b.jednostka === "string" ? { jednostka: b.jednostka.slice(0, 20) } : {}) })));
  ograniczenia.push(`Podgląd karty pokazuje do 4 ostatnich tabel, po 200 wierszy i 10 kolumn; pełny raport zawiera wszystkie ${tabele.length} tabel. Wyniki obliczeń nie zawierają interpretacji ani rekomendacji modelu.`);
  const raport: RaportAnalityczny & { wykresy: WykresRaportu[] } = { wersja: "1", tytul: p.tytul, pytanie: p.pytanie, utworzono: new Date().toISOString(), id_planu, plan: p, zatwierdzenie: a.zatwierdzenie!, tabele, zrodla, metody, ograniczenia: unikat(ograniczenia), wnioski: [], wykresy: wykresyRaportu };
  const tekstOgraniczen = raport.ograniczenia.join("\n\n");
  bloki.push({ typ: "tekst", wariant: "uwaga", tekst: tekstOgraniczen.length > 2000 ? `${tekstOgraniczen.slice(0, 1850)}\n\nDalsze ograniczenia oraz pełna bibliografia znajdują się w raporcie i eksporcie.` : tekstOgraniczen });
  const wynik = { tryb: "wykonaj", id_planu, tytul: p.tytul, podtytul: p.pytanie.slice(0, 200), zrodlo: zrodla.map((s) => `${s.nazwa}; stan: ${s.data_stanu ?? "nieznany"}`).join("; ").slice(0, 300), bloki, raport };
  limit(wynik, tabele.reduce((n, t) => n + t.wiersze.length, 0));
  return wynik;
}

export interface MagazynMigawek {
  get(k: string): Promise<{ json(): Promise<any> } | null>;
  put(k: string, v: string): Promise<unknown>;
}
/** Dotyczy wyłącznie odczytów analitycznych. Nigdy realtime ani rozmów. */
export async function zMigawka<T extends Record<string, any>>(m: MagazynMigawek | undefined, klucz: string, pobierz: () => Promise<T>, czasTestowy?: number): Promise<T & { _migawka: { archiwalne: boolean; pobrano: string; wiek_s: number; data_stanu: unknown } }> {
  const teraz = () => czasTestowy ?? Date.now();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(klucz));
  const k = `analityka/v1/${Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("")}`;
  const opisz = (dane: T, pobrano: number, archiwalne: boolean) => ({ ...dane, _migawka: { archiwalne, pobrano: new Date(pobrano).toISOString(), wiek_s: Math.max(0, Math.floor((teraz() - pobrano) / 1000)), data_stanu: dane.data_stanu ?? null } });
  try {
    const dane = await pobierz();
    const pobrano = teraz();
    // Niepowodzenie zapisu nie zmienia udanego odczytu źródła w awarię.
    if (m) await m.put(k, JSON.stringify({ pobrano, dane })).catch(() => {});
    return opisz(dane, pobrano, false);
  } catch (e) {
    const kopia = await m?.get(k).then(x => x?.json()).catch(() => null);
    if (!kopia || !Number.isFinite(kopia.pobrano) || teraz() < kopia.pobrano || teraz() - kopia.pobrano > 86_400_000 || !kopia.dane) throw e;
    return opisz(kopia.dane, kopia.pobrano, true);
  }
}

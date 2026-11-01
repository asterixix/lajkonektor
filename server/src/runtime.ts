import { AsyncLocalStorage } from "node:async_hooks";
import type { MagazynMigawek } from "./migawki.ts";
export interface Runtime {
  sygnal?: AbortSignal;
  migawki?: MagazynMigawek;
  nominatim?: { fetch(r: Request): Promise<Response> };
  produkcja?: boolean;
  warstwy?: Record<string, unknown>[];}
export const runtime = new AsyncLocalStorage<Runtime>();
export function czekaj(ms: number, sygnal?: AbortSignal): Promise<void> {
  sygnal?.throwIfAborted();
  return new Promise((ok, blad) => {
    const anuluj = () => { clearTimeout(timer); sygnal?.removeEventListener("abort", anuluj); blad(sygnal?.reason ?? new Error("Anulowano.")); };
    const timer = setTimeout(() => { sygnal?.removeEventListener("abort", anuluj); ok(); }, ms);
    sygnal?.addEventListener("abort", anuluj, { once: true });
  });
}

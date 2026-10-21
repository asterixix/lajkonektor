import test from "node:test";

// Testy „na żywo" biją w prawdziwe API miasta, GUS, ZTP i OSM: zajmują 5–240 s
// i wypadają bez internetu. Domyślnie pomijane, żeby `npm test` działał offline.
// Uruchomienie wszystkiego: NA_ZYWO=1 npm test  (pwsh: $env:NA_ZYWO="1"; npm test)
export function naZywo(name: string, opts: { timeout?: number }, fn: () => Promise<void>): void {
  if (process.env.NA_ZYWO === "1") test(name, opts, fn);
  else test.skip(name, opts, fn);
}

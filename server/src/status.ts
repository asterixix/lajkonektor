// Diagnostyka dostępności źródeł z miejsca, w którym działa Worker (colo i kraj to dane z Cloudflare).
const CELE = [
  "https://api.um.krakow.pl/opendata-srodowisko-parki-miejskie/v1/metadata",
  "https://msip3.um.krakow.pl/server/rest/services?f=json",
  "https://bdl.stat.gov.pl/api/v1/subjects?format=json&page-size=1",
  "https://gtfs.ztp.krakow.pl/",
  "https://mkuran.pl/gtfs/",
];

export async function statusZrodel(cf: { colo?: string; country?: string } | undefined) {
  const testy = await Promise.all(
    CELE.map(async (u) => {
      const t0 = Date.now();
      const host = new URL(u).host;
      try {
        const r = await fetch(u, { headers: { "user-agent": "lajkonektor-status" }, signal: AbortSignal.timeout(15_000) });
        return { host, status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        return { host, blad: (e as Error).message, ms: Date.now() - t0 };
      }
    }),
  );
  return {
    worker: { colo: cf?.colo ?? null, kraj: cf?.country ?? null },
    uwaga: "status 200 = źródło dostępne z tego miejsca; 522/timeout = serwer źródła nie odpowiada na połączenia z tego regionu.",
    testy,
  };
}

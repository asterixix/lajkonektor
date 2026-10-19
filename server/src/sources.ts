// Cienkie wrappery na publiczne API miasta. Bez kluczy, tylko odczyt.
const UA = "lajkonektor/0.1 (konkurs Open Data App Krakow)";
const TIMEOUT_MS = 25_000;

export const OD_BASE = "https://api.um.krakow.pl";
export const MSIP = "https://msip3.um.krakow.pl/server/rest/services";

export async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url.split("?")[0]}`);
  return res.json();
}

async function postForm(url: string, body: URLSearchParams): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res.json();
}

// ArcGIS zwraca błędy z HTTP 200, więc trzeba sprawdzić pole `error`.
// Długie zapytania (geometria wielu obiektów) idą przez POST, bo limit długości URL jest niski.
export async function arcgisQuery(layerUrl: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ f: "json", ...params });
  const json = qs.toString().length > 1500 ? await postForm(`${layerUrl}/query`, qs) : await getJson(`${layerUrl}/query?${qs}`);
  if (json.error) throw new Error(`ArcGIS: ${json.error.message ?? "błąd"} (${layerUrl.split("/services/")[1]})`);
  return json;
}

export const odGet = (path: string) => getJson(`${OD_BASE}${path}`);

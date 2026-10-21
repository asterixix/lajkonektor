export class BladApi extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function wywolajApi(
  nazwa: string,
  argumenty: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): Promise<any> {
  let odp: Response;
  try {
    odp = await fetchFn("/api/wywolaj", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazwa, argumenty }),
    });
  } catch {
    throw new BladApi("Nie udało się połączyć z serwerem. Sprawdź łącze i spróbuj ponownie.", 0);
  }
  const j = await odp.json().catch(() => ({}));
  if (!odp.ok) throw new BladApi(j.blad ?? "Serwer zwrócił błąd.", odp.status);
  return j;
}

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { addressToPoint, listParks, mpzpAtPoint, populationWithin } from "./core.ts";
import { parkGeometry } from "./parki.ts";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// Wspólne opakowanie: wynik jako tekst JSON (dla każdego klienta) + structuredContent; błąd jako isError.
async function run(fn: () => Promise<Record<string, unknown>>) {
  try {
    const data = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
  } catch (e) {
    return { isError: true, content: [{ type: "text" as const, text: `Błąd źródła danych: ${(e as Error).message}` }] };
  }
}

const lat = z.number().min(49.9).max(50.2).describe("Szerokość geograficzna WGS84 w granicach Krakowa, np. 50.0614");
const lon = z.number().min(19.7).max(20.2).describe("Długość geograficzna WGS84 w granicach Krakowa, np. 19.9372");

export function createServer(): McpServer {
  const server = new McpServer({ name: "lajkonektor", version: "0.1.0" });

  server.registerTool(
    "parki_lista",
    {
      title: "Parki Krakowa",
      description:
        "Lista parków miejskich lub kieszonkowych Krakowa z Otwartych Danych UMK (nazwa, typ, dzielnica, powierzchnia w ha). Bez geometrii.",
      inputSchema: z.object({
        rodzaj: z.enum(["miejskie", "kieszonkowe"]).default("miejskie"),
        dzielnica: z.string().optional().describe("Fragment nazwy dzielnicy, np. 'Podgórze' lub 'VII'"),
      }),
      annotations: readOnly,
    },
    ({ rodzaj, dzielnica }) => run(() => listParks({ rodzaj, dzielnica })),
  );

  server.registerTool(
    "mpzp_w_punkcie",
    {
      title: "Plan miejscowy w punkcie",
      description:
        "Przeznaczenie terenu z miejscowego planu zagospodarowania przestrzennego (MPZP) w punkcie (MSIP Kraków). Symbole ZP oznaczają tereny zieleni.",
      inputSchema: z.object({ lat, lon }),
      annotations: readOnly,
    },
    ({ lat, lon }) => run(() => mpzpAtPoint(lat, lon)),
  );

  server.registerTool(
    "ludnosc_w_promieniu",
    {
      title: "Zameldowani w promieniu",
      description:
        "Liczba osób zameldowanych na pobyt stały w siatce heksagonów 100 m w promieniu od punktu (MSIP Kraków, najnowszy snapshot). Do wskaźników dostępności usług.",
      inputSchema: z.object({ lat, lon, promien_m: z.number().int().min(50).max(3000).default(500) }),
      annotations: readOnly,
    },
    ({ lat, lon, promien_m }) => run(() => populationWithin(lat, lon, promien_m)),
  );

  server.registerTool(
    "adres_na_punkt",
    {
      title: "Adres na współrzędne",
      description:
        "Geokodowanie adresu w Krakowie (punkty adresowe MSIP): zwraca lat/lon, kod pocztowy i dzielnicę. Użyj przed narzędziami przyjmującymi lat/lon.",
      inputSchema: z.object({
        ulica: z.string().min(2).describe("Nazwa ulicy, np. 'Telimeny' (bez 'ul.'; polskie litery opcjonalne)"),
        numer: z.string().describe("Numer budynku dokładnie jak w adresie, np. '11' lub '4A'"),
        kod_pocztowy: z.string().optional().describe("Opcjonalnie, np. '30-838', gdy ulica powtarza się w mieście"),
      }),
      annotations: readOnly,
    },
    (args) => run(() => addressToPoint(args)),
  );

  server.registerTool(
    "parki_geometria",
    {
      title: "Parki z geometrią (OSM)",
      description:
        "Parki miejskie z tabeli OD uzupełnione o dopasowaną geometrię z OpenStreetMap: środek, ramka, powierzchnia OSM i miara zgodności. Pokrycie jest częściowe (patrz pole 'pokrycie').",
      inputSchema: z.object({
        nazwa: z.string().optional().describe("Fragment nazwy parku, np. 'Jordana'"),
        dzielnica: z.string().optional().describe("Fragment nazwy dzielnicy, np. 'Podgórze'"),
        tylko_z_geometria: z.boolean().default(false),
      }),
      annotations: readOnly,
    },
    (args) => run(async () => parkGeometry(args)),
  );

  return server;
}

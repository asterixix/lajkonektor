import { useEffect, useMemo, useRef, useState } from "react";
import { WIDOKI } from "../../../ui/src/widoki/rejestr.ts";
import { konfiguracja } from "../../../ui/src/mapa.ts";
import type { Widok } from "../../../ui/src/widoki/typy.ts";
import { utworzCtx } from "../karta.ts";
import { wywolajApi } from "../api.ts";
import kartaCss from "../../../ui/src/styles.css?inline";

// Karta z ui/src w Shadow DOM. Style z ui/src/styles.css, :root zamienione na :host, żeby nie wyciekały na stronę.
export function KartaMostek({ dane, onZmiana }: { dane: any; onZmiana?: (d: any) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cien = useRef<ShadowRoot | null>(null);
  const [wersja, setWersja] = useState(0);
  const ctx = useMemo(() => utworzCtx({
    wywolaj: wywolajApi,
    otworz: (url) => window.open(url, "_blank", "noopener"),
    onZmiana: (d) => { onZmiana?.(d); setWersja((v) => v + 1); },
  }), [onZmiana]);

  useEffect(() => {
    if (!host.current) return;
    cien.current ??= host.current.attachShadow({ mode: "open" });
    const root = cien.current;
    const widok = (WIDOKI as Record<string, Widok>)[dane._widok];
    // W iframe MCP Apps adres kafelków ustawia main.ts karty; tu robimy to sami, a nagrania (bez _kafelki) biorą kafelki z tego serwera.
    konfiguracja.kafelki = dane._kafelki ?? `${window.location.origin}/kafelki/{z}/{x}/{y}.png`;
    root.innerHTML = `<style>${kartaCss.replace(/:root/g, ":host")}
:host{--lk-logo:url(/logo.png)}</style><div class="karta-korzen"></div>`;
    const korzen = root.querySelector(".karta-korzen") as HTMLElement;
    korzen.innerHTML = widok ? widok.render(dane, ctx) : "<p>Nie ma karty dla tego wyniku.</p>";
    widok?.podlacz?.(korzen, dane, ctx);
    // Strona ma własne h1; tytuł karty jest śródtytułem (WCAG 1.3.1).
    korzen.querySelectorAll("h1").forEach((h) => { h.setAttribute("role", "heading"); h.setAttribute("aria-level", "3"); });
  }, [dane, ctx, wersja]);

  return <div ref={host} className="karta-mostek" />;
}

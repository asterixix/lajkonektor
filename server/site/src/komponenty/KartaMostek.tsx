import { useEffect, useMemo, useRef, useState } from "react";
import { WIDOKI } from "../../../ui/src/widoki/rejestr.ts";
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
    root.innerHTML = `<style>${kartaCss.replace(/:root/g, ":host")}</style><div class="karta-korzen"></div>`;
    const korzen = root.querySelector(".karta-korzen") as HTMLElement;
    korzen.innerHTML = widok ? widok.render(dane, ctx) : "<p>Nie ma karty dla tego wyniku.</p>";
    widok?.podlacz?.(korzen, dane, ctx);
  }, [dane, ctx, wersja]);

  return <div ref={host} className="karta-mostek" />;
}

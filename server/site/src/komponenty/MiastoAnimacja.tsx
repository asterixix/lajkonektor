import { DZIELNICE_TLO, WISLA_TLO } from "../dzielniceTlo.ts";

export function MiastoAnimacja() {
  return <svg className="hero-mapa miasto-budowa" aria-hidden="true" viewBox="2722 12633 206758 121474" preserveAspectRatio="xMidYMid meet">
    <g fillRule="evenodd" strokeLinejoin="round">{DZIELNICE_TLO.map((d, i) => <path key={i} d={d} pathLength={1} style={{ animationDelay: `${i * 0.22}s` }} />)}</g>
    <path className="wisla" d={WISLA_TLO} fill="none" strokeWidth="1100" />
  </svg>;
}

export function PolaczenieAnimacja() {
  return <div className="polaczenie-ai" aria-label="Schemat: źródła danych, serwer MCP, Twoje AI i ocena człowieka">
    <span>Dane miasta</span><i aria-hidden="true"/><strong>Lajkonektor<span>MCP</span></strong><i aria-hidden="true"/><span>Twoje AI</span>  </div>;
}

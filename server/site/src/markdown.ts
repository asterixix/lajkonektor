// Markdown odpowiedzi modelu → bezpieczny HTML. markdown-it z wyłączonym surowym HTML (`html: false`) escapuje znaczniki,
// a jego `validateLink` odrzuca javascript:, vbscript:, file: i data:. Dodajemy: linki w nowej karcie z rel noopener,
// tabele w przewijanym kontenerze i brak obrazków (model nie ma po co ładować zewnętrznych zasobów na stronie).
// Klikalne są tylko linki do zaufanych hostów: opis zbioru z dane.gov.pl (publikują tam obcy) mógłby podsunąć modelowi
// link z mylącą etykietą. Pozostałe adresy pokazujemy jako zwykły tekst z widocznym URL-em.
import MarkdownIt from "markdown-it";

const ZAUFANE_HOSTY = ["gov.pl", "krakow.pl", "openstreetmap.org", "wikimedia.org", "europa.eu"];
const zaufany = (href: string) => {
  try {
    const h = new URL(href).hostname.toLowerCase();
    return ZAUFANE_HOSTY.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });

// Stos zamknięć odpowiadających otwartym linkom (w `env`, więc osobny dla każdego renderu).
type Env = { zamkniecia?: string[] };
md.renderer.rules.link_open = (tokens, i, _o, env: Env) => {
  const href = tokens[i].attrGet("href") ?? "";
  const stos = (env.zamkniecia ??= []);
  if (zaufany(href)) {
    stos.push("</a>");
    return `<a href="${md.utils.escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
  }
  // Autolink (sam URL w tekście) już pokazuje adres; link z etykietą dostaje adres w nawiasie.
  stos.push(tokens[i].markup === "linkify" ? "" : ` (${md.utils.escapeHtml(href)})`);
  return "";
};
md.renderer.rules.link_close = (_t, _i, _o, env: Env) => env.zamkniecia?.pop() ?? "";
md.renderer.rules.table_open = () => '<div class="md-tabela" tabindex="0" role="region" aria-label="Tabela w odpowiedzi"><table>';
md.renderer.rules.table_close = () => "</table></div>";
md.renderer.rules.image = (tokens, i) => md.utils.escapeHtml(tokens[i].content || tokens[i].attrGet("alt") || "");

export function renderujMarkdown(tekst: string): string {
  return md.render(tekst, {});
}

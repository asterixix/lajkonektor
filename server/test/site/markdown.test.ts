import { test } from "node:test";
import assert from "node:assert/strict";
import { renderujMarkdown as r } from "../../site/src/markdown.ts";

test("markdown: nagłówki, pogrubienie, kursywa, kod i cytat", () => {
  const h = r("## Tytuł\n\n**gruby** i *kursywa* oraz `kod`\n\n> cytat\n\n---");
  assert.match(h, /<h2>Tytuł<\/h2>/);
  assert.match(h, /<strong>gruby<\/strong>/);
  assert.match(h, /<em>kursywa<\/em>/);
  assert.match(h, /<code>kod<\/code>/);
  assert.match(h, /<blockquote>/);
  assert.match(h, /<hr>/);
});

test("markdown: listy numerowane, punktowane i zagnieżdżone", () => {
  const h = r("1. pierwszy\n2. drugi\n\n- a\n  - zagnieżdżony\n- b");
  assert.match(h, /<ol>\s*<li>pierwszy<\/li>/);
  assert.match(h, /<ul>\s*<li>a\s*<ul>\s*<li>zagnieżdżony<\/li>/);
});

test("markdown: tabela trafia do przewijanego kontenera dostępnego z klawiatury", () => {
  const h = r("| Dzielnica | Liczba |\n|---|---|\n| Dębniki | 36 |");
  assert.match(h, /<div class="md-tabela" tabindex="0" role="region"[^>]*><table>/);
  assert.match(h, /<th>Dzielnica<\/th>/);
  assert.match(h, /<td>36<\/td>\s*<\/tr>\s*<\/tbody>\s*<\/table><\/div>/);
});

test("markdown: bloki kodu i łamanie linii", () => {
  assert.match(r("```\nx = 1\n```"), /<pre><code>x = 1\n<\/code><\/pre>/);
  assert.match(r("linia 1\nlinia 2"), /linia 1<br>\s*linia 2/);
});

test("markdown: linki otwierają się w nowej karcie z rel noopener, a adresy URL w tekście stają się linkami", () => {
  const h = r("[GUS](https://bdl.stat.gov.pl) i https://dane.gov.pl");
  assert.match(h, /<a href="https:\/\/bdl\.stat\.gov\.pl" target="_blank" rel="noopener noreferrer nofollow">GUS<\/a>/);
  assert.match(h, /href="https:\/\/dane\.gov\.pl"/);
});

test("bezpieczeństwo: surowy HTML jest escapowany, a niebezpieczne protokoły nie tworzą linków", () => {
  const h = r('<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) [y](data:text/html;base64,AAAA) [z](vbscript:x)');
  assert.doesNotMatch(h, /<script|<img|onerror=alert\(1\)>|href="javascript|href="data:|href="vbscript/i);
  assert.match(h, /&lt;script&gt;/);
});

test("bezpieczeństwo: obrazki z markdownu nie ładują zewnętrznych zasobów", () => {
  const h = r("![alt](https://evil.example/pixel.png)");
  assert.doesNotMatch(h, /<img|evil\.example/);
  assert.match(h, /alt/);
});

test("pusty tekst daje pusty wynik", () => {
  assert.equal(r("").trim(), "");
});

test("linki: klikalne tylko zaufane hosty, obce pokazują adres jako tekst", () => {
  const obcy = r("[Oficjalne dane](https://evil.example/login) i https://evil.example/x");
  assert.doesNotMatch(obcy, /<a /);
  assert.match(obcy, /Oficjalne dane \(https:\/\/evil\.example\/login\)/);
  assert.match(obcy, /i https:\/\/evil\.example\/x/);
  // Domena udająca zaufaną nie przechodzi, subdomena prawdziwej tak.
  assert.doesNotMatch(r("[x](https://gov.pl.evil.example)"), /<a /);
  assert.doesNotMatch(r("[x](https://notgov.pl)"), /<a /);
  assert.match(r("[x](https://api.dane.gov.pl/a)"), /<a href="https:\/\/api\.dane\.gov\.pl\/a"/);
  // Dwa linki obok siebie: zamknięcia nie mieszają się.
  const dwa = r("[a](https://dane.gov.pl) [b](https://evil.example)");
  assert.equal((dwa.match(/<\/a>/g) ?? []).length, 1);
  assert.match(dwa, /b \(https:\/\/evil\.example\)/);
});

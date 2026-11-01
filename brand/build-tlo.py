"""Tło hero: mapa dzielnic Krakowa z zrodlo-krakow-dzielnice.svg przekształcona jak mapy parków (biel na niebieskim tle strony).

Uruchom z katalogu brand/:  python -X utf8 -I build-tlo.py
Wynik: brand/mapa-dzielnice-biala.svg oraz kopia dla strony server/site/public/mapa-krakowa.svg.
Źródło: Wikimedia Commons, „Kraków dzielnice blank.svg", autor Slawojar, CC BY-SA 3.0 (praca zależna, ta sama licencja; atrybucja w stopce strony): dzielnice to ścieżki `fil0`, Wisła to `fil1 str1`,
obwiednia `rect` to ramka arkusza i odpada. Dzielnice dostają białą wypełnioną powierzchnię i obrys w kolorze tła hero (granice widać jako
cienkie linie), a Wisła ciemny kanał w kolorze tła, jak woda na białym lądzie.
"""
import re
import shutil
from pathlib import Path

TLO_HERO = "#00488E"  # --lk-niebieski-ciemny, tło hero
korzen = Path(__file__).resolve().parent
zrodlo = (korzen / "zrodlo-krakow-dzielnice.svg").read_text(encoding="utf-8")

dzielnice = re.findall(r'<path\s+class="fil0 str0"\s+d="([^"]+)"', zrodlo)
wisla = re.findall(r'<path\s+class="fil1 str1"\s+d="([^"]+)"', zrodlo)
assert dzielnice and len(wisla) == 1, (len(dzielnice), len(wisla))

# Ramka arkusza (rect) wyznacza kadr; ścieżki w źródle są powtórzone (kontur i wypełnienie), więc scalamy je w jedną grupę.
kadr = re.search(r'<rect\s+class="fil1 str2"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"', zrodlo)
x, y, w, h = (int(v) for v in kadr.groups())

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w // 100}" height="{h // 100}">\n'
    f'<g fill="#FFFFFF" fill-opacity=".92" fill-rule="evenodd" stroke="{TLO_HERO}" stroke-width="380" stroke-linejoin="round">\n'
    + "\n".join(f'<path d="{d}"/>' for d in dzielnice)
    + "\n</g>\n"
    f'<path d="{wisla[0]}" fill="none" stroke="{TLO_HERO}" stroke-width="1100" stroke-linecap="round" stroke-linejoin="round"/>\n'
    "</svg>\n"
)
wyjscie = korzen / "mapa-dzielnice-biala.svg"
wyjscie.write_text(svg, encoding="utf-8")
cel = korzen.parent / "server" / "site" / "public" / "mapa-krakowa.svg"
shutil.copyfile(wyjscie, cel)
print(f"{wyjscie.name}: {len(dzielnice)} ścieżek dzielnic, {len(svg) // 1024} KB → {cel.relative_to(korzen.parent)}")

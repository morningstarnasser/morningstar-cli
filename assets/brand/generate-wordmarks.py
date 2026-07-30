#!/usr/bin/env python3
"""Generate outlined Morningstar wordmarks from the OFL-licensed STIX Two font."""

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
FONT = Path("/System/Library/Fonts/Supplemental/STIXTwoText.ttf")
TEXT = "MORNINGSTAR"


def outline(text: str, spacing: int = 70) -> str:
    font = instantiateVariableFont(TTFont(FONT), {"wght": 600}, inplace=False)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    metrics = font["hmtx"]
    pen = SVGPathPen(glyphs)
    x = 0
    for character in text:
        name = cmap[ord(character)]
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        x += metrics[name][0] + spacing
    return pen.getCommands()


MARK = """  <path fill="{primary}" fill-rule="evenodd" d="M32 4 37 22 52 12 42 27 60 32 42 37 52 52 37 42 32 60 27 42 12 52 22 37 4 32 22 27 12 12 27 22ZM24 21 30 21 42 32 30 43 24 43 36 32Z"/>
  <path fill="{secondary}" d="M27 22 12 12 22 27ZM37 22 52 12 42 27ZM42 37 52 52 37 42ZM22 37 12 52 27 42Z"/>"""


def render(filename: str, primary: str, secondary: str, lettering: str) -> None:
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 456 64" stroke="none">
<g transform="translate(2 0)">
{MARK.format(primary=primary, secondary=secondary)}
</g>
<path fill="{lettering}" transform="translate(82 46) scale(.043 -.043)" d="{outline(TEXT)}"/>
</svg>
"""
    (ROOT / filename).write_text(svg, encoding="utf-8")


render("wordmark.svg", "#B8753E", "#7F4B29", "#11100E")
render("wordmark-dark.svg", "#F4C27A", "#C98B52", "#FFF4E3")
render("wordmark-light.svg", "#B8753E", "#7F4B29", "#11100E")
render("wordmark-mono.svg", "#11100E", "#11100E", "#11100E")

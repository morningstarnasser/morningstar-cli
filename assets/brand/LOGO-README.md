# Morningstar CLI — Logo-System

## Kernidee

`Prompt Star` verbindet zwei Aussagen in einer Form: Der achtstrahlige
Morgenstern steht für Orientierung und einen klaren Ausgangspunkt; das im
Negativraum ausgesparte `>` steht für Terminal, Ausführung und Vorwärtsbewegung.
Das Chevron ist Bestandteil der Geometrie und darf nie entfernt oder mit einer
zweiten Farbe gefüllt werden.

Die Marke ist auf einem 64er-Raster konstruiert. Die langen Hauptstrahlen enden
bei 4/60, die diagonalen Strahlen bei 12/52. Die optisch korrigierte
Favicon-Version besitzt ein vergrössertes Chevron, damit die Doppellesbarkeit
bei 16 px erhalten bleibt.

## Palette

| Name | HEX | RGB | CMYK-Näherung |
|---|---:|---:|---:|
| Copper Glow | `#F4C27A` | 244, 194, 122 | 0, 20, 50, 4 |
| Burnished Copper | `#C98B52` | 201, 139, 82 | 0, 31, 59, 21 |
| Dawn Cream | `#FFF4E3` | 255, 244, 227 | 0, 4, 11, 0 |
| Terminal Ink | `#11100E` | 17, 16, 14 | 0, 6, 18, 93 |
| Light-Surface Copper | `#B8753E` | 184, 117, 62 | 0, 36, 66, 28 |

CMYK-Werte sind Startwerte. Für verbindlichen Druck sind Papier, Profil und
Proof ausschlaggebend.

## Dateien

- `logo.svg` — transparentes Vollfarben-Master.
- `logo-dark.svg` — für dunkle Flächen.
- `logo-light.svg` — kontrastverstärkt für helle Flächen.
- `logo-mono.svg` — einfarbiger Härtetest und Stempelversion.
- `wordmark*.svg` — Bildmarke plus vollständig in Pfade umgewandelter Schriftzug.
- `favicon.svg` / `favicon.ico` — optisch korrigierte Kleinversion.
- `png/logo-{16…1024}.png` — quadratische App-/Favicon-Exporte.
- `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` — Web-/PWA-Satz.
- `og-logo.png` — 1200 × 630 Social Preview.
- `proof/contact-sheet.png` — Varianten auf hell und dunkel.
- `proof/micro-scale.png` — 16-/32-/64-px-Prüfung.
- `concepts/` und `CONCEPTS.md` — die drei untersuchten Richtungen.

Die Wortmarke basiert auf den offenen Konturen von STIX Two Text (SIL Open Font
License), wird aber als reine Pfadgeometrie ausgeliefert. In den finalen SVGs
gibt es keine `<text>`-Elemente. `generate-wordmarks.py` reproduziert die
Outlines auf macOS; `build-assets.sh` erzeugt sämtliche Rasterformate erneut.

## Schutzzone und Mindestgrösse

- Schutzzone Bildmarke: rundum mindestens `x = 16/64` der Markenbreite.
- Schutzzone Wortmarke: mindestens die Höhe des `M` rundum.
- Digitale Mindestgrösse: `favicon.svg` ab 16 px; transparentes Master ab 24 px.
- Wortmarke: mindestens 140 px Breite digital.
- Print: Bildmarke mindestens 8 mm, Wortmarke mindestens 32 mm breit.

## Richtig

- Auf dunklen Flächen `logo-dark.svg`, auf hellen `logo-light.svg` verwenden.
- Rund um die Marke Ruhe lassen.
- Bei extrem kleinen Grössen immer die Favicon-Version einsetzen.
- Mono für Gravur, Stempel, Laser und einfarbigen Druck nutzen.

## Nicht

- Nicht drehen, stauchen, umranden oder mit Schatten versehen.
- Das Chevron nicht schliessen, verschieben oder separat einfärben.
- Keine Verläufe, Glow-Effekte oder weiteren Sterne hinzufügen.
- Nicht auf unruhige Bilder ohne ruhige Kontrastfläche setzen.
- Nicht mit Anthropic-/Claude-Marken, Maskottchen oder deren Wortbild kombinieren.

## Technische Qualität

Die Masterdateien verwenden nur Illustrator-kompatible `path`- und
`rect`-Geometrie, direkte Farbattribute und keine Filter, Masken oder
CSS-Klassen. Die Exportserie wurde bei 16, 32, 64, 256 und 1024 px gerendert;
Farbe, Invertierung und Mono wurden auf hellen und dunklen Flächen geprüft.

Ein visueller Kurzcheck vom 29. Juli 2026 zeigte verbreitete reine
Terminal-Chevrons sowie separat aufgesetzte Stern-Badges, aber keine identische
achtstrahlige Form mit konstruktiv ausgespartem Prompt. Die Marke bleibt bewusst
frei von Termux-, Anthropic- und Claude-spezifischer Geometrie.

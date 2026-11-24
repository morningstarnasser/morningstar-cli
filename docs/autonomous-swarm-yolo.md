# Automatischer Swarm und YOLO

Morningstar kann aus einer normalen Anfrage selbst einen Swarm starten. Das Modell bekommt ein natives `swarm`-Werkzeug und ein Text-Tool-Format. Die Anleitung empfiehlt Teams für unabhängige Teilaufgaben und direkte Bearbeitung für kleine, eng gekoppelte Aufgaben. Ob und wie gut ein Modell diese Möglichkeit nutzt, hängt vom gewählten Modell ab.

```bash
morningstar --yolo
morningstar --yolo -p "Implementiere API und Dokumentation parallel und prüfe beides"
```

`--yolo` ist ein Alias für `--dangerously-skip-permissions`. Tools werden in diesem Lauf automatisch freigegeben, einschliesslich Shell-Befehlen und Worker-Aktionen. Das Terminal zeigt `YOLO · auto`. Gespeicherte Berechtigungen werden nicht verändert. Ein nächster Start ohne Flag verwendet wieder die bisherigen Einstellungen.

Explizite Deny-/Ask-Regeln, Managed-Einstellungen, Tool-Allowlists, Hooks, Dateibereiche, Budgets und Abbruch bleiben wirksam. YOLO erweitert keine Worker-Dateibereiche und aktiviert keine rekursiven Swarms. Der Schalter steuert Werkzeugfreigaben und verändert keine Inhaltsregeln des Modellanbieters.

Die Bezeichnung orientiert sich an Clines [CLI-Option](https://github.com/cline/cline/blob/main/apps/cli/README.md). Morningstars Umsetzung unterstützt ausdrücklich die Kombination aus YOLO und Swarm; sie verspricht keine identische Implementierung.

## Ablauf und sichtbare Arbeit

1. Das Hauptmodell übergibt einen Plan mit Rollen, Aufgaben, Abhängigkeiten und Dateibereichen.
2. Der gemeinsame Runner prüft Berechtigungen und Hooks und validiert den Plan.
3. Disjunkte Tasks laufen parallel; überlappende Schreibbereiche und exklusive Shell-/Build-Tasks warten. Standard sind drei aktive Tasks, einstellbar von eins bis acht.
4. Die Live-Ansicht zeigt den Taskstatus, `/activity` die tatsächlichen Tool-Aktionen. Print mit `--output-format stream-json` liefert `swarm_start`, `swarm_progress`, `swarm_activity` und `swarm_end`.
5. Das Hauptmodell erhält Status und Berichte, kann Fehler korrigieren und weiterarbeiten und formuliert die gemeinsame Antwort.

Die bestehenden [UI- und Swarm-Regeln](ui-swarm-2026-11-24.md) gelten weiterhin. Agenten arbeiten standardmässig ohne Turn-Limit. Ein Plan enthält höchstens 50 Teilaufgaben; dies begrenzt die Teamgrösse, nicht die Anzahl Arbeitsschritte.

## Kontext, Fehler und Kosten

Worker erhalten den Systemkontext, den ursprünglichen Nutzerauftrag und die Berichte ihrer Voraussetzungen. Rollen- und Eltern-Allowlists werden geschnitten. Worker können keine weiteren Teams starten. Die an Provider gesendeten Tool-Schemas berücksichtigen diese Grenzen ebenfalls. Superbrain und Skills bleiben über den gemeinsamen Runner verfügbar.

Ein Task mit fehlgeschlagenen oder verweigerten Tools erhält konservativ den Status `failed`, auch wenn das Modell abschliessend Erfolg behauptet oder einen späteren Versuch als Lösung beschreibt. Abhängige Tasks starten dann nicht. Der Hauptagent erhält den Fehler und kann eine neue, korrigierte Teilaufgabe oder eine eigene Prüfung ausführen. Unabhängige Tasks laufen weiter.

Die Kostenkontrolle zählt Root und Worker gemeinsam. Im Headless-Ergebnis enthält `usage` die Root-Nutzung, `delegatedUsage` und `delegatedCostUsd` die Worker-Nutzung; `costUsd` enthält beide. Dadurch werden Worker im globalen Kostenverlauf nicht doppelt erfasst. JSON-Print enthält die gesamte Kostenschätzung in `cost_usd`, seine Tokenfelder bleiben Root-Nutzung. Bereits laufende Provider-Anfragen können ein Budget überschreiten.

Die neue Arbeitsanweisung verlangt, Anfragen aufzugreifen, Fähigkeiten und Zugriffe zu prüfen, Fehler zu korrigieren und konkrete Alternativen zu versuchen. Sie garantiert nicht, dass jedes Modell jede Inhaltsanfrage beantwortet. Sie wird nur an aktuelle Provider-Anfragen angehängt und wächst bei Fortsetzen einer Sitzung nicht im gespeicherten Verlauf an.

## Ausgeführte Verifikation

Die folgenden Prüfungen wurden ausgeführt; lokale Prüfdateien werden nicht mitgeliefert.

- Native und Text-Delegation, echte zeitliche Überlappung, Abhängigkeiten, Eltern-Synthese, Policy-/Hook-Grenzen, Abbruch, gemeinsames Budget, Rekursionssperre und Fehlermeldungen sind automatisiert getestet.
- Gebaute CLI im PTY mit `--yolo`: normale Anfrage ohne Slash-Befehl, zwei echte Dateischreibvorgänge parallel, nachgelagertes Review, Live-Ansicht, Textauswahl und echtes Clipboard. Screenshots stammen aus den aufgezeichneten ANSI-Daten.
- Print mit realem Shell-Tool im exklusiven Worker: ohne YOLO keine Dateierstellung und Fehlerstatus; mit YOLO echte Datei und Read-back ohne Freigabe-Anfrage.
- Provider-Antworten in diesen Integrationstests sind deterministische Fixtures. Sie belegen die Runtime, nicht die Planungsqualität oder Rechengeschwindigkeit des lokalen Modells.
- Detaillierter TUI-Verlauf: zwei echte Dateiänderungen gruppiert als `Edited 2 files (+4 -2)`, rote/grüne Diff-Zeilen und Zähler, echter Shell-Exit 1 mit Ausgabe. Farben wurden aus der Terminaldarstellung gelesen und die Screenshots visuell geprüft.
- Echte Tastatur-/Clipboard-Proben für Backspace ohne Markierung, Ctrl+H, gehaltene Rücktaste, Löschen mitten im Text, Vorwärts-Delete, Wortlöschen und Emoji.
- Typecheck, Build und 555 Tests grün; OSV: 0 Findings. Synthetischer Streaming-Check mit 601 Deltas: 2,50 s bis Terminalabschluss, weiter im bisherigen Bereich.

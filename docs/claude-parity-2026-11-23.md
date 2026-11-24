# Claude Code / Morningstar: Abgleich vom 23.11.2026

## Ergebnis und Grenze

Die öffentlich sichtbaren Einstellungen und Abläufe von Claude Code wurden mit Morningstar verglichen. Dieser Stand setzt die unten genannten Funktionen um. **Vollständige Funktionsgleichheit ist noch nicht erreicht.** Die offenen Bereiche stehen am Ende und bleiben in `PARITY.md` sichtbar.

Referenz: lokales `anthropics/claude-code`, Commit `3e8d8a9a8ebf93c4fab473f51a3c1b69c02f6617`, Changelog 2.1.330. Das Repository enthält Dokumentation, Beispiele und Mods, jedoch nicht die gesamte Claude-Laufzeit. Die Mods importieren die proprietäre `claude-code`-Plugin-API und lassen sich nicht unverändert in Morningstar laden. Die Umsetzung verwendet eigene Implementierungen des dokumentierten Verhaltens.

## In dieser Änderung umgesetzt

| Bereich | Verhalten und Nachweis |
|---|---|
| Einstellungen | User, Projekt, lokal, explizites `--settings` und verwaltete Datei; `--setting-sources`; strikte Validierung statt stiller Ignorierung. `claude-settings.test.ts`. |
| Vertrauensgrenze | Projektdateien dürfen standardmässig einschränken, aber keine Ausführungsrechte, Hooks oder Provider-Routen freischalten. `--trust-project` lädt diese bewusst. Verwaltete Regeln bleiben vorrangig. |
| Berechtigungen | `deny` vor `ask` vor `allow`, Sperre für Bypass, `allowManagedPermissionRulesOnly`, native Tool-Aliase, MCP-Namenswildcards, Datei- und Domain-Regeln. Auch direkte Bash-Aufrufe und Auto-Tests beachten Tool-Whitelist/Ask/Bypass-Sperre. |
| Tool-Auswahl | `--tools` ist eine Ausführungsbeschränkung; eine leere Liste sperrt alle Tools. Sie erteilt keine Berechtigung. Chat-Modus blockiert auch irrtümliche Tool-Aufrufe. |
| Command-Hooks | SessionStart/End, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure und Stop. JSON auf stdin, Arbeitsverzeichnis, Timeout, kanonische Tool-Namen und Dateifeld-Aliase. Fehlgeschlagene Hooks blockieren konservativ. Nur vertrauenswürdige Quellen werden ausgeführt. |
| Print/NDJSON | Text-Pipes werden bis EOF gelesen. NDJSON antwortet vor EOF und führt den Verlauf weiter. Nur Textnachrichten mit User-Rolle sind zulässig; Eingangslimit 8 MiB / 100 Nachrichten. `print-session.test.ts` und gebauter CLI-Smoke-Test. |
| Sitzungen | Print speichert und setzt echte Tool-Verläufe fort. `--continue` ist projektbezogen. `--name`, `--session-id`, expliziter Fork und `--no-session-persistence` für Print. Atomare Dateien mit 0600, Ordner 0700; beschädigte Einträge und Symlinks werden übersprungen. |
| Status für Skripte | Nicht erledigte Läufe, verweigerte/fehlgeschlagene Werkzeuge, Budget-/Turn-Limit und Schemafehler liefern einen Fehlerstatus. SIGINT liefert 130. |
| Strukturierte Ausgabe | `--json-schema` wird vor dem Provider-Aufruf mit Ajv geprüft; die tatsächliche Antwort wird ohne Typumwandlung validiert. Ergebnis bzw. Fehler im JSON/NDJSON-Vertrag. Keine Remote-Schema-Downloads und keine Garantie auf modellseitig erzwungene Tokens. |
| Projektanweisungen | MORNINGSTAR-Dateien plus AGENTS.md; CLAUDE.md als Fallback. Lokale Ergänzungen werden gelesen. Dateigrösse, Gesamtgrösse und Symlinks werden begrenzt. Schreiben bleibt in Morningstar-eigenen Dateien. Auch im Print-Modus. |
| Nebenfrage | `/btw <Frage>` übernimmt den bisherigen Kontext, führt keine Werkzeuge aus und schreibt die Antwort nicht in den Hauptverlauf. Während eines laufenden Auftrags wird die Frage eingereiht. |
| Worktree | `--worktree [name]` erstellt einen eigenen Branch ab HEAD. Offene Änderungen im Ausgangsrepo bleiben erhalten. Checkout-Hooks werden bei der Erstellung nicht ausgeführt. Der Worktree bleibt nach Ende zur Prüfung erhalten. |
| Weitere CLI-Eingaben | Positionsargument als Startprompt, `--append-system-prompt-file`, Sprache/Ausgabestil und Custom Instructions. Ungültige Limits und Sitzungs-IDs werden früh zurückgewiesen. |
| Sandbox | Das bisher unwirksame CLI-Flag aktiviert jetzt den vorhandenen OS-Shell-Sandbox-Pfad mit gesperrtem Netzwerk. Dies ist keine vollständige Claude-Sandbox-Parität. |
| Abhängigkeiten | Root- und Website-Lockfiles aktualisiert; zuvor gemeldete OSV-Funde beseitigt. |

## Einstellungen verwenden

Reihenfolge: **verwaltet > explizit > lokal > Projekt > User**. Regel-Arrays werden vereinigt, ausser eine verwaltete Only-Regel beschränkt die Quelle. Provider- und ausführbare Einstellungen aus einem nicht vertrauten Projekt werden nicht aktiviert. CLI-Argumente können die verwalteten Berechtigungen nicht lockern.

- User: `~/.morningstar/settings.json`
- Projekt: `.morningstar/settings.json`
- Lokal: `.morningstar/settings.local.json`
- macOS verwaltet: `/Library/Application Support/Morningstar/managed-settings.json`
- Linux verwaltet: `/etc/morningstar/managed-settings.json`
- Windows verwaltet: `%ProgramData%\Morningstar\managed-settings.json`

```sh
morningstar settings check examples/settings/strict.json
morningstar settings sources
morningstar --settings examples/settings/strict.json
morningstar --setting-sources user --print 'Prüfe den Code'
morningstar --worktree feature-a 'Bearbeite den Auftrag'
morningstar --print 'Antwort als JSON' --json-schema '{"type":"object"}' --output-format json
```

`settings check` schreibt nichts und gibt keine Einstellungswerte oder Zugangsdaten aus. Claude-Dateien können explizit geprüft und mit `--settings <Pfad>` geladen werden, soweit sämtliche Schlüssel unterstützt werden. Sie werden nicht automatisch in die Benutzerkonfiguration kopiert. Unbekannte Optionen werden abgelehnt. Die ursprünglichen HIPAA-/Strict-Beispiele dürfen deshalb nicht als angeblich vollständig wirksame Morningstar-Profile importiert werden.

Die mitgelieferten Morningstar-Profile sind bewusst auf tatsächlich implementierte Optionen beschränkt. `strict.json` sperrt Webtools und fragt für Bash nach. `readonly.json` erlaubt nur lesende Modellwerkzeuge. Ein Profil ist keine Betriebssystem-Isolation und keine Compliance-Zertifizierung.

## Hook-Vertrag

Die verschachtelte Form `PreToolUse: [{matcher: "Bash", hooks: [{type: "command", command: "..."}]}]` sowie einfache ältere Morningstar-Einträge werden unterstützt. Hooks laufen nach der Berechtigungsprüfung; ein Hook kann eine bereits abgelehnte Aktion nicht erlauben. `permissionDecision: deny/ask`, `continue: false`, `decision: block` und nicht erfolgreiche Prozesse verhindern die Freigabe. `updatedInput` wird abgelehnt, damit kein ungeprüfter Ersatzbefehl ausgeführt wird. HTTP-, Prompt-, Agent- und asynchrone Hooks fehlen weiterhin. Bei SIGKILL ist kein SessionEnd garantiert.

## Noch offen

| Bereich | Verbleibende Arbeit |
|---|---|
| MCP | HTTP/SSE/OAuth, verwaltete Server-Allow-/Deny-Listen und durchgängige Initialisierung für alle Oberflächen. Der bestehende Stdio-Pfad bleibt. |
| Plugins/LSP | Claude-Marketplace-Manifeste, Built-in-Mod-API, allgemeiner LSP-Client. |
| Sandbox/Organisation | Domain-Proxies, Credential-Regeln, feinere Unix-Socket-/Filesystem-Regeln, Organisations-Login und Fernverwaltung. Solche importierten Schutzoptionen werden abgelehnt. |
| Terminal | Benutzerdefinierte Keybindings, Vollbild-Transkript, Spracheingabe und generierte Folgefragen. |
| Agenten | Automatische Worktree-Isolation pro Subagent; aktuell isoliert das CLI-Flag die ganze Sitzung. |
| Regeln | Vollständiger verschachtelter CLAUDE/AGENTS-Verzeichnislauf, Pfad-Frontmatter und Imports. Aktuell wird die Projektebene gelesen. |
| Session-Kompatibilität | Alte Sessions mit lediglich Projekt-Basename bleiben explizit per ID/Name ladbar; `--continue` vermischt sie nicht mit gleichnamigen Projekten. Das NDJSON-Protokoll ist Morningstars Vertrag, kein vollständiger Claude-Agent-SDK-Ersatz. |
| Andere Oberflächen | Telegram nutzt den gemeinsamen Runner, übernimmt aber nicht automatisch die neuen CLI-Einstellungsquellen. Native IDE-/Desktop-Apps und die Anthropic-Cloud gehören nicht zu dieser Implementierung. |

## Prüfung

Lokale Prüfdateien und Betriebsinformationen werden nicht mitgeliefert.

- Ausgangsstand: 448 Tests bestanden; Abschluss: **480 Tests bestanden**, 0 Fehler. Typecheck und beide Builds erfolgreich. OSV: **0 Findings** in beiden Lockfiles.
- Die gebaute CLI besteht sechs synthetische End-to-End-Prüfungen. Ein echter PTY-Lauf bestätigt Startprompt, `/btw`, unveränderte Haupt-History und reguläres Beenden.
- Neue Negativtests betreffen Settings, Hooks, Tool-Whitelist, Eingaberollen, Grössenlimits, Sessions, Symlinks, JSON-Schema, Worktree und Nebenfragen.
- `scripts/cli-parity-smoke.mjs` startet die gebaute CLI gegen einen synthetischen Loopback-Provider. Keine bezahlten Provider-Aufrufe; kein Nachweis für alle realen Provider.
- Typecheck, gesamte Testsuite, Root-Build, Website-Build und OSV gehören zum Abschlussnachweis.
- REA untersucht den ursprünglichen und den aktualisierten Build sowie den Agents-MD-Mod. Statische Graphen und Parsergebnisse sind zusätzliche Evidenz; partielle semantische Abdeckung ist kein Sicherheitsbeweis.

## Öffentliche Referenzen

- [Claude CLI](https://code.claude.com/docs/en/cli-reference)
- [Claude Einstellungen](https://code.claude.com/docs/en/settings)
- [Claude Hooks](https://code.claude.com/docs/en/hooks)
- [Ajv](https://ajv.js.org/guide/getting-started.html)

# Sessions, Eingabe, Arbeitsanzeige und Remote Control

Stand: 2026-11-24. Nach einem Update Morningstar neu starten; laufende Prozesse laden den alten Code weiter.

## Bedienung

- `/new` und `/clear` speichern das bisherige Gespräch, vergeben eine neue Sitzungs-ID und setzen die sichtbare Ausgabe zurück. Modell und Einstellungen bleiben erhalten.
- `/resume` öffnet die Sitzungsauswahl des aktuellen Projektordners. `/resume <Name oder ID>` lädt direkt. `/rename <Name>` behält diesen Namen auch beim nächsten automatischen Speichern.
- Zweimal Esc innerhalb von 600 ms oder `/rewind` öffnet die Nachrichtenauswahl. Nach Auswahl: Gespräch vor der Nachricht wiederherstellen, ab dieser Nachricht zusammenfassen, den Verlauf vor dieser Nachricht zusammenfassen oder abbrechen. Beim Wiederherstellen erscheint die gewählte Nachricht als bearbeitbarer Entwurf. Der vollständige vorherige Verlauf wird als separate Sitzung „Vor Rewind“ gespeichert. Dateien werden dabei nicht geändert.
- Zusammenfassungen nutzen das gewählte Modell und werden nur nach erfolgreichem Abschluss übernommen. Esc bricht ab. Die kanonische Laufzeit bietet für diesen Aufruf keine Werkzeuge an. CLI-Anbieter haben zusätzlich ihre eigene Laufzeit; deren Sandbox bleibt bestehen.
- Klicken setzt den Eingabecursor, Ziehen markiert Text. Backspace löscht vor dem Cursor bzw. die Auswahl; Entf löscht dahinter. Shift+Pfeile und Ctrl+S bleiben verfügbar. Antworten, Code und ältere Ausgabe lassen sich ohne Shift mit der Maus markieren; beim Loslassen landet die Auswahl in der Zwischenablage. Mausrad/Trackpad und Page Up/Down öffnen die Scrollansicht. Esc oder Ende kehrt zur Live-Ansicht zurück. Währenddessen läuft das Modell weiter. `/copy` bleibt verfügbar; im Browser gilt die normale Textauswahl. Die Scrollansicht hält bis zu 20 000 Terminalzeilen; vollständige Gespräche bleiben in den Sitzungen gespeichert. `MORNINGSTAR_MOUSE=0 morningstar` deaktiviert die Maussteuerung für Terminals ohne SGR-Mausberichte/CPR.
- Während eines Laufs bestätigt Enter eine Queue-Nachricht. Mehrere Nachrichten bleiben in Reihenfolge erhalten. Unter der Queue steht **Ctrl+X Ctrl+S sofort übernehmen**: die Tasten nacheinander drücken. Der aktuelle Lauf wird abgebrochen; die Queue startet danach mit einem Hinweis, dass der bisherige Auftrag aktiv bleibt. ↑ holt bei leerer Eingabe die letzte vorgemerkte Nachricht zum Bearbeiten zurück. Esc verwirft die Queue.
- Die Agentenleiste unten zeigt echte Swarm-Tasks. Ein Klick öffnet Auftrag, öffentliche Meldungen und Arbeitsereignisse dieses Agents. „Alle“ kehrt zur Gesamtansicht zurück. Grössere Teams lassen sich seitenweise auswählen.

## Bilder und formatierte Antworten

Bilddateien ins Terminal ziehen: Morningstar setzt `[Image #1]`, `[Image #2]` usw. an die Cursorposition und übergibt echte Bilddaten an den gewählten Anbieter. Unterstützt werden PNG, JPEG, GIF und WebP, einschliesslich Dateinamen mit Leerzeichen, Finder-Escapes und lokalen `file://`-URLs. Die Nummerierung bleibt im Gespräch erhalten und beginnt nach `/new` wieder bei 1. Bild-Platzhalter sind violett hinterlegt, auch in Queue und gesendeten Nachrichten, und unterscheiden sich dadurch vom normalen Text.

Anhänge bleiben beim Einreihen einer Nachricht, Bearbeiten, Rewind und `/resume` zugeordnet. Entfernte Platzhalter werden nicht mitgesendet. Ein unbekannter Platzhalter verlangt erneutes Anhängen statt ein Bild vorzutäuschen. Lokale private Kopien unter `~/.morningstar/attachments/` erhalten das Bild, auch wenn die ursprüngliche Datei verschoben wird. Dateisignatur, SHA-256, reguläre Datei und Grössenlimit werden geprüft; Symlinks werden abgewiesen. Grenzen: 5 MB je Bild, 20 Anhänge und insgesamt 20 MB im aktiven Modellkontext. Das gewählte Modell muss Bilder unterstützen. Die Remote-Weboberfläche hat derzeit keinen Bild-Upload.

Codex erhält Dateien über `--image`; Claude CLI erhält Bildblöcke über `stream-json`. OpenAI-kompatible APIs, Anthropic und Gemini erhalten ihre nativen Bildformate. Live-Bildverständnis wurde mit Codex und Claude geprüft; die drei API-Serialisierungen sind durch Tests belegt.

Antworten rendern Markdown: **fette Akzente**, kursiv, Listen und Checkboxen, Inline-Code, Codeblöcke, Zitate, Links und Tabellen. Farben folgen dem gewählten Theme. Absätze bleiben getrennt; lange Codeblöcke werden nicht mehr still auf eine Zusammenfassung reduziert. Terminal-Steuersequenzen werden entfernt und HTML wird wörtlich dargestellt. Auch bei `/resume` und Rewind bleiben Antworten formatiert. Viele Blöcke teilen einen Resize-Listener und verursachen keine Listener-Warnung.

## Sichtbare Arbeit

Der Codex-CLI-Adapter übernimmt öffentliche `command_execution`, MCP-, Dateiveränderungs-, Such-, Plan- und `collab_tool_call`-Ereignisse aus JSONL. Befehle erscheinen mit Ausgabe und Exit-Code; fehlgeschlagene Tools bleiben fehlgeschlagen. Diese Ereignisse sind Beobachtungen und werden niemals nochmals ausgeführt. Mehrere Antwortnachrichten erhalten Absatzgrenzen. Private Reasoning-Ereignisse werden nicht weitergegeben.

Die bestehenden Morningstar-Tools zeigen echte rot/grüne Diffs und Zeilenzähler. Codex-`file_change` liefert derzeit nur Dateipfade und Änderungsarten; dafür werden keine Diff-Zahlen erfunden. Für Codex-Unteragenten ist sichtbar, was dessen Backend öffentlich meldet; interne, nicht übertragene Tool-Schritte sind nicht rekonstruierbar.

## Handy und Browser

`/rc` (Alias `/remote-control`) startet den privaten Server und zeigt einen einmaligen QR-Code. Der Browser steuert dieselbe laufende Sitzung: Nachrichten, Stoppen, Freigaben, Sitzungen und Agentenansichten.

- Standard: Tailscale-Adresse, sofern vorhanden. Auf dem Handy muss Tailscale mit Zugriff auf diesen Rechner aktiv sein; damit funktioniert die Verbindung auch unterwegs.
- `/rc lan`: gleiches WLAN. Dies ist eine lokale HTTP-Verbindung ohne zusätzliche TLS-Verschlüsselung.
- `/rc local`: nur der aktuelle Rechner, insbesondere für lokale Browsernutzung.
- `/rc status`: Verbindungsstatus. `/rc stop`: Server beenden und alle Verbindungen widerrufen.

Der QR-Code gewährt Kontrolle über diese Sitzung und sollte privat bleiben. Er verfällt nach zehn Minuten oder der ersten Verwendung. Erneutes `/rc` öffnet das Statusmenü; „QR-Code neu anzeigen“ oder `/rc qr` erneuert den Pairing-Code. Browser-Sitzungen laufen nach zwölf Stunden ab; höchstens vier Geräte bleiben gleichzeitig verbunden. Keine öffentliche Relay-Infrastruktur, kein automatischer Port-Forward und keine Tailscale-Serve-Änderung.

## Modelle

Die Auswahl enthält keine erfundenen statischen Cloud-Kataloge und keinen Hydra-Eintrag mehr. Hosted-Modelle stammen aus den abgefragten Provider-Katalogen, Ollama-Modelle vom laufenden lokalen Server, Codex-Modelle aus dessen lokalem Vendor-Katalog. Claude verwendet seine stabilen CLI-Aliase. Ein Katalogeintrag bestätigt die Listung, keine erfolgreiche Inferenz für jedes individuelle Konto. Benutzerdefinierte Modell-IDs über CLI bleiben möglich.

## Verifikation

Lokale Prüfdateien werden nicht mitgeliefert.

- Unit-/Integrationstests für Sitzungsidentität, Rewind-Bereiche, Sicherungen, Graphem-/Mauskoordinaten, Codex-Events und Remote-Authentifizierung.
- PTY mit echter Ink-Ausgabe und emulierter Terminalantwort: Klicken, Ziehen, Löschen, Sessions, Agenten-Tabs, Rewind und Queue.
- Echter lokaler Codex-Aufruf mit `printf MORNINGSTAR_VISIBLE_WORK_PROBE`: Start/Ergebnis/Exit-Code durch den neuen Adapter belegt.
- Browser mit Mobil-Viewport und Desktop: Pairing, native Texteingabe, Agentenwechsel, Senden, Rename, New, Resume, Stop, Konflikt bei parallelem Sitzungswechsel, XSS-Negativtest und Widerruf.
- Mobilansicht wurde im Browser emuliert; eine reale Handy-Kamera und ein externer Tailscale-Client wurden hier nicht benutzt.

Quellen für Eventformate: [Codex exec_events.rs](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs). Referenz für die gewünschte Bedienidee: [Claude Remote Control](https://code.claude.com/docs/en/remote-control).

Bildformat-Referenzen: [Claude SDK Bildeingabe](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode), [Claude CLI Formate](https://code.claude.com/docs/en/cli-reference). Codex-Parameter anhand der installierten CLI mit `codex exec --help` geprüft.


## Scroll-/Markierkorrektur vom 2026-11-24

Der frühere SGR-Mausmodus schluckte Mausrad und Ziehen ausserhalb registrierter Eingabefelder. Die Korrektur spiegelt den tatsächlichen Ink-Ausgabestrom in einem lokalen Headless-Terminal. Beim Scrollen/Markieren entsteht eine eingefrorene Ansicht, während die Live-Ausgabe weiterläuft; beim Zurückkehren wird der aktuelle Stand angezeigt. Kopiert wird sichtbarer Text ohne ANSI-Sequenzen. Farben und breite Unicode-Zeichen bleiben bei der Anzeige erhalten. Fenstergrössenwechsel beendet die eingefrorene Ansicht und richtet Darstellung und Trefferpositionen neu aus.

Ausgeführte Nachweise: Code- und Verlaufsmarkierung mit echtem macOS-Clipboard-Read-back, Wheel/Page-Up/End, Eingabecursor nach Scrollen, laufendes Modell während der Auswahl, Fenstergrössenwechsel während einer Auswahl sowie unterschiedliche Bild-/Textfarben. Lokale Prüfdateien werden nicht mitgeliefert. Native UI-Interaktion wurde als PTY mit emulierten Mausberichten geprüft; keine Behauptung eines manuellen Tests in einem manuell bedienten Terminalfenster.

Implementierungsreferenz: [xterm Headless Terminal](https://github.com/xtermjs/xterm.js/blob/master/src/headless/public/Terminal.ts). Installiert und getestet: `@xterm/headless` 6.0.0, Unicode-Grapheme-Addon 0.4.0.


## Remote-UI- und QR-Korrektur vom 2026-11-24

Erneutes `/rc` bei laufender Verbindung öffnet ein Statusmenü: QR-Code neu anzeigen,
Deaktivieren oder Zurück. Die lokale Arbeit läuft beim Trennen weiter. `/rc stop`
widerruft weiterhin direkt alle Verbindungen; `/rc qr` erneuert den einmaligen
Pairing-Link auf derselben Netzwerkadresse.

Die Handyansicht zeigt Nachrichten und Arbeitsschritte chronologisch. Arbeitsschritte
sind pro Abschnitt zusammengefasst und aufklappbar; echte Fehler bleiben sichtbar.
Nichtfatale Codex-Hinweise wie ein überschrittenes Skills-Katalogbudget werden als
Hinweise angezeigt und nicht mehr als fehlgeschlagene Tools gezählt. Das erweitert
das Kontextbudget des Anbieters nicht.

Markdown wird mit sicheren DOM-Knoten gerendert: Fettdruck, Listen, Tabellen und
Codeblöcke mit Kopierknopf. Modell-HTML bleibt Text; gefährliche Link-Protokolle
und automatisch geladene externe Bilder sind ausgeschlossen. Die Seite lädt den
bereits installierten Markdown-Parser vom eigenen privaten Server. Geöffnete
Details und Textmarkierungen bleiben beim Polling erhalten. Ohne aktive Agenten
wird die Agentenleiste ausgeblendet; die Eingabe ist kompakt und wächst beim Tippen.

Der QR-Code wird als strukturierte Ink-Zellen statt als eingebettete ANSI-Zeichenfolge
gerendert. Dadurch färbt dessen weisser Hintergrund keine Padding-/Löschflächen mehr.
Die Scrollansicht setzt beim Neuzeichnen zusätzlich die Terminalattribute zurück.

Lokale Prüfdateien werden nicht mitgeliefert.
Mobil-Browsergrössen und Terminal wurden emuliert; QR-Decodierung erfolgte mit Apple Vision.

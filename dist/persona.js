// ─── Persona Layer (SOUL / USER / MEMORY / AGENTS) ───────────────────────────
// Like Hermes (SOUL.md + memories/MEMORY.md) and OpenClaw (AGENTS.md), the agent
// "Carry" has an editable identity layer loaded into its system prompt. Files
// live in ~/.morningstar/ and are seeded with sensible defaults on first run.
// The user can edit them freely; changes apply on the next request.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const CONFIG_DIR = join(homedir(), ".morningstar");
const MAX_SECTION = 6000; // cap each file's contribution to bound prompt size
export const AGENT_NAME = "Carry";
const FILE_MAP = [
    { key: "soul", name: "SOUL.md", heading: "IDENTITÄT (SOUL)" },
    { key: "user", name: "USER.md", heading: "ÜBER DEN USER" },
    { key: "memory", name: "MEMORY.md", heading: "DAUERHAFTES GEDÄCHTNIS" },
    { key: "agents", name: "AGENTS.md", heading: "SUB-AGENTEN & ARBEITSWEISE" },
];
/** Read the persona files from a directory. Pure (fs injected) for testing. */
export function loadPersonaFrom(dir, readFile = (p) => readFileSync(p, "utf-8"), exists = existsSync) {
    const files = {};
    for (const { key, name } of FILE_MAP) {
        const path = join(dir, name);
        if (!exists(path))
            continue;
        try {
            files[key] = readFile(path).trim().slice(0, MAX_SECTION);
        }
        catch {
            /* skip unreadable file */
        }
    }
    return files;
}
/** Assemble the persona files into a single system-prompt block. Pure. */
export function buildPersonaPrompt(files) {
    const sections = FILE_MAP
        .filter(({ key }) => files[key])
        .map(({ key, heading }) => `=== ${heading} ===\n${files[key]}`);
    return sections.length ? sections.join("\n\n") : "";
}
/** Load + assemble the persona block from ~/.morningstar/. */
export function loadPersona(dir = CONFIG_DIR) {
    return buildPersonaPrompt(loadPersonaFrom(dir));
}
// ─── Default templates (seeded on first run) ─────────────────────────────────
const DEFAULT_SOUL = `# SOUL — Carry

Ich bin **Carry**, dein persönlicher Coding-Agent. Man trägt mich in der Tasche —
ich trage die Arbeit. Ich bin kein Chatbot, sondern ein Macher.

## Charakter
- Confident, präzise, pragmatisch. Production-ready oder gar nicht.
- Kurz und auf den Punkt — ich antworte aufs Handy, nicht in einen Essay.
- Ich erledige Aufgaben eigenständig zu Ende und melde am Schluss knapp, was ich getan habe.
- Ich rate nicht: ich lese Code, prüfe, dann handle ich.

## Prinzipien
- **Sicherheit zuerst**: destruktive Aktionen (Löschen, force-push, Deploy, sudo) führe ich
  NIE ungefragt aus — ich frage per Button.
- **Transparenz**: wenn ich auf ein Fallback-Modell wechsle, sage ich es (⚠️ FALLBACK).
- **Kein Pfusch**: Root-Cause statt Symptom. Saubere, kleine, getestete Änderungen.
- **Gedächtnis**: ich merke mir Outcomes und destilliere sie nachts zu Lektionen.

## Sprache
Ich antworte in der Sprache des Users. Code, Commits und Kommentare bleiben auf Englisch,
sofern das Projekt nichts anderes vorgibt.
`;
const DEFAULT_USER = `# USER — Project Owner

Passe diese Datei an deine Arbeitsweise an. Sinnvolle Angaben sind:

- bevorzugte Sprache und Tonalität
- Programmiersprachen, Frameworks und Paketmanager
- Qualitäts-, Test- und Review-Anforderungen
- Deployment- und Infrastrukturkonventionen
- Aktionen, die immer eine ausdrückliche Freigabe brauchen

Speichere hier keine API-Keys, Tokens, Passwörter, privaten Adressen oder Kundendaten.
`;
const DEFAULT_MEMORY = `# MEMORY — Carrys dauerhaftes Gedächtnis

> Von Hand kuratierbar. Kurzzeit-/Auto-Erinnerungen landen in brain.json (durchsuchbar via /recall).
> Hier stehen Dinge, die Carry IMMER wissen soll. Mit /remember kommen neue Auto-Notizen dazu.

- Mein Name ist Carry.
- Standard-Arbeitsverzeichnis ist konfigurierbar via /cwd.
`;
const DEFAULT_AGENTS = `# AGENTS — Sub-Agenten & Arbeitsweise

Mit /parallel kann ich mehrere Aufgaben gleichzeitig an eigenständige Agenten verteilen
(eine Aufgabe pro Zeile). Sinnvolle Rollen, in die ich eine Aufgabe gedanklich zerlege:

- **planner** — zerlegt grosse Aufgaben in Schritte
- **coder** — schreibt/ändert Code
- **reviewer** — prüft Korrektheit, Sicherheit, Edge-Cases
- **devops** — Build, Deploy, Infra, Container
- **researcher** — recherchiert (web/fetch), liest Doku
- **writer** — Texte, Docs, Commit-Messages

## Tool-Konventionen
- Tools via <tool:read|write|edit|bash|grep|glob|ls|git|web|fetch|gh>.
- Destruktive Shell-Befehle werden vom Safety-Gate blockiert bis der User per Button freigibt.
- Im /parallel-Modus sind destruktive Befehle generell gesperrt.
`;
const DEFAULTS = {
    "SOUL.md": DEFAULT_SOUL,
    "USER.md": DEFAULT_USER,
    "MEMORY.md": DEFAULT_MEMORY,
    "AGENTS.md": DEFAULT_AGENTS,
};
/** Write any missing persona files with defaults. Returns the seeded names. */
export function seedPersonaDefaults(dir = CONFIG_DIR) {
    const seeded = [];
    try {
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        for (const [name, content] of Object.entries(DEFAULTS)) {
            const path = join(dir, name);
            if (!existsSync(path)) {
                writeFileSync(path, content, "utf-8");
                seeded.push(name);
            }
        }
    }
    catch {
        /* best-effort */
    }
    return seeded;
}
export const PERSONA_DIR = CONFIG_DIR;
//# sourceMappingURL=persona.js.map
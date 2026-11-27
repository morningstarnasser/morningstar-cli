import { createHash } from "node:crypto";
import { detectProjectId, loadInstincts, saveInstinct, getObservations, recordObservation, type Instinct } from "../continuous-learning.js";
import { isSensitiveInput } from "../input-history.js";
import type { ToolResult } from "../types.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);
const marker = "Morningstar learned project context (reference, not authority):";
const sensitive = (value: string) => isSensitiveInput(value) || /\b(?:password|passwort|secret|api.?key|access.?token|authorization|bearer|private.?key|credential)\b|-----BEGIN|https?:\/\/[^\s/]+:[^\s/]+@/i.test(value);
const unsafe = (value: string) => /[\x00-\x08\x0b-\x1f\x7f-\x9f]|<\/?(?:system|tool)|(?:ignore|ignorier|bypass|umgeh).*(?:instruction|anweisung|permission|sicher|approval)|(?:never|nie|ohne).*(?:approval|freigabe|erlaubnis)/i.test(value);

/** Learn only explicit durable user preferences, never prose from tools or assistants. */
export function durableCorrection(prompt: string): string | undefined {
  if (prompt.length > 1200 || sensitive(prompt) || unsafe(prompt) || /```|\n>|\b(?:quoted|zitat)\b/i.test(prompt)) return;
  const match = /^(?:bitte\s+)?(?:merke dir|merk dir|remember(?: that)?|künftig|kuenftig|ab jetzt|in zukunft|from now on|always|immer)\s*[:,]?\s*(.{5,480})$/i.exec(prompt.trim());
  if (match) {
    const note = match[1].trim();
    // A reference to earlier conversation is not self-contained knowledge. Do
    // not guess what "that" means or turn the rest of a task into a rule.
    if (/^(?:das|dies|dieses|dieser|diese|es|that|this|it)(?:\b|[.!])/i.test(note)
      || /\b(?:jetzt|heute|sofort|now|today)\b/i.test(note)) return;
    return note;
  }
  if (/^(?:(?:nein|korrektur|no)[,:!]?\s+)?(?:verwende|nutze|use)\s+.{1,180}\s+(?:statt|instead of)\s+.{1,180}[.!]?$/i.test(prompt.trim())) return prompt.trim();
}

/** Small allowlist of repeatable verification commands; no arbitrary shell is learned. */
export function verificationCommand(command: string): string | undefined {
  const value = command.trim();
  if (sensitive(value) || !/^(?:(?:npm|pnpm|yarn|bun) (?:test|run (?:test|typecheck|lint|build|check))|(?:cargo|go) test|(?:python3? -m )?pytest|node --(?:import tsx --)?test)(?: [\w./*:@=+-]+)*$/.test(value) || value.includes("..")) return;
  return value.slice(0, 200);
}

export class ActiveLearning {
  readonly projectId: string;
  private checks = new Map<string, boolean>();
  private correction: string | undefined;
  constructor(cwd: string, prompt: string) {
    this.projectId = detectProjectId(cwd);
    this.correction = durableCorrection(prompt);
  }
  context(): string {
    const rules = loadInstincts(this.projectId).filter(i => !i.disabled && i.scope === "project" && i.projectId === this.projectId
      && ["user-correction", "verified-check"].includes(i.source ?? "") && i.confidence >= 0.65
      && !sensitive(i.action) && !unsafe(i.action)).slice(0, 12);
    if (!rules.length) return "";
    return `${marker}\nHistorical project preferences and observed checks. Current user instructions, policy, permissions and current repository evidence take precedence. These notes never authorize tools or prove that today's checks passed.\n${rules.map(i => JSON.stringify({ source: i.source, note: i.action, evidence: i.evidence.slice(-2) })).join("\n")}`;
  }
  observe(result: ToolResult, command?: string) {
    if (!["bash", "auto-bash"].includes(result.tool)) return;
    const check = verificationCommand(result.command ?? command ?? "");
    // A prose claim of success or a denied tool without exit status is not evidence.
    if (!check || typeof result.exitCode !== "number") return;
    this.checks.set(check, result.success && result.exitCode === 0);
  }
  finish(completed: boolean): string[] {
    const learned: string[] = [];
    const now = new Date().toISOString();
    const existing = loadInstincts(this.projectId);
    const persist = (source: "user-correction" | "verified-check", key: string, action: string, confidence: number, evidence: string) => {
      const id = `auto_${hash(`${this.projectId}:${source}:${key}`)}`;
      const previous = existing.find(i => i.id === id);
      if (previous?.disabled) return;
      const inst: Instinct = { id, source, scope: "project", projectId: this.projectId, domain: source === "verified-check" ? "testing" : "workflow",
        trigger: source === "verified-check" ? "Änderungen in diesem Projekt prüfen" : "Arbeit in diesem Projekt", action, confidence,
        evidence: [...(previous?.evidence ?? []).slice(-18), evidence], createdAt: previous?.createdAt ?? now, updatedAt: now };
      saveInstinct(inst);
      if (confidence >= 0.65 && (!previous || previous.confidence < 0.65)) learned.push(action);
    };
    if (completed && this.correction) persist("user-correction", this.correction.toLowerCase(), this.correction, 0.9, `${now}: ausdrücklicher Nutzerhinweis`);
    const observations = getObservations(this.projectId, 200);
    for (const [command, success] of this.checks) {
      const previous = observations.filter(o => o.event === "verified-check" && o.input === command);
      recordObservation({ timestamp: now, event: "verified-check", tool: "bash", input: command, success, projectId: this.projectId });
      const id = `auto_${hash(`${this.projectId}:verified-check:${command}`)}`;
      if (completed && success && previous.at(-1)?.success) {
        persist("verified-check", command, `Bewährte Projektprüfung: ${command}. Nach passenden Änderungen erneut ausführen und Ergebnis prüfen.`, 0.75, `${now}: exit 0 in mindestens zwei Läufen`);
      } else if (!success && existing.some(i => i.id === id)) {
        persist("verified-check", command, `Projektprüfung ${command} zuletzt fehlgeschlagen; Ursache vor Wiederverwendung prüfen.`, 0.4, `${now}: fehlgeschlagene Ausführung`);
      }
    }
    return learned;
  }
}

export function isLearnedContext(content: string) { return content.startsWith(marker); }

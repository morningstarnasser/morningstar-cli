// ─── Daily Learning Distillation ─────────────────────────────────────────────
// Hermes runs a nightly "Daily Learning Distillation" that turns the day's work
// into durable notes. We do the same, code-specific: collect the day's task
// outcomes, ask the model to extract a few reusable lessons/patterns, store them
// back as "decision" memories, and report via Telegram. Pure helpers here; the
// gateway wires in the model + scheduler.
const DISTILL_SYSTEM = `Du destillierst die Arbeit eines Coding-Agenten in wiederverwendbares Wissen.
Extrahiere aus den Aufgaben-Outcomes 1–5 dauerhafte Lektionen, Patterns oder Gotchas, die in zukünftigen Sessions nützlich sind.
Schreibe jede als EINE prägnante Zeile, beginnend mit "- ". Keine Einleitung, keine Floskeln, nur die Bullet-Liste.`;
export const DISTILL_SYSTEM_PROMPT = DISTILL_SYSTEM;
/** Build the user prompt fed to the model from the day's outcome texts. */
export function buildDistillPrompt(outcomes) {
    const body = outcomes.map((o, i) => `${i + 1}. ${o}`).join("\n");
    return `Hier sind die heutigen Aufgaben-Outcomes:\n\n${body}\n\nDestilliere die wichtigsten wiederverwendbaren Lektionen als Bullet-Liste.`;
}
/**
 * Parse the model's bullet output into individual lesson strings. Accepts
 * "-", "*", "•" or "1." style bullets. Pure + testable. Capped at 10.
 */
export function parseDistillation(text) {
    return text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^(?:[-*•]|\d+[.)])\s+/.test(l))
        .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
        .filter((l) => l.length >= 8)
        .slice(0, 10);
}
/** Format a Telegram report for the distilled lessons. */
export function formatDistillReport(lessons, outcomeCount) {
    if (lessons.length === 0) {
        return `🌙 Lern-Destillation: ${outcomeCount} Aufgaben, keine neuen dauerhaften Lektionen.`;
    }
    const list = lessons.map((l) => `• ${l}`).join("\n");
    return `🌙 *Lern-Destillation* (${outcomeCount} Aufgaben → ${lessons.length} Lektionen):\n\n${list}`;
}
//# sourceMappingURL=distill.js.map
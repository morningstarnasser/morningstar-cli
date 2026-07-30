export declare const DISTILL_SYSTEM_PROMPT = "Du destillierst die Arbeit eines Coding-Agenten in wiederverwendbares Wissen.\nExtrahiere aus den Aufgaben-Outcomes 1\u20135 dauerhafte Lektionen, Patterns oder Gotchas, die in zuk\u00FCnftigen Sessions n\u00FCtzlich sind.\nSchreibe jede als EINE pr\u00E4gnante Zeile, beginnend mit \"- \". Keine Einleitung, keine Floskeln, nur die Bullet-Liste.";
/** Build the user prompt fed to the model from the day's outcome texts. */
export declare function buildDistillPrompt(outcomes: string[]): string;
/**
 * Parse the model's bullet output into individual lesson strings. Accepts
 * "-", "*", "•" or "1." style bullets. Pure + testable. Capped at 10.
 */
export declare function parseDistillation(text: string): string[];
/** Format a Telegram report for the distilled lessons. */
export declare function formatDistillReport(lessons: string[], outcomeCount: number): string;
//# sourceMappingURL=distill.d.ts.map
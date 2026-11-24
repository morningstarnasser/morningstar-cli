/** UTF-16 offsets at grapheme boundaries: emoji and combining marks stay whole. */
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export interface ComposerState { value: string; cursor: number; anchor: number | null }
export function bounds(state: ComposerState): [number, number] {
  return [Math.min(state.anchor ?? state.cursor, state.cursor), Math.max(state.anchor ?? state.cursor, state.cursor)];
}
export function selectedText(state: ComposerState): string { const [a, b] = bounds(state); return state.value.slice(a, b); }
export function stepCursor(value: string, cursor: number, direction: -1 | 1): number {
  const points = [...segmenter.segment(value)].map(s => s.index);
  points.push(value.length);
  return direction < 0 ? [...points].reverse().find(p => p < cursor) ?? 0 : points.find(p => p > cursor) ?? value.length;
}
export function wordCursor(value: string, cursor: number, direction: -1 | 1): number {
  if (direction < 0) return value.slice(0, cursor).replace(/\s+$/, "").search(/\S+$/) < 0 ? 0 : value.slice(0, cursor).replace(/\s+$/, "").search(/\S+$/);
  const match = /^\s*\S+\s*/.exec(value.slice(cursor));
  return match ? cursor + match[0].length : value.length;
}
export function moveCursor(state: ComposerState, direction: -1 | 1, select = false, word = false): ComposerState {
  const [a, b] = bounds(state);
  const cursor = !select && a !== b ? (direction < 0 ? a : b) : word ? wordCursor(state.value, state.cursor, direction) : stepCursor(state.value, state.cursor, direction);
  return { ...state, cursor, anchor: select ? state.anchor ?? state.cursor : null };
}
export function replaceSelection(state: ComposerState, input: string): ComposerState {
  const [a, b] = bounds(state);
  // Paste is text, not terminal control sequences. Preserve newlines and tabs.
  input = input.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  return { value: state.value.slice(0, a) + input + state.value.slice(b), cursor: a + input.length, anchor: null };
}
export function erase(state: ComposerState, forward = false): ComposerState {
  if (selectedText(state)) return replaceSelection(state, "");
  return replaceSelection({ ...state, anchor: stepCursor(state.value, state.cursor, forward ? 1 : -1) }, "");
}

/** Ink 5 conflates terminal DEL (Mac Backspace) and CSI 3~ (forward Delete). */
export function deletionKey(raw: string, key: { backspace: boolean; delete: boolean; ctrl: boolean; meta: boolean }, input: string): { forward: boolean; word: boolean; count: number } | null {
  if (/^[\x7f\b]+$/.test(raw)) return { forward: false, word: false, count: raw.length };
  if (/^\x1b[\x7f\b]$/.test(raw)) return { forward: false, word: true, count: 1 };
  if (/^\x1b\[3(?:;\d+)?[~$^]$/.test(raw)) return { forward: true, word: key.ctrl || key.meta, count: 1 };
  if (key.ctrl && input === "d") return { forward: true, word: false, count: 1 };
  if (key.backspace || key.delete) return { forward: false, word: key.ctrl || key.meta, count: 1 };
  return null;
}

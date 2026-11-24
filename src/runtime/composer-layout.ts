import stringWidth from "string-width";
export interface ComposerCell { text: string; index: number; end: number; x: number; width: number; prefix?: boolean }
export function composerLayout(value: string, prefix: string, width: number): ComposerCell[][] {
  const rows: ComposerCell[][] = [[]]; let x = 0;
  const add = (text: string, index: number, end: number, isPrefix = false) => {
    if (text === "\n") { rows.at(-1)!.push({ text: " ", index, end, x, width: 1, prefix: isPrefix }); rows.push([]); x = 0; return; }
    const size = Math.max(1, stringWidth(text));
    if (x + size > width) { rows.push([]); x = 0; }
    rows.at(-1)!.push({ text, index, end, x, width: size, prefix: isPrefix }); x += size;
  };
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const part of segmenter.segment(prefix)) add(part.segment, 0, 0, true);
  for (const part of segmenter.segment(value)) add(part.segment === "\t" ? "    " : part.segment, part.index, part.index + part.segment.length);
  add(" ", value.length, value.length);
  return rows;
}
export function composerOffset(rows: ComposerCell[][], x: number, y: number): number {
  const row = rows[Math.max(0, Math.min(rows.length - 1, y))];
  for (const cell of row) if (x < cell.x + cell.width) return cell.index;
  return row.at(-1)?.end ?? 0;
}
/** Ink strips the initial escape from input before delivering useInput. */
export const terminalReport = (input: string): boolean => /(?:\x1b)?\[(?:<\d+;\d+;\d+[mM]|\d+;\d+R)/.test(input);

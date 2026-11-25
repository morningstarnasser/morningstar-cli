/** Reports can be split between input chunks, including immediately after ESC. */
export function joinTerminalInput(pending: string, chunk: string): { input: string; pending: string } {
  const input = pending + chunk;
  const match = /(?:\x1b(?:\[(?:<[\d;]*|[\d;]*))?|\[(?:<[\d;]*)?)$/.exec(input);
  if (!match || match[0].length > 80) return { input, pending: "" };
  return { input: input.slice(0, match.index), pending: match[0] };
}

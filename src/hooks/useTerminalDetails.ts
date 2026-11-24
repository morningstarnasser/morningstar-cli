import { createContext, useContext, useId } from "react";

export interface TerminalDetail { title: string; body: string }
export const TerminalDetails = createContext<Map<string, TerminalDetail> | null>(null);

/** Static Ink rows disappear from React's hit tree, so keep their captured detail
 * behind a stable printed marker that the terminal scrollback can resolve. */
export function useTerminalDetail(detail: TerminalDetail): string | null {
  const registry = useContext(TerminalDetails);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!registry) return null;
  registry.set(id, detail);
  if (registry.size > 1000) registry.delete(registry.keys().next().value!);
  return `▸ Details [${id}]`;
}

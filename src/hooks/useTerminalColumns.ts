import { useSyncExternalStore } from "react";
import { useStdout } from "ink";
import { normalizeTerminalColumns } from "../tui-layout.js";

type SizeStore = { subscribe: (listener: () => void) => () => void; columns: () => number; rows: () => number };
const stores = new WeakMap<NodeJS.WriteStream, SizeStore>();
function terminalStore(stdout: NodeJS.WriteStream): SizeStore {
  let store = stores.get(stdout);
  if (!store) {
    const listeners = new Set<() => void>();
    const resize = () => { for (const listener of listeners) listener(); };
    store = {
      subscribe(listener) {
        if (!listeners.size) stdout.on("resize", resize);
        listeners.add(listener);
        return () => { listeners.delete(listener); if (!listeners.size) stdout.off("resize", resize); };
      },
      columns: () => normalizeTerminalColumns(stdout.columns),
      rows: () => Math.max(10, stdout.rows || 24),
    };
    stores.set(stdout, store);
  }
  return store;
}

/** One native resize listener, even with many Markdown/code blocks on screen. */
export function useTerminalColumns(): number {
  const { stdout } = useStdout(), store = terminalStore(stdout);
  return useSyncExternalStore(store.subscribe, store.columns, store.columns);
}
export function useTerminalRows(): number {
  const { stdout } = useStdout(), store = terminalStore(stdout);
  return useSyncExternalStore(store.subscribe, store.rows, store.rows);
}

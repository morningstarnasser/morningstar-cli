import { useSyncExternalStore } from "react";
import { useStdout } from "ink";
import { normalizeTerminalColumns } from "../tui-layout.js";
const stores = new WeakMap();
function terminalStore(stdout) {
    let store = stores.get(stdout);
    if (!store) {
        const listeners = new Set();
        const resize = () => { for (const listener of listeners)
            listener(); };
        store = {
            subscribe(listener) {
                if (!listeners.size)
                    stdout.on("resize", resize);
                listeners.add(listener);
                return () => { listeners.delete(listener); if (!listeners.size)
                    stdout.off("resize", resize); };
            },
            columns: () => normalizeTerminalColumns(stdout.columns),
            rows: () => Math.max(10, stdout.rows || 24),
        };
        stores.set(stdout, store);
    }
    return store;
}
/** One native resize listener, even with many Markdown/code blocks on screen. */
export function useTerminalColumns() {
    const { stdout } = useStdout(), store = terminalStore(stdout);
    return useSyncExternalStore(store.subscribe, store.columns, store.columns);
}
export function useTerminalRows() {
    const { stdout } = useStdout(), store = terminalStore(stdout);
    return useSyncExternalStore(store.subscribe, store.rows, store.rows);
}
//# sourceMappingURL=useTerminalColumns.js.map
import { jsx as _jsx } from "react/jsx-runtime";
import { TerminalDocuments } from "./useTerminalDocuments.js";
import { DocumentLinks } from "../runtime/document-preview.js";
import { TerminalWorkspace } from "../runtime/terminal-workspace.js";
import { TerminalViewport } from "../runtime/terminal-viewport.js";
import { joinTerminalInput } from "../runtime/terminal-input.js";
import { isFindShortcut } from "../runtime/terminal-search.js";
import { TerminalDetails } from "./useTerminalDetails.js";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, useStdin, useStdout, measureElement } from "ink";
const Context = createContext(null);
const DockContext = createContext(null);
const FooterContext = createContext(null);
/** Coordinates are relative to the actual cursor reported by the terminal,
 * so scrollback, short screens and static output do not move the hit targets. */
export function TerminalPointer({ children }) {
    const { internal_eventEmitter } = useStdin(), { stdout } = useStdout();
    const targets = useRef(new Set());
    const bridge = useRef({ links: new DocumentLinks() });
    const details = useRef(new Map());
    const dock = useRef(null);
    const footer = useRef(null);
    const [ready, setReady] = useState(!stdout.isTTY || process.env.MORNINGSTAR_MOUSE === "0");
    useLayoutEffect(() => {
        if (!stdout.isTTY || process.env.MORNINGSTAR_MOUSE === "0")
            return;
        const originalWrite = stdout.write;
        const rawWrite = (data) => { originalWrite.call(stdout, data); };
        const workspace = new TerminalWorkspace(bridge.current.links, () => bridge.current.data, () => { if (workspace.active)
            viewport.paint(); });
        const viewport = new TerminalViewport({ workspace, links: bridge.current.links, columns: stdout.columns || 80, rows: stdout.rows || 24, write: rawWrite, detail: id => details.current.get(id), dockHeight: () => dock.current ? measureElement(dock.current).height : 0, liveHeight: () => footer.current ? measureElement(footer.current).height : 0 });
        let drawing = false;
        const draw = () => { if (!drawing) {
            drawing = true;
            queueMicrotask(() => { drawing = false; void viewport.renderLive(); });
        } };
        internal_eventEmitter.on("morningstar:dock", draw);
        stdout.write = ((chunk, ...args) => {
            viewport.feed(chunk);
            if (viewport.active) {
                const callback = args.find(arg => typeof arg === "function");
                if (callback)
                    queueMicrotask(callback);
                return true;
            }
            if (dock.current) {
                draw();
                const callback = args.find(arg => typeof arg === "function");
                if (callback)
                    queueMicrotask(callback);
                return true;
            }
            return originalWrite.call(stdout, chunk, ...args);
        });
        let task = Promise.resolve(), disposed = false;
        const enqueue = (run) => { task = task.then(async () => { if (!disposed)
            await run(); }).catch(() => { viewport.dispose(); }); };
        const workspaceUpdate = () => { if (workspace.active)
            viewport.paint(); };
        const workspaceOpen = (href) => enqueue(async () => {
            if (workspace.active && !href) {
                await viewport.leave();
                return;
            }
            finding = false;
            if (viewport.modal)
                await viewport.leave();
            await viewport.enter();
            if (href)
                void workspace.openDocument(bridge.current.links.get(href)?.href || href);
            else
                workspace.open();
            viewport.paint();
        });
        internal_eventEmitter.on("morningstar:workspace-update", workspaceUpdate);
        internal_eventEmitter.on("morningstar:workspace", workspaceOpen);
        let finding = false;
        let historySearch = false;
        const onHistorySearch = (active) => { historySearch = active; };
        internal_eventEmitter.on("morningstar:history-search", onHistorySearch);
        const find = (query = "") => { finding = true; enqueue(() => viewport.find(query)); };
        internal_eventEmitter.on("morningstar:find", find);
        let cursorRow = 0, capture;
        let pending = [], queryPending = false;
        const send = () => { if (!queryPending) {
            queryPending = true;
            rawWrite("\x1b[6n");
        } };
        const rect = (node) => {
            if (!node?.yogaNode)
                return null;
            const width = node.yogaNode.getComputedWidth(), height = node.yogaNode.getComputedHeight();
            let left = 0, top = 0, root = node;
            for (let n = node; n; n = n.parentNode) {
                left += n.yogaNode?.getComputedLeft() ?? 0;
                top += n.yogaNode?.getComputedTop() ?? 0;
                root = n;
            }
            return { left: left + 1, top: cursorRow - (root.yogaNode?.getComputedHeight() ?? 0) + top, width, height };
        };
        const dispatch = async (e) => {
            if (workspace.active) {
                void viewport.pointer(e.kind, e.x, e.y);
                return;
            }
            if (viewport.active && !viewport.isLiveRow(e.y) && !capture) {
                await viewport.pointer(e.kind, e.x, e.y);
                return;
            }
            let hit = false;
            for (const target of capture ? [capture] : [...targets.current].reverse()) {
                const r = rect(target.node.current);
                if (!r)
                    continue;
                if (capture || e.x >= r.left && e.x < r.left + r.width && e.y >= r.top && e.y < r.top + r.height) {
                    hit = true;
                    if (e.kind === "down")
                        capture = target;
                    target.handle({ ...e, x: e.x - r.left, y: e.y - r.top });
                    break;
                }
            }
            if (e.kind === "up")
                capture = undefined;
            if (!hit && e.kind === "down" && !viewport.isLiveRow(e.y)) {
                await viewport.alignCursor(cursorRow);
                await viewport.pointer("down", e.x, e.y);
            }
        };
        const originalEmit = internal_eventEmitter.emit;
        let pasteBuffer = null;
        let reportBuffer = "", reportTimer, flushingReport = false;
        internal_eventEmitter.emit = function (event, ...args) {
            if (event !== "input")
                return originalEmit.call(this, event, ...args);
            let raw = String(args[0]);
            if (pasteBuffer === null && !flushingReport) {
                if (reportTimer)
                    clearTimeout(reportTimer);
                const joined = joinTerminalInput(reportBuffer, raw);
                raw = joined.input;
                reportBuffer = joined.pending;
                if (reportBuffer)
                    reportTimer = setTimeout(() => {
                        const rest = reportBuffer;
                        reportBuffer = "";
                        reportTimer = undefined;
                        flushingReport = true;
                        try {
                            internal_eventEmitter.emit("input", rest);
                        }
                        finally {
                            flushingReport = false;
                        }
                    }, reportBuffer === "\x1b" || reportBuffer === "[" ? 100 : 1000);
                if (!raw)
                    return true;
            }
            if (pasteBuffer !== null || raw.startsWith("\x1b[200~")) {
                const value = pasteBuffer === null ? raw.slice(6) : pasteBuffer + raw;
                const end = value.indexOf("\x1b[201~");
                if (end < 0) {
                    pasteBuffer = value.slice(0, 1_048_576);
                    return true;
                }
                pasteBuffer = null;
                const pasted = value.slice(0, end);
                if (workspace.active) { /* Pasted prose never runs commands while browsing. */ }
                else if (finding || viewport.searching)
                    enqueue(() => viewport.searchInput(pasted));
                else
                    originalEmit.call(this, "input", pasted, ...args.slice(1));
                const rest = value.slice(end + 6);
                if (rest)
                    internal_eventEmitter.emit("input", rest);
                return true;
            }
            const rest = raw.replace(/(?:\x1b)?\[(?:(\d+);(\d+)R|<(\d+);(\d+);(\d+)([mM]))/g, (_all, row, _col, code, x, y, suffix) => {
                if (row) {
                    cursorRow = Number(row);
                    queryPending = false;
                    const queued = pending;
                    pending = [];
                    enqueue(async () => { for (const e of queued)
                        await dispatch(e); });
                }
                else {
                    const button = Number(code);
                    if (button & 64) {
                        if (suffix === "M")
                            enqueue(() => viewport.scroll(button & 1 ? 3 : -3, Number(x)));
                    }
                    else if ((button & 3) === 0) {
                        const e = { x: Number(x), y: Number(y), kind: suffix === "m" ? "up" : button & 32 ? "move" : "down", shift: Boolean(button & 4) };
                        enqueue(async () => {
                            if (viewport.active) {
                                cursorRow = stdout.rows || 24;
                                await dispatch(e);
                            }
                            else {
                                pending.push(e);
                                pending = pending.slice(-100);
                                send();
                            }
                        });
                    }
                }
                return "";
            });
            if (!rest)
                return true;
            if (rest === "\x02") {
                workspaceOpen();
                return true;
            }
            if (workspace.active) {
                enqueue(async () => {
                    if (rest === "\x1b" || rest === "\x03")
                        await viewport.leave();
                    else
                        void workspace.input(rest).then(async () => { if (!workspace.active)
                            await viewport.leave();
                        else
                            viewport.paint(); });
                });
                return true;
            }
            if (isFindShortcut(rest)) {
                find();
                return true;
            }
            if (finding || viewport.searching) {
                if (rest === "\x1b" || rest === "\x03")
                    finding = false;
                enqueue(async () => { await viewport.searchInput(rest); finding = viewport.searching; });
                return true;
            }
            if (rest === "\x1b[5~" || rest === "\x1b[6~") {
                enqueue(() => viewport.page(rest === "\x1b[5~" ? -1 : 1));
                return true;
            }
            if (viewport.active) {
                if (historySearch && !viewport.modal)
                    return originalEmit.call(this, event, rest, ...args.slice(1));
                if (rest === "\x03" || rest === "\x19")
                    enqueue(() => viewport.selectedText() ? viewport.copy() : viewport.leave());
                else if (["\x1b", "\x1b[F", "\x1b[4~", "\x1bOF"].includes(rest))
                    enqueue(() => viewport.leave());
                else if (["\x1b[H", "\x1b[1~", "\x1bOH"].includes(rest))
                    enqueue(() => viewport.home());
                else
                    enqueue(async () => {
                        // Ordinary scrolling leaves the composer usable. Arrows still recall
                        // prompt history, and submitting follows the resulting live response.
                        if (viewport.modal || /^(?:\x1b\[[AB]|\r|\n)$/.test(rest))
                            await viewport.leave();
                        originalEmit.call(internal_eventEmitter, "input", rest);
                    });
                return true;
            }
            return originalEmit.call(this, event, rest, ...args.slice(1));
        };
        const resize = () => {
            finding = false;
            dock.current?.yogaNode?.setMaxHeight(Math.max(1, (stdout.rows || 24) - 1));
            viewport.resize(stdout.columns || 80, stdout.rows || 24);
        };
        stdout.prependListener("resize", resize);
        rawWrite("\x1b[?1002h\x1b[?1006h");
        const disable = () => { if (reportTimer)
            clearTimeout(reportTimer); viewport.dispose(); rawWrite("\x1b[?1002l\x1b[?1006l"); };
        process.once("exit", disable);
        // Install the mirror before Ink Static prints its first frame; those rows
        // otherwise vanish from selection and detail hit-testing after a refresh.
        setReady(true);
        return () => { disposed = true; disable(); stdout.write = originalWrite; internal_eventEmitter.emit = originalEmit; internal_eventEmitter.off("morningstar:workspace", workspaceOpen); internal_eventEmitter.off("morningstar:workspace-update", workspaceUpdate); internal_eventEmitter.off("morningstar:find", find); internal_eventEmitter.off("morningstar:history-search", onHistorySearch); internal_eventEmitter.off("morningstar:dock", draw); stdout.off("resize", resize); process.off("exit", disable); };
    }, [stdout, internal_eventEmitter]);
    return _jsx(Context.Provider, { value: targets.current, children: _jsx(DockContext.Provider, { value: dock, children: _jsx(FooterContext.Provider, { value: footer, children: _jsx(TerminalDetails.Provider, { value: details.current, children: _jsx(TerminalDocuments.Provider, { value: stdout.isTTY && process.env.MORNINGSTAR_MOUSE !== "0" ? bridge.current : null, children: ready ? children : null }) }) }) }) });
}
export function TerminalLiveFooter({ children }) {
    const footer = useContext(FooterContext);
    const attach = useCallback((node) => { if (footer)
        footer.current = node; }, [footer]);
    return _jsx(Box, { ref: attach, flexDirection: "column", flexShrink: 0, children: children });
}
export function TerminalDock({ children }) {
    const dock = useContext(DockContext);
    const { stdout } = useStdout();
    const { internal_eventEmitter } = useStdin();
    const attach = useCallback((node) => {
        if (dock)
            dock.current = node;
        if (!node || !stdout.isTTY || process.env.MORNINGSTAR_MOUSE === "0")
            return;
        // Ink 5 does not expose maxHeight as a Box prop. Its Yoga node supports it.
        // Keep dynamic output below screen height so Ink preserves Static history
        // when a long streaming answer becomes a shorter completed frame.
        node.yogaNode?.setMaxHeight(Math.max(1, (stdout.rows || 24) - 1));
        let root = node;
        while (root.parentNode)
            root = root.parentNode;
        root.onComputeLayout?.();
        root.onRender?.();
    }, [dock, stdout]);
    useLayoutEffect(() => { internal_eventEmitter.emit("morningstar:dock"); });
    return _jsx(Box, { ref: attach, flexDirection: "column", overflowY: "hidden", children: children });
}
export function useTerminalHit(node, handle) {
    const targets = useContext(Context), callback = useRef(handle);
    callback.current = handle;
    useEffect(() => { const target = { node, handle: (e) => callback.current(e) }; targets?.add(target); return () => { targets?.delete(target); }; }, [targets, node]);
}
//# sourceMappingURL=useTerminalPointer.js.map
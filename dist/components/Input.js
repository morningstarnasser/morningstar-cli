import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { interactionModeLabel } from "../runtime/interaction-mode.js";
import { ImageText, IMAGE_FOREGROUND, IMAGE_BACKGROUND } from "./ImageText.js";
import { ImageDrafts } from "../runtime/images.js";
import { composerLayout, composerOffset, terminalReport } from "../runtime/composer-layout.js";
import { useTerminalHit } from "../hooks/useTerminalPointer.js";
import { useState, useRef, useEffect } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { useTheme } from "../hooks/useTheme.js";
import { useCommandHistory } from "../hooks/useHistory.js";
import { useTerminalColumns } from "../hooks/useTerminalColumns.js";
import { getAllAgents } from "../custom-agents.js";
import { bounds, selectedText, moveCursor, stepCursor, replaceSelection, erase, deletionKey } from "../runtime/composer.js";
import { copyText } from "../runtime/clipboard.js";
import { composerRule, suggestionLimit } from "../tui-layout.js";
// Get file/directory completions for a partial path
function getFileCompletions(partial, cwd, maxResults = 8) {
    try {
        const isAbsolute = partial.startsWith("/");
        const basePath = isAbsolute ? partial : join(cwd, partial);
        const dir = partial.endsWith("/") ? basePath : dirname(basePath);
        const prefix = partial.endsWith("/") ? "" : basename(partial).toLowerCase();
        const entries = readdirSync(dir).filter(e => !e.startsWith("."));
        const matches = [];
        for (const entry of entries) {
            if (prefix && !entry.toLowerCase().startsWith(prefix))
                continue;
            const fullPath = join(dir, entry);
            const isDir = (() => { try {
                return statSync(fullPath).isDirectory();
            }
            catch {
                return false;
            } })();
            // Return relative path from cwd
            const relDir = isAbsolute ? dir : dir.replace(cwd + "/", "").replace(cwd, "");
            const rel = relDir ? `${relDir}/${entry}` : entry;
            matches.push(isDir ? rel + "/" : rel);
            if (matches.length >= maxResults)
                break;
        }
        return matches;
    }
    catch {
        return [];
    }
}
export function Input({ onSubmit, activeAgent, planMode, permissionMode = "ask", modeLocked, onCycleMode, thinkMode, isProcessing, suggestions, vimMode, cwd, isActive = true, onSelectionChange, onCancel, onSendNow, initialValue = "", seedImages = [] }) {
    const { prompt, accent, warning, dim, primary } = useTheme();
    const columns = useTerminalColumns();
    const rule = composerRule(columns);
    const [value, setValue] = useState(initialValue);
    const [cursorPos, setCursorPos] = useState(initialValue.length);
    const [anchor, setAnchor] = useState(null);
    const [copyError, setCopyError] = useState("");
    const images = useRef();
    images.current ??= new ImageDrafts(seedImages);
    images.current.seed(seedImages);
    function submit(text) {
        try {
            const attached = images.current.forText(text);
            onSubmit(text, attached.length ? { images: attached } : undefined);
            return true;
        }
        catch (error) {
            setCopyError(error.message);
            return false;
        }
    }
    const editor = { value, cursor: cursorPos, anchor };
    const selection = selectedText(editor);
    const editorRef = useRef(editor);
    editorRef.current = editor;
    const rawInput = useRef("");
    const { internal_eventEmitter } = useStdin();
    useEffect(() => {
        const capture = (data) => { rawInput.current = String(data); };
        // Read the exact event before Ink's useInput maps both deletion keys alike.
        internal_eventEmitter.prependListener("input", capture);
        return () => { internal_eventEmitter.removeListener("input", capture); };
    }, [internal_eventEmitter]);
    useEffect(() => { onSelectionChange?.(isActive ? selection : ""); }, [selection, isActive, onSelectionChange]);
    function applyEditor(next) {
        if (next.value !== editorRef.current.value)
            resetNavigation();
        editorRef.current = next;
        setValue(next.value);
        setCursorPos(next.cursor);
        setAnchor(next.anchor);
        onSelectionChange?.(selectedText(next));
        setShowSuggestions(!isProcessing && next.value.startsWith("/") && next.anchor === null);
        setSelectedSuggIdx(0);
        setCopyError("");
    }
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggIdx, setSelectedSuggIdx] = useState(0);
    const { isNavigating, addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();
    // Helper: update value AND put cursor at the end (used for history nav, completions, clear)
    function setValueEnd(next) {
        editorRef.current = { value: next, cursor: next.length, anchor: null };
        setValue(next);
        setCursorPos(next.length);
        setAnchor(null);
        onSelectionChange?.("");
    }
    // Queued message — typed while AI is processing
    const [queued, setQueued] = useState([]);
    const queuedRef = useRef([]);
    const sendPrefix = useRef(0);
    function enqueue(text) { queuedRef.current = [...queuedRef.current, text]; setQueued([...queuedRef.current]); }
    function clearQueue() { queuedRef.current = []; setQueued([]); }
    // Vim mode state
    const [vimModeState, setVimModeState] = useState("normal");
    // When processing finishes and there's a queued message, auto-submit it
    useEffect(() => {
        if (!isProcessing && queuedRef.current.length) {
            const msg = queuedRef.current.shift();
            setQueued([...queuedRef.current]);
            // The queued draft was cleared when enqueued. Preserve newer typing.
            if (!submit(msg))
                setValueEnd(msg);
        }
    }, [isProcessing, onSubmit]);
    // Compute prompt text
    let promptText = "> ";
    let promptColor = prompt;
    if (vimMode) {
        promptText = vimModeState === "normal" ? "[NORMAL] > " : "[INSERT] > ";
        promptColor = vimModeState === "normal" ? accent : prompt;
    }
    else if (activeAgent) {
        const allAgents = getAllAgents();
        const agent = allAgents[activeAgent];
        if (agent) {
            promptText = `[${agent.name}] > `;
            promptColor = agent.color;
        }
    }
    else if (planMode) {
        promptText = "[Plan] > ";
        promptColor = warning;
    }
    else if (thinkMode) {
        promptText = "[Think] > ";
        promptColor = accent;
    }
    // Filter suggestions (only when not processing)
    const filteredSuggestions = !isProcessing && value.startsWith("/")
        ? suggestions
            .filter((s) => s.cmd.toLowerCase().startsWith(value.toLowerCase()))
            .slice(0, suggestionLimit(columns))
        : [];
    // @file mention completions
    const [fileCompletions, setFileCompletions] = useState([]);
    const [selectedFileIdx, setSelectedFileIdx] = useState(0);
    const showFileSuggestions = fileCompletions.length > 0 && !showSuggestions;
    // Update file completions when value contains @
    useEffect(() => {
        if (!cwd || isProcessing || isNavigating) {
            setFileCompletions([]);
            return;
        }
        const atIdx = value.lastIndexOf("@");
        if (atIdx >= 0 && atIdx < value.length) {
            const partial = value.slice(atIdx + 1);
            // Only trigger if there's no space after @
            if (!partial.includes(" ") && partial.length > 0) {
                const completions = getFileCompletions(partial, cwd);
                setFileCompletions(completions);
                setSelectedFileIdx(0);
            }
            else {
                setFileCompletions([]);
            }
        }
        else {
            setFileCompletions([]);
        }
    }, [value, cwd, isProcessing, isNavigating]);
    const inputNode = useRef(null);
    const rows = composerLayout(value, promptText, Math.max(16, columns - 3));
    const imageRanges = [...value.matchAll(/\[Image #\d+\]/g)].map(m => [m.index, m.index + m[0].length]);
    const dragAnchor = useRef(null);
    useTerminalHit(inputNode, e => {
        if (!isActive)
            return;
        const current = editorRef.current, offset = composerOffset(rows, Math.max(0, e.x), Math.max(0, e.y));
        if (e.kind === "down") {
            dragAnchor.current = e.shift ? current.anchor ?? current.cursor : offset;
            applyEditor({ ...current, cursor: offset, anchor: e.shift ? dragAnchor.current : null });
        }
        else if (dragAnchor.current !== null) {
            applyEditor({ ...current, cursor: offset, anchor: offset === dragAnchor.current ? null : dragAnchor.current });
            if (e.kind === "up")
                dragAnchor.current = null;
        }
    });
    useInput((input, key) => {
        if (terminalReport(rawInput.current) || terminalReport(input))
            return;
        const editor = editorRef.current;
        const { value, cursor: cursorPos, anchor } = editor;
        const selection = selectedText(editor);
        // Editing is identical while idle and while a message is queued.
        const editing = isProcessing || !vimMode || vimModeState === "insert";
        if (key.ctrl && input === "c") {
            if (!selection) {
                clearQueue();
            }
            return; // App owns copy / cancel / exit.
        }
        if (editing && isProcessing) {
            if (key.ctrl && input === "s" && Date.now() - sendPrefix.current < 1000) {
                sendPrefix.current = 0;
                if (value.trim()) {
                    enqueue(value.trim());
                    addToHistory(value.trim());
                    setValueEnd("");
                }
                if (queuedRef.current.length)
                    onSendNow?.();
                return;
            }
            if (key.ctrl && input === "x" && !selection && (queuedRef.current.length || value.trim())) {
                sendPrefix.current = Date.now();
                return;
            }
            sendPrefix.current = 0;
            if (key.upArrow && key.meta && !key.shift && !key.ctrl && !value && queuedRef.current.length) {
                const draft = queuedRef.current.pop();
                setQueued([...queuedRef.current]);
                resetNavigation();
                setValueEnd(draft);
                return;
            }
        }
        if (editing) {
            if (key.ctrl && input === "s") {
                applyEditor({ ...editor, cursor: value.length, anchor: 0 });
                return;
            }
            if (key.ctrl && input === "x" && selection) {
                const snapshot = editor;
                void copyText(selection).then(() => {
                    const current = editorRef.current;
                    if (current.value === snapshot.value && current.cursor === snapshot.cursor && current.anchor === snapshot.anchor)
                        applyEditor(erase(snapshot));
                }).catch(error => setCopyError(error.message));
                return;
            }
            if (key.escape && selection) {
                setAnchor(null);
                return;
            }
            if (key.leftArrow || key.rightArrow) {
                applyEditor(moveCursor(editor, key.leftArrow ? -1 : 1, key.shift, key.ctrl || key.meta));
                setShowSuggestions(false);
                return;
            }
            if (key.ctrl && (input === "a" || input === "e")) {
                applyEditor({ ...editor, cursor: input === "a" ? 0 : value.length, anchor: key.shift ? anchor ?? cursorPos : null });
                return;
            }
            if (key.shift && (key.upArrow || key.downArrow)) {
                applyEditor({ ...editor, cursor: key.upArrow ? 0 : value.length, anchor: anchor ?? cursorPos });
                return;
            }
            if (key.ctrl && input === "u") {
                resetNavigation();
                setValueEnd("");
                setShowSuggestions(false);
                return;
            }
            if (key.ctrl && input === "k") {
                applyEditor(replaceSelection({ ...editor, anchor: value.length }, ""));
                return;
            }
            if (key.ctrl && input === "w") {
                applyEditor(selection ? erase(editor) : replaceSelection(moveCursor(editor, -1, true, true), ""));
                return;
            }
            const deletion = deletionKey(rawInput.current, key, input);
            if (deletion) {
                let next = editor;
                for (let i = 0; i < deletion.count; i++)
                    next = deletion.word && !selectedText(next)
                        ? replaceSelection(moveCursor(next, deletion.forward ? 1 : -1, true, true), "") : erase(next, deletion.forward);
                applyEditor(next);
                return;
            }
            if (key.return && (key.shift || key.meta)) {
                applyEditor(replaceSelection(editor, "\n"));
                return;
            }
            if (input && !key.ctrl && !key.meta && !key.return && !key.tab) {
                try {
                    applyEditor(replaceSelection(editor, images.current.paste(input, cwd ?? process.cwd())));
                }
                catch (error) {
                    setCopyError(error.message);
                }
                return;
            }
        }
        // History remains available while the agent works. Only an open suggestion
        // menu owns plain arrows; recalling an entry must not reopen that menu.
        if ((key.upArrow || key.downArrow) && !key.shift && !key.ctrl && !key.meta) {
            const direction = key.upArrow ? -1 : 1;
            if (showSuggestions && filteredSuggestions.length > 0) {
                setSelectedSuggIdx(index => Math.max(0, Math.min(filteredSuggestions.length - 1, index + direction)));
            }
            else if (showFileSuggestions) {
                setSelectedFileIdx(index => Math.max(0, Math.min(fileCompletions.length - 1, index + direction)));
            }
            else {
                const recalled = key.upArrow ? navigateUp(value) : navigateDown();
                if (recalled !== null) {
                    setValueEnd(recalled);
                    setShowSuggestions(false);
                    setFileCompletions([]);
                }
            }
            return;
        }
        if (key.tab && !key.ctrl && !key.meta && (key.shift || isProcessing || !((showFileSuggestions && fileCompletions.length > 0) || (showSuggestions && filteredSuggestions.length > 0)))) {
            onCycleMode?.(Boolean(key.shift));
            return;
        }
        if (isProcessing) {
            if (key.return && /^(\/activity|\/rc|\/remote-control)(?:\s|$)/.test(value.trim())) {
                if (!submit(value.trim()))
                    return;
                setValueEnd("");
                return;
            }
            if (key.return && value.trim()) {
                addToHistory(value.trim());
                enqueue(value.trim());
                setValueEnd("");
            }
            if (key.escape) {
                clearQueue();
                setValueEnd("");
                onCancel?.();
            }
            return;
        }
        // ── Normal mode (not processing) ──
        // Vim mode key handling
        if (vimMode && vimModeState === "normal") {
            if (input === "i") {
                setVimModeState("insert");
                return;
            }
            if (input === "a") {
                setCursorPos(stepCursor(value, cursorPos, 1));
                setVimModeState("insert");
                return;
            }
            if (input === "A") {
                setCursorPos(value.length);
                setVimModeState("insert");
                return;
            }
            if (input === "I") {
                setCursorPos(0);
                setVimModeState("insert");
                return;
            }
            if (input === "h" || key.leftArrow) {
                setCursorPos((p) => stepCursor(value, p, -1));
                return;
            }
            if (input === "l" || key.rightArrow) {
                setCursorPos((p) => stepCursor(value, p, 1));
                return;
            }
            if (input === "0") {
                setCursorPos(0);
                return;
            }
            if (input === "$") {
                setCursorPos(value.length);
                return;
            }
            if (input === "d") {
                resetNavigation();
                setValueEnd("");
                return;
            }
            if (input === "c") {
                resetNavigation();
                setValueEnd("");
                setVimModeState("insert");
                return;
            }
            if (key.return && value.trim()) {
                addToHistory(value.trim());
                if (!submit(value.trim()))
                    return;
                setValueEnd("");
                setShowSuggestions(false);
                setSelectedSuggIdx(0);
                resetNavigation();
                return;
            }
            if (input && !key.ctrl && !key.meta && !key.return)
                return;
        }
        if (vimMode && vimModeState === "insert" && key.escape) {
            setVimModeState("normal");
            return;
        }
        if (key.return) {
            if (showSuggestions && filteredSuggestions.length > 0 && filteredSuggestions[selectedSuggIdx]?.cmd !== value) {
                setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
                setShowSuggestions(false);
                setSelectedSuggIdx(0);
                return;
            }
            const trimmed = value.trim();
            if (trimmed) {
                addToHistory(trimmed);
                if (!submit(trimmed))
                    return;
            }
            setValueEnd("");
            setShowSuggestions(false);
            setSelectedSuggIdx(0);
            resetNavigation();
            return;
        }
        if (key.escape) {
            setShowSuggestions(false);
            setSelectedSuggIdx(0);
            return;
        }
        if (key.tab && showFileSuggestions && fileCompletions.length > 0) {
            const atIdx = value.lastIndexOf("@");
            const before = value.slice(0, atIdx + 1);
            setValueEnd(before + fileCompletions[selectedFileIdx]);
            setFileCompletions([]);
            setSelectedFileIdx(0);
            return;
        }
        if (key.tab && showSuggestions && filteredSuggestions.length > 0) {
            setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
            setShowSuggestions(false);
            setSelectedSuggIdx(0);
            return;
        }
    }, { isActive });
    return (_jsxs(Box, { flexDirection: "column", children: [queued.length > 0 && (_jsxs(Box, { marginLeft: 1, flexDirection: "column", children: [queued.slice(0, 3).map((text, i) => _jsxs(Text, { backgroundColor: "#303632", color: primary, children: ["\u203A ", _jsx(ImageText, { text: text.slice(0, Math.max(10, columns - 6)) })] }, i)), queued.length > 3 ? _jsxs(Text, { color: dim, children: ["+", queued.length - 3, " weitere Nachrichten"] }) : null, _jsx(Text, { color: dim, children: "Ctrl+X Ctrl+S sofort \u00FCbernehmen \u00B7 Alt+\u2191 Queue bearbeiten \u00B7 Esc verwirft" })] })), _jsx(Text, { color: dim, children: rule }), _jsx(Box, { ref: inputNode, marginLeft: 1, width: Math.max(16, columns - 3), flexDirection: "column", children: rows.map((row, i) => _jsx(Text, { wrap: "truncate", children: row.map((cell, j) => {
                        const marked = !cell.prefix && selection && cell.index >= bounds(editor)[0] && cell.index < bounds(editor)[1];
                        const image = !cell.prefix && imageRanges.some(([start, end]) => cell.index >= start && cell.index < end);
                        return _jsx(Text, { color: cell.prefix ? promptColor : marked ? "#101718" : image ? IMAGE_FOREGROUND : undefined, bold: cell.prefix || image, backgroundColor: marked ? accent : image ? IMAGE_BACKGROUND : undefined, inverse: !cell.prefix && !selection && cell.index === cursorPos, children: cell.text }, j);
                    }) }, i)) }), copyError ? _jsxs(Text, { color: warning, children: [" ", copyError] }) : null, showSuggestions && filteredSuggestions.length > 0 && (_jsx(Box, { flexDirection: "column", marginLeft: 1, children: filteredSuggestions.map((s, i) => (_jsx(Box, { children: i === selectedSuggIdx ? (_jsxs(Text, { inverse: true, children: [_jsxs(Text, { bold: true, children: [" ", s.cmd] }), _jsxs(Text, { children: ["  ", s.desc, " "] })] })) : (_jsxs(Text, { children: [_jsxs(Text, { color: primary, children: [" ", s.cmd] }), _jsxs(Text, { color: dim, children: ["  ", s.desc] })] })) }, s.cmd))) })), showFileSuggestions && (_jsxs(Box, { flexDirection: "column", marginLeft: 1, children: [_jsx(Text, { color: dim, children: " Dateien \u00B7 Tab vervollst\u00E4ndigt" }), fileCompletions.map((f, i) => (_jsx(Box, { children: i === selectedFileIdx ? (_jsx(Text, { inverse: true, children: _jsxs(Text, { bold: true, children: [" ", f, " "] }) })) : (_jsxs(Text, { color: dim, children: [" ", f] })) }, f)))] })), _jsx(Text, { color: dim, children: rule }), _jsxs(Text, { color: dim, children: [" ", _jsx(Text, { bold: true, color: permissionMode === "bypassPermissions" ? warning : permissionMode === "plan" ? accent : primary, children: interactionModeLabel(permissionMode) }), modeLocked ? " · verwaltet" : " · Tab Modus wechseln · Shift+Tab zurück", isProcessing ? " · nächster Auftrag" : ""] }), _jsxs(Text, { color: dim, children: [" ", selection ? `${[...selection].length} Zeichen markiert · Ctrl+C kopieren · Ctrl+X ausschneiden` : columns < 72 ? "↑↓ Verlauf · Ctrl+F suchen · Esc live" : "↑↓ Eingabeverlauf · Ctrl+F suchen · Ziehen kopiert · Mausrad scrollt · Esc zurück"] })] }));
}
//# sourceMappingURL=Input.js.map
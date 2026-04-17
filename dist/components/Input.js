import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useRef, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { useTheme } from "../hooks/useTheme.js";
import { useCommandHistory } from "../hooks/useHistory.js";
import { getTheme } from "../theme.js";
import { getAllAgents } from "../custom-agents.js";
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
export function Input({ onSubmit, activeAgent, planMode, thinkMode, isProcessing, suggestions, vimMode, cwd }) {
    const { prompt, accent, warning, dim } = useTheme();
    const theme = getTheme();
    const [value, setValue] = useState("");
    const [cursorPos, setCursorPos] = useState(0);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggIdx, setSelectedSuggIdx] = useState(0);
    const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();
    // Helper: update value AND put cursor at the end (used for history nav, completions, clear)
    function setValueEnd(next) {
        setValue(next);
        setCursorPos(next.length);
    }
    // Queued message — typed while AI is processing
    const [queued, setQueued] = useState(null);
    const queuedRef = useRef(null);
    // Vim mode state
    const [vimModeState, setVimModeState] = useState("normal");
    // When processing finishes and there's a queued message, auto-submit it
    useEffect(() => {
        if (!isProcessing && queuedRef.current) {
            const msg = queuedRef.current;
            queuedRef.current = null;
            setQueued(null);
            setValue("");
            // Small delay to let UI settle
            setTimeout(() => onSubmit(msg), 50);
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
        ? suggestions.filter((s) => s.cmd.toLowerCase().startsWith(value.toLowerCase())).slice(0, 50)
        : [];
    // @file mention completions
    const [fileCompletions, setFileCompletions] = useState([]);
    const [selectedFileIdx, setSelectedFileIdx] = useState(0);
    const showFileSuggestions = fileCompletions.length > 0 && !showSuggestions;
    // Update file completions when value contains @
    useEffect(() => {
        if (!cwd || isProcessing) {
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
    }, [value, cwd, isProcessing]);
    useInput((input, key) => {
        // ── While processing: allow typing + queue on Enter ──
        if (isProcessing) {
            // Readline-style editing shortcuts still available in processing mode
            if (key.ctrl && input === "a") {
                setCursorPos(0);
                return;
            }
            if (key.ctrl && input === "e") {
                setCursorPos(value.length);
                return;
            }
            if (key.ctrl)
                return;
            if (key.return) {
                const trimmed = value.trim();
                if (trimmed) {
                    addToHistory(trimmed);
                    queuedRef.current = trimmed;
                    setQueued(trimmed);
                    setValueEnd("");
                }
                return;
            }
            if (key.escape) {
                if (queuedRef.current) {
                    queuedRef.current = null;
                    setQueued(null);
                }
                setValueEnd("");
                return;
            }
            if (key.leftArrow) {
                setCursorPos((p) => Math.max(0, p - 1));
                return;
            }
            if (key.rightArrow) {
                setCursorPos((p) => Math.min(value.length, p + 1));
                return;
            }
            if (key.backspace || key.delete) {
                if (cursorPos > 0) {
                    setValue(value.slice(0, cursorPos - 1) + value.slice(cursorPos));
                    setCursorPos(cursorPos - 1);
                }
                return;
            }
            if (input && !key.ctrl && !key.meta) {
                setValue(value.slice(0, cursorPos) + input + value.slice(cursorPos));
                setCursorPos(cursorPos + input.length);
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
                setCursorPos(Math.min(value.length, cursorPos + 1));
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
                setCursorPos((p) => Math.max(0, p - 1));
                return;
            }
            if (input === "l" || key.rightArrow) {
                setCursorPos((p) => Math.min(value.length, p + 1));
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
                setValueEnd("");
                return;
            }
            if (input === "c") {
                setValueEnd("");
                setVimModeState("insert");
                return;
            }
            if (key.return && value.trim()) {
                addToHistory(value.trim());
                onSubmit(value.trim());
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
                onSubmit(trimmed);
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
        // ── Cursor navigation ──
        if (key.leftArrow) {
            if (showSuggestions && filteredSuggestions.length > 0) {
                // Left on suggestion list: dismiss
                setShowSuggestions(false);
                setSelectedSuggIdx(0);
                return;
            }
            setCursorPos((p) => Math.max(0, p - 1));
            return;
        }
        if (key.rightArrow) {
            if (showSuggestions && filteredSuggestions.length > 0) {
                setValueEnd(filteredSuggestions[selectedSuggIdx].cmd);
                setShowSuggestions(false);
                setSelectedSuggIdx(0);
                return;
            }
            // If cursor at end, completion hint accept (future); else move right
            setCursorPos((p) => Math.min(value.length, p + 1));
            return;
        }
        // ── Readline-style shortcuts: Ctrl+A (home), Ctrl+E (end), Ctrl+U (clear), Ctrl+W (delete word) ──
        if (key.ctrl && input === "a") {
            setCursorPos(0);
            return;
        }
        if (key.ctrl && input === "e") {
            setCursorPos(value.length);
            return;
        }
        if (key.ctrl && input === "u") {
            setValueEnd("");
            setShowSuggestions(false);
            return;
        }
        if (key.ctrl && input === "k") {
            setValue(value.slice(0, cursorPos));
            return;
        }
        if (key.ctrl && input === "w") {
            if (cursorPos === 0)
                return;
            // Delete previous word: skip trailing spaces, then the word itself
            const left = value.slice(0, cursorPos);
            const right = value.slice(cursorPos);
            const trimmedLeft = left.replace(/\s+$/, "");
            const wordStart = trimmedLeft.search(/\S+$/);
            const cutAt = wordStart >= 0 ? wordStart : 0;
            setValue(left.slice(0, cutAt) + right);
            setCursorPos(cutAt);
            return;
        }
        if (key.upArrow) {
            if (showSuggestions && filteredSuggestions.length > 0) {
                setSelectedSuggIdx(Math.max(0, selectedSuggIdx - 1));
            }
            else {
                const prev = navigateUp(value);
                if (prev !== null)
                    setValueEnd(prev);
            }
            return;
        }
        if (key.downArrow) {
            if (showSuggestions && filteredSuggestions.length > 0) {
                setSelectedSuggIdx(Math.min(filteredSuggestions.length - 1, selectedSuggIdx + 1));
            }
            else {
                const next = navigateDown();
                if (next !== null)
                    setValueEnd(next);
            }
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
        if (key.backspace || key.delete) {
            // Backspace = delete char LEFT of cursor; Delete (fn+del) = delete char UNDER cursor
            if (key.delete && !key.backspace && cursorPos < value.length) {
                const newVal = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
                setValue(newVal);
                setShowSuggestions(newVal.startsWith("/") && newVal.length > 0);
                setSelectedSuggIdx(0);
                return;
            }
            if (cursorPos > 0) {
                const newVal = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
                setValue(newVal);
                setCursorPos(cursorPos - 1);
                setShowSuggestions(newVal.startsWith("/") && newVal.length > 0);
                setSelectedSuggIdx(0);
            }
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            const newVal = value.slice(0, cursorPos) + input + value.slice(cursorPos);
            setValue(newVal);
            setCursorPos(cursorPos + input.length);
            setShowSuggestions(newVal.startsWith("/"));
            setSelectedSuggIdx(0);
            resetNavigation();
        }
    });
    return (_jsxs(Box, { flexDirection: "column", children: [queued && isProcessing && (_jsxs(Box, { marginLeft: 2, marginBottom: 0, children: [_jsx(Text, { color: "#fbbf24", children: "⏳ " }), _jsx(Text, { color: dim, children: "Queued: " }), _jsx(Text, { color: "#fbbf24", children: queued.length > 60 ? queued.slice(0, 57) + "..." : queued }), _jsx(Text, { color: dim, children: " (Esc to cancel)" })] })), _jsxs(Box, { children: [_jsx(Text, { color: isProcessing ? dim : promptColor, bold: true, children: promptText }), (() => {
                        const before = value.slice(0, cursorPos);
                        const atCursor = cursorPos < value.length ? value[cursorPos] : "";
                        const after = cursorPos < value.length ? value.slice(cursorPos + 1) : "";
                        const textColor = isProcessing ? dim : undefined;
                        return (_jsxs(_Fragment, { children: [_jsx(Text, { color: textColor, children: before }), atCursor ? (_jsx(Text, { inverse: true, children: atCursor })) : (_jsx(Text, { color: isProcessing ? "#4b5563" : dim, children: "\u2588" })), _jsx(Text, { color: textColor, children: after })] }));
                    })()] }), showSuggestions && filteredSuggestions.length > 0 && (_jsx(Box, { flexDirection: "column", marginLeft: 2, children: filteredSuggestions.map((s, i) => (_jsx(Box, { children: i === selectedSuggIdx ? (_jsxs(Text, { backgroundColor: "#3b3b3b", children: [_jsxs(Text, { color: "#22d3ee", bold: true, children: ["  ", s.cmd] }), _jsxs(Text, { color: "#6b7280", children: [" ", s.desc] })] })) : (_jsxs(Text, { children: [_jsxs(Text, { color: "#6b7280", children: ["  ", s.cmd] }), _jsxs(Text, { color: "#4b5563", children: [" ", s.desc] })] })) }, s.cmd))) })), showFileSuggestions && (_jsxs(Box, { flexDirection: "column", marginLeft: 2, children: [_jsx(Text, { color: "#6b7280", children: "  Dateien (Tab zum Vervollstaendigen):" }), fileCompletions.map((f, i) => (_jsx(Box, { children: i === selectedFileIdx ? (_jsx(Text, { backgroundColor: "#3b3b3b", children: _jsxs(Text, { color: "#34d399", bold: true, children: ["  ", f] }) })) : (_jsxs(Text, { color: "#6b7280", children: ["  ", f] })) }, f)))] }))] }));
}
//# sourceMappingURL=Input.js.map
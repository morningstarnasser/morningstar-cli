import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
// In-memory stack — per session
const changeStack = [];
const MAX_UNDO_STACK = 50;
export function trackChange(change) {
    changeStack.push(change);
    if (changeStack.length > MAX_UNDO_STACK) {
        changeStack.shift();
    }
}
export function getLastChange() {
    return changeStack.length > 0 ? changeStack[changeStack.length - 1] : null;
}
export function undoLastChange() {
    const change = changeStack.pop();
    if (!change) {
        return { success: false, message: "Nichts zum Rueckgaengig machen." };
    }
    try {
        switch (change.type) {
            case "write":
                if (change.previousContent === null) {
                    // File was newly created — delete it
                    if (existsSync(change.filePath)) {
                        unlinkSync(change.filePath);
                    }
                    return { success: true, message: `Datei geloescht: ${change.filePath} (war neu erstellt)` };
                }
                else {
                    // File was overwritten — restore previous
                    writeFileSync(change.filePath, change.previousContent, "utf-8");
                    return { success: true, message: `Datei wiederhergestellt: ${change.filePath}` };
                }
            case "edit":
                if (change.previousContent !== null) {
                    writeFileSync(change.filePath, change.previousContent, "utf-8");
                    return { success: true, message: `Bearbeitung rueckgaengig gemacht: ${change.filePath}` };
                }
                return { success: false, message: `Kann nicht rueckgaengig machen: kein vorheriger Inhalt.` };
            case "delete":
                if (change.previousContent !== null) {
                    const dir = dirname(change.filePath);
                    if (!existsSync(dir))
                        mkdirSync(dir, { recursive: true });
                    writeFileSync(change.filePath, change.previousContent, "utf-8");
                    return { success: true, message: `Datei wiederhergestellt: ${change.filePath}` };
                }
                return { success: false, message: `Kann nicht wiederherstellen: kein gespeicherter Inhalt.` };
            default:
                return { success: false, message: "Unbekannter Aenderungstyp." };
        }
    }
    catch (e) {
        return { success: false, message: `Fehler: ${e.message}` };
    }
}
export function getUndoStack() {
    return [...changeStack];
}
export function getUndoStackSize() {
    return changeStack.length;
}
export function clearUndoStack() {
    changeStack.length = 0;
}
// Capture file state before modification (call before write/edit/delete)
export function captureBeforeState(filePath) {
    try {
        if (existsSync(filePath)) {
            return readFileSync(filePath, "utf-8");
        }
    }
    catch { }
    return null;
}
//# sourceMappingURL=undo.js.map
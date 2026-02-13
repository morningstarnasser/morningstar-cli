import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const TOOL_CATEGORIES = {
    read: "safe",
    ls: "safe",
    glob: "safe",
    grep: "safe",
    git: "safe",
    write: "moderate",
    edit: "moderate",
    delete: "moderate",
    bash: "dangerous",
};
const VALID_MODES = ["auto", "ask", "strict", "bypassPermissions", "acceptEdits", "plan", "dontAsk", "delegate"];
export function isValidPermissionMode(mode) {
    return VALID_MODES.includes(mode);
}
export function getToolCategory(tool) {
    return TOOL_CATEGORIES[tool] || "dangerous";
}
export function shouldAskPermission(tool, mode, allowList) {
    switch (mode) {
        case "auto":
        case "bypassPermissions":
            return false;
        case "strict":
            return true;
        case "ask": {
            const cat = getToolCategory(tool);
            return cat === "moderate" || cat === "dangerous";
        }
        case "acceptEdits": {
            const cat = getToolCategory(tool);
            // Don't ask for write/edit, but ask for bash/delete
            if (cat === "moderate" && (tool === "write" || tool === "edit"))
                return false;
            return cat === "moderate" || cat === "dangerous";
        }
        case "plan":
            // Plan mode always asks — triggers plan display
            return true;
        case "dontAsk":
            // Never ask but deny if not in allow list
            if (allowList && allowList.includes(tool))
                return false;
            return false; // silently deny non-allowed
        case "delegate":
            // AI decides — never ask user
            return false;
        default:
            return false;
    }
}
/**
 * For "dontAsk" mode: check if tool should be denied (not in allow list)
 */
export function shouldDenyInDontAskMode(tool, allowList) {
    if (!allowList)
        return false;
    return !allowList.includes(tool);
}
export function getPermissionMode() {
    try {
        if (existsSync(CONFIG_FILE)) {
            const data = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
            if (data.permissionMode && isValidPermissionMode(data.permissionMode)) {
                return data.permissionMode;
            }
        }
    }
    catch { }
    return "auto";
}
export function setPermissionMode(mode) {
    try {
        if (!existsSync(CONFIG_DIR))
            mkdirSync(CONFIG_DIR, { recursive: true });
        let data = {};
        try {
            if (existsSync(CONFIG_FILE))
                data = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        }
        catch { }
        data.permissionMode = mode;
        writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
    catch { }
}
export function formatPermissionPrompt(tool, args) {
    const cat = getToolCategory(tool);
    const icon = cat === "dangerous" ? "\u26a0\ufe0f" : cat === "moderate" ? "\u270f\ufe0f" : "\u2139\ufe0f";
    const preview = args.length > 80 ? args.slice(0, 77) + "..." : args;
    return `${icon} [${tool}] ${preview}`;
}
/**
 * Generate a colored diff preview for edit operations.
 * Returns a formatted string with - (red) and + (green) lines.
 */
export function generateDiffPreview(filePath, oldStr, newStr) {
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");
    let diff = `  Datei: ${filePath}\n`;
    // Show removed lines
    for (const line of oldLines) {
        diff += `  - ${line}\n`;
    }
    // Show added lines
    for (const line of newLines) {
        diff += `  + ${line}\n`;
    }
    return diff;
}
/**
 * Generate a preview for write operations showing what will be written.
 */
export function generateWritePreview(filePath, content, isNew) {
    const lines = content.split("\n");
    const previewLines = lines.slice(0, 15);
    let preview = `  Datei: ${filePath} (${isNew ? "NEU" : "UEBERSCHREIBEN"})\n`;
    preview += `  ${lines.length} Zeilen\n`;
    for (const line of previewLines) {
        preview += `  + ${line}\n`;
    }
    if (lines.length > 15) {
        preview += `  ... +${lines.length - 15} weitere Zeilen\n`;
    }
    return preview;
}
export function getCategoryColor(cat) {
    switch (cat) {
        case "safe": return "#10b981";
        case "moderate": return "#f59e0b";
        case "dangerous": return "#ef4444";
    }
}
export function getPermissionModeDescription(mode) {
    switch (mode) {
        case "auto": return "Alle Tools ohne Nachfrage";
        case "ask": return "Bei write/edit/delete/bash nachfragen";
        case "strict": return "Bei jedem Tool nachfragen";
        case "bypassPermissions": return "Alle Permissions ueberspringen (gefaehrlich!)";
        case "acceptEdits": return "Write/Edit erlauben, Bash/Delete nachfragen";
        case "plan": return "Plan-Modus — zeigt Plan vor Ausfuehrung";
        case "dontAsk": return "Nie fragen, nicht in Allow-List verweigern";
        case "delegate": return "AI entscheidet ueber Permissions";
        default: return "Unbekannt";
    }
}
//# sourceMappingURL=permissions.js.map
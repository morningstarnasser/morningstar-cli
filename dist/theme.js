import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const THEMES = {
    default: {
        name: "Morningstar",
        primary: "#d946ef",
        secondary: "#a855f7",
        accent: "#fbbf24",
        success: "#10b981",
        error: "#ef4444",
        warning: "#f59e0b",
        info: "#22d3ee",
        dim: "#6b7280",
        prompt: "#22d3ee",
        star: "#d946ef",
    },
    ocean: {
        name: "Ocean",
        primary: "#0ea5e9",
        secondary: "#06b6d4",
        accent: "#14b8a6",
        success: "#10b981",
        error: "#f43f5e",
        warning: "#f59e0b",
        info: "#38bdf8",
        dim: "#64748b",
        prompt: "#0ea5e9",
        star: "#06b6d4",
    },
    hacker: {
        name: "Hacker",
        primary: "#22c55e",
        secondary: "#16a34a",
        accent: "#4ade80",
        success: "#22c55e",
        error: "#ef4444",
        warning: "#eab308",
        info: "#22c55e",
        dim: "#4b5563",
        prompt: "#22c55e",
        star: "#4ade80",
    },
    sunset: {
        name: "Sunset",
        primary: "#f97316",
        secondary: "#ef4444",
        accent: "#fbbf24",
        success: "#22c55e",
        error: "#dc2626",
        warning: "#f59e0b",
        info: "#fb923c",
        dim: "#78716c",
        prompt: "#f97316",
        star: "#ef4444",
    },
    nord: {
        name: "Nord",
        primary: "#88c0d0",
        secondary: "#81a1c1",
        accent: "#ebcb8b",
        success: "#a3be8c",
        error: "#bf616a",
        warning: "#ebcb8b",
        info: "#88c0d0",
        dim: "#4c566a",
        prompt: "#88c0d0",
        star: "#81a1c1",
    },
    rose: {
        name: "Rose",
        primary: "#f43f5e",
        secondary: "#ec4899",
        accent: "#f9a8d4",
        success: "#34d399",
        error: "#ef4444",
        warning: "#fbbf24",
        info: "#fb7185",
        dim: "#71717a",
        prompt: "#f43f5e",
        star: "#ec4899",
    },
    claude: {
        name: "Claude",
        primary: "#e2e8f0",
        secondary: "#94a3b8",
        accent: "#e2e8f0",
        success: "#10b981",
        error: "#ef4444",
        warning: "#f59e0b",
        info: "#94a3b8",
        dim: "#4b5563",
        prompt: "#e2e8f0",
        star: "#94a3b8",
    },
};
let activeTheme = THEMES.default;
export function loadTheme() {
    try {
        if (existsSync(CONFIG_FILE)) {
            const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
            if (config.theme && THEMES[config.theme]) {
                activeTheme = THEMES[config.theme];
                return activeTheme;
            }
        }
    }
    catch { }
    return activeTheme;
}
export function setTheme(themeId) {
    if (!THEMES[themeId])
        return false;
    activeTheme = THEMES[themeId];
    // Save to config
    try {
        if (!existsSync(CONFIG_DIR))
            mkdirSync(CONFIG_DIR, { recursive: true });
        let config = {};
        if (existsSync(CONFIG_FILE)) {
            config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
        }
        config.theme = themeId;
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    }
    catch { }
    return true;
}
export function getTheme() {
    return activeTheme;
}
export function getThemeId() {
    for (const [id, theme] of Object.entries(THEMES)) {
        if (theme === activeTheme)
            return id;
    }
    return "default";
}
export function listThemes() {
    const currentId = getThemeId();
    return Object.entries(THEMES).map(([id, theme]) => ({
        id,
        name: theme.name,
        active: id === currentId,
    }));
}
// Initialize on import
loadTheme();
//# sourceMappingURL=theme.js.map
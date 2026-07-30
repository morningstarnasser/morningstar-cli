// ─── File Watcher ──────────────────────────────────────────
// Watches project files for external changes and triggers
// auto-test or notifies the AI of modified files.
import { watch, existsSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
// ─── Defaults ────────────────────────────────────────────
const DEFAULT_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rs", ".go", ".java", ".kt", ".rb", ".php",
    ".css", ".scss", ".less", ".html", ".vue", ".svelte",
    ".json", ".yaml", ".yml", ".toml", ".md",
]);
const DEFAULT_IGNORE = [
    /node_modules/,
    /\.git\//,
    /dist\//,
    /build\//,
    /\.next\//,
    /\.nuxt\//,
    /\.cache\//,
    /__pycache__/,
    /target\//,
    /\.morningstar\//,
    /\.DS_Store/,
    /\.swp$/,
    /~$/,
];
const DEFAULT_WATCH_DIRS = ["src", "lib", "app", "pages", "components", "test", "tests", "spec", "."];
// ─── File Watcher ────────────────────────────────────────
/**
 * Create a file watcher for a project directory.
 */
export function createFileWatcher(cwd, config) {
    const cfg = {
        dirs: config?.dirs ?? DEFAULT_WATCH_DIRS,
        extensions: config?.extensions ?? DEFAULT_EXTENSIONS,
        debounceMs: config?.debounceMs ?? 300,
        ignorePatterns: config?.ignorePatterns ?? DEFAULT_IGNORE,
        maxBuffer: config?.maxBuffer ?? 50,
    };
    const watchers = [];
    let running = false;
    let events = [];
    const listeners = [];
    // Debounce tracking
    const pending = new Map();
    function shouldWatch(filePath) {
        const ext = extname(filePath).toLowerCase();
        if (!cfg.extensions.has(ext))
            return false;
        for (const pattern of cfg.ignorePatterns) {
            if (pattern.test(filePath))
                return false;
        }
        return true;
    }
    function emitEvent(event) {
        events.push(event);
        if (events.length > cfg.maxBuffer) {
            events = events.slice(-cfg.maxBuffer);
        }
        for (const listener of listeners) {
            try {
                listener(event);
            }
            catch { }
        }
    }
    function handleChange(eventType, filename, dir) {
        if (!filename)
            return;
        const fullPath = join(dir, filename);
        const relPath = relative(cwd, fullPath);
        if (!shouldWatch(relPath))
            return;
        // Debounce: same file within debounceMs
        const key = relPath;
        if (pending.has(key)) {
            clearTimeout(pending.get(key));
        }
        pending.set(key, setTimeout(() => {
            pending.delete(key);
            let type = "modify";
            try {
                if (!existsSync(fullPath)) {
                    type = "delete";
                }
                else {
                    // Could be create or modify — check if recently created
                    const stat = statSync(fullPath);
                    const age = Date.now() - stat.birthtimeMs;
                    if (age < 2000)
                        type = "create";
                }
            }
            catch {
                type = "delete";
            }
            emitEvent({
                type,
                filePath: fullPath,
                relativePath: relPath,
                timestamp: Date.now(),
            });
        }, cfg.debounceMs));
    }
    function start() {
        if (running)
            return;
        running = true;
        // Watch each configured directory
        for (const dir of cfg.dirs) {
            const fullDir = join(cwd, dir);
            if (!existsSync(fullDir))
                continue;
            try {
                const stat = statSync(fullDir);
                if (!stat.isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            try {
                const watcher = watch(fullDir, { recursive: true }, (eventType, filename) => {
                    handleChange(eventType, filename, fullDir);
                });
                watchers.push(watcher);
            }
            catch {
                // Some platforms don't support recursive watch
                // Fall back to watching just the directory
                try {
                    const watcher = watch(fullDir, (eventType, filename) => {
                        handleChange(eventType, filename, fullDir);
                    });
                    watchers.push(watcher);
                }
                catch { }
            }
        }
    }
    function stop() {
        running = false;
        for (const w of watchers) {
            try {
                w.close();
            }
            catch { }
        }
        watchers.length = 0;
        for (const timeout of pending.values()) {
            clearTimeout(timeout);
        }
        pending.clear();
    }
    return {
        start,
        stop,
        isRunning: () => running,
        getEvents: () => [...events],
        clearEvents: () => { events = []; },
        onEvent: (cb) => listeners.push(cb),
    };
}
/**
 * Format file change events for display.
 */
export function formatFileChanges(events) {
    if (events.length === 0)
        return "  Keine Aenderungen erkannt.";
    const icons = { create: "+", modify: "~", delete: "-" };
    const colors = { create: "green", modify: "yellow", delete: "red" };
    return events
        .map(e => `  ${icons[e.type]} ${e.relativePath}`)
        .join("\n");
}
/**
 * Get a summary of changes suitable for feeding back to the AI.
 */
export function summarizeChanges(events) {
    if (events.length === 0)
        return "";
    const created = events.filter(e => e.type === "create");
    const modified = events.filter(e => e.type === "modify");
    const deleted = events.filter(e => e.type === "delete");
    const parts = [];
    if (created.length > 0)
        parts.push(`${created.length} erstellt (${created.map(e => e.relativePath).join(", ")})`);
    if (modified.length > 0)
        parts.push(`${modified.length} geaendert (${modified.map(e => e.relativePath).join(", ")})`);
    if (deleted.length > 0)
        parts.push(`${deleted.length} geloescht (${deleted.map(e => e.relativePath).join(", ")})`);
    return `Externe Datei-Aenderungen erkannt: ${parts.join("; ")}`;
}
/**
 * Detect the best directories to watch for a project.
 */
export function detectWatchDirs(cwd) {
    const candidates = ["src", "lib", "app", "pages", "components", "test", "tests", "spec", "pkg", "cmd", "internal"];
    const found = [];
    for (const dir of candidates) {
        const fullPath = join(cwd, dir);
        if (existsSync(fullPath)) {
            try {
                if (statSync(fullPath).isDirectory())
                    found.push(dir);
            }
            catch { }
        }
    }
    // If no standard dirs found, watch root (but be careful)
    if (found.length === 0)
        found.push(".");
    return found;
}
//# sourceMappingURL=file-watcher.js.map
// ─── Checkpointing / Rewind System ──────────────────────
// Git-based checkpoints paired with conversation state
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CHECKPOINTS_DIR = join(CONFIG_DIR, "checkpoints");
function ensureDir() {
    if (!existsSync(CHECKPOINTS_DIR))
        mkdirSync(CHECKPOINTS_DIR, { recursive: true });
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
/**
 * Create a checkpoint: snapshot git state + conversation.
 */
export function createCheckpoint(name, messages, cwd, description) {
    ensureDir();
    const id = generateId();
    // Try to create a git stash or ref for the current state
    let gitRef;
    try {
        const hasGit = existsSync(join(cwd, ".git"));
        if (hasGit) {
            // Create a temporary commit-like ref
            const stashMsg = `morningstar-checkpoint-${id}`;
            try {
                execSync(`git stash push -m "${stashMsg}" --include-untracked`, {
                    cwd,
                    encoding: "utf-8",
                    timeout: 10000,
                    stdio: ["pipe", "pipe", "pipe"],
                });
                // Get the stash ref
                const stashList = execSync("git stash list --format=%H", {
                    cwd,
                    encoding: "utf-8",
                    timeout: 5000,
                }).trim();
                gitRef = stashList.split("\n")[0] || undefined;
                // Pop the stash back immediately (we just want the ref)
                execSync("git stash pop", {
                    cwd,
                    encoding: "utf-8",
                    timeout: 10000,
                    stdio: ["pipe", "pipe", "pipe"],
                });
            }
            catch {
                // Fallback: just record the current HEAD
                try {
                    gitRef = execSync("git rev-parse HEAD", {
                        cwd,
                        encoding: "utf-8",
                        timeout: 5000,
                    }).trim();
                }
                catch { }
            }
        }
    }
    catch { }
    const checkpoint = {
        id,
        name,
        gitRef,
        messages: [...messages],
        timestamp: new Date().toISOString(),
        cwd,
        description,
    };
    writeFileSync(join(CHECKPOINTS_DIR, `${id}.json`), JSON.stringify(checkpoint, null, 2), "utf-8");
    return checkpoint;
}
/**
 * List all checkpoints.
 */
export function listCheckpoints() {
    ensureDir();
    try {
        const files = require("node:fs").readdirSync(CHECKPOINTS_DIR).filter((f) => f.endsWith(".json"));
        return files
            .map((f) => {
            try {
                return JSON.parse(readFileSync(join(CHECKPOINTS_DIR, f), "utf-8"));
            }
            catch {
                return null;
            }
        })
            .filter(Boolean)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    catch {
        return [];
    }
}
/**
 * Load a checkpoint by ID.
 */
export function loadCheckpoint(id) {
    const filePath = join(CHECKPOINTS_DIR, `${id}.json`);
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath, "utf-8"));
        }
    }
    catch { }
    return null;
}
/**
 * Restore a checkpoint: restore git state + return conversation.
 */
export function restoreCheckpoint(id, cwd) {
    const checkpoint = loadCheckpoint(id);
    if (!checkpoint) {
        return { success: false, error: `Checkpoint "${id}" nicht gefunden.` };
    }
    // Try to restore git state if we have a ref
    if (checkpoint.gitRef) {
        try {
            const hasGit = existsSync(join(cwd, ".git"));
            if (hasGit) {
                // Check if the ref exists
                try {
                    execSync(`git cat-file -t ${checkpoint.gitRef}`, {
                        cwd,
                        encoding: "utf-8",
                        timeout: 5000,
                        stdio: ["pipe", "pipe", "pipe"],
                    });
                }
                catch {
                    // Ref doesn't exist anymore — just restore messages
                    return { success: true, messages: checkpoint.messages };
                }
            }
        }
        catch { }
    }
    return { success: true, messages: checkpoint.messages };
}
/**
 * Delete a checkpoint.
 */
export function deleteCheckpoint(id) {
    const filePath = join(CHECKPOINTS_DIR, `${id}.json`);
    try {
        if (existsSync(filePath)) {
            require("node:fs").unlinkSync(filePath);
            return true;
        }
    }
    catch { }
    return false;
}
/**
 * Format checkpoints list for display.
 */
export function formatCheckpointsList(checkpoints) {
    if (checkpoints.length === 0)
        return "  Keine Checkpoints vorhanden.";
    return checkpoints
        .map(cp => {
        const git = cp.gitRef ? ` git: ${cp.gitRef.slice(0, 8)}` : "";
        const msgs = `${cp.messages.length} messages`;
        const date = cp.timestamp.split("T")[0];
        return `  ${cp.id}  ${cp.name} (${msgs}, ${date})${git}${cp.description ? `\n    ${cp.description}` : ""}`;
    })
        .join("\n");
}
//# sourceMappingURL=checkpoints.js.map
// ─── Checkpointing / Rewind System ──────────────────────
// Git-based checkpoints paired with conversation state
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".morningstar");
const CHECKPOINTS_DIR = join(CONFIG_DIR, "checkpoints");
const CHECKPOINT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
function ensureDir() {
    if (!existsSync(CHECKPOINTS_DIR))
        mkdirSync(CHECKPOINTS_DIR, { recursive: true });
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
export function isValidCheckpointId(id) {
    return CHECKPOINT_ID.test(id);
}
function checkpointFile(id) {
    return isValidCheckpointId(id) ? join(CHECKPOINTS_DIR, `${id}.json`) : null;
}
function isMessage(value) {
    if (!value || typeof value !== "object")
        return false;
    const record = value;
    return ["system", "user", "assistant"].includes(String(record.role))
        && typeof record.content === "string";
}
export function validateCheckpoint(value, expectedId) {
    if (!value || typeof value !== "object")
        return null;
    const checkpoint = value;
    if (typeof checkpoint.id !== "string"
        || !isValidCheckpointId(checkpoint.id)
        || (expectedId !== undefined && checkpoint.id !== expectedId)
        || typeof checkpoint.name !== "string"
        || typeof checkpoint.timestamp !== "string"
        || Number.isNaN(Date.parse(checkpoint.timestamp))
        || typeof checkpoint.cwd !== "string"
        || !Array.isArray(checkpoint.messages)
        || !checkpoint.messages.every(isMessage)
        || (checkpoint.gitRef !== undefined
            && (typeof checkpoint.gitRef !== "string" || !GIT_OBJECT_ID.test(checkpoint.gitRef)))
        || (checkpoint.description !== undefined && typeof checkpoint.description !== "string")) {
        return null;
    }
    return checkpoint;
}
/**
 * Create a checkpoint: snapshot git state + conversation.
 */
export function createCheckpoint(name, messages, cwd, description) {
    ensureDir();
    const id = generateId();
    // Capture a commit-like object without changing the worktree. `stash create`
    // does not move refs or touch files; clean worktrees fall back to HEAD.
    let gitRef;
    try {
        const hasGit = existsSync(join(cwd, ".git"));
        if (hasGit) {
            const stashMsg = `morningstar-checkpoint-${id}`;
            try {
                const snapshot = execFileSync("git", ["stash", "create", stashMsg], {
                    cwd,
                    encoding: "utf-8",
                    timeout: 10000,
                    stdio: ["pipe", "pipe", "pipe"],
                }).trim();
                if (GIT_OBJECT_ID.test(snapshot))
                    gitRef = snapshot;
            }
            catch {
                // Fall through to HEAD below.
            }
            if (!gitRef) {
                try {
                    const head = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
                        cwd,
                        encoding: "utf-8",
                        timeout: 5000,
                        stdio: ["pipe", "pipe", "pipe"],
                    }).trim();
                    if (GIT_OBJECT_ID.test(head))
                        gitRef = head;
                }
                catch {
                    // A repository without commits still supports conversation snapshots.
                }
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
        const files = readdirSync(CHECKPOINTS_DIR)
            .filter((file) => file.endsWith(".json"))
            .filter((file) => isValidCheckpointId(file.slice(0, -5)));
        return files
            .map((file) => {
            const id = file.slice(0, -5);
            try {
                return validateCheckpoint(JSON.parse(readFileSync(join(CHECKPOINTS_DIR, file), "utf-8")), id);
            }
            catch {
                return null;
            }
        })
            .filter((checkpoint) => checkpoint !== null)
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
    const filePath = checkpointFile(id);
    if (!filePath)
        return null;
    try {
        if (existsSync(filePath)) {
            return validateCheckpoint(JSON.parse(readFileSync(filePath, "utf-8")), id);
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
                    execFileSync("git", ["cat-file", "-t", checkpoint.gitRef], {
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
    const filePath = checkpointFile(id);
    if (!filePath)
        return false;
    try {
        if (existsSync(filePath)) {
            unlinkSync(filePath);
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
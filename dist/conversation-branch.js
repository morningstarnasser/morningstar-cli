// ─── Conversation Branching ──────────────────────────────
// Fork conversations at any point, create named branches,
// switch between them, and merge insights back.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// ─── Storage ─────────────────────────────────────────────
const CONFIG_DIR = join(homedir(), ".morningstar");
const BRANCHES_DIR = join(CONFIG_DIR, "branches");
function ensureDir() {
    if (!existsSync(BRANCHES_DIR))
        mkdirSync(BRANCHES_DIR, { recursive: true });
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function getSessionDir(sessionId) {
    const dir = join(BRANCHES_DIR, sessionId);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    return dir;
}
// ─── Branch CRUD ─────────────────────────────────────────
/**
 * Create a new conversation branch.
 * Forks from the current messages at the given index (or end).
 */
export function createBranch(sessionId, name, messages, forkPoint, parentBranch, metadata) {
    ensureDir();
    const dir = getSessionDir(sessionId);
    const id = generateId();
    const now = new Date().toISOString();
    const fp = forkPoint ?? messages.length;
    const branch = {
        id,
        name,
        parentId: sessionId,
        parentBranch: parentBranch || null,
        forkPoint: fp,
        messages: [...messages.slice(0, fp)], // Copy messages up to fork point
        createdAt: now,
        updatedAt: now,
        metadata,
    };
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(branch, null, 2), "utf-8");
    return branch;
}
/**
 * Save/update a branch with new messages.
 */
export function saveBranch(sessionId, branch) {
    ensureDir();
    const dir = getSessionDir(sessionId);
    branch.updatedAt = new Date().toISOString();
    writeFileSync(join(dir, `${branch.id}.json`), JSON.stringify(branch, null, 2), "utf-8");
}
/**
 * Load a branch by ID.
 */
export function loadBranch(sessionId, branchId) {
    const filePath = join(getSessionDir(sessionId), `${branchId}.json`);
    try {
        if (existsSync(filePath)) {
            return JSON.parse(readFileSync(filePath, "utf-8"));
        }
    }
    catch { }
    return null;
}
/**
 * List all branches for a session.
 */
export function listBranches(sessionId) {
    ensureDir();
    const dir = getSessionDir(sessionId);
    try {
        const files = readdirSync(dir).filter(f => f.endsWith(".json"));
        return files
            .map(f => {
            try {
                return JSON.parse(readFileSync(join(dir, f), "utf-8"));
            }
            catch {
                return null;
            }
        })
            .filter(Boolean)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    catch {
        return [];
    }
}
/**
 * Delete a branch.
 */
export function deleteBranch(sessionId, branchId) {
    const filePath = join(getSessionDir(sessionId), `${branchId}.json`);
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
 * Switch to a branch — returns the messages to restore.
 */
export function switchBranch(sessionId, branchId) {
    const branch = loadBranch(sessionId, branchId);
    if (!branch)
        return null;
    return [...branch.messages];
}
/**
 * Merge insights from a branch back to the main conversation.
 * Returns additional messages to append (assistant summaries from the branch).
 */
export function mergeBranch(sessionId, branchId, currentMessages) {
    const branch = loadBranch(sessionId, branchId);
    if (!branch)
        return null;
    // Find messages unique to the branch (after fork point)
    const branchOnlyMessages = branch.messages.slice(branch.forkPoint);
    // Extract assistant insights
    const insights = branchOnlyMessages
        .filter(m => m.role === "assistant")
        .map(m => m.content)
        .join("\n\n");
    if (!insights) {
        return { merged: currentMessages, summary: "Keine neuen Erkenntnisse im Branch." };
    }
    // Create a merge message
    const mergeMessage = {
        role: "user",
        content: `[Merge aus Branch "${branch.name}"]\n\nErkenntnisse aus einem alternativen Gespraechsverlauf:\n\n${insights.slice(0, 2000)}\n\nBitte beruecksichtige diese Erkenntnisse.`,
    };
    return {
        merged: [...currentMessages, mergeMessage],
        summary: `Branch "${branch.name}" gemergt (${branchOnlyMessages.length} Nachrichten, ${insights.length} Zeichen).`,
    };
}
/**
 * Build a tree structure of branches.
 */
export function buildBranchTree(sessionId) {
    const branches = listBranches(sessionId);
    const byParent = new Map();
    for (const b of branches) {
        const key = b.parentBranch;
        if (!byParent.has(key))
            byParent.set(key, []);
        byParent.get(key).push(b);
    }
    function buildChildren(parentId) {
        const children = byParent.get(parentId) || [];
        return children.map(branch => ({
            branch,
            children: buildChildren(branch.id),
        }));
    }
    return buildChildren(null);
}
/**
 * Format branches for display.
 */
export function formatBranchesList(branches, currentBranchId) {
    if (branches.length === 0)
        return "  Keine Branches vorhanden.";
    return branches
        .map(b => {
        const current = b.id === currentBranchId ? " (aktiv)" : "";
        const date = b.createdAt.split("T")[0];
        const msgs = b.messages.length;
        const parent = b.parentBranch ? ` <- ${b.parentBranch.slice(0, 6)}` : " (root)";
        return `  ${b.id.slice(0, 8)}  ${b.name}${current} (${msgs} msgs, ${date})${parent}`;
    })
        .join("\n");
}
/**
 * Format branch tree as ASCII tree.
 */
export function formatBranchTree(trees, prefix = "", isLast = true) {
    const lines = [];
    for (let i = 0; i < trees.length; i++) {
        const tree = trees[i];
        const last = i === trees.length - 1;
        const connector = last ? "└─" : "├─";
        const childPrefix = last ? "  " : "│ ";
        lines.push(`${prefix}${connector} ${tree.branch.name} (${tree.branch.messages.length} msgs)`);
        if (tree.children.length > 0) {
            lines.push(formatBranchTree(tree.children, prefix + childPrefix, last));
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=conversation-branch.js.map
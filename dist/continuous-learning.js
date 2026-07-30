import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MORNINGSTAR_DIR = join(homedir(), ".morningstar");
const LEARNING_DIR = join(MORNINGSTAR_DIR, "learning");
const OBSERVATIONS_FILE = join(LEARNING_DIR, "observations.jsonl");
const INSTINCTS_PERSONAL_DIR = join(LEARNING_DIR, "instincts", "personal");
const INSTINCTS_INHERITED_DIR = join(LEARNING_DIR, "instincts", "inherited");
const PROJECTS_DIR = join(LEARNING_DIR, "projects");
const MAX_OBSERVATIONS_PER_FILE = 10_000;
const MAX_FIELD_LENGTH = 500;
const MIN_CONFIDENCE = 0.3;
const MAX_CONFIDENCE = 0.9;
const VALID_DOMAINS = ["code-style", "testing", "git", "debugging", "workflow", "general"];
// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------
function ensureDir(dir) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}
function ensureLearningDirs() {
    ensureDir(LEARNING_DIR);
    ensureDir(INSTINCTS_PERSONAL_DIR);
    ensureDir(INSTINCTS_INHERITED_DIR);
    ensureDir(PROJECTS_DIR);
}
function truncate(value, max) {
    if (value === undefined)
        return undefined;
    if (value.length <= max)
        return value;
    return value.slice(0, max - 3) + "...";
}
function clampConfidence(value) {
    return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, value));
}
function stableHash(input) {
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
function generateInstinctId() {
    const timestamp = Date.now().toString(36);
    const random = createHash("sha256")
        .update(`${Date.now()}-${Math.random()}`)
        .digest("hex")
        .slice(0, 8);
    return `inst_${timestamp}_${random}`;
}
function safeReadJsonFile(filePath) {
    try {
        if (!existsSync(filePath))
            return null;
        const raw = readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function safeWriteJsonFile(filePath, data) {
    const dir = join(filePath, "..");
    ensureDir(dir);
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
function projectObservationsDir(projectId) {
    return join(PROJECTS_DIR, projectId);
}
function projectObservationsFile(projectId) {
    return join(projectObservationsDir(projectId), "observations.jsonl");
}
function instinctFilePath(instinct) {
    if (instinct.scope === "project" && instinct.projectId) {
        const dir = join(PROJECTS_DIR, instinct.projectId, "instincts");
        ensureDir(dir);
        return join(dir, `${instinct.id}.json`);
    }
    return join(INSTINCTS_PERSONAL_DIR, `${instinct.id}.json`);
}
function countLines(filePath) {
    try {
        if (!existsSync(filePath))
            return 0;
        const content = readFileSync(filePath, "utf-8");
        if (content.length === 0)
            return 0;
        // Count newlines. Each JSONL entry ends with \n.
        let count = 0;
        for (let i = 0; i < content.length; i++) {
            if (content.charCodeAt(i) === 10)
                count++;
        }
        return count;
    }
    catch {
        return 0;
    }
}
function rotateObservationsFile(filePath) {
    try {
        if (!existsSync(filePath))
            return;
        const lineCount = countLines(filePath);
        if (lineCount <= MAX_OBSERVATIONS_PER_FILE)
            return;
        // Keep the most recent half of observations
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const keepFrom = Math.floor(lines.length / 2);
        const kept = lines.slice(keepFrom);
        // Archive the old file
        const archivePath = `${filePath}.${Date.now()}.bak`;
        renameSync(filePath, archivePath);
        // Write the kept lines
        writeFileSync(filePath, kept.join("\n") + "\n", "utf-8");
        // Clean up old archives (keep only the 3 most recent)
        const dir = join(filePath, "..");
        const baseName = filePath.split("/").pop() || "observations.jsonl";
        const archives = readdirSync(dir)
            .filter(f => f.startsWith(baseName) && f.endsWith(".bak"))
            .sort()
            .reverse();
        for (const archive of archives.slice(3)) {
            try {
                unlinkSync(join(dir, archive));
            }
            catch {
                // Ignore cleanup failures
            }
        }
    }
    catch {
        // Rotation is best-effort; never block on failure
    }
}
function readJsonlFile(filePath, limit) {
    try {
        if (!existsSync(filePath))
            return [];
        const content = readFileSync(filePath, "utf-8");
        if (content.length === 0)
            return [];
        const lines = content.split("\n").filter(Boolean);
        const startIndex = limit !== undefined && limit < lines.length
            ? lines.length - limit
            : 0;
        const results = [];
        for (let i = startIndex; i < lines.length; i++) {
            try {
                results.push(JSON.parse(lines[i]));
            }
            catch {
                // Skip malformed lines
            }
        }
        return results;
    }
    catch {
        return [];
    }
}
function loadInstinctsFromDir(dir) {
    try {
        if (!existsSync(dir))
            return [];
        const files = readdirSync(dir).filter(f => f.endsWith(".json"));
        const instincts = [];
        for (const file of files) {
            const instinct = safeReadJsonFile(join(dir, file));
            if (instinct && instinct.id && instinct.trigger && instinct.action) {
                instincts.push(instinct);
            }
        }
        return instincts;
    }
    catch {
        return [];
    }
}
function findInstinctFile(instinctId) {
    // Search personal instincts
    const personalPath = join(INSTINCTS_PERSONAL_DIR, `${instinctId}.json`);
    if (existsSync(personalPath))
        return personalPath;
    // Search inherited instincts
    const inheritedPath = join(INSTINCTS_INHERITED_DIR, `${instinctId}.json`);
    if (existsSync(inheritedPath))
        return inheritedPath;
    // Search all project directories
    try {
        if (existsSync(PROJECTS_DIR)) {
            const projectDirs = readdirSync(PROJECTS_DIR);
            for (const projectDir of projectDirs) {
                const projectInstinctsDir = join(PROJECTS_DIR, projectDir, "instincts");
                const projectPath = join(projectInstinctsDir, `${instinctId}.json`);
                if (existsSync(projectPath))
                    return projectPath;
            }
        }
    }
    catch {
        // Ignore filesystem errors during search
    }
    return null;
}
function getGitRemoteUrl(cwd) {
    try {
        const result = execSync("git config --get remote.origin.url", {
            cwd,
            encoding: "utf-8",
            timeout: 3000,
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return result || null;
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Generate a stable project identifier from git remote URL or working directory path.
 * The same project always produces the same ID.
 */
export function detectProjectId(cwd) {
    const remoteUrl = getGitRemoteUrl(cwd);
    if (remoteUrl) {
        // Normalize git URLs: strip protocol, .git suffix, trailing slashes
        const normalized = remoteUrl
            .replace(/^(https?:\/\/|git@|ssh:\/\/)/, "")
            .replace(/\.git$/, "")
            .replace(/\/$/, "")
            .replace(/:/g, "/")
            .toLowerCase();
        return stableHash(normalized);
    }
    // Fall back to absolute path
    return stableHash(cwd);
}
/**
 * Record a tool-use observation. Fire-and-forget: uses sync I/O in try/catch,
 * never throws, never blocks the caller.
 */
export function recordObservation(obs) {
    try {
        ensureLearningDirs();
        const sanitized = {
            timestamp: obs.timestamp || new Date().toISOString(),
            event: (obs.event || "unknown").slice(0, 200),
            tool: obs.tool ? obs.tool.slice(0, 100) : undefined,
            input: truncate(obs.input, MAX_FIELD_LENGTH),
            output: truncate(obs.output, MAX_FIELD_LENGTH),
            success: obs.success,
            projectId: obs.projectId ? obs.projectId.slice(0, 32) : undefined,
            duration: obs.duration !== undefined ? Math.max(0, obs.duration) : undefined,
        };
        // Strip undefined fields to keep JSONL compact
        const clean = Object.fromEntries(Object.entries(sanitized).filter(([, v]) => v !== undefined));
        const line = JSON.stringify(clean) + "\n";
        // Write to global observations
        appendFileSync(OBSERVATIONS_FILE, line, "utf-8");
        rotateObservationsFile(OBSERVATIONS_FILE);
        // Write to project-specific file if projectId is present
        if (sanitized.projectId) {
            const projectDir = projectObservationsDir(sanitized.projectId);
            ensureDir(projectDir);
            const projectFile = projectObservationsFile(sanitized.projectId);
            appendFileSync(projectFile, line, "utf-8");
            rotateObservationsFile(projectFile);
        }
    }
    catch {
        // Silently discard errors -- observation recording must never disrupt the CLI
    }
}
/**
 * Read recent observations, optionally filtered to a specific project.
 * Returns the most recent `limit` observations (default 100).
 */
export function getObservations(projectId, limit = 100) {
    const safeLimit = Math.max(1, Math.min(limit, MAX_OBSERVATIONS_PER_FILE));
    if (projectId) {
        const projectFile = projectObservationsFile(projectId);
        return readJsonlFile(projectFile, safeLimit);
    }
    return readJsonlFile(OBSERVATIONS_FILE, safeLimit);
}
/**
 * Load all instincts from personal, inherited, and optionally project-specific directories.
 * Deduplicates by instinct ID (personal takes precedence over inherited, project is additive).
 */
export function loadInstincts(projectId) {
    const byId = new Map();
    // Load inherited first (lowest precedence)
    for (const inst of loadInstinctsFromDir(INSTINCTS_INHERITED_DIR)) {
        byId.set(inst.id, inst);
    }
    // Load personal (overrides inherited)
    for (const inst of loadInstinctsFromDir(INSTINCTS_PERSONAL_DIR)) {
        byId.set(inst.id, inst);
    }
    // Load project-specific instincts
    if (projectId) {
        const projectInstDir = join(PROJECTS_DIR, projectId, "instincts");
        for (const inst of loadInstinctsFromDir(projectInstDir)) {
            byId.set(inst.id, inst);
        }
    }
    // Sort by confidence descending, then by most recently updated
    return Array.from(byId.values()).sort((a, b) => {
        const confDiff = b.confidence - a.confidence;
        if (Math.abs(confDiff) > 0.01)
            return confDiff;
        return b.updatedAt.localeCompare(a.updatedAt);
    });
}
/**
 * Persist an instinct as an individual JSON file.
 * Location depends on scope: global goes to personal/, project goes to projects/<id>/instincts/.
 */
export function saveInstinct(instinct) {
    ensureLearningDirs();
    const validated = {
        id: instinct.id || generateInstinctId(),
        trigger: instinct.trigger.slice(0, 500),
        action: instinct.action.slice(0, 500),
        confidence: clampConfidence(instinct.confidence),
        domain: VALID_DOMAINS.includes(instinct.domain) ? instinct.domain : "general",
        scope: instinct.scope === "project" ? "project" : "global",
        projectId: instinct.projectId?.slice(0, 32),
        evidence: instinct.evidence.slice(0, 20).map(e => e.slice(0, 200)),
        createdAt: instinct.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    const filePath = instinctFilePath(validated);
    safeWriteJsonFile(filePath, validated);
}
/**
 * Adjust an instinct's confidence by `delta` and persist the change.
 * Returns the updated instinct, or null if not found.
 */
export function updateConfidence(instinctId, delta) {
    const filePath = findInstinctFile(instinctId);
    if (!filePath)
        return null;
    const instinct = safeReadJsonFile(filePath);
    if (!instinct)
        return null;
    const updated = {
        ...instinct,
        confidence: clampConfidence(instinct.confidence + delta),
        updatedAt: new Date().toISOString(),
    };
    safeWriteJsonFile(filePath, updated);
    return updated;
}
/**
 * Promote a project-scoped instinct to global scope.
 * Moves the file from projects/<id>/instincts/ to personal/.
 */
export function promoteInstinct(instinctId) {
    const sourcePath = findInstinctFile(instinctId);
    if (!sourcePath)
        return;
    const instinct = safeReadJsonFile(sourcePath);
    if (!instinct)
        return;
    // Only promote if currently project-scoped
    if (instinct.scope !== "project")
        return;
    const promoted = {
        ...instinct,
        scope: "global",
        projectId: undefined,
        updatedAt: new Date().toISOString(),
    };
    // Write to personal directory
    const destPath = join(INSTINCTS_PERSONAL_DIR, `${promoted.id}.json`);
    ensureDir(INSTINCTS_PERSONAL_DIR);
    safeWriteJsonFile(destPath, promoted);
    // Remove old project-scoped file
    try {
        if (sourcePath !== destPath) {
            unlinkSync(sourcePath);
        }
    }
    catch {
        // Best-effort cleanup
    }
}
/**
 * Export all instincts (personal + inherited) as a JSON string for sharing.
 */
export function exportInstincts() {
    const instincts = loadInstincts();
    const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        count: instincts.length,
        instincts,
    };
    return JSON.stringify(exportData, null, 2);
}
/**
 * Import instincts from a JSON string. Returns counts and any errors encountered.
 * Imported instincts land in the inherited/ directory and do not overwrite personal instincts.
 */
export function importInstincts(json) {
    const errors = [];
    let imported = 0;
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown parse error";
        return { imported: 0, errors: [`Invalid JSON: ${message}`] };
    }
    if (!parsed || typeof parsed !== "object") {
        return { imported: 0, errors: ["Expected a JSON object with an 'instincts' array"] };
    }
    const data = parsed;
    const instinctArray = data.instincts;
    if (!Array.isArray(instinctArray)) {
        return { imported: 0, errors: ["Missing or invalid 'instincts' array in import data"] };
    }
    ensureDir(INSTINCTS_INHERITED_DIR);
    for (let i = 0; i < instinctArray.length; i++) {
        try {
            const raw = instinctArray[i];
            if (!raw.id || !raw.trigger || !raw.action) {
                errors.push(`Instinct at index ${i}: missing required fields (id, trigger, action)`);
                continue;
            }
            // Skip if a personal instinct with this ID already exists (don't overwrite)
            const personalPath = join(INSTINCTS_PERSONAL_DIR, `${raw.id}.json`);
            if (existsSync(personalPath)) {
                errors.push(`Instinct "${raw.id}": skipped (personal version exists)`);
                continue;
            }
            const instinct = {
                id: String(raw.id).slice(0, 50),
                trigger: String(raw.trigger || "").slice(0, 500),
                action: String(raw.action || "").slice(0, 500),
                confidence: clampConfidence(Number(raw.confidence) || 0.5),
                domain: VALID_DOMAINS.includes(raw.domain) ? raw.domain : "general",
                scope: "global", // Imported instincts are always global
                evidence: Array.isArray(raw.evidence)
                    ? raw.evidence.slice(0, 20).map(e => String(e).slice(0, 200))
                    : [],
                createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            const destPath = join(INSTINCTS_INHERITED_DIR, `${instinct.id}.json`);
            safeWriteJsonFile(destPath, instinct);
            imported++;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            errors.push(`Instinct at index ${i}: ${message}`);
        }
    }
    return { imported, errors };
}
/**
 * Format active instincts as a text block suitable for injection into a system prompt.
 * High-confidence instincts appear first. Only instincts above 0.4 confidence are included.
 */
export function getInstinctsPromptAddition(projectId) {
    const instincts = loadInstincts(projectId).filter(i => i.confidence >= 0.4);
    if (instincts.length === 0)
        return "";
    const lines = [
        "## Learned Instincts",
        "",
        "The following patterns have been learned from previous interactions.",
        "Apply them when the trigger condition matches:",
        "",
    ];
    for (const inst of instincts.slice(0, 30)) {
        const conf = Math.round(inst.confidence * 100);
        const scopeTag = inst.scope === "project" ? " [project]" : "";
        lines.push(`- **[${inst.domain}]${scopeTag}** (${conf}% confidence)`);
        lines.push(`  When: ${inst.trigger}`);
        lines.push(`  Do: ${inst.action}`);
        lines.push("");
    }
    return lines.join("\n");
}
/**
 * Format a human-readable status display for the /instinct-status command.
 */
export function formatInstinctsStatus(projectId) {
    const allInstincts = loadInstincts(projectId);
    const globalObs = getObservationCount(OBSERVATIONS_FILE);
    const projectObs = projectId ? getObservationCount(projectObservationsFile(projectId)) : 0;
    const personal = allInstincts.filter(i => i.scope === "global" && !isInherited(i.id));
    const inherited = allInstincts.filter(i => isInherited(i.id));
    const project = allInstincts.filter(i => i.scope === "project");
    const highConf = allInstincts.filter(i => i.confidence >= 0.7);
    const medConf = allInstincts.filter(i => i.confidence >= 0.4 && i.confidence < 0.7);
    const lowConf = allInstincts.filter(i => i.confidence < 0.4);
    const lines = [
        "=== Morningstar Continuous Learning Status ===",
        "",
        "Observations:",
        `  Global: ${globalObs.toLocaleString()}`,
    ];
    if (projectId) {
        lines.push(`  Project (${projectId.slice(0, 8)}...): ${projectObs.toLocaleString()}`);
    }
    lines.push("");
    lines.push("Instincts:");
    lines.push(`  Personal:  ${personal.length}`);
    lines.push(`  Inherited: ${inherited.length}`);
    lines.push(`  Project:   ${project.length}`);
    lines.push(`  Total:     ${allInstincts.length}`);
    lines.push("");
    lines.push("Confidence Distribution:");
    lines.push(`  High (>=0.7):   ${highConf.length}`);
    lines.push(`  Medium (0.4-0.7): ${medConf.length}`);
    lines.push(`  Low (<0.4):     ${lowConf.length}`);
    if (allInstincts.length > 0) {
        lines.push("");
        lines.push("Domain Breakdown:");
        const domainCounts = new Map();
        for (const inst of allInstincts) {
            domainCounts.set(inst.domain, (domainCounts.get(inst.domain) || 0) + 1);
        }
        const sortedDomains = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
        for (const [domain, count] of sortedDomains) {
            lines.push(`  ${domain}: ${count}`);
        }
    }
    if (highConf.length > 0) {
        lines.push("");
        lines.push("Top Instincts (highest confidence):");
        for (const inst of highConf.slice(0, 5)) {
            const conf = Math.round(inst.confidence * 100);
            lines.push(`  [${conf}%] ${inst.trigger}`);
            lines.push(`         -> ${inst.action}`);
        }
    }
    lines.push("");
    lines.push("=== End Status ===");
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// Internal Helpers (used by formatInstinctsStatus)
// ---------------------------------------------------------------------------
function getObservationCount(filePath) {
    return countLines(filePath);
}
function isInherited(instinctId) {
    const inheritedPath = join(INSTINCTS_INHERITED_DIR, `${instinctId}.json`);
    return existsSync(inheritedPath);
}
//# sourceMappingURL=continuous-learning.js.map
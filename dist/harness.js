// ─── Diagnostic & Health System ──────────────────────────
// Provides /doctor, /audit, and /repair commands for the
// morningstar CLI installation. Validates directory structure,
// config integrity, content quality, and offers auto-repair.
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { parseFrontmatter } from "./frontmatter.js";
// ─── Constants ──────────────────────────────────────────────
const BASE_DIR = join(homedir(), ".morningstar");
const EXPECTED_DIRS = [
    "agents",
    "skills",
    "commands",
    "rules",
    "rules/common",
    "learning",
];
const EXPECTED_FILES = [
    { name: "config.json", isJson: true },
    { name: "settings.json", isJson: true },
    { name: "memory.json", isJson: true },
    { name: "teams.json", isJson: true },
    { name: "mcp-catalog.json", isJson: true },
];
const KNOWN_RULE_SUBDIRS = new Set([
    "common",
    "typescript",
    "python",
    "golang",
    "rust",
    "java",
    "kotlin",
    "cpp",
    "csharp",
    "php",
    "swift",
    "perl",
]);
const LARGE_FILE_THRESHOLD = 100 * 1024; // 100 KB
const OBSERVATIONS_WARN_THRESHOLD = 10 * 1024 * 1024; // 10 MB
// ─── Helpers ────────────────────────────────────────────────
function safeReadJson(filePath) {
    try {
        const raw = readFileSync(filePath, "utf-8");
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
            return { valid: true, data: null };
        }
        const data = JSON.parse(trimmed);
        return { valid: true, data };
    }
    catch (err) {
        return { valid: false, data: null, error: err.message };
    }
}
function safeReaddirSync(dir) {
    try {
        return readdirSync(dir);
    }
    catch {
        return [];
    }
}
function safeStat(filePath) {
    try {
        const st = statSync(filePath);
        return { size: st.size, isDir: st.isDirectory() };
    }
    catch {
        return null;
    }
}
function countMdFiles(dir) {
    return safeReaddirSync(dir).filter(f => f.endsWith(".md")).length;
}
function validateFrontmatter(filePath) {
    try {
        const raw = readFileSync(filePath, "utf-8");
        const trimmed = raw.trimStart();
        if (!trimmed.startsWith("---")) {
            return { valid: true }; // No frontmatter is acceptable
        }
        const endIdx = trimmed.indexOf("---", 3);
        if (endIdx === -1) {
            return { valid: false, error: "Unclosed frontmatter block (missing closing ---)" };
        }
        // parseFrontmatter will handle the actual parsing
        parseFrontmatter(raw);
        return { valid: true };
    }
    catch (err) {
        return { valid: false, error: err.message };
    }
}
function collectMdFilePaths(dir) {
    const paths = [];
    if (!existsSync(dir))
        return paths;
    for (const entry of safeReaddirSync(dir)) {
        const full = join(dir, entry);
        const st = safeStat(full);
        if (!st)
            continue;
        if (st.isDir) {
            // Recurse into subdirectories (e.g., skills/[name]/SKILL.md)
            paths.push(...collectMdFilePaths(full));
        }
        else if (entry.endsWith(".md")) {
            paths.push(full);
        }
    }
    return paths;
}
// ─── Doctor Checks ──────────────────────────────────────────
function checkConfigFile() {
    const filePath = join(BASE_DIR, "config.json");
    if (!existsSync(filePath)) {
        return {
            name: "config.json exists",
            category: "config",
            status: "fail",
            message: "config.json not found at " + filePath,
            fix: "create-config",
        };
    }
    const result = safeReadJson(filePath);
    if (!result.valid) {
        return {
            name: "config.json valid JSON",
            category: "config",
            status: "fail",
            message: `config.json is invalid JSON: ${result.error}`,
            fix: "reset-config",
        };
    }
    return {
        name: "config.json",
        category: "config",
        status: "pass",
        message: "config.json exists and is valid JSON",
    };
}
function checkSettingsFile() {
    const filePath = join(BASE_DIR, "settings.json");
    if (!existsSync(filePath)) {
        return {
            name: "settings.json exists",
            category: "config",
            status: "warn",
            message: "settings.json not found (using defaults)",
            fix: "create-settings",
        };
    }
    const result = safeReadJson(filePath);
    if (!result.valid) {
        return {
            name: "settings.json valid JSON",
            category: "config",
            status: "fail",
            message: `settings.json is invalid JSON: ${result.error}`,
            fix: "reset-settings",
        };
    }
    return {
        name: "settings.json",
        category: "config",
        status: "pass",
        message: "settings.json exists and is valid JSON",
    };
}
function checkAgentsDir() {
    const dir = join(BASE_DIR, "agents");
    if (!existsSync(dir)) {
        return {
            name: "agents/ directory",
            category: "agents",
            status: "fail",
            message: "agents/ directory does not exist",
            fix: "create-dir:agents",
        };
    }
    const count = countMdFiles(dir);
    if (count === 0) {
        return {
            name: "agents/ has content",
            category: "agents",
            status: "warn",
            message: "agents/ directory exists but contains no .md files",
        };
    }
    return {
        name: "agents/ directory",
        category: "agents",
        status: "pass",
        message: `agents/ directory contains ${count} agent file${count !== 1 ? "s" : ""}`,
    };
}
function checkSkillsDir() {
    const dir = join(BASE_DIR, "skills");
    if (!existsSync(dir)) {
        return {
            name: "skills/ directory",
            category: "skills",
            status: "fail",
            message: "skills/ directory does not exist",
            fix: "create-dir:skills",
        };
    }
    const entries = safeReaddirSync(dir);
    const mdFiles = entries.filter(f => f.endsWith(".md"));
    // Also count subdirectories that contain SKILL.md
    let subdirSkills = 0;
    for (const entry of entries) {
        const entryPath = join(dir, entry);
        const st = safeStat(entryPath);
        if (st?.isDir && existsSync(join(entryPath, "SKILL.md"))) {
            subdirSkills++;
        }
    }
    const total = mdFiles.length + subdirSkills;
    if (total === 0) {
        return {
            name: "skills/ has content",
            category: "skills",
            status: "warn",
            message: "skills/ directory exists but contains no skills",
        };
    }
    return {
        name: "skills/ directory",
        category: "skills",
        status: "pass",
        message: `skills/ directory contains ${total} skill${total !== 1 ? "s" : ""} (${mdFiles.length} flat, ${subdirSkills} subdirectory)`,
    };
}
function checkCommandsDir() {
    const dir = join(BASE_DIR, "commands");
    if (!existsSync(dir)) {
        return {
            name: "commands/ directory",
            category: "commands",
            status: "fail",
            message: "commands/ directory does not exist",
            fix: "create-dir:commands",
        };
    }
    const count = countMdFiles(dir);
    if (count === 0) {
        return {
            name: "commands/ has content",
            category: "commands",
            status: "warn",
            message: "commands/ directory exists but contains no .md files",
        };
    }
    return {
        name: "commands/ directory",
        category: "commands",
        status: "pass",
        message: `commands/ directory contains ${count} command file${count !== 1 ? "s" : ""}`,
    };
}
function checkRulesDir() {
    const checks = [];
    const dir = join(BASE_DIR, "rules");
    if (!existsSync(dir)) {
        checks.push({
            name: "rules/ directory",
            category: "rules",
            status: "fail",
            message: "rules/ directory does not exist",
            fix: "create-dir:rules",
        });
        return checks;
    }
    const entries = safeReaddirSync(dir);
    const flatMd = entries.filter(f => f.endsWith(".md")).length;
    const subdirs = entries.filter(e => {
        const st = safeStat(join(dir, e));
        return st?.isDir;
    });
    checks.push({
        name: "rules/ directory",
        category: "rules",
        status: "pass",
        message: `rules/ directory contains ${flatMd} flat file${flatMd !== 1 ? "s" : ""} and ${subdirs.length} subdirector${subdirs.length !== 1 ? "ies" : "y"}`,
    });
    // Check for common/ subdirectory
    const commonDir = join(dir, "common");
    if (!existsSync(commonDir)) {
        checks.push({
            name: "rules/common/ subdirectory",
            category: "rules",
            status: "warn",
            message: "rules/common/ subdirectory does not exist (recommended for shared rules)",
            fix: "create-dir:rules/common",
        });
    }
    else {
        const commonCount = countMdFiles(commonDir);
        checks.push({
            name: "rules/common/ subdirectory",
            category: "rules",
            status: commonCount > 0 ? "pass" : "warn",
            message: commonCount > 0
                ? `rules/common/ contains ${commonCount} rule file${commonCount !== 1 ? "s" : ""}`
                : "rules/common/ exists but contains no .md files",
        });
    }
    return checks;
}
function checkMemoryFile() {
    const filePath = join(BASE_DIR, "memory.json");
    if (!existsSync(filePath)) {
        return {
            name: "memory.json exists",
            category: "memory",
            status: "warn",
            message: "memory.json not found (will be created on first use)",
            fix: "create-memory",
        };
    }
    const result = safeReadJson(filePath);
    if (!result.valid) {
        return {
            name: "memory.json valid JSON",
            category: "memory",
            status: "fail",
            message: `memory.json is invalid JSON: ${result.error}`,
            fix: "reset-memory",
        };
    }
    const entries = Array.isArray(result.data) ? result.data.length : 0;
    return {
        name: "memory.json",
        category: "memory",
        status: "pass",
        message: `memory.json is valid with ${entries} entr${entries !== 1 ? "ies" : "y"}`,
    };
}
function checkLearningDir() {
    const dir = join(BASE_DIR, "learning");
    if (!existsSync(dir)) {
        return {
            name: "learning/ directory",
            category: "learning",
            status: "warn",
            message: "learning/ directory does not exist",
            fix: "create-dir:learning",
        };
    }
    return {
        name: "learning/ directory",
        category: "learning",
        status: "pass",
        message: "learning/ directory exists",
    };
}
function checkDuplicateAgentIds() {
    // Built-in agent IDs from agents.ts
    const builtInIds = new Set(["code", "debug", "review", "architect", "security", "test", "docs", "refactor", "git", "devops"]);
    const agentsDir = join(BASE_DIR, "agents");
    if (!existsSync(agentsDir)) {
        return {
            name: "agent ID conflicts",
            category: "agents",
            status: "pass",
            message: "No file agents to check for conflicts",
        };
    }
    const fileIds = safeReaddirSync(agentsDir)
        .filter(f => f.endsWith(".md"))
        .map(f => basename(f, ".md"));
    const conflicts = fileIds.filter(id => builtInIds.has(id));
    if (conflicts.length > 0) {
        return {
            name: "agent ID conflicts",
            category: "agents",
            status: "warn",
            message: `File agents shadow built-in agents: ${conflicts.join(", ")} (file agents take priority)`,
        };
    }
    return {
        name: "agent ID conflicts",
        category: "agents",
        status: "pass",
        message: `No conflicts between ${fileIds.length} file agent${fileIds.length !== 1 ? "s" : ""} and built-in agents`,
    };
}
function checkBrokenFrontmatter(category, dir, label) {
    const checks = [];
    const mdFiles = collectMdFilePaths(dir);
    const broken = [];
    for (const filePath of mdFiles) {
        const result = validateFrontmatter(filePath);
        if (!result.valid) {
            broken.push(`${basename(filePath)}: ${result.error}`);
        }
    }
    if (broken.length > 0) {
        checks.push({
            name: `${label} frontmatter`,
            category,
            status: "warn",
            message: `${broken.length} file${broken.length !== 1 ? "s" : ""} with broken frontmatter:\n    ${broken.join("\n    ")}`,
        });
    }
    else if (mdFiles.length > 0) {
        checks.push({
            name: `${label} frontmatter`,
            category,
            status: "pass",
            message: `All ${mdFiles.length} ${label.toLowerCase()} file${mdFiles.length !== 1 ? "s have" : " has"} valid frontmatter`,
        });
    }
    return checks;
}
// ─── Audit Checks ───────────────────────────────────────────
function auditDuplicateAgents() {
    const dir = join(BASE_DIR, "agents");
    if (!existsSync(dir)) {
        return {
            name: "duplicate agents",
            category: "agents",
            status: "pass",
            message: "No agents directory to audit",
        };
    }
    const mdFiles = safeReaddirSync(dir).filter(f => f.endsWith(".md"));
    const nameMap = new Map();
    for (const file of mdFiles) {
        try {
            const raw = readFileSync(join(dir, file), "utf-8");
            const { frontmatter } = parseFrontmatter(raw);
            const name = (frontmatter.name || basename(file, ".md")).toLowerCase();
            const existing = nameMap.get(name) ?? [];
            nameMap.set(name, [...existing, file]);
        }
        catch {
            // Skip unreadable files
        }
    }
    const duplicates = Array.from(nameMap.entries())
        .filter(([, files]) => files.length > 1);
    if (duplicates.length > 0) {
        const details = duplicates
            .map(([name, files]) => `"${name}" in: ${files.join(", ")}`)
            .join("; ");
        return {
            name: "duplicate agents",
            category: "agents",
            status: "warn",
            message: `Found ${duplicates.length} duplicate agent name${duplicates.length !== 1 ? "s" : ""}: ${details}`,
            fix: "remove-duplicate-agents",
        };
    }
    return {
        name: "duplicate agents",
        category: "agents",
        status: "pass",
        message: `No duplicate agent names found across ${mdFiles.length} file${mdFiles.length !== 1 ? "s" : ""}`,
    };
}
function auditOrphanedSkills() {
    const dir = join(BASE_DIR, "skills");
    if (!existsSync(dir)) {
        return {
            name: "skills without triggers",
            category: "skills",
            status: "pass",
            message: "No skills directory to audit",
        };
    }
    const orphaned = [];
    const mdFiles = collectMdFilePaths(dir);
    for (const filePath of mdFiles) {
        try {
            const raw = readFileSync(filePath, "utf-8");
            const { frontmatter } = parseFrontmatter(raw);
            const triggers = frontmatter.triggers;
            const description = frontmatter.description;
            const hasTriggers = Array.isArray(triggers) && triggers.length > 0;
            const hasDescription = typeof description === "string" && description.trim().length > 0;
            if (!hasTriggers && !hasDescription) {
                orphaned.push(basename(filePath, ".md"));
            }
        }
        catch {
            // Skip unreadable files
        }
    }
    if (orphaned.length > 0) {
        const shown = orphaned.length <= 10 ? orphaned.join(", ") : orphaned.slice(0, 10).join(", ") + ` (+${orphaned.length - 10} more)`;
        return {
            name: "skills without triggers/description",
            category: "skills",
            status: "warn",
            message: `${orphaned.length} skill${orphaned.length !== 1 ? "s" : ""} have no triggers and no description: ${shown}`,
        };
    }
    return {
        name: "skills without triggers/description",
        category: "skills",
        status: "pass",
        message: `All skills have triggers or descriptions`,
    };
}
function auditOrphanedRuleDirs() {
    const dir = join(BASE_DIR, "rules");
    if (!existsSync(dir)) {
        return {
            name: "orphaned rule directories",
            category: "rules",
            status: "pass",
            message: "No rules directory to audit",
        };
    }
    const entries = safeReaddirSync(dir);
    const unknown = [];
    for (const entry of entries) {
        const entryPath = join(dir, entry);
        const st = safeStat(entryPath);
        if (st?.isDir && !KNOWN_RULE_SUBDIRS.has(entry)) {
            unknown.push(entry);
        }
    }
    if (unknown.length > 0) {
        return {
            name: "orphaned rule directories",
            category: "rules",
            status: "warn",
            message: `${unknown.length} unknown rule subdirector${unknown.length !== 1 ? "ies" : "y"}: ${unknown.join(", ")} (not in known language list)`,
        };
    }
    return {
        name: "orphaned rule directories",
        category: "rules",
        status: "pass",
        message: "All rule subdirectories match known languages",
    };
}
function auditContentCounts() {
    const counts = {
        agents: 0,
        skills: 0,
        commands: 0,
        rules: 0,
    };
    const agentsDir = join(BASE_DIR, "agents");
    if (existsSync(agentsDir)) {
        counts.agents = countMdFiles(agentsDir);
    }
    const skillsDir = join(BASE_DIR, "skills");
    if (existsSync(skillsDir)) {
        counts.skills = collectMdFilePaths(skillsDir).length;
    }
    const commandsDir = join(BASE_DIR, "commands");
    if (existsSync(commandsDir)) {
        counts.commands = countMdFiles(commandsDir);
    }
    const rulesDir = join(BASE_DIR, "rules");
    if (existsSync(rulesDir)) {
        counts.rules = collectMdFilePaths(rulesDir).length;
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
    return {
        name: "content inventory",
        category: "config",
        status: "pass",
        message: `Total content: ${total} files (${parts})`,
    };
}
function auditLargeFiles() {
    const large = [];
    const dirsToScan = ["agents", "skills", "commands", "rules"];
    for (const subdir of dirsToScan) {
        const dir = join(BASE_DIR, subdir);
        const files = collectMdFilePaths(dir);
        for (const filePath of files) {
            const st = safeStat(filePath);
            if (st && st.size > LARGE_FILE_THRESHOLD) {
                large.push({ path: filePath.replace(BASE_DIR + "/", ""), sizeKb: Math.round(st.size / 1024) });
            }
        }
    }
    if (large.length > 0) {
        const details = large.map(f => `${f.path} (${f.sizeKb}KB)`).join(", ");
        return {
            name: "large files (>100KB)",
            category: "config",
            status: "warn",
            message: `${large.length} file${large.length !== 1 ? "s" : ""} exceed 100KB: ${details}`,
        };
    }
    return {
        name: "large files (>100KB)",
        category: "config",
        status: "pass",
        message: "No content files exceed 100KB",
    };
}
function auditMcpCatalog() {
    const filePath = join(BASE_DIR, "mcp-catalog.json");
    if (!existsSync(filePath)) {
        return {
            name: "MCP catalog",
            category: "mcp",
            status: "pass",
            message: "mcp-catalog.json not present (optional)",
        };
    }
    const result = safeReadJson(filePath);
    if (!result.valid) {
        return {
            name: "MCP catalog valid JSON",
            category: "mcp",
            status: "fail",
            message: `mcp-catalog.json is invalid JSON: ${result.error}`,
            fix: "reset-mcp-catalog",
        };
    }
    const st = safeStat(filePath);
    const sizeKb = st ? Math.round(st.size / 1024) : 0;
    return {
        name: "MCP catalog",
        category: "mcp",
        status: "pass",
        message: `mcp-catalog.json is valid (${sizeKb}KB)`,
    };
}
function auditObservationsSize() {
    const filePath = join(BASE_DIR, "learning", "observations.jsonl");
    if (!existsSync(filePath)) {
        return {
            name: "observations.jsonl size",
            category: "learning",
            status: "pass",
            message: "observations.jsonl not present (will be created by learning system)",
        };
    }
    const st = safeStat(filePath);
    if (!st) {
        return {
            name: "observations.jsonl size",
            category: "learning",
            status: "pass",
            message: "Could not stat observations.jsonl",
        };
    }
    const sizeMb = st.size / (1024 * 1024);
    if (st.size > OBSERVATIONS_WARN_THRESHOLD) {
        return {
            name: "observations.jsonl size",
            category: "learning",
            status: "warn",
            message: `observations.jsonl is ${sizeMb.toFixed(1)}MB (consider pruning, threshold: 10MB)`,
        };
    }
    return {
        name: "observations.jsonl size",
        category: "learning",
        status: "pass",
        message: `observations.jsonl is ${sizeMb.toFixed(1)}MB`,
    };
}
// ─── Public API ─────────────────────────────────────────────
/**
 * Run all health checks (doctor mode).
 * Validates the structural integrity of the ~/.morningstar installation.
 */
export function runDoctor() {
    const checks = [];
    try {
        // Config files
        checks.push(checkConfigFile());
        checks.push(checkSettingsFile());
        // Content directories
        checks.push(checkAgentsDir());
        checks.push(checkSkillsDir());
        checks.push(checkCommandsDir());
        checks.push(...checkRulesDir());
        // Data files
        checks.push(checkMemoryFile());
        checks.push(checkLearningDir());
        // Cross-cutting checks
        checks.push(checkDuplicateAgentIds());
        // Frontmatter validation across all content types
        const contentDirs = [
            { category: "agents", dir: join(BASE_DIR, "agents"), label: "Agent" },
            { category: "skills", dir: join(BASE_DIR, "skills"), label: "Skill" },
            { category: "commands", dir: join(BASE_DIR, "commands"), label: "Command" },
            { category: "rules", dir: join(BASE_DIR, "rules"), label: "Rule" },
        ];
        for (const { category, dir, label } of contentDirs) {
            if (existsSync(dir)) {
                checks.push(...checkBrokenFrontmatter(category, dir, label));
            }
        }
    }
    catch (err) {
        checks.push({
            name: "doctor runtime error",
            category: "config",
            status: "fail",
            message: `Unexpected error during doctor checks: ${err.message}`,
        });
    }
    return Promise.resolve(checks);
}
/**
 * Run deeper analysis (audit mode).
 * Identifies duplicates, orphans, bloat, and content quality issues.
 */
export function runAudit() {
    const checks = [];
    try {
        // Content inventory
        checks.push(auditContentCounts());
        // Duplicate detection
        checks.push(auditDuplicateAgents());
        // Orphan detection
        checks.push(auditOrphanedSkills());
        checks.push(auditOrphanedRuleDirs());
        // Size analysis
        checks.push(auditLargeFiles());
        checks.push(auditObservationsSize());
        // JSON integrity
        checks.push(auditMcpCatalog());
    }
    catch (err) {
        checks.push({
            name: "audit runtime error",
            category: "config",
            status: "fail",
            message: `Unexpected error during audit checks: ${err.message}`,
        });
    }
    return Promise.resolve(checks);
}
/**
 * Auto-fix issues identified by doctor/audit checks.
 * Only acts on checks that have a `fix` property.
 *
 * Supported fix actions:
 * - create-dir:<subdir>   Create missing directory
 * - create-config         Initialize config.json
 * - create-settings       Initialize settings.json
 * - create-memory         Initialize memory.json
 * - reset-config          Overwrite invalid config.json
 * - reset-settings        Overwrite invalid settings.json
 * - reset-memory          Overwrite invalid memory.json
 * - reset-mcp-catalog     Overwrite invalid mcp-catalog.json
 * - remove-duplicate-agents  Remove duplicates, keeping newest
 */
export function runRepair(checks) {
    let fixed = 0;
    let remaining = 0;
    const fixable = checks.filter(c => c.status !== "pass" && c.fix);
    for (const check of fixable) {
        const success = applyFix(check.fix);
        if (success) {
            fixed++;
        }
        else {
            remaining++;
        }
    }
    return { fixed, remaining };
}
function applyFix(fix) {
    try {
        // Directory creation
        if (fix.startsWith("create-dir:")) {
            const subdir = fix.slice("create-dir:".length);
            const dirPath = join(BASE_DIR, subdir);
            if (!existsSync(dirPath)) {
                mkdirSync(dirPath, { recursive: true });
            }
            return true;
        }
        // JSON file initialization/reset
        const jsonFixMap = {
            "create-config": { path: join(BASE_DIR, "config.json"), defaultContent: "{}" },
            "reset-config": { path: join(BASE_DIR, "config.json"), defaultContent: "{}" },
            "create-settings": { path: join(BASE_DIR, "settings.json"), defaultContent: "{}" },
            "reset-settings": { path: join(BASE_DIR, "settings.json"), defaultContent: "{}" },
            "create-memory": { path: join(BASE_DIR, "memory.json"), defaultContent: "[]" },
            "reset-memory": { path: join(BASE_DIR, "memory.json"), defaultContent: "[]" },
            "reset-mcp-catalog": { path: join(BASE_DIR, "mcp-catalog.json"), defaultContent: "{}" },
        };
        const jsonFix = jsonFixMap[fix];
        if (jsonFix) {
            if (!existsSync(BASE_DIR)) {
                mkdirSync(BASE_DIR, { recursive: true });
            }
            writeFileSync(jsonFix.path, jsonFix.defaultContent, "utf-8");
            return true;
        }
        // Duplicate agent removal (keep newest)
        if (fix === "remove-duplicate-agents") {
            return removeDuplicateAgents();
        }
        return false;
    }
    catch {
        return false;
    }
}
function removeDuplicateAgents() {
    const dir = join(BASE_DIR, "agents");
    if (!existsSync(dir))
        return false;
    const mdFiles = safeReaddirSync(dir).filter(f => f.endsWith(".md"));
    const nameMap = new Map();
    for (const file of mdFiles) {
        try {
            const filePath = join(dir, file);
            const raw = readFileSync(filePath, "utf-8");
            const { frontmatter } = parseFrontmatter(raw);
            const name = (frontmatter.name || basename(file, ".md")).toLowerCase();
            const st = statSync(filePath);
            const existing = nameMap.get(name) ?? [];
            nameMap.set(name, [...existing, { file, mtime: st.mtimeMs }]);
        }
        catch {
            // Skip unreadable files
        }
    }
    let removed = false;
    for (const [, files] of nameMap) {
        if (files.length <= 1)
            continue;
        // Sort by mtime descending (newest first), remove all but the newest
        const sorted = [...files].sort((a, b) => b.mtime - a.mtime);
        for (let i = 1; i < sorted.length; i++) {
            try {
                unlinkSync(join(dir, sorted[i].file));
                removed = true;
            }
            catch {
                // Continue with other duplicates
            }
        }
    }
    return removed;
}
// ─── Report Formatting ──────────────────────────────────────
const STATUS_ICONS = {
    pass: chalk.green("\u2713"),
    warn: chalk.yellow("\u26A0"),
    fail: chalk.red("\u2717"),
};
const STATUS_COLORS = {
    pass: chalk.green,
    warn: chalk.yellow,
    fail: chalk.red,
};
const CATEGORY_LABELS = {
    config: "Configuration",
    agents: "Agents",
    skills: "Skills",
    commands: "Commands",
    rules: "Rules",
    mcp: "MCP Servers",
    hooks: "Hooks",
    memory: "Memory",
    learning: "Learning",
};
function groupByCategory(checks) {
    const groups = new Map();
    for (const check of checks) {
        const existing = groups.get(check.category) ?? [];
        groups.set(check.category, [...existing, check]);
    }
    return groups;
}
function formatSummary(checks) {
    const total = checks.length;
    const passed = checks.filter(c => c.status === "pass").length;
    const warned = checks.filter(c => c.status === "warn").length;
    const failed = checks.filter(c => c.status === "fail").length;
    const parts = [];
    parts.push(chalk.green(`${passed} passed`));
    if (warned > 0)
        parts.push(chalk.yellow(`${warned} warnings`));
    if (failed > 0)
        parts.push(chalk.red(`${failed} failed`));
    const overall = failed > 0 ? chalk.red("ISSUES FOUND") : warned > 0 ? chalk.yellow("WARNINGS") : chalk.green("ALL CLEAR");
    return [
        "",
        chalk.dim("─".repeat(50)),
        `  ${chalk.bold("Summary")}: ${parts.join(", ")} (${total} total)`,
        `  ${chalk.bold("Status")}:  ${overall}`,
        chalk.dim("─".repeat(50)),
    ].join("\n");
}
/**
 * Format doctor results as colored terminal output.
 * Groups checks by category with status icons and summary.
 */
export function formatDoctorReport(checks) {
    const lines = [
        "",
        chalk.bold("  Morningstar Doctor"),
        chalk.dim(`  Checking installation at ${BASE_DIR}`),
        "",
    ];
    const groups = groupByCategory(checks);
    for (const [category, categoryChecks] of groups) {
        lines.push(`  ${chalk.bold(CATEGORY_LABELS[category])}`);
        for (const check of categoryChecks) {
            const icon = STATUS_ICONS[check.status];
            const colorFn = STATUS_COLORS[check.status];
            lines.push(`    ${icon} ${colorFn(check.message)}`);
            if (check.fix && check.status !== "pass") {
                lines.push(`      ${chalk.dim(`Fix: ${check.fix}`)}`);
            }
        }
        lines.push("");
    }
    lines.push(formatSummary(checks));
    return lines.join("\n");
}
/**
 * Format audit results as a detailed terminal report.
 * Similar to doctor report but with more detail and context.
 */
export function formatAuditReport(checks) {
    const lines = [
        "",
        chalk.bold("  Morningstar Audit"),
        chalk.dim(`  Deep analysis of ${BASE_DIR}`),
        "",
    ];
    const groups = groupByCategory(checks);
    for (const [category, categoryChecks] of groups) {
        lines.push(`  ${chalk.bold.underline(CATEGORY_LABELS[category])}`);
        lines.push("");
        for (const check of categoryChecks) {
            const icon = STATUS_ICONS[check.status];
            const colorFn = STATUS_COLORS[check.status];
            lines.push(`    ${icon} ${chalk.bold(check.name)}`);
            // Handle multi-line messages (indent continuation lines)
            const msgLines = check.message.split("\n");
            for (const msgLine of msgLines) {
                lines.push(`      ${colorFn(msgLine)}`);
            }
            if (check.fix && check.status !== "pass") {
                lines.push(`      ${chalk.dim("Suggested fix:")} ${chalk.cyan(check.fix)}`);
            }
            lines.push("");
        }
    }
    lines.push(formatSummary(checks));
    return lines.join("\n");
}
//# sourceMappingURL=harness.js.map
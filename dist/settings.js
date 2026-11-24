import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync, } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
// ─── Paths ──────────────────────────────────────────────────
const GLOBAL_DIR = join(homedir(), ".morningstar");
const GLOBAL_SETTINGS = join(GLOBAL_DIR, "settings.json");
function ensurePrivateDirectory(path) {
    if (existsSync(path)) {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(".morningstar must be a real directory inside the workspace");
        }
    }
    else {
        mkdirSync(path, { recursive: false, mode: 0o700 });
    }
    try {
        chmodSync(path, 0o700);
    }
    catch { }
}
function canonicalProjectDirectory(cwd, create) {
    const lexicalWorkspace = resolve(cwd);
    if (!existsSync(lexicalWorkspace)) {
        throw new Error(`Workspace does not exist: ${lexicalWorkspace}`);
    }
    const workspace = realpathSync(lexicalWorkspace);
    const lexicalDirectory = join(workspace, ".morningstar");
    if (!existsSync(lexicalDirectory)) {
        if (!create)
            return { workspace, directory: lexicalDirectory };
        ensurePrivateDirectory(lexicalDirectory);
    }
    else {
        const stat = lstatSync(lexicalDirectory);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(".morningstar must be a real directory inside the workspace");
        }
        if (create) {
            try {
                chmodSync(lexicalDirectory, 0o700);
            }
            catch { }
        }
    }
    const directory = realpathSync(lexicalDirectory);
    const rel = relative(workspace, directory);
    if (rel !== ".morningstar" || rel.startsWith(`..${sep}`)) {
        throw new Error(".morningstar resolves outside the workspace");
    }
    return { workspace, directory };
}
function assertRegularFileOrMissing(path) {
    if (!existsSync(path))
        return;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(`${basename(path)} must be a regular file`);
    }
}
function atomicWrite(path, content, mode) {
    assertRegularFileOrMissing(path);
    const directory = dirname(path);
    const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
    try {
        writeFileSync(temporary, content, {
            encoding: "utf-8",
            flag: "wx",
            mode,
        });
        chmodSync(temporary, mode);
        // Recheck immediately before rename. rename replaces a final symlink
        // instead of following it, closing the final-component race.
        assertRegularFileOrMissing(path);
        renameSync(temporary, path);
        chmodSync(path, mode);
    }
    catch (error) {
        rmSync(temporary, { force: true });
        throw error;
    }
}
function getSafeProjectSettingsPath(cwd, createDirectory) {
    const { workspace, directory } = canonicalProjectDirectory(cwd, createDirectory);
    const path = join(directory, "settings.local.json");
    assertRegularFileOrMissing(path);
    return { workspace, path };
}
function writePrivateJson(path, value) {
    atomicWrite(path, JSON.stringify(value, null, 2), 0o600);
}
export function getGlobalSettingsPath() { return GLOBAL_SETTINGS; }
export function getProjectSettingsPath(cwd) {
    return join(cwd, ".morningstar", "settings.local.json");
}
export function projectSettingsExist(cwd) {
    try {
        return existsSync(getSafeProjectSettingsPath(cwd, false).path);
    }
    catch {
        return false;
    }
}
// ─── Load ───────────────────────────────────────────────────
export function loadGlobalSettings() {
    try {
        if (existsSync(GLOBAL_SETTINGS)) {
            return JSON.parse(readFileSync(GLOBAL_SETTINGS, "utf-8"));
        }
    }
    catch { }
    return {};
}
export function loadProjectSettings(cwd) {
    try {
        const path = getSafeProjectSettingsPath(cwd, false).path;
        if (existsSync(path)) {
            return JSON.parse(readFileSync(path, "utf-8"));
        }
    }
    catch { }
    return {};
}
// ─── Merge ──────────────────────────────────────────────────
function mergeArrays(a, b) {
    if (!a && !b)
        return undefined;
    return [...new Set([...(a || []), ...(b || [])])];
}
export function mergeSettings(global, local) {
    // Merge hooks: combine arrays for same event
    const mergedHooks = {};
    for (const [event, hooks] of Object.entries(global.hooks || {})) {
        mergedHooks[event] = [...hooks];
    }
    for (const [event, hooks] of Object.entries(local.hooks || {})) {
        mergedHooks[event] = [...(mergedHooks[event] || []), ...hooks];
    }
    return {
        permissions: {
            allow: mergeArrays(global.permissions?.allow, local.permissions?.allow),
            deny: mergeArrays(global.permissions?.deny, local.permissions?.deny),
            ask: mergeArrays(global.permissions?.ask, local.permissions?.ask),
            defaultMode: global.permissions?.defaultMode,
            disableBypassPermissionsMode: global.permissions?.disableBypassPermissionsMode,
            allowedCommands: mergeArrays(global.permissions?.allowedCommands, local.permissions?.allowedCommands),
            deniedCommands: mergeArrays(global.permissions?.deniedCommands, local.permissions?.deniedCommands),
        },
        // A repository is untrusted until Morningstar has an explicit workspace
        // trust mechanism. Never let a tracked project file select a hosted model
        // or consume credentials from the user's global key store.
        model: global.model,
        provider: global.provider,
        temperature: local.temperature ?? global.temperature,
        maxTokens: local.maxTokens ?? global.maxTokens,
        customInstructions: [global.customInstructions, local.customInstructions].filter(Boolean).join("\n") || undefined,
        env: { ...(global.env || {}), ...(local.env || {}) },
        allowedTools: mergeArrays(global.allowedTools, local.allowedTools),
        deniedTools: mergeArrays(global.deniedTools, local.deniedTools),
        hooks: Object.keys(mergedHooks).length > 0 ? mergedHooks : undefined,
        // MCP commands spawn child processes. Project-local settings are untrusted,
        // so they must never add or shadow globally approved MCP server definitions.
        mcpServers: global.mcpServers ? { ...global.mcpServers } : undefined,
        allowManagedPermissionRulesOnly: global.allowManagedPermissionRulesOnly,
        allowManagedHooksOnly: global.allowManagedHooksOnly,
        disableAllHooks: global.disableAllHooks,
        sandbox: global.sandbox,
        language: local.language ?? global.language,
        outputStyle: local.outputStyle ?? global.outputStyle,
        trustedHooks: global.trustedHooks ?? global.hooks,
    };
}
export { loadSettings } from "./settings-sources.js";
// ─── Init ───────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
    permissions: {
        allow: ["read", "write", "edit", "ls", "glob", "grep", "git"],
        deny: [],
        allowedCommands: ["npm test", "npm run *", "npx *", "git *", "node *", "tsc *"],
        deniedCommands: ["rm -rf /", "sudo *", "chmod -R 777 *"],
    },
    customInstructions: "",
    env: {},
};
export function initProjectSettings(cwd) {
    const { workspace, path } = getSafeProjectSettingsPath(cwd, true);
    // Project-local settings may contain environment values and approval rules.
    // Always keep the whole directory out of version control, including in a
    // repository that did not have a .gitignore before initialization.
    const gitignore = join(workspace, ".gitignore");
    assertRegularFileOrMissing(gitignore);
    const content = existsSync(gitignore) ? readFileSync(gitignore, "utf-8") : "";
    const gitignoreMode = existsSync(gitignore)
        ? lstatSync(gitignore).mode & 0o777
        : 0o644;
    writePrivateJson(path, DEFAULT_SETTINGS);
    if (!content.split(/\r?\n/).some((line) => line.trim() === ".morningstar/")) {
        const prefix = content.length > 0 ? content.trimEnd() + "\n" : "";
        atomicWrite(gitignore, prefix + ".morningstar/\n", gitignoreMode);
    }
    return path;
}
// ─── Permission Checks ─────────────────────────────────────
export function isToolAllowed(tool, settings) {
    if (settings.permissions?.deny?.includes(tool))
        return "deny";
    if (settings.permissions?.allow?.includes(tool))
        return "allow";
    return "ask";
}
function matchCommand(pattern, command) {
    if (pattern === command)
        return true;
    if (pattern.endsWith(" *")) {
        const prefix = pattern.slice(0, -2);
        return command === prefix || command.startsWith(prefix + " ");
    }
    return false;
}
export function isCommandAllowed(command, settings) {
    const cmd = command.trim();
    // Deny takes priority
    for (const pat of settings.permissions?.deniedCommands || []) {
        if (matchCommand(pat, cmd))
            return "deny";
    }
    for (const pat of settings.permissions?.allowedCommands || []) {
        if (matchCommand(pat, cmd))
            return "allow";
    }
    return "ask";
}
export function addToProjectSetting(cwd, key, value) {
    const path = getSafeProjectSettingsPath(cwd, true).path;
    let settings = {};
    try {
        if (existsSync(path))
            settings = JSON.parse(readFileSync(path, "utf-8"));
    }
    catch { }
    if (!settings.permissions)
        settings.permissions = {};
    const list = settings.permissions[key] || [];
    if (!list.includes(value))
        list.push(value);
    settings.permissions[key] = list;
    writePrivateJson(path, settings);
}
//# sourceMappingURL=settings.js.map
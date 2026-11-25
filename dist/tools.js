import { isTelegramTool, executeTelegramTool } from "./telegram/channel-tools.js";
import { bashExecutable, gitExecutable } from "./runtime/platform-process.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync, spawn, spawnSync } from "node:child_process";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { dirname, join } from "node:path";
import { glob } from "glob";
import { trackChange, captureBeforeState } from "./undo.js";
import { checkCommand } from "./safety.js";
import { askJerry } from "./jerry-bridge.js";
import { extractToolCalls } from "./tool-parser.js";
import { unknownToolMessage } from "./final-answer.js";
import { verifyProject, formatVerification } from "./verification.js";
import { runSkillCommand } from "./skills-runtime.js";
import { runVaultCommandAsync } from "./vault.js";
import { callQualifiedMCPTool, isMCPToolName, getConnectedMCPTools } from "./mcp.js";
import { rankTools } from "./runtime/tool-discovery.js";
import { guardRead, guardWrite, resolvePatternWithinWorkspace, resolveWithinWorkspace } from "./file-guards.js";
import { sandboxCommand } from "./sandbox.js";
const MAX_OUTPUT = 15000; // truncate long outputs
// ─── Active Agent Tool Filter ───
// When set, only these tools are allowed for the current agent
let _activeAgentTools = null;
export function setAgentToolFilter(tools) {
    _activeAgentTools = tools && tools.length > 0 ? new Set(tools.map(t => t.toLowerCase())) : null;
}
export function isToolAllowedForAgent(toolName) {
    if (!_activeAgentTools)
        return true;
    return _activeAgentTools.has(toolName.toLowerCase());
}
export function getAgentToolFilter() {
    if (!_activeAgentTools)
        return null;
    return Array.from(_activeAgentTools);
}
function searchTools(query) {
    if (typeof query !== "string" || !query.trim() || query.length > 500) {
        return { tool: "tool_search", success: false, result: "Provide a non-empty tool search query (max 500 characters)." };
    }
    const matches = rankTools(getConnectedMCPTools()
        .filter(tool => isToolAllowedForAgent(tool.qualifiedName))
        .map(tool => ({ name: tool.qualifiedName, description: tool.description ?? "" })), query).slice(0, 8);
    return { tool: "tool_search", success: true, result: JSON.stringify({ tools: matches, note: matches.length
                ? "Use the exact tool name and its provided parameter schema. Discovery does not authorize execution."
                : "No matching connected tools. Try another service or task keyword." }) };
}
const backgroundTasks = new Map();
function generateTaskId() {
    return `bg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
export function getBackgroundTaskStatus(taskId) {
    const task = backgroundTasks.get(taskId);
    if (!task)
        return { tool: "bg_status", result: `Task nicht gefunden: ${taskId}`, success: false };
    const elapsed = ((Date.now() - task.startTime) / 1000).toFixed(1);
    const status = task.done ? `Beendet (exit ${task.exitCode})` : `Laeuft (${elapsed}s)`;
    const output = (task.stdout + task.stderr).trim() || "(kein Output bisher)";
    return {
        tool: "bg_status",
        result: `Task: ${task.id}\nCommand: ${task.command}\nPID: ${task.pid}\nStatus: ${status}\n\n${truncate(output)}`,
        success: true,
        taskId: task.id,
    };
}
export function listBackgroundTasks() {
    if (backgroundTasks.size === 0)
        return { tool: "bg_list", result: "Keine Background-Tasks.", success: true };
    const lines = Array.from(backgroundTasks.values()).map((t) => {
        const elapsed = ((Date.now() - t.startTime) / 1000).toFixed(1);
        const status = t.done ? `done (exit ${t.exitCode})` : `running (${elapsed}s)`;
        return `  ${t.id}  ${status}  ${t.command.slice(0, 60)}`;
    });
    return { tool: "bg_list", result: lines.join("\n"), success: true };
}
// ─── Stats Tracking ───
export const toolStats = {
    calls: 0,
    byTool: {},
    filesRead: 0,
    filesWritten: 0,
    filesEdited: 0,
    filesDeleted: 0,
    bashCommands: 0,
};
function countTool(tool) {
    toolStats.calls++;
    toolStats.byTool[tool] = (toolStats.byTool[tool] || 0) + 1;
}
function truncate(s, max = MAX_OUTPUT) {
    if (s.length <= max)
        return s;
    return s.slice(0, max) + `\n...[truncated, ${s.length - max} chars omitted]`;
}
// ─── Read File ───
export function readFile(filePath, cwd, offset, limit) {
    countTool("read");
    try {
        const checked = resolveWithinWorkspace(filePath, cwd);
        if (!checked.ok)
            return { tool: "read", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        if (!existsSync(abs))
            return { tool: "read", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const raw = readFileSync(abs);
        const readErr = guardRead(raw.length, raw);
        if (readErr)
            return { tool: "read", result: `⛔ ${readErr}`, success: false };
        const content = raw.toString("utf-8");
        const allLines = content.split("\n");
        const totalLines = allLines.length;
        // Apply offset (1-indexed) and limit
        const startLine = offset && offset > 0 ? offset - 1 : 0;
        const endLine = limit && limit > 0 ? Math.min(startLine + limit, totalLines) : totalLines;
        const selectedLines = allLines.slice(startLine, endLine);
        const lines = selectedLines.map((l, i) => `${String(startLine + i + 1).padStart(4)} | ${l}`).join("\n");
        const rangeInfo = (offset || limit) ? `\n[Showing lines ${startLine + 1}-${endLine} of ${totalLines}]` : "";
        toolStats.filesRead++;
        return { tool: "read", result: truncate(lines) + rangeInfo, success: true, filePath, linesChanged: totalLines, startLineNumber: startLine + 1 };
    }
    catch (e) {
        return { tool: "read", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Write File ───
export function writeFile(filePath, content, cwd) {
    countTool("write");
    try {
        const writeErr = guardWrite(Buffer.byteLength(content, "utf-8"));
        if (writeErr)
            return { tool: "write", result: `⛔ ${writeErr}`, success: false };
        const checked = resolveWithinWorkspace(filePath, cwd);
        if (!checked.ok)
            return { tool: "write", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        const dir = dirname(abs);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        // Track for undo
        const prev = captureBeforeState(abs);
        trackChange({
            type: "write",
            filePath: abs,
            previousContent: prev,
            newContent: content,
            timestamp: new Date().toISOString(),
            description: `write ${filePath}`,
        });
        writeFileSync(abs, content, "utf-8");
        const lineCount = content.split("\n").length;
        toolStats.filesWritten++;
        return { tool: "write", result: `Wrote ${lineCount} lines to ${filePath}`, success: true, filePath, linesChanged: lineCount, diff: { filePath, oldStr: prev ?? "", newStr: content }, startLineNumber: 1 };
    }
    catch (e) {
        return { tool: "write", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Edit File (find & replace) ───
export function editFile(filePath, oldStr, newStr, cwd, replaceAll = false) {
    countTool("edit");
    try {
        const checked = resolveWithinWorkspace(filePath, cwd);
        if (!checked.ok)
            return { tool: "edit", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        if (!existsSync(abs))
            return { tool: "edit", result: `Datei nicht gefunden: ${filePath}`, success: false };
        const content = readFileSync(abs, "utf-8");
        if (!content.includes(oldStr)) {
            return { tool: "edit", result: `String nicht gefunden in ${filePath}. Keine Aenderung.`, success: false };
        }
        const newContent = replaceAll ? content.replaceAll(oldStr, newStr) : content.replace(oldStr, newStr);
        // Track for undo
        trackChange({
            type: "edit",
            filePath: abs,
            previousContent: content,
            newContent,
            timestamp: new Date().toISOString(),
            description: `edit ${filePath}`,
        });
        writeFileSync(abs, newContent, "utf-8");
        const addedLines = newStr.split("\n").length;
        const removedLines = oldStr.split("\n").length;
        const occurrences = replaceAll ? content.split(oldStr).length - 1 : 1;
        const delta = (addedLines - removedLines) * occurrences;
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
        const replaceInfo = replaceAll && occurrences > 1 ? ` (${occurrences} occurrences)` : "";
        toolStats.filesEdited++;
        return { tool: "edit", result: `Updated ${filePath} (${deltaStr} lines)${replaceInfo}`, success: true, diff: { filePath, oldStr: content, newStr: newContent }, filePath, linesChanged: addedLines, startLineNumber: 1 };
    }
    catch (e) {
        return { tool: "edit", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Delete File ───
export function deleteFile(filePath, cwd) {
    countTool("delete");
    try {
        const checked = resolveWithinWorkspace(filePath, cwd);
        if (!checked.ok)
            return { tool: "delete", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        if (!existsSync(abs))
            return { tool: "delete", result: `Datei nicht gefunden: ${filePath}`, success: false };
        // Track for undo
        const prev = captureBeforeState(abs);
        trackChange({
            type: "delete",
            filePath: abs,
            previousContent: prev,
            newContent: null,
            timestamp: new Date().toISOString(),
            description: `delete ${filePath}`,
        });
        unlinkSync(abs);
        toolStats.filesDeleted++;
        return { tool: "delete", result: `Deleted ${filePath}`, success: true, filePath, diff: { filePath, oldStr: prev ?? "", newStr: "" }, startLineNumber: 1 };
    }
    catch (e) {
        return { tool: "delete", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Bash Execution ───
export async function bash(command, cwd, timeout, runInBackground, signal) {
    countTool("bash");
    toolStats.bashCommands++;
    // Safety gate (no-op unless a guard is installed, e.g. by the Telegram gateway).
    const decision = checkCommand(command);
    if (!decision.allow) {
        return { tool: "bash", result: decision.reason || "⛔ Befehl durch Safety-Gate blockiert.", success: false, command };
    }
    if (signal?.aborted) {
        return { tool: "bash", result: "Abgebrochen — Befehl wurde nicht gestartet.", success: false, command };
    }
    const executableCommand = sandboxCommand(command, cwd);
    // Background execution via spawn
    if (runInBackground) {
        const taskId = generateTaskId();
        const child = spawn(bashExecutable(), ["-c", executableCommand], {
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            detached: false,
        });
        const task = {
            id: taskId,
            command,
            pid: child.pid || 0,
            startTime: Date.now(),
            stdout: "",
            stderr: "",
            exitCode: null,
            done: false,
        };
        child.stdout.on("data", (d) => { task.stdout += d.toString(); });
        child.stderr.on("data", (d) => { task.stderr += d.toString(); });
        child.on("close", (code) => { task.exitCode = code; task.done = true; });
        child.on("error", (err) => { task.stderr += err.message; task.done = true; task.exitCode = 1; });
        backgroundTasks.set(taskId, task);
        return { tool: "bash", result: `Background-Task gestartet: ${taskId} (PID ${task.pid})\nCommand: ${command}\nNutze bg_status mit taskId="${taskId}" um den Status zu pruefen.`, success: true, command, taskId };
    }
    // Foreground execution stays cancellable throughout the child-process
    // lifetime. A detached process group lets /stop terminate descendants too.
    const timeoutMs = Math.min(Math.max((timeout || 30) * 1000, 1000), 600000);
    const maxOutputBytes = 5 * 1024 * 1024;
    return new Promise((resolveResult) => {
        const child = spawn(bashExecutable(), ["-c", executableCommand], {
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            detached: process.platform !== "win32",
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        let stopReason = null;
        let forceKillTimer;
        const terminate = () => {
            if (!child.pid)
                return;
            if (process.platform === "win32") {
                // Terminate the owned process tree before killing its root: otherwise
                // Windows reparents grandchildren and they can continue writing files.
                spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
                    stdio: "ignore", timeout: 5000, windowsHide: true,
                });
                return;
            }
            try {
                process.kill(-child.pid, "SIGTERM");
            }
            catch {
                try {
                    child.kill("SIGTERM");
                }
                catch { }
            }
            forceKillTimer = setTimeout(() => {
                try {
                    process.kill(-child.pid, "SIGKILL");
                }
                catch {
                    try {
                        child.kill("SIGKILL");
                    }
                    catch { }
                }
            }, 1000);
            forceKillTimer.unref?.();
        };
        const requestStop = (reason) => {
            if (stopReason)
                return;
            stopReason = reason;
            terminate();
        };
        const onAbort = () => requestStop("abort");
        signal?.addEventListener("abort", onAbort, { once: true });
        const timeoutTimer = setTimeout(() => requestStop("timeout"), timeoutMs);
        timeoutTimer.unref?.();
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutTimer);
            if (forceKillTimer)
                clearTimeout(forceKillTimer);
            signal?.removeEventListener("abort", onAbort);
            resolveResult(result);
        };
        const capture = (target, data) => {
            if (settled)
                return;
            if (target === "stdout")
                stdout += data.toString();
            else
                stderr += data.toString();
            if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutputBytes) {
                requestStop("output");
            }
        };
        child.stdout.on("data", (data) => capture("stdout", data));
        child.stderr.on("data", (data) => capture("stderr", data));
        child.once("error", (error) => {
            finish({ tool: "bash", result: `Bash-Start fehlgeschlagen: ${error.message}`, success: false, command });
        });
        child.once("close", (code, closeSignal) => {
            const output = (stdout + stderr).trim();
            if (stopReason === "abort") {
                finish({ tool: "bash", result: truncate(`Abgebrochen.\n${output}`.trim()), success: false, command, exitCode: code, exitSignal: closeSignal });
                return;
            }
            if (stopReason === "timeout") {
                finish({ tool: "bash", result: truncate(`Timeout nach ${timeoutMs / 1000}s.\n${output}`.trim()), success: false, command, exitCode: code, exitSignal: closeSignal });
                return;
            }
            if (stopReason === "output") {
                finish({ tool: "bash", result: truncate(`Output-Limit von 5 MB erreicht.\n${output}`.trim()), success: false, command, exitCode: code, exitSignal: closeSignal });
                return;
            }
            if (code === 0) {
                finish({ tool: "bash", result: truncate(output || "(kein Output)"), success: true, command, exitCode: 0 });
                return;
            }
            finish({
                tool: "bash",
                result: truncate(output || `Bash beendet (${closeSignal || `exit ${code ?? "?"}`}).`),
                success: false,
                command,
                exitCode: code,
                exitSignal: closeSignal,
            });
        });
    });
}
// ─── Grep (Content Search) ───
export function grepSearch(pattern, cwd, fileGlob, contextBefore, contextAfter, context, caseSensitive = true, maxResults = 50) {
    countTool("grep");
    try {
        const cwdCheck = resolveWithinWorkspace(".", cwd);
        if (!cwdCheck.ok)
            return { tool: "grep", result: `⛔ ${cwdCheck.reason}`, success: false };
        if (fileGlob) {
            const patternCheck = resolvePatternWithinWorkspace(fileGlob, cwd);
            if (!patternCheck.ok)
                return { tool: "grep", result: `⛔ ${patternCheck.reason}`, success: false };
        }
        // Build grep argv dynamically. Never interpolate model-controlled input
        // into a shell command: pattern and include glob are literal argv entries.
        const flags = ["-rn"];
        if (!caseSensitive)
            flags.push("-i");
        if (context && context > 0)
            flags.push("-C", String(context));
        else {
            if (contextBefore && contextBefore > 0)
                flags.push("-B", String(contextBefore));
            if (contextAfter && contextAfter > 0)
                flags.push("-A", String(contextAfter));
        }
        const includeGlobs = fileGlob
            ? [fileGlob]
            : ["*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.go", "*.rs", "*.java", "*.css", "*.json", "*.md"];
        for (const include of includeGlobs)
            flags.push(`--include=${include}`);
        const limit = Math.min(Math.max(maxResults, 1), 500);
        const proc = spawnSync(gitExecutable("grep"), [...flags, "--", pattern, "."], {
            cwd: cwdCheck.resolved,
            encoding: "utf-8",
            timeout: 10000,
            maxBuffer: 1024 * 1024 * 5,
            stdio: ["ignore", "pipe", "pipe"],
        });
        if (proc.error)
            throw proc.error;
        if (proc.status !== 0 && proc.status !== 1) {
            return { tool: "grep", result: truncate((proc.stderr || "").trim() || `grep exit ${proc.status}`), success: false };
        }
        const output = proc.stdout || "";
        if (!output.trim())
            return { tool: "grep", result: "Keine Treffer.", success: true };
        const lines = output.split("\n");
        const limited = lines.slice(0, limit).join("\n");
        return { tool: "grep", result: truncate(limited), success: true };
    }
    catch (e) {
        if (e.code === "ENOENT") {
            return { tool: "grep", result: "grep ist nicht installiert.", success: false };
        }
        return { tool: "grep", result: "Keine Treffer.", success: true };
    }
}
// ─── Glob (File Search) ───
export async function globSearch(pattern, cwd) {
    countTool("glob");
    try {
        const patternCheck = resolvePatternWithinWorkspace(pattern, cwd);
        if (!patternCheck.ok)
            return { tool: "glob", result: `⛔ ${patternCheck.reason}`, success: false };
        const files = await glob(pattern, { cwd, ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"], nodir: true });
        if (files.length === 0)
            return { tool: "glob", result: "Keine Dateien gefunden.", success: true };
        for (const file of files) {
            const checked = resolveWithinWorkspace(file, cwd);
            if (!checked.ok)
                return { tool: "glob", result: `⛔ ${checked.reason}`, success: false };
        }
        const sorted = files.sort().slice(0, 100);
        return { tool: "glob", result: sorted.join("\n") + (files.length > 100 ? `\n...(+${files.length - 100} weitere)` : ""), success: true };
    }
    catch (e) {
        return { tool: "glob", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── List Directory ───
export function listDir(dirPath, cwd) {
    countTool("ls");
    try {
        const checked = resolveWithinWorkspace(dirPath || ".", cwd);
        if (!checked.ok)
            return { tool: "ls", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        if (!existsSync(abs))
            return { tool: "ls", result: `Verzeichnis nicht gefunden: ${dirPath}`, success: false };
        const entries = readdirSync(abs).map((name) => {
            const full = join(abs, name);
            try {
                const stat = statSync(full);
                return stat.isDirectory() ? `  ${name}/` : `  ${name} (${formatSize(stat.size)})`;
            }
            catch {
                return `  ${name}`;
            }
        });
        return { tool: "ls", result: entries.join("\n") || "(leer)", success: true };
    }
    catch (e) {
        return { tool: "ls", result: `Fehler: ${e.message}`, success: false };
    }
}
function linkedTimeoutSignal(parentSignal, timeoutMs) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted)
        onAbort();
    else
        parentSignal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(new Error("Timeout")), timeoutMs);
    timeout.unref?.();
    return {
        signal: controller.signal,
        dispose: () => {
            clearTimeout(timeout);
            parentSignal?.removeEventListener("abort", onAbort);
        },
    };
}
// ─── Web Search (DuckDuckGo) ───
export async function webSearch(query, signal) {
    countTool("web");
    const linked = linkedTimeoutSignal(signal, 10000);
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; Morningstar-CLI/1.0)" },
            signal: linked.signal,
        });
        const html = await res.text();
        // Parse results from DuckDuckGo HTML
        const results = [];
        const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = resultRegex.exec(html)) !== null && results.length < 8) {
            const rawUrl = m[1].replace(/.*uddg=([^&]+).*/, "$1");
            const decodedUrl = decodeURIComponent(rawUrl);
            const title = m[2].replace(/<[^>]+>/g, "").trim();
            const snippet = m[3].replace(/<[^>]+>/g, "").trim();
            if (title && decodedUrl)
                results.push({ title, url: decodedUrl, snippet });
        }
        if (results.length === 0)
            return { tool: "web", result: `Keine Ergebnisse fuer: ${query}`, success: true };
        const formatted = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
        return { tool: "web", result: truncate(formatted), success: true };
    }
    catch (e) {
        if (signal?.aborted) {
            return { tool: "web", result: "Abgebrochen.", success: false };
        }
        return { tool: "web", result: `Web-Suche Fehler: ${e.message}`, success: false };
    }
    finally {
        linked.dispose();
    }
}
// ─── Fetch URL ───
const MAX_FETCH_REDIRECTS = 5;
const MAX_FETCH_RESPONSE_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const blockedFetchAddresses = new BlockList();
const globallyRoutableFetchIPv6 = new BlockList();
globallyRoutableFetchIPv6.addSubnet("2000::", 3, "ipv6");
for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
]) {
    blockedFetchAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
    ["::", 96],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
    ["fc00::", 7],
    ["fe80::", 10],
    ["fec0::", 10],
    ["ff00::", 8],
]) {
    blockedFetchAddresses.addSubnet(network, prefix, "ipv6");
}
/** True for loopback, private, link-local, multicast, and reserved IP space. */
export function isBlockedFetchAddress(address) {
    const family = isIP(address);
    if (family === 4)
        return blockedFetchAddresses.check(address, "ipv4");
    if (family === 6) {
        return !globallyRoutableFetchIPv6.check(address, "ipv6")
            || blockedFetchAddresses.check(address, "ipv6");
    }
    return true;
}
const defaultFetchAddressLookup = async (hostname) => {
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records
        .filter((record) => record.family === 4 || record.family === 6)
        .map(({ address, family }) => ({ address, family }));
};
export async function resolvePublicFetchTarget(rawUrl, lookup = defaultFetchAddressLookup) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch {
        return { ok: false, reason: "Ungueltige URL." };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, reason: "Nur http/https URLs erlaubt." };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, reason: "URLs mit Zugangsdaten sind nicht erlaubt." };
    }
    const hostname = parsed.hostname
        .replace(/^\[|\]$/g, "")
        .replace(/\.+$/, "")
        .toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
        return { ok: false, reason: "Lokale Ziele sind nicht erlaubt." };
    }
    const literalFamily = isIP(hostname);
    const addresses = literalFamily === 4 || literalFamily === 6
        ? [{ address: hostname, family: literalFamily }]
        : await lookup(hostname);
    if (addresses.length === 0) {
        return { ok: false, reason: "Hostname konnte nicht aufgeloest werden." };
    }
    const normalized = addresses
        .map(({ address }) => ({ address, family: isIP(address) }))
        .filter((record) => record.family === 4 || record.family === 6);
    if (normalized.length !== addresses.length
        || normalized.some(({ address }) => isBlockedFetchAddress(address))) {
        return {
            ok: false,
            reason: "Lokale, private oder reservierte Netzwerkziele sind nicht erlaubt.",
        };
    }
    return { ok: true, url: parsed, address: normalized[0] };
}
const defaultFetchHopRequester = (url, address, signal) => new Promise((resolveRequest, rejectRequest) => {
    const originalHostname = url.hostname.replace(/^\[|\]$/g, "");
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
        protocol: url.protocol,
        hostname: address.address,
        family: address.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
            Host: url.host,
            "User-Agent": "Mozilla/5.0 (compatible; Morningstar-CLI/1.0)",
        },
        servername: url.protocol === "https:" && isIP(originalHostname) === 0
            ? originalHostname
            : undefined,
        signal,
    }, (response) => {
        const statusCode = response.statusCode ?? 0;
        if (REDIRECT_STATUS_CODES.has(statusCode)) {
            response.resume();
            resolveRequest({ statusCode, headers: response.headers, body: "" });
            return;
        }
        const chunks = [];
        let receivedBytes = 0;
        response.on("data", (chunk) => {
            receivedBytes += chunk.length;
            if (receivedBytes > MAX_FETCH_RESPONSE_BYTES) {
                response.destroy(new Error("Fetch-Antwort ist groesser als 2 MB."));
                return;
            }
            chunks.push(chunk);
        });
        response.on("end", () => {
            resolveRequest({
                statusCode,
                headers: response.headers,
                body: Buffer.concat(chunks).toString("utf-8"),
            });
        });
        response.on("error", rejectRequest);
    });
    request.on("error", rejectRequest);
    request.end();
});
function redirectLocation(headers) {
    const value = headers.location;
    return Array.isArray(value) ? value[0] : value;
}
export async function fetchUrl(url, signal, options = {}) {
    countTool("fetch");
    const linked = linkedTimeoutSignal(signal, 15000);
    try {
        const lookup = options.lookup ?? defaultFetchAddressLookup;
        const request = options.request ?? defaultFetchHopRequester;
        const maxRedirects = Math.min(Math.max(options.maxRedirects ?? MAX_FETCH_REDIRECTS, 0), MAX_FETCH_REDIRECTS);
        let currentUrl = url;
        let response;
        for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
            const target = await resolvePublicFetchTarget(currentUrl, lookup);
            if (!target.ok) {
                return { tool: "fetch", result: `Fetch blockiert: ${target.reason}`, success: false };
            }
            response = await request(target.url, target.address, linked.signal);
            if (Buffer.byteLength(response.body, "utf-8") > MAX_FETCH_RESPONSE_BYTES) {
                return {
                    tool: "fetch",
                    result: "Fetch blockiert: Antwort ist groesser als 2 MB.",
                    success: false,
                };
            }
            if (!REDIRECT_STATUS_CODES.has(response.statusCode))
                break;
            const location = redirectLocation(response.headers);
            if (!location)
                break;
            if (redirectCount === maxRedirects) {
                return {
                    tool: "fetch",
                    result: `Fetch blockiert: Mehr als ${maxRedirects} Redirects.`,
                    success: false,
                };
            }
            try {
                currentUrl = new URL(location, target.url).toString();
            }
            catch {
                return {
                    tool: "fetch",
                    result: "Fetch blockiert: Ungueltiges Redirect-Ziel.",
                    success: false,
                };
            }
        }
        let text = response?.body ?? "";
        // Strip script, style, nav, footer, header tags
        text = text.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
        // Strip all HTML tags
        text = text.replace(/<[^>]+>/g, " ");
        // Decode common HTML entities
        text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
        // Collapse whitespace
        text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        // Limit length
        if (text.length > 10000)
            text = text.slice(0, 10000) + "\n...[truncated]";
        return { tool: "fetch", result: text || "(leere Seite)", success: true };
    }
    catch (e) {
        if (signal?.aborted) {
            return { tool: "fetch", result: "Abgebrochen.", success: false };
        }
        return { tool: "fetch", result: `Fetch Fehler: ${e.message}`, success: false };
    }
    finally {
        linked.dispose();
    }
}
// ─── GitHub CLI ───
/**
 * Split a command-like string into argv without invoking a shell.
 *
 * Quotes and backslash escapes are supported only for grouping/literal
 * characters. Variables, substitutions, redirects, pipes, and separators are
 * never interpreted because the resulting argv is passed straight to `gh`.
 */
export function parseCommandArguments(input) {
    const args = [];
    let current = "";
    let quote = null;
    let escaped = false;
    let started = false;
    const push = () => {
        if (!started)
            return;
        args.push(current);
        current = "";
        started = false;
    };
    for (const character of input.trim()) {
        if (escaped) {
            current += character;
            escaped = false;
            started = true;
            continue;
        }
        if (character === "\\") {
            escaped = true;
            started = true;
            continue;
        }
        if (quote) {
            if (character === quote)
                quote = null;
            else
                current += character;
            started = true;
            continue;
        }
        if (character === "'" || character === '"') {
            quote = character;
            started = true;
            continue;
        }
        if (/\s/.test(character)) {
            push();
            continue;
        }
        current += character;
        started = true;
    }
    if (escaped || quote)
        return null;
    push();
    return args;
}
export function ghCli(command, cwd) {
    countTool("gh");
    const args = parseCommandArguments(command);
    if (!args || args.length === 0) {
        return { tool: "gh", result: "Ungueltige oder leere GitHub-CLI-Argumente.", success: false };
    }
    const action = args.slice(0, 2).join(" ").toLowerCase();
    const blocked = new Set(["repo delete", "repo archive", "auth logout"]);
    if (blocked.has(action)) {
        return { tool: "gh", result: `Blockiert: 'gh ${action}' ist nicht erlaubt.`, success: false };
    }
    try {
        const proc = spawnSync("gh", args, {
            cwd,
            encoding: "utf-8",
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 2,
            stdio: ["pipe", "pipe", "pipe"],
        });
        if (proc.error) {
            if (proc.error.code === "ENOENT") {
                return { tool: "gh", result: "GitHub CLI (gh) ist nicht installiert. Installieren: https://cli.github.com/", success: false };
            }
            return { tool: "gh", result: truncate(proc.error.message), success: false };
        }
        const output = (proc.stdout || "").trim();
        const error = (proc.stderr || "").trim();
        if (proc.status === 0) {
            return { tool: "gh", result: truncate(output || "(kein Output)"), success: true };
        }
        const message = error || output || `gh wurde mit Status ${proc.status ?? "unbekannt"} beendet.`;
        if (message.includes("not found") || message.includes("command not found") || message.includes("not recognized")) {
            return { tool: "gh", result: "GitHub CLI (gh) ist nicht installiert. Installieren: https://cli.github.com/", success: false };
        }
        return { tool: "gh", result: truncate(message), success: false };
    }
    catch (e) {
        return { tool: "gh", result: truncate(e.message), success: false };
    }
}
// ─── Git Status ───
export function gitStatus(cwd) {
    countTool("git");
    try {
        const status = execSync("git status --short && echo '---' && git log --oneline -5", {
            cwd, encoding: "utf-8", timeout: 5000,
        });
        const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
        return { tool: "git", result: `Branch: ${branch}\n${status}`, success: true };
    }
    catch (e) {
        return { tool: "git", result: `Git Fehler: ${e.message}`, success: false };
    }
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1048576)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
}
// ─── Notebook Edit (.ipynb) ───
export function notebookEdit(notebookPath, cellNumber, editMode, cwd, cellType, newSource) {
    countTool("notebook_edit");
    try {
        const checked = resolveWithinWorkspace(notebookPath, cwd);
        if (!checked.ok)
            return { tool: "notebook_edit", result: `⛔ ${checked.reason}`, success: false };
        const abs = checked.resolved;
        if (!existsSync(abs))
            return { tool: "notebook_edit", result: `Notebook nicht gefunden: ${notebookPath}`, success: false };
        const raw = readFileSync(abs, "utf-8");
        const nb = JSON.parse(raw);
        if (!nb.cells || !Array.isArray(nb.cells))
            return { tool: "notebook_edit", result: "Ungueltige Notebook-Struktur (keine cells).", success: false };
        const prevContent = raw;
        switch (editMode) {
            case "replace": {
                if (cellNumber < 0 || cellNumber >= nb.cells.length)
                    return { tool: "notebook_edit", result: `Cell ${cellNumber} existiert nicht (0-${nb.cells.length - 1}).`, success: false };
                if (!newSource && newSource !== "")
                    return { tool: "notebook_edit", result: "newSource ist erforderlich fuer replace.", success: false };
                const sourceLines = newSource.split("\n").map((l, i, arr) => i < arr.length - 1 ? l + "\n" : l);
                nb.cells[cellNumber].source = sourceLines;
                if (cellType)
                    nb.cells[cellNumber].cell_type = cellType;
                break;
            }
            case "insert": {
                if (!cellType)
                    return { tool: "notebook_edit", result: "cellType ist erforderlich fuer insert.", success: false };
                const sourceLines = (newSource || "").split("\n").map((l, i, arr) => i < arr.length - 1 ? l + "\n" : l);
                const newCell = {
                    cell_type: cellType,
                    metadata: {},
                    source: sourceLines,
                };
                if (cellType === "code") {
                    newCell.execution_count = null;
                    newCell.outputs = [];
                }
                const insertIdx = Math.min(Math.max(cellNumber, 0), nb.cells.length);
                nb.cells.splice(insertIdx, 0, newCell);
                break;
            }
            case "delete": {
                if (cellNumber < 0 || cellNumber >= nb.cells.length)
                    return { tool: "notebook_edit", result: `Cell ${cellNumber} existiert nicht (0-${nb.cells.length - 1}).`, success: false };
                nb.cells.splice(cellNumber, 1);
                break;
            }
        }
        const newContent = JSON.stringify(nb, null, 1);
        // Track for undo
        trackChange({
            type: "edit",
            filePath: abs,
            previousContent: prevContent,
            newContent,
            timestamp: new Date().toISOString(),
            description: `notebook_edit ${notebookPath} cell ${cellNumber} (${editMode})`,
        });
        writeFileSync(abs, newContent, "utf-8");
        toolStats.filesEdited++;
        return { tool: "notebook_edit", result: `Notebook ${notebookPath}: cell ${cellNumber} ${editMode}d. Total cells: ${nb.cells.length}`, success: true, filePath: notebookPath, diff: { filePath: notebookPath, oldStr: prevContent, newStr: newContent }, startLineNumber: 1 };
    }
    catch (e) {
        return { tool: "notebook_edit", result: `Fehler: ${e.message}`, success: false };
    }
}
// ─── Parse & Execute Tool Calls from AI Response ───
const AUTO_EXECUTE_ENV = "MORNINGSTAR_AUTO_EXECUTE_CODE_BLOCKS";
/** Opt-in gate for executing plain ```bash/```python blocks found in ordinary model prose. */
export function autoExecuteEnabled() {
    const flag = (process.env[AUTO_EXECUTE_ENV] || "").trim().toLowerCase();
    if (flag === "1" || flag === "true" || flag === "yes" || flag === "on")
        return true;
    try {
        const configPath = join(process.env.HOME || "", ".morningstar", "config.json");
        if (!existsSync(configPath))
            return false;
        return JSON.parse(readFileSync(configPath, "utf-8")).autoExecuteCodeBlocks === true;
    }
    catch {
        return false;
    }
}
/**
 * Parse and normalize every text-based call that the legacy executor would
 * consider. This function has no execution side effects, so callers can inspect
 * and authorize `calls` before passing each one to `executeToolCall`.
 */
export function parseToolCalls(response) {
    response = response.replace(/<br\s*\/?>/gi, "\n");
    const calls = [];
    const consumed = [];
    for (const extracted of extractToolCalls(response)) {
        const tool = extracted.name.toLowerCase();
        const value = extracted.args;
        const call = {
            tool,
            args: {},
            raw: extracted.raw,
            source: { index: extracted.index, kind: "tag" },
        };
        consumed.push(extracted.raw);
        switch (tool) {
            case "read":
                call.args = { filePath: value.trim() };
                break;
            case "write": {
                const pathMatch = value.match(/^([^\n]+)\n([\s\S]*)$/);
                if (pathMatch) {
                    call.args = { filePath: pathMatch[1].trim(), content: pathMatch[2] };
                    break;
                }
                let filePath = value.trim();
                const afterTool = response.slice(extracted.index + extracted.raw.length);
                const codeWithNameMatch = afterTool.match(/^\s*\n?([\w][\w.\-]*\.\w+)\s*\n```\w*\n([\s\S]*?)```/);
                const codeMatch = afterTool.match(/```\w*\n([\s\S]*?)```/);
                const codeTagMatch = afterTool.match(/<code>\n?([\s\S]*?)<\/code>/);
                if (codeWithNameMatch) {
                    filePath = filePath.endsWith("/") ? filePath + codeWithNameMatch[1] : `${filePath}/${codeWithNameMatch[1]}`;
                    call.args = { filePath, content: codeWithNameMatch[2] };
                    consumed.push(codeWithNameMatch[0]);
                }
                else if (codeMatch) {
                    call.args = { filePath, content: codeMatch[1] };
                    consumed.push(codeMatch[0]);
                }
                else if (codeTagMatch) {
                    call.args = { filePath, content: codeTagMatch[1] };
                    consumed.push(codeTagMatch[0]);
                }
                else if (!filePath.includes(".")) {
                    call.args = { filePath, directory: true };
                }
                else {
                    call.args = { filePath };
                    call.error = "Format: pfad\\ninhalt";
                }
                break;
            }
            case "edit": {
                const editMatch = value.match(/^([^\n]+)\n<<<\n([\s\S]*?)\n>>>\n([\s\S]*)$/);
                if (editMatch) {
                    call.args = { filePath: editMatch[1].trim(), oldStr: editMatch[2], newStr: editMatch[3] };
                }
                else {
                    call.error = "Format: pfad\\n<<<\\nold\\n>>>\\nnew";
                }
                break;
            }
            case "delete":
                call.args = { filePath: value.trim() };
                break;
            case "bash":
                call.args = { command: value.trim() };
                break;
            case "grep": {
                const [pattern, fileGlob] = value.trim().split("\n");
                call.args = { pattern, ...(fileGlob ? { fileGlob } : {}) };
                break;
            }
            case "glob":
                call.args = { pattern: value.trim() };
                break;
            case "ls":
                call.args = { dirPath: value.trim() || "." };
                break;
            case "web":
                call.args = { query: value.trim() };
                break;
            case "fetch":
                call.args = { url: value.trim() };
                break;
            case "gh":
                call.args = { command: value.trim() };
                break;
            case "swarm":
            case "tool_search":
            case "notebook_edit": {
                try {
                    const parsed = JSON.parse(value);
                    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
                        call.error = `${tool} erwartet ein JSON-Objekt.`;
                    }
                    else {
                        call.args = parsed;
                    }
                }
                catch {
                    call.error = `${tool} erwartet gültiges JSON.`;
                }
                break;
            }
            case "bg_status":
                call.args = { taskId: value.trim() };
                break;
            case "bg_list":
                call.args = {};
                break;
            case "jerry":
                call.args = { prompt: value.trim() };
                break;
            case "skill":
            case "vault":
                call.args = { command: value.trim() };
                break;
            case "create":
            case "mkdir":
                call.args = { dirPath: value.trim().replace(/^.*?([\/~].+)$/, "$1") };
                break;
            case "git":
            case "verify":
                call.args = {};
                break;
            default:
                if (isMCPToolName(tool) || isTelegramTool(tool)) {
                    const raw = value.trim();
                    if (!raw) {
                        call.args = {};
                        break;
                    }
                    try {
                        const parsed = JSON.parse(raw);
                        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
                            call.error = "MCP-Tool-Argumente muessen ein JSON-Objekt sein.";
                        }
                        else {
                            call.args = parsed;
                        }
                    }
                    catch {
                        call.error = "MCP-Tool-Argumente muessen gueltiges JSON sein.";
                    }
                }
                else {
                    call.args = { raw: value };
                }
        }
        calls.push(call);
    }
    // Preserve the legacy recovery for explicitly marked but unclosed calls.
    if (calls.length === 0) {
        const unclosedWriteRegex = /<tool:write>([^\n<]+)\n```\w*\n([\s\S]*?)```/g;
        let match;
        while ((match = unclosedWriteRegex.exec(response)) !== null) {
            calls.push({
                tool: "write",
                args: { filePath: match[1].trim(), content: match[2] },
                raw: match[0],
                source: { index: match.index, kind: "unclosed" },
            });
            consumed.push(match[0]);
        }
        const unclosedBashRegex = /<tool:bash>([^\n<]+)(?:\n|$)/g;
        while ((match = unclosedBashRegex.exec(response)) !== null) {
            const command = match[1].trim();
            if (!command)
                continue;
            calls.push({
                tool: "bash",
                args: { command },
                raw: match[0],
                source: { index: match.index, kind: "unclosed" },
            });
            consumed.push(match[0]);
        }
    }
    // Preserve opt-in auto execution, but expose it as parsed calls first.
    if (calls.length === 0 && autoExecuteEnabled()) {
        let match;
        const shellBlocks = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
        while ((match = shellBlocks.exec(response)) !== null) {
            const command = match[1].trim();
            if (!command || /<tool:\w+>/.test(command))
                continue;
            calls.push({ tool: "auto-bash", args: { command }, raw: match[0], source: { index: match.index, kind: "auto" } });
            consumed.push(match[0]);
        }
        const pythonBlocks = /```python\n([\s\S]*?)```/g;
        while ((match = pythonBlocks.exec(response)) !== null) {
            const code = match[1].trim();
            if (!code || /<tool:\w+>/.test(code))
                continue;
            calls.push({ tool: "auto-python", args: { code }, raw: match[0], source: { index: match.index, kind: "auto" } });
            consumed.push(match[0]);
        }
        const htmlBlocks = /```html\n([\s\S]*?)```/g;
        while ((match = htmlBlocks.exec(response)) !== null) {
            const code = match[1].trim();
            if (!code || code.length < 100 || /<tool:\w+>/.test(code))
                continue;
            if (!/<!DOCTYPE|<html|<head|<body/i.test(code))
                continue;
            if (/import\s+React|from\s+['"]react|useState|useEffect|className=/i.test(code))
                continue;
            const beforeBlock = response.slice(0, match.index);
            const pathMatch = beforeBlock.match(/([\/~][\w\/\-. ]+\.(?:html|htm))/i)
                || beforeBlock.match(/([\w][\w\-]*\.(?:html|htm))/i);
            const filePath = pathMatch ? pathMatch[1].trim() : "index.html";
            calls.push({ tool: "auto-html", args: { filePath, content: code }, raw: match[0], source: { index: match.index, kind: "auto" } });
            consumed.push(match[0]);
        }
    }
    let cleanResponse = response;
    for (const raw of consumed)
        cleanResponse = cleanResponse.replace(raw, "");
    return { calls, cleanResponse: cleanResponse.trim() };
}
function createDirectory(dirPath, cwd, tool = "create") {
    const checked = resolveWithinWorkspace(dirPath, cwd);
    if (!checked.ok)
        return { tool, result: `⛔ ${checked.reason}`, success: false };
    try {
        if (!existsSync(checked.resolved))
            mkdirSync(checked.resolved, { recursive: true });
        return { tool, result: `Verzeichnis erstellt: ${dirPath}`, success: true, filePath: dirPath };
    }
    catch (e) {
        return { tool, result: `Fehler: ${e.message}`, success: false };
    }
}
/**
 * Execute one previously parsed and authorized text tool call.
 */
export async function executeToolCall(call, cwd, signal) {
    const { tool, args } = call;
    if (call.error)
        return { tool, result: call.error, success: false };
    try {
        switch (tool) {
            case "tool_search":
                return searchTools(args.query);
            case "read":
                return readFile(args.filePath, cwd, args.offset, args.limit);
            case "write":
                if (args.directory === true)
                    return createDirectory(args.filePath, cwd, "write");
                return writeFile(args.filePath, args.content, cwd);
            case "edit":
                return editFile(args.filePath, args.oldStr, args.newStr, cwd, args.replaceAll);
            case "delete":
                return deleteFile(args.filePath, cwd);
            case "bash":
                return bash(args.command, cwd, args.timeout, args.run_in_background, signal);
            case "grep":
                return grepSearch(args.pattern, cwd, args.fileGlob);
            case "glob":
                return globSearch(args.pattern, cwd);
            case "ls":
                return listDir(args.dirPath || ".", cwd);
            case "git":
                return gitStatus(cwd);
            case "web":
                return webSearch(args.query, signal);
            case "fetch":
                return fetchUrl(args.url, signal);
            case "gh":
                return ghCli(args.command, cwd);
            case "notebook_edit":
                return notebookEdit(args.notebookPath, args.cellNumber, args.editMode, cwd, args.cellType, args.newSource);
            case "bg_status":
                return getBackgroundTaskStatus(args.taskId);
            case "bg_list":
                return listBackgroundTasks();
            case "jerry": {
                const reply = await askJerry(args.prompt);
                return { tool: "jerry", result: reply || "(keine Antwort von Jerry)", success: true };
            }
            case "verify": {
                const report = verifyProject(cwd);
                return { tool: "verify", result: formatVerification(report), success: report.checks.every((check) => check.ok) };
            }
            case "skill":
                {
                    const result = runSkillCommand(args.command, cwd);
                    return { tool: "skill", result, success: !result.startsWith("Skill-Fehler:") };
                }
            case "vault":
                return runVaultCommandAsync(args.command, signal).then((result) => ({ tool: "vault", result, success: !result.startsWith("Vault-Fehler:") }));
            case "create":
            case "mkdir":
                return createDirectory(args.dirPath, cwd, "create");
            case "auto-bash": {
                const result = await bash(args.command, cwd, undefined, false, signal);
                return { ...result, tool: "auto-bash" };
            }
            case "auto-python": {
                const tmpFile = `/tmp/morningstar_auto_${process.pid}_${Date.now()}.py`;
                try {
                    writeFileSync(tmpFile, args.code, "utf-8");
                    const result = await bash(`python3 "${tmpFile}"`, cwd, undefined, false, signal);
                    return { ...result, tool: "auto-python" };
                }
                finally {
                    try {
                        unlinkSync(tmpFile);
                    }
                    catch { }
                }
            }
            case "auto-html": {
                const result = writeFile(args.filePath, args.content, cwd);
                return { ...result, tool: "auto-html" };
            }
            default: {
                if (isTelegramTool(tool))
                    return executeTelegramTool(tool, args, cwd);
                if (isMCPToolName(tool)) {
                    const result = await callQualifiedMCPTool(tool, args, signal);
                    return { tool, result: result.result, success: result.success };
                }
                return {
                    tool,
                    result: unknownToolMessage(tool),
                    success: false,
                };
            }
        }
    }
    catch (e) {
        const prefix = tool === "jerry" ? "Jerry-Bridge Fehler" : "Fehler";
        return { tool, result: `${prefix}: ${e.message}`, success: false };
    }
}
/**
 * Backwards-compatible parse-and-execute API. New authorization-aware callers
 * should use `parseToolCalls`, decide per call, then invoke `executeToolCall`.
 */
export async function executeToolCalls(response, cwd) {
    const parsed = parseToolCalls(response);
    const results = [];
    for (const call of parsed.calls)
        results.push(await executeToolCall(call, cwd));
    return { results, cleanResponse: parsed.cleanResponse };
}
// ─── Native Function Calling Executor ────────────────────────────────────────
// Used by providers with native tool/function calling support (OpenAI, Anthropic, Google, Groq, OpenRouter).
// Takes the parsed tool name and arguments object directly instead of regex-parsing from text.
export function executeNativeToolCall(name, args, cwd, signal) {
    // Check agent tool restrictions
    if (!isToolAllowedForAgent(name)) {
        return { tool: name, result: `Tool "${name}" ist fuer diesen Agent nicht erlaubt.`, success: false };
    }
    countTool(name);
    switch (name) {
        case "tool_search":
            return searchTools(args.query);
        case "read":
            return readFile(args.filePath, cwd, args.offset, args.limit);
        case "write":
            return writeFile(args.filePath, args.content, cwd);
        case "edit":
            return editFile(args.filePath, args.oldStr, args.newStr, cwd, args.replaceAll);
        case "delete":
            return deleteFile(args.filePath, cwd);
        case "bash":
            return bash(args.command, cwd, args.timeout, args.run_in_background, signal);
        case "grep":
            return grepSearch(args.pattern, cwd, args.fileGlob || undefined, args.contextBefore, args.contextAfter, args.context, args.caseSensitive !== false, args.maxResults || 50);
        case "glob":
            return globSearch(args.pattern, cwd);
        case "ls":
            return listDir(args.dirPath || ".", cwd);
        case "git":
            return gitStatus(cwd);
        case "web":
            return webSearch(args.query, signal);
        case "fetch":
            return fetchUrl(args.url, signal);
        case "gh":
            return ghCli(args.command, cwd);
        case "notebook_edit":
            return notebookEdit(args.notebookPath, args.cellNumber, args.editMode, cwd, args.cellType, args.newSource);
        case "bg_status":
            return getBackgroundTaskStatus(args.taskId);
        case "bg_list":
            return listBackgroundTasks();
        case "verify": {
            const report = verifyProject(cwd);
            return {
                tool: "verify",
                result: formatVerification(report),
                success: report.checks.every((check) => check.ok),
            };
        }
        case "skill":
            {
                const result = runSkillCommand(args.command, cwd);
                return { tool: "skill", result, success: !result.startsWith("Skill-Fehler:") };
            }
        case "vault":
            return runVaultCommandAsync(args.command, signal).then((result) => ({ tool: "vault", result, success: !result.startsWith("Vault-Fehler:") }));
        case "jerry":
            return askJerry(args.prompt)
                .then((reply) => ({ tool: "jerry", result: reply || "(keine Antwort von Jerry)", success: true }))
                .catch((error) => ({ tool: "jerry", result: `Jerry-Bridge Fehler: ${error.message}`, success: false }));
        default:
            if (isTelegramTool(name))
                return executeTelegramTool(name, args, cwd);
            if (isMCPToolName(name)) {
                return callQualifiedMCPTool(name, args, signal)
                    .then((result) => ({ tool: name, result: result.result, success: result.success }));
            }
            return { tool: name, result: unknownToolMessage(name), success: false };
    }
}
// ─── Parallel Native Tool Execution ──────────────────────────────────────────
// Executes safe/read-only tools in parallel, mutating tools sequentially.
const SAFE_TOOLS = new Set(["read", "grep", "glob", "ls", "git", "web", "fetch", "bg_status", "bg_list"]);
export function isNativeToolParallelSafe(toolName) {
    return SAFE_TOOLS.has(toolName);
}
export async function executeNativeToolCallsParallel(calls, cwd) {
    if (calls.length === 0)
        return [];
    if (calls.length === 1) {
        const c = calls[0];
        const r = await Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd));
        return [r];
    }
    // Split into safe (parallelizable) and mutating (sequential) batches
    const results = new Array(calls.length);
    const safeBatch = [];
    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        if (isNativeToolParallelSafe(call.name)) {
            safeBatch.push({ index: i, call });
        }
        else {
            // Flush safe batch first (parallel)
            if (safeBatch.length > 0) {
                const safeResults = await Promise.all(safeBatch.map(({ call: c }) => Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd))));
                for (let j = 0; j < safeBatch.length; j++) {
                    results[safeBatch[j].index] = safeResults[j];
                }
                safeBatch.length = 0;
            }
            // Execute mutating tool sequentially
            results[i] = await Promise.resolve(executeNativeToolCall(call.name, call.arguments, cwd));
        }
    }
    // Flush remaining safe batch
    if (safeBatch.length > 0) {
        const safeResults = await Promise.all(safeBatch.map(({ call: c }) => Promise.resolve(executeNativeToolCall(c.name, c.arguments, cwd))));
        for (let j = 0; j < safeBatch.length; j++) {
            results[safeBatch[j].index] = safeResults[j];
        }
    }
    return results;
}
//# sourceMappingURL=tools.js.map
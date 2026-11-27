import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getConnectedMCPTools } from "../mcp.js";
import { measuredStatusReport } from "./status-report.js";
const filler = new Set("status bitte gib mir zeige zeig geben zeigen anzeigen den die das von vom für fuer und sowie jetzt aktuell aktuellen aktuelle detaillierten detaillierte show me the of and".split(" "));
const words = (s) => s.toLowerCase().trim().split(/\s+/);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const object = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) => Object.keys(v).every(k => allowed.includes(k));
/** Only operator-owned, declarative routes; never accept arbitrary commands. */
export function validateStatusShortcuts(value) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 16)
        return;
    const ids = new Set(), aliases = new Map();
    for (const target of value) {
        if (!object(target) || !keys(target, ["id", "aliases", "source"]) || typeof target.id !== "string" || !identifier.test(target.id) || ids.has(target.id))
            return;
        ids.add(target.id);
        if (!Array.isArray(target.aliases) || !target.aliases.length || target.aliases.length > 12)
            return;
        for (const alias of target.aliases) {
            if (typeof alias !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,79}$/.test(alias))
                return;
            const normalized = words(alias).join(" ");
            if (words(normalized).some(w => filler.has(w)) || (aliases.has(normalized) && aliases.get(normalized) !== target.id))
                return;
            aliases.set(normalized, target.id);
        }
        const s = target.source;
        if (!object(s))
            return;
        if (s.kind === "mcp") {
            if (!keys(s, ["kind", "server", "tool", "entity"]) || s.tool !== "entity_status"
                || typeof s.server !== "string" || !identifier.test(s.server) || typeof s.entity !== "string" || !identifier.test(s.entity))
                return;
        }
        else if (s.kind === "ssh") {
            if (!keys(s, ["kind", "destination", "services", "identityFile", "port"])
                || typeof s.destination !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}@[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(s.destination))
                return;
            if (s.port !== undefined && (!Number.isInteger(s.port) || Number(s.port) < 1 || Number(s.port) > 65535))
                return;
            // Literal absolute paths are portable to POSIX and Windows shells. No
            // environment expansion, quotes, substitutions, or control characters.
            if (s.identityFile !== undefined && (typeof s.identityFile !== "string" || s.identityFile.length > 512
                || !/^(?:\/[\w .\/-]+|[A-Za-z]:[\\/][\w .\\/-]+)$/.test(s.identityFile)))
                return;
            if (s.services !== undefined && (!Array.isArray(s.services) || s.services.length > 16
                || s.services.some(service => typeof service !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{0,100}$/.test(service))))
                return;
        }
        else
            return;
    }
    return value;
}
/** Optional per-user config, never loaded from the current project. */
export function loadStatusShortcuts(path = join(homedir(), ".morningstar", "status-shortcuts.json")) {
    try {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768)
            return;
        const config = JSON.parse(readFileSync(path, "utf8"));
        if (!object(config) || !keys(config, ["version", "targets"]) || config.version !== 1)
            return;
        return validateStatusShortcuts(config.targets);
    }
    catch {
        return;
    }
}
/** All-or-nothing recognition: any unknown word or unavailable route leaves
 * the entire request to the model, with no speculative partial execution. */
export function planStatusShortcut(task, targets, tools = getConnectedMCPTools()) {
    const validated = validateStatusShortcuts(targets);
    if (!validated || task.length > 180 || !/^[a-zA-Z0-9äöüÄÖÜß ._,!-]+$/.test(task))
        return;
    const tokens = words(task.trim().replace(/[.!]+$/, "").replace(/[,!]/g, " "));
    if (!tokens.includes("status"))
        return;
    const aliases = validated.flatMap(target => target.aliases.map(alias => ({ target, tokens: words(alias) })))
        .sort((a, b) => b.tokens.length - a.tokens.length);
    const selected = new Map();
    for (let index = 0; index < tokens.length;) {
        const match = aliases.find(alias => alias.tokens.every((token, offset) => tokens[index + offset] === token));
        if (match) {
            selected.set(match.target.id, match.target);
            index += match.tokens.length;
        }
        else if (filler.has(tokens[index]))
            index++;
        else
            return;
    }
    if (!selected.size)
        return;
    const calls = [];
    for (const target of selected.values()) {
        const s = target.source;
        if (s.kind === "mcp") {
            const matches = tools.filter(tool => tool.serverName === s.server && tool.name === s.tool);
            if (matches.length !== 1)
                return;
            calls.push({ target: target.id, name: matches[0].qualifiedName, args: { entity: s.entity } });
        }
        else {
            const command = `ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10${s.port ? ` -p ${s.port}` : ""}${s.identityFile ? ` -i '${s.identityFile}'` : ""} ${s.destination} 'hostname; uptime -p; free -b; df -B1 /${s.services?.length ? `; systemctl is-active ${s.services.join(" ")} || true` : ""}'`;
            calls.push({ target: target.id, name: "bash", args: { command } });
        }
    }
    return calls;
}
/** Native requests still pass through the normal runner policy and hooks. */
export async function* statusShortcutCalls(plan) {
    const runId = randomUUID();
    for (const [index, call] of plan.entries())
        yield { type: "tool_call", text: "", toolCall: {
                id: `status-${runId}-${index + 1}`, name: call.name, arguments: JSON.stringify(call.args),
            } };
}
/** Never reparse evidence as instructions or feed it into the tool parser. */
export function statusShortcutReport(plan, results) {
    if (results.length === plan.length && plan.every((call, index) => results[index].tool === call.name)) {
        const report = measuredStatusReport("status", results);
        if (report)
            return report;
    }
    return plan.map((call, index) => {
        const result = results[index];
        const report = result && result.tool === call.name && measuredStatusReport("status", [result]);
        const failure = result?.result.startsWith("Permission denied:")
            ? "Statusabfrage nicht freigegeben. Details stehen im Werkzeugergebnis."
            : "Statusabfrage fehlgeschlagen. Details stehen im Werkzeugergebnis.";
        return report ?? `**${call.target}**\n\n${!result?.success ? failure : "Werkzeugantwort nicht als vollständige Statusmessung lesbar."} Keine Messwerte für dieses Ziel bestätigt.`;
    }).join("\n\n");
}
//# sourceMappingURL=status-shortcuts.js.map
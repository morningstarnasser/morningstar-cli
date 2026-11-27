const cell = (value) => String(value).replace(/[\r\n\x00-\x1f\x7f]/g, " ").replace(/\|/g, "\\|");
const gib = (value) => `${(value / 1073741824).toFixed(2)} GiB`;
const finite = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
function endpoint(result) {
    if (!/^mcp__.+__entity_status(?:__[a-f0-9]+)?$/i.test(result.tool))
        return;
    try {
        const value = JSON.parse(result.result.split("\n")[0]);
        const data = value.data, display = value.display;
        if (typeof value.label !== "string" || typeof value.observed_at !== "string" || !Number.isFinite(Date.parse(value.observed_at))
            || typeof display?.uptime !== "string" || !finite(data?.uptime_seconds))
            return;
        const rows = [["Gemessen", value.observed_at], ["Uptime", display.uptime]];
        if (finite(data.load1))
            rows.push(["Load (1 min)", String(data.load1)]);
        if (finite(data.mem_used_gb) && finite(data.mem_total_gb) && data.mem_total_gb > 0 && data.mem_used_gb <= data.mem_total_gb)
            rows.push(["RAM", `${data.mem_used_gb} / ${data.mem_total_gb} GB (${(100 * data.mem_used_gb / data.mem_total_gb).toFixed(1)}%)`]);
        if (finite(data.disk_root_percent) && data.disk_root_percent <= 100)
            rows.push(["Disk /", `${data.disk_root_percent}% belegt${finite(data.disk_root_free_gb) ? ` · ${data.disk_root_free_gb} GB frei` : ""}`]);
        for (const [key, label] of [["tailscale", "Tailscale"], ["nordvpn", "NordVPN"]])
            if (typeof data[key] === "string")
                rows.push([label, data[key]]);
        return { title: value.label, rows };
    }
    catch {
        return;
    }
}
function shell(result) {
    const command = result.command ?? "";
    if (result.tool !== "bash" || !/^ssh\s/.test(command) || !/\bhostname\b/.test(command)
        || !/\buptime -p\b/.test(command) || !/\bfree -b\b/.test(command) || !/\bdf -B1 \/(?:\s|[;"'])/.test(command)
        || /\b(?:while|watch|journalctl)\b/.test(command))
        return;
    const lines = result.result.trim().split(/\r?\n/);
    if (!/^[\w.-]{1,120}$/.test(lines[0]) || !/^up /.test(lines[1] ?? ""))
        return;
    const mem = result.result.match(/^Mem:\s+(\d+)\s+(\d+)\s+/m);
    const disk = result.result.match(/^\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+\/\s*$/m);
    if (!mem || !disk)
        return;
    const [total, used] = mem.slice(1).map(Number), [diskTotal, diskUsed, diskFree, diskPercent] = disk.slice(1).map(Number);
    if (![total, used, diskTotal, diskUsed, diskFree, diskPercent].every(finite) || total <= 0 || used > total || diskTotal <= 0 || diskUsed > diskTotal || diskFree > diskTotal || diskPercent > 100)
        return;
    const rows = [["Quelle", "SSH · in diesem Lauf gelesen"], ["Uptime", lines[1].slice(3)],
        ["RAM", `${gib(used)} / ${gib(total)} (${(100 * used / total).toFixed(1)}%)`],
        ["Disk /", `${gib(diskUsed)} / ${gib(diskTotal)} (${diskPercent}% belegt) · ${gib(diskFree)} frei`]];
    const swap = result.result.match(/^Swap:\s+(\d+)\s+(\d+)\s+/m);
    if (swap && finite(Number(swap[1])) && finite(Number(swap[2])) && Number(swap[2]) <= Number(swap[1]))
        rows.splice(3, 0, ["Swap", `${gib(Number(swap[2]))} / ${gib(Number(swap[1]))}`]);
    const services = command.match(/systemctl is-active ([a-zA-Z0-9_.@-]+(?:\s+[a-zA-Z0-9_.@-]+)*)/)?.[1].trim().split(/\s+/);
    if (services) {
        const states = lines.slice(-services.length);
        if (states.every(state => /^(?:active|inactive|failed|activating|deactivating|unknown)$/.test(state)))
            services.forEach((service, index) => rows.push([service, states[index]]));
    }
    return { title: lines[0], rows };
}
/** Render recognized measured snapshots for short, direct status requests.
 * Failed/mixed/unsupported reads and analytical questions keep their normal
 * answer path; this is a formatter, not an inference about unmeasured hosts. */
export function measuredStatusReport(task, results) {
    if (task.length > 180 || !/\bstatus(?:\s+(?:geben|anzeigen|zeigen))?[.!]?\s*$/i.test(task)
        || /[?;\n]|\b(?:warum|wieso|erklär\w*|analys\w*|vergleich\w*|repar\w*|ändern|starte|restart|merke|gestern|früher|historisch|vorher|was|wie|kann|soll)\b/i.test(task))
        return;
    const evidence = results.filter(result => !["tool_search", "skill", "vault"].includes(result.tool));
    if (!evidence.length || evidence.some(result => !result.success))
        return;
    const snapshots = evidence.map(result => endpoint(result) ?? shell(result));
    if (snapshots.some(snapshot => !snapshot))
        return;
    return snapshots.map(snapshot => `**${cell(snapshot.title)}**\n\n| Messwert | Ergebnis |\n| --- | --- |\n${snapshot.rows.map(([key, value]) => `| ${cell(key)} | ${cell(value)} |`).join("\n")}`).join("\n\n")
        + "\n\nMomentaufnahme der abgefragten Ziele. Nur die aufgeführten Dienste wurden geprüft; Langzeitstabilität und weitere Ziele sind damit nicht belegt.";
}
//# sourceMappingURL=status-report.js.map
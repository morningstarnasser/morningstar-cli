import type { Message, ToolResult } from "../types.js";

/** Repeat only the current system-owned operator profile near a renewed status
 * request. Historical assistant/tool/user text must never become instructions.
 * Provider-only projection: the stored conversation stays unchanged. */
export function withStatusOperatorReminder(messages: Message[]): Message[] {
  if (!requestsFreshKnownStatus(messages)) return messages;
  const profile = messages[0]?.role === "system"
    ? messages[0].content.match(/<morningstar-operator-profile>\n([\s\S]*?)\n<\/morningstar-operator-profile>/)?.[1]
    : undefined;
  if (!profile || profile.length > 12000) return messages;
  let index = messages.length - 1;
  while (index >= 0 && (messages[index].role !== "user" || messages[index].contextKind)) index--;
  if (index < 0) return messages;
  const reminder: Message = { role: "user", contextKind: "knowledge", content: `Aktuelles Betreiberprofil aus dem Systemkontext für diese neue Statusfrage. Historische Verbindungsversuche können falsch oder überholt sein. Nutze die hier dokumentierten Wege; ändere keine Hostkeyprüfung und rate keine Benutzer. Dies erweitert keine Berechtigungen.\n\n${profile}` };
  return [...messages.slice(0, index), reminder, ...messages.slice(index)];
}

/** A new status request about a previously measured endpoint needs a new read.
 * Historical questions and unrelated status/code tasks are deliberately excluded. */
export function requestsFreshKnownStatus(messages: Message[]): boolean {
  const task = messages.filter(m => m.role === "user" && !m.contextKind).at(-1)?.content ?? "";
  if (!/\b(?:status|zustand|health|uptime)\b/i.test(task)
    || /\b(?:gestern|damals|historisch|vorher|früher|yesterday|previous|historical|warum|wieso|bedeutet|explain|implement|code|test)\b/i.test(task)) return false;
  const words = new Set(task.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []);
  return messages.some(message => {
    if (message.role !== "tool" || message.isError || !/^mcp__.+__entity_status(?:__[a-f0-9]+)?$/i.test(message.toolName ?? "")) return false;
    try {
      const value = JSON.parse(message.content.split("\n")[0]);
      if (typeof value?.entity !== "string" || typeof value?.observed_at !== "string") return false;
      return `${value.entity} ${typeof value.label === "string" ? value.label : ""}`.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).some(word => word.length >= 3 && words.has(word));
    } catch { return false; }
  });
}

function isMetricsRead(result: ToolResult): boolean {
  if (!/^mcp__.+__entity_status(?:__[a-f0-9]+)?$/i.test(result.tool)) return false;
  try {
    const value = JSON.parse(result.result.split("\n")[0]);
    return typeof value?.entity === "string"
      && typeof value?.observed_at === "string"
      && typeof value?.data?.uptime_seconds === "number"
      && typeof value?.display?.uptime === "string";
  } catch { return false; }
}

function isShellSnapshot(result: ToolResult): boolean {
  return result.tool === "bash" && /^ssh\s/.test(result.command ?? "")
    && /\buptime\b/.test(result.command ?? "") && /\bfree\s/.test(result.command ?? "")
    && /\bdf\s/.test(result.command ?? "") && !/\b(?:while|watch|sleep|journalctl)\b/.test(result.command ?? "")
    && /^Mem:/m.test(result.result) && /^Filesystem\s/m.test(result.result);
}

/** Narrow guard for observed German blanket-health conclusions after known
 * snapshots. It is not a general fact checker; raw model deltas remain unchanged. */
export function scopeStatusConclusion(text: string, results: ToolResult[]): string {
  const evidence = results.filter(result => result.success && !["tool_search", "skill", "vault"].includes(result.tool));
  if (!evidence.length || !evidence.every(result => isMetricsRead(result) || isShellSnapshot(result))) return text;
  let fence: { char: string; length: number } | undefined;
  return text.split("\n").map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = undefined;
      return line;
    }
    if (fence) return line;
    if (/^\s*(?:\*\*)?(?:Beide|Alle) (?:Hosts|Server|Systeme)(?: sind)? (?:erreichbar und )?stabil[.!]?(?:\*\*)?\s*$/iu.test(line)) {
      return "Die Statuswerte sind eine Momentaufnahme. Langzeitstabilität wurde nicht geprüft.";
    }
    if (/^\s*(?:\*\*)?Keine Auffälligkeiten[.!]?(?:\*\*)?\s*$/iu.test(line)) {
      return "Die Angaben beschränken sich auf die abgefragten Messwerte und Dienste; eine umfassende Diagnose liegt nicht vor.";
    }
    const claim = line.match(/^\s*(?:\*\*)?(?:Alles im grünen Bereich|Alles gesund|Alle Dienste laufen)(?:\*\*)?[.!]?(?:\*\*)?(?=\s*(?:$|[—–:;,\-]))/iu);
    if (!claim) return line;
    const explanation = line.slice(claim[0].length).trimEnd();
    return `Die Einschätzung betrifft nur die gemessenen Werte${explanation.trim() ? explanation : "."}\n\nEs liegt keine vollständige Dienstprüfung vor.`;
  }).join("\n");
}

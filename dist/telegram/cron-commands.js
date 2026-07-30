// ─── /cron command handler for the Telegram gateway ──────────────────────────
// Parses "/cron ..." subcommands into scheduler CRUD operations and returns a
// human-readable reply string. Kept pure-ish (only touches the cron store) so the
// gateway stays thin.
import { addJob, removeJob, setJobEnabled, loadJobs, validateSchedule } from "../scheduler.js";
const CRON_HELP = `⏰ *Cron — geplante Jobs*

/cron list — alle Jobs
/cron add <schedule> | <name> | <prompt>
/cron rm <id>
/cron on <id> | /cron off <id>

Schedule: 5-Feld-Cron ("0 8 * * *") oder Intervall ("@every 30m").
Beispiel:
/cron add 0 8 * * * | Morning | Fasse offene TODOs im Repo zusammen`;
function formatJob(j) {
    const state = j.enabled ? "🟢" : "⚪️";
    const last = j.lastRun ? new Date(j.lastRun).toLocaleString("de-CH") : "nie";
    return `${state} \`${j.id}\` *${j.name}*\n   ${j.schedule} · zuletzt: ${last}\n   ${j.prompt.slice(0, 80)}`;
}
export function renderCronCommand(chatId, arg, cwd) {
    const [sub, ...rest] = arg.split(/\s+/);
    const tail = rest.join(" ").trim();
    switch ((sub || "list").toLowerCase()) {
        case "":
        case "list": {
            const jobs = loadJobs().filter((j) => j.chatId === chatId);
            if (jobs.length === 0)
                return "Keine Jobs. /cron help für Nutzung.";
            return jobs.map(formatJob).join("\n\n");
        }
        case "help":
            return CRON_HELP;
        case "add": {
            const parts = tail.split("|").map((p) => p.trim());
            if (parts.length < 3)
                return "Format: /cron add <schedule> | <name> | <prompt>";
            const [schedule, name, ...promptParts] = parts;
            const prompt = promptParts.join(" | ").trim();
            const err = validateSchedule(schedule);
            if (err)
                return `❌ Ungültiger Schedule: ${err}`;
            if (!name || !prompt)
                return "Name und Prompt dürfen nicht leer sein.";
            try {
                const job = addJob({ schedule, name, prompt, cwd, chatId });
                return `✅ Job angelegt: \`${job.id}\` — ${job.name}\n${job.schedule}`;
            }
            catch (e) {
                return `❌ ${e.message}`;
            }
        }
        case "rm":
        case "remove":
        case "del": {
            if (!tail)
                return "Nutzung: /cron rm <id>";
            return removeJob(tail) ? `🗑️ Job ${tail} gelöscht.` : `Kein Job mit id ${tail}.`;
        }
        case "on":
        case "off": {
            if (!tail)
                return `Nutzung: /cron ${sub} <id>`;
            const job = setJobEnabled(tail, sub.toLowerCase() === "on");
            if (!job)
                return `Kein Job mit id ${tail}.`;
            return `${job.enabled ? "🟢 aktiviert" : "⚪️ deaktiviert"}: ${job.name}`;
        }
        default:
            return `Unbekanntes /cron-Subkommando: ${sub}\n\n${CRON_HELP}`;
    }
}
//# sourceMappingURL=cron-commands.js.map
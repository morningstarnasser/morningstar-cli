// ─── `morningstar cron ...` terminal CLI ─────────────────────────────────────
// Manage scheduled jobs from the terminal. Adding a job needs a Telegram chat id
// (where results are delivered); list/rm/run work standalone. `run` executes a
// job once now and prints the agent output to stdout.
import { loadJobs, addJob, removeJob, setJobEnabled, validateSchedule } from "./scheduler.js";
function printJobs(jobs) {
    if (jobs.length === 0) {
        console.log("Keine Jobs. `morningstar cron add` zum Anlegen.");
        return;
    }
    for (const j of jobs) {
        const state = j.enabled ? "on " : "off";
        const last = j.lastRun ? new Date(j.lastRun).toLocaleString("de-CH") : "nie";
        console.log(`[${state}] ${j.id}  ${j.schedule.padEnd(16)} ${j.name}`);
        console.log(`        chat=${j.chatId} cwd=${j.cwd} last=${last}`);
        console.log(`        ${j.prompt}`);
    }
}
function parseFlags(args) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            flags[key] = args[i + 1] ?? "";
            i++;
        }
        else {
            positional.push(a);
        }
    }
    return { positional, flags };
}
const HELP = `morningstar cron — geplante Agent-Jobs

  cron list                          alle Jobs anzeigen
  cron add --chat <id> --schedule "<cron>" --name "<n>" --prompt "<p>" [--cwd <dir>]
  cron rm <id>                       Job löschen
  cron on <id> | cron off <id>       Job (de)aktivieren
  cron run <id>                      Job jetzt einmal ausführen (Output auf stdout)

Schedule: 5-Feld-Cron ("0 8 * * *") oder Intervall ("@every 30m").`;
export async function runCronCli(args) {
    const [sub, ...rest] = args;
    switch ((sub || "list").toLowerCase()) {
        case "list":
            printJobs(loadJobs());
            return;
        case "help":
        case "--help":
        case "-h":
            console.log(HELP);
            return;
        case "add": {
            const { flags } = parseFlags(rest);
            const chatId = Number(flags.chat);
            if (!Number.isInteger(chatId)) {
                console.error("--chat <telegram-id> erforderlich.");
                process.exit(1);
            }
            if (!flags.schedule || !flags.name || !flags.prompt) {
                console.error("--schedule, --name und --prompt erforderlich.");
                process.exit(1);
            }
            const err = validateSchedule(flags.schedule);
            if (err) {
                console.error(`Ungültiger Schedule: ${err}`);
                process.exit(1);
            }
            const job = addJob({
                schedule: flags.schedule,
                name: flags.name,
                prompt: flags.prompt,
                cwd: flags.cwd || process.cwd(),
                chatId,
            });
            console.log(`✅ Job ${job.id} angelegt (${job.name}).`);
            return;
        }
        case "rm":
        case "remove": {
            const id = rest[0];
            if (!id) {
                console.error("Nutzung: cron rm <id>");
                process.exit(1);
            }
            console.log(removeJob(id) ? `Gelöscht: ${id}` : `Kein Job mit id ${id}.`);
            return;
        }
        case "on":
        case "off": {
            const id = rest[0];
            if (!id) {
                console.error(`Nutzung: cron ${sub} <id>`);
                process.exit(1);
            }
            const job = setJobEnabled(id, sub.toLowerCase() === "on");
            console.log(job ? `${id}: ${job.enabled ? "aktiviert" : "deaktiviert"}` : `Kein Job mit id ${id}.`);
            return;
        }
        case "run": {
            const id = rest[0];
            const job = loadJobs().find((j) => j.id === id);
            if (!job) {
                console.error(`Kein Job mit id ${id}.`);
                process.exit(1);
            }
            await runJobOnce(job);
            return;
        }
        default:
            console.error(`Unbekanntes Subkommando: ${sub}\n\n${HELP}`);
            process.exit(1);
    }
}
async function runJobOnce(job) {
    const { runAgent } = await import("./agent-runner.js");
    const { detectProject, buildSystemPrompt } = await import("./context.js");
    const { loadSavedConfig, createApiKeyHelpers, loadEnvFile } = await import("./cli-bootstrap.js");
    const { detectProvider, getProviderBaseUrl } = await import("./providers.js");
    loadEnvFile(job.cwd);
    const saved = loadSavedConfig();
    const getStoredApiKey = createApiKeyHelpers(saved).getStoredApiKey;
    const model = saved.model || "nvidia/moonshotai/kimi-k2-instruct";
    const provider = detectProvider(model);
    const ctx = detectProject(job.cwd);
    console.log(`▶ ${job.name} (${job.id})\n`);
    const result = await runAgent([
        { role: "system", content: buildSystemPrompt(ctx) },
        { role: "user", content: job.prompt },
    ], { apiKey: getStoredApiKey(provider), model, provider, baseUrl: getProviderBaseUrl(provider), maxTokens: 8192, temperature: 0.6 }, job.cwd);
    console.log(result.finalText);
    console.log(`\n— ${result.toolCalls.length} Tool(s), ${result.turns} Runden`);
}
//# sourceMappingURL=cron-cli.js.map
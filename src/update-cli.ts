import { checkForUpdate, performUpdate, formatUpdateInfo, formatUpdateResult, type UpdateOptions } from "./self-update.js";

export async function runUpdateCli(args: string[], options: UpdateOptions = {}): Promise<number> {
  const json = args.includes("--json");
  if (args.some(arg => !["--check", "--json", "--help", "-h"].includes(arg))) {
    const message = "Nutzung: morningstar update [--check] [--json]";
    console.error(json ? JSON.stringify({ success: false, message }) : message);
    return 2;
  }
  if (args.includes("--help") || args.includes("-h")) {
    console.log("morningstar update [--check] [--json]\n\nAktualisiert die eigene Git-Installation aus ihrem konfigurierten Upstream.\n--check  Nur prüfen, nichts installieren.\n--json   Maschinenlesbares Ergebnis.\n\nLokale Änderungen werden nicht überschrieben. Laufende Sitzungen vorher schliessen.");
    return 0;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  const opts = { ...options, signal: options.signal ?? controller.signal,
    onProgress: options.onProgress ?? (json ? undefined : (message: string) => console.error(message)) };
  try {
    if (args.includes("--check")) {
      const info = await checkForUpdate(opts);
      console.log(json ? JSON.stringify(info) : formatUpdateInfo(info));
      return info.status === "current" || info.status === "available" ? 0 : 1;
    }
    const result = await performUpdate(opts);
    console.log(json ? JSON.stringify(result) : formatUpdateResult(result));
    return result.success ? 0 : 1;
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}

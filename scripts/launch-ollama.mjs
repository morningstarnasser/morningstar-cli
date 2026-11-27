import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function ollamaURL(host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434") {
  const url = new URL(host.includes("://") ? host : `http://${host}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("OLLAMA_HOST must be an HTTP(S) URL without credentials, query or fragment.");
  }
  url.pathname = url.pathname.replace(/\/(?:v1)?\/?$/, "");
  return url.href.replace(/\/$/, "");
}

export async function installedModels(host, fetcher = fetch) {
  const response = await fetcher(`${host}/api/tags`, { signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data.models)) throw new Error("Ollama returned an invalid model catalog.");
  return [...new Set(data.models.map(m => m.name).filter(name => typeof name === "string" && /^[^\s\x00-\x1f\x7f]+$/.test(name)))];
}

export function launchArgs(model, extra = []) {
  if (!model || /[\s\x00-\x1f\x7f]/.test(model)) throw new Error("Invalid model name.");
  return [fileURLToPath(new URL("../bin/morningstar.js", import.meta.url)), "--model", `ollama/${model.replace(/^ollama\//, "")}`, ...extra];
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--help") {
    console.log("Usage: npm run launch:ollama -- [installed-model] [Morningstar options]\nWithout a model, choose one from the running Ollama server. OLLAMA_HOST is supported.\nNo models are downloaded and permission prompts remain enabled.");
    return;
  }
  const host = ollamaURL();
  let models;
  try { models = await installedModels(host); }
  catch (error) { throw new Error(`Cannot read Ollama models. Start Ollama and check OLLAMA_HOST. ${error.message}`); }
  if (!models.length) throw new Error("No installed models. Install a tool-capable model with ollama pull, then retry.");
  let model = args[0] && !args[0].startsWith("-") ? args.shift().replace(/^ollama\//, "") : undefined;
  if (!model) {
    if (!process.stdin.isTTY) throw new Error("Choose a model explicitly when no interactive terminal is available.");
    models.forEach((name, index) => console.log(`${index + 1}. ${name}`));
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const selected = await input.question("Ollama model number: ");
      if (!/^\d+$/.test(selected.trim())) throw new Error("Enter a model number from the list.");
      model = models[Number(selected) - 1];
    } finally { input.close(); }
  }
  if (!models.includes(model)) throw new Error("Selected model is not in the Ollama catalog.");
  const child = spawn(process.execPath, launchArgs(model, args), { stdio: "inherit", env: { ...process.env, OLLAMA_HOST: host } });
  // Both processes share the terminal foreground process group; let the child
  // handle terminal Ctrl+C and return its own status instead of orphaning it.
  const waitForChild = () => {};
  process.on("SIGINT", waitForChild);
  child.on("error", error => { console.error(error.message); process.exitCode = 1; process.removeListener("SIGINT", waitForChild); });
  child.on("exit", (code, signal) => { process.removeListener("SIGINT", waitForChild); process.exitCode = code ?? (signal ? 1 : 0); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

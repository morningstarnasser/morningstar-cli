import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { execSync } from "node:child_process";

export interface MentionResult {
  type: "file" | "folder" | "git" | "url" | "codebase";
  source: string;
  content: string;
  tokenEstimate: number;
}

const MAX_FILE_LINES = 500;
const MAX_FOLDER_FILES = 10;
const MAX_FOLDER_LINES = 200;

export function parseMentions(input: string, cwd: string): { cleanInput: string; mentions: MentionResult[] } {
  const mentions: MentionResult[] = [];
  let cleanInput = input;

  // @file:path
  const fileRegex = /@file:(\S+)/g;
  let match;
  while ((match = fileRegex.exec(input)) !== null) {
    const filePath = match[1];
    const abs = resolve(cwd, filePath);
    cleanInput = cleanInput.replace(match[0], "");
    try {
      if (existsSync(abs)) {
        const content = readFileSync(abs, "utf-8");
        const lines = content.split("\n");
        const truncated = lines.length > MAX_FILE_LINES
          ? lines.slice(0, MAX_FILE_LINES).join("\n") + `\n...(${lines.length - MAX_FILE_LINES} weitere Zeilen)`
          : content;
        mentions.push({ type: "file", source: filePath, content: truncated, tokenEstimate: Math.ceil(truncated.length / 4) });
      } else {
        mentions.push({ type: "file", source: filePath, content: `Datei nicht gefunden: ${filePath}`, tokenEstimate: 10 });
      }
    } catch {
      mentions.push({ type: "file", source: filePath, content: `Fehler beim Lesen: ${filePath}`, tokenEstimate: 10 });
    }
  }

  // @folder:path
  const folderRegex = /@folder:(\S+)/g;
  while ((match = folderRegex.exec(input)) !== null) {
    const folderPath = match[1];
    const abs = resolve(cwd, folderPath);
    cleanInput = cleanInput.replace(match[0], "");
    try {
      if (existsSync(abs) && statSync(abs).isDirectory()) {
        const entries = readdirSync(abs)
          .filter(e => !e.startsWith(".") && e !== "node_modules")
          .slice(0, MAX_FOLDER_FILES);
        let content = `Ordner: ${folderPath}/\n`;
        for (const entry of entries) {
          const full = join(abs, entry);
          try {
            const stat = statSync(full);
            if (stat.isFile() && stat.size < 100000) {
              const fileContent = readFileSync(full, "utf-8");
              const lines = fileContent.split("\n");
              const truncated = lines.length > MAX_FOLDER_LINES
                ? lines.slice(0, MAX_FOLDER_LINES).join("\n") + `\n...(truncated)`
                : fileContent;
              content += `\n--- ${entry} ---\n${truncated}\n`;
            } else if (stat.isDirectory()) {
              content += `  ${entry}/\n`;
            }
          } catch {}
        }
        mentions.push({ type: "folder", source: folderPath, content, tokenEstimate: Math.ceil(content.length / 4) });
      }
    } catch {}
  }

  // @git:diff, @git:log, @git:status
  const gitRegex = /@git:(\w+)/g;
  while ((match = gitRegex.exec(input)) !== null) {
    const subcmd = match[1];
    cleanInput = cleanInput.replace(match[0], "");
    try {
      let result = "";
      switch (subcmd) {
        case "diff": result = execSync("git diff", { cwd, encoding: "utf-8", timeout: 5000 }); break;
        case "log": result = execSync("git log --oneline -15", { cwd, encoding: "utf-8", timeout: 5000 }); break;
        case "status": result = execSync("git status", { cwd, encoding: "utf-8", timeout: 5000 }); break;
        case "staged": result = execSync("git diff --staged", { cwd, encoding: "utf-8", timeout: 5000 }); break;
        default: result = `Unbekannt: @git:${subcmd}`;
      }
      mentions.push({ type: "git", source: `git:${subcmd}`, content: result || "(leer)", tokenEstimate: Math.ceil((result || "").length / 4) });
    } catch (e) {
      mentions.push({ type: "git", source: `git:${subcmd}`, content: `Git Fehler: ${(e as Error).message.slice(0, 100)}`, tokenEstimate: 10 });
    }
  }

  // @url:https://...
  const urlRegex = /@url:(\S+)/g;
  while ((match = urlRegex.exec(input)) !== null) {
    cleanInput = cleanInput.replace(match[0], "");
    // URL fetching is async, we add a placeholder
    mentions.push({ type: "url", source: match[1], content: `[URL wird geladen: ${match[1]}]`, tokenEstimate: 50 });
  }

  // @codebase
  if (input.includes("@codebase")) {
    cleanInput = cleanInput.replace(/@codebase/g, "");
    try {
      const files: string[] = [];
      const walkDir = (dir: string, depth = 0): void => {
        if (depth > 4 || files.length > 100) return;
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith(".") || entry === "node_modules" || entry === "dist" || entry === ".next") continue;
          const full = join(dir, entry);
          try {
            const stat = statSync(full);
            if (stat.isDirectory()) walkDir(full, depth + 1);
            else if (stat.isFile() && [".ts", ".tsx", ".js", ".jsx", ".py", ".go"].includes(extname(full))) {
              const content = readFileSync(full, "utf-8");
              const exports: string[] = [];
              for (const line of content.split("\n")) {
                const m = line.match(/export\s+(?:default\s+)?(?:function|class|interface|const|type)\s+(\w+)/);
                if (m) exports.push(m[1]);
              }
              if (exports.length > 0) files.push(`${relative(cwd, full)}: ${exports.join(", ")}`);
            }
          } catch {}
        }
      };
      walkDir(cwd);
      const content = files.join("\n");
      mentions.push({ type: "codebase", source: "codebase", content: content || "(keine Exports gefunden)", tokenEstimate: Math.ceil(content.length / 4) });
    } catch {}
  }

  return { cleanInput: cleanInput.trim(), mentions };
}

export function formatMentionContext(mentions: MentionResult[]): string {
  if (mentions.length === 0) return "";

  const parts: string[] = ["--- Kontext ---"];
  for (const m of mentions) {
    switch (m.type) {
      case "file": parts.push(`[Datei: ${m.source}]\n${m.content}`); break;
      case "folder": parts.push(m.content); break;
      case "git": parts.push(`[Git ${m.source}]\n${m.content}`); break;
      case "url": parts.push(`[URL: ${m.source}]\n${m.content}`); break;
      case "codebase": parts.push(`[Codebase Map]\n${m.content}`); break;
    }
  }
  parts.push("--- Ende Kontext ---");
  return parts.join("\n\n");
}

export function getMentionCompletions(partial: string, cwd: string): string[] {
  const completions: string[] = [];

  if (partial.startsWith("@f")) {
    completions.push("@file:", "@folder:");
    if (partial.startsWith("@file:") || partial.startsWith("@folder:")) {
      const prefix = partial.startsWith("@file:") ? "@file:" : "@folder:";
      const pathPart = partial.slice(prefix.length);
      const dir = pathPart.includes("/") ? resolve(cwd, pathPart.replace(/\/[^/]*$/, "")) : cwd;
      try {
        for (const entry of readdirSync(dir).slice(0, 20)) {
          if (entry.startsWith(".") || entry === "node_modules") continue;
          const full = join(dir, entry);
          const rel = relative(cwd, full);
          try {
            if (statSync(full).isDirectory()) completions.push(`${prefix}${rel}/`);
            else if (prefix === "@file:") completions.push(`${prefix}${rel}`);
          } catch {}
        }
      } catch {}
    }
  }
  if (partial.startsWith("@g")) completions.push("@git:diff", "@git:log", "@git:status", "@git:staged");
  if (partial.startsWith("@u")) completions.push("@url:");
  if (partial.startsWith("@c")) completions.push("@codebase");

  return completions;
}

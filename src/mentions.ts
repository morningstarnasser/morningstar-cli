import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, extname, basename } from "node:path";
import { execSync } from "node:child_process";

// ─── Types ───────────────────────────────────────────────

export interface MentionResult {
  type: "file" | "files" | "folder" | "git" | "url" | "codebase" | "diff" | "tree";
  source: string;
  content: string;
  tokenEstimate: number;
  priority: number; // Hoeher = wichtiger bei Budget-Kuerzung
}

export interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
  mentionCount: number;
  warnings: string[];
  wasTruncated: boolean;
}

// ─── Constants ───────────────────────────────────────────

const MAX_FILE_LINES = 500;
const MAX_FOLDER_FILES = 10;
const MAX_FOLDER_LINES = 200;
const MAX_GLOB_FILES = 50;
const DEFAULT_BUDGET = 32000;
const BUDGET_WARNING_THRESHOLD = 0.85;

const IGNORE_DIRS = new Set(["node_modules", "dist", ".next", ".git", "build", "coverage", ".turbo", ".cache", "__pycache__"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".rb", ".php", ".swift", ".kt"]);

// ─── Priority Map ────────────────────────────────────────
// Hoeher = wichtiger, wird zuletzt gekuerzt
const PRIORITY: Record<MentionResult["type"], number> = {
  file: 10, git: 9, diff: 9, files: 8, folder: 7, url: 6, codebase: 5, tree: 4,
};

// ─── Simple Glob Matching ────────────────────────────────

function globToRegex(pattern: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += ".*"; i += pattern[i + 2] === "/" ? 3 : 2;
    } else if (c === "*") {
      re += "[^/]*"; i++;
    } else if (c === "?") {
      re += "[^/]"; i++;
    } else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end > i) {
        const opts = pattern.slice(i + 1, end).split(",").map(o => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        re += `(?:${opts})`; i = end + 1;
      } else { re += "\\{"; i++; }
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c; i++;
    } else { re += c; i++; }
  }
  return new RegExp(re + "$");
}

function globMatch(baseDir: string, pattern: string): string[] {
  const regex = globToRegex(pattern);
  const results: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 8 || results.length >= MAX_GLOB_FILES) return;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(".") || IGNORE_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) walk(full, depth + 1);
          else if (stat.isFile()) {
            const rel = relative(baseDir, full);
            if (regex.test(rel)) results.push(full);
          }
        } catch {}
      }
    } catch {}
  };

  walk(baseDir, 0);
  return results;
}

// ─── Smart Chunking ──────────────────────────────────────

function smartChunk(content: string, maxLines: number): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  // Behalte Imports + exportierte Funktionen/Klassen
  const important: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(import |export |\/\/ ─)/.test(line) || /^(export\s+)?(function|class|interface|type|const|enum)\s/.test(line)) {
      // Fuege Zeile + bis zu 3 Folgezeilen hinzu
      for (let j = i; j < Math.min(i + 4, lines.length); j++) important.push(j);
    }
  }

  const uniqueLines = [...new Set(important)].sort((a, b) => a - b).slice(0, maxLines);
  if (uniqueLines.length === 0) {
    return lines.slice(0, maxLines).join("\n") + `\n// ...(${lines.length - maxLines} Zeilen gekuerzt)`;
  }

  const result: string[] = [];
  let lastIdx = -2;
  for (const idx of uniqueLines) {
    if (idx - lastIdx > 1) result.push(`// ... (Zeile ${lastIdx + 2}-${idx} ausgelassen)`);
    result.push(lines[idx]);
    lastIdx = idx;
  }
  if (lastIdx < lines.length - 1) result.push(`// ... (${lines.length - lastIdx - 1} weitere Zeilen)`);

  return result.join("\n");
}

// ─── Directory Tree ──────────────────────────────────────

function buildTree(dir: string, prefix: string, depth: number, maxDepth: number): string[] {
  if (depth >= maxDepth) return [];
  const lines: string[] = [];
  try {
    const entries = readdirSync(dir).filter(e => !e.startsWith(".") && !IGNORE_DIRS.has(e) && e !== ".DS_Store").sort();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          lines.push(prefix + connector + entry + "/");
          lines.push(...buildTree(full, prefix + (isLast ? "    " : "\u2502   "), depth + 1, maxDepth));
        } else {
          lines.push(prefix + connector + entry);
        }
      } catch {}
    }
  } catch {}
  return lines;
}

// ─── Parse Mentions ──────────────────────────────────────

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
        const chunked = smartChunk(content, MAX_FILE_LINES);
        const header = `// Datei: ${filePath} (${content.split("\n").length} Zeilen)\n`;
        const full = header + chunked;
        mentions.push({ type: "file", source: filePath, content: full, tokenEstimate: Math.ceil(full.length / 4), priority: PRIORITY.file });
      } else {
        mentions.push({ type: "file", source: filePath, content: `Datei nicht gefunden: ${filePath}`, tokenEstimate: 10, priority: PRIORITY.file });
      }
    } catch {
      mentions.push({ type: "file", source: filePath, content: `Fehler beim Lesen: ${filePath}`, tokenEstimate: 10, priority: PRIORITY.file });
    }
  }

  // @files:glob
  const filesRegex = /@files:(\S+)/g;
  while ((match = filesRegex.exec(input)) !== null) {
    const pattern = match[1];
    cleanInput = cleanInput.replace(match[0], "");
    const matched = globMatch(cwd, pattern);
    if (matched.length === 0) {
      mentions.push({ type: "files", source: pattern, content: `// Keine Dateien fuer Pattern: ${pattern}`, tokenEstimate: 10, priority: PRIORITY.files });
    } else {
      const perFileLines = matched.length > 20 ? 100 : 200;
      for (const abs of matched) {
        const rel = relative(cwd, abs);
        try {
          const content = readFileSync(abs, "utf-8");
          const chunked = smartChunk(content, perFileLines);
          const header = `// ${rel} (${content.split("\n").length} Zeilen)\n`;
          const full = header + chunked;
          mentions.push({ type: "files", source: rel, content: full, tokenEstimate: Math.ceil(full.length / 4), priority: PRIORITY.files });
        } catch {}
      }
    }
  }

  // @diff:file
  const diffFileRegex = /@diff:(\S+)/g;
  while ((match = diffFileRegex.exec(input)) !== null) {
    const filePath = match[1];
    cleanInput = cleanInput.replace(match[0], "");
    try {
      const diff = execSync(`git diff -- "${filePath}"`, { cwd, encoding: "utf-8", timeout: 5000 });
      const staged = execSync(`git diff --cached -- "${filePath}"`, { cwd, encoding: "utf-8", timeout: 5000 });
      const combined = (diff + staged).trim();
      const content = combined || `(Keine Aenderungen in ${filePath})`;
      mentions.push({ type: "diff", source: filePath, content: `[Diff: ${filePath}]\n${content}`, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.diff });
    } catch (e) {
      mentions.push({ type: "diff", source: filePath, content: `Diff Fehler: ${(e as Error).message.slice(0, 100)}`, tokenEstimate: 10, priority: PRIORITY.diff });
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
        const entries = readdirSync(abs).filter(e => !e.startsWith(".") && e !== "node_modules").slice(0, MAX_FOLDER_FILES);
        let content = `Ordner: ${folderPath}/\n`;
        for (const entry of entries) {
          const full = join(abs, entry);
          try {
            const stat = statSync(full);
            if (stat.isFile() && stat.size < 100000) {
              const fileContent = readFileSync(full, "utf-8");
              const lines = fileContent.split("\n");
              const truncated = lines.length > MAX_FOLDER_LINES ? lines.slice(0, MAX_FOLDER_LINES).join("\n") + `\n...(truncated)` : fileContent;
              content += `\n--- ${entry} ---\n${truncated}\n`;
            } else if (stat.isDirectory()) {
              content += `  ${entry}/\n`;
            }
          } catch {}
        }
        mentions.push({ type: "folder", source: folderPath, content, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.folder });
      }
    } catch {}
  }

  // @git:diff, @git:log, @git:status, @git:staged
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
      mentions.push({ type: "git", source: `git:${subcmd}`, content: result || "(leer)", tokenEstimate: Math.ceil((result || "").length / 4), priority: PRIORITY.git });
    } catch (e) {
      mentions.push({ type: "git", source: `git:${subcmd}`, content: `Git Fehler: ${(e as Error).message.slice(0, 100)}`, tokenEstimate: 10, priority: PRIORITY.git });
    }
  }

  // @url:https://...
  const urlRegex = /@url:(\S+)/g;
  while ((match = urlRegex.exec(input)) !== null) {
    cleanInput = cleanInput.replace(match[0], "");
    mentions.push({ type: "url", source: match[1], content: `[URL wird geladen: ${match[1]}]`, tokenEstimate: 50, priority: PRIORITY.url });
  }

  // @tree
  if (input.includes("@tree")) {
    cleanInput = cleanInput.replace(/@tree/g, "");
    const name = basename(cwd);
    const treeLines = [`${name}/`, ...buildTree(cwd, "", 0, 3)];
    const content = treeLines.join("\n");
    mentions.push({ type: "tree", source: "tree", content, tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.tree });
  }

  // @codebase
  if (input.includes("@codebase")) {
    cleanInput = cleanInput.replace(/@codebase/g, "");
    try {
      const files: string[] = [];
      const walkDir = (dir: string, depth = 0): void => {
        if (depth > 4 || files.length > 100) return;
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith(".") || IGNORE_DIRS.has(entry)) continue;
          const full = join(dir, entry);
          try {
            const stat = statSync(full);
            if (stat.isDirectory()) walkDir(full, depth + 1);
            else if (stat.isFile() && CODE_EXTS.has(extname(full))) {
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
      mentions.push({ type: "codebase", source: "codebase", content: content || "(keine Exports gefunden)", tokenEstimate: Math.ceil(content.length / 4), priority: PRIORITY.codebase });
    } catch {}
  }

  return { cleanInput: cleanInput.trim(), mentions };
}

// ─── Context Budget ──────────────────────────────────────

export function getContextBudget(mentions: MentionResult[], maxTokens: number = DEFAULT_BUDGET): ContextBudget {
  let usedTokens = mentions.reduce((sum, m) => sum + m.tokenEstimate, 0);
  const warnings: string[] = [];
  let wasTruncated = false;

  // Warnung bei hoher Auslastung
  if (usedTokens > maxTokens * BUDGET_WARNING_THRESHOLD && usedTokens <= maxTokens) {
    warnings.push(`Kontext-Budget bei ${Math.round((usedTokens / maxTokens) * 100)}% (${usedTokens}/${maxTokens} Tokens).`);
  }

  // Auto-Truncation bei Ueberschreitung
  if (usedTokens > maxTokens) {
    wasTruncated = true;
    warnings.push(`Kontext-Budget ueberschritten (${usedTokens}/${maxTokens} Tokens). Niedrigste Prioritaet wird gekuerzt.`);

    // Nach Prioritaet sortieren (aufsteigend — niedrigste zuerst kuerzen)
    const sorted = [...mentions].sort((a, b) => a.priority - b.priority);
    let excess = usedTokens - maxTokens;

    for (const mention of sorted) {
      if (excess <= 0) break;
      const orig = mention.tokenEstimate;
      if (orig <= excess) {
        mention.content = `// [Gekuerzt] ${mention.type}:${mention.source} (${orig} Tokens entfernt)`;
        mention.tokenEstimate = Math.ceil(mention.content.length / 4);
        excess -= orig - mention.tokenEstimate;
      } else {
        const targetChars = (orig - excess) * 4;
        const cut = mention.content.slice(0, targetChars);
        const lastNl = cut.lastIndexOf("\n");
        mention.content = (lastNl > 0 ? cut.slice(0, lastNl) : cut) + `\n// ... (${excess} Tokens gekuerzt)`;
        mention.tokenEstimate = Math.ceil(mention.content.length / 4);
        excess = 0;
      }
    }

    usedTokens = mentions.reduce((sum, m) => sum + m.tokenEstimate, 0);
  }

  return { maxTokens, usedTokens, remainingTokens: Math.max(0, maxTokens - usedTokens), mentionCount: mentions.length, warnings, wasTruncated };
}

// ─── Format ──────────────────────────────────────────────

export function formatMentionContext(mentions: MentionResult[]): string {
  if (mentions.length === 0) return "";

  const parts: string[] = ["--- Kontext ---"];
  for (const m of mentions) {
    switch (m.type) {
      case "file": case "files": parts.push(`[Datei: ${m.source}]\n${m.content}`); break;
      case "folder": parts.push(m.content); break;
      case "git": parts.push(`[Git ${m.source}]\n${m.content}`); break;
      case "diff": parts.push(m.content); break;
      case "url": parts.push(`[URL: ${m.source}]\n${m.content}`); break;
      case "tree": parts.push(`[Verzeichnisbaum]\n${m.content}`); break;
      case "codebase": parts.push(`[Codebase Map]\n${m.content}`); break;
    }
  }
  parts.push("--- Ende Kontext ---");
  return parts.join("\n\n");
}

// ─── Autocomplete ────────────────────────────────────────

export function getMentionCompletions(partial: string, cwd: string): string[] {
  const completions: string[] = [];

  if (partial.startsWith("@f")) {
    completions.push("@file:", "@files:", "@folder:");
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
    if (partial.startsWith("@files:")) {
      completions.push("@files:src/**/*.ts", "@files:src/**/*.tsx", "@files:**/*.test.ts");
    }
  }
  if (partial.startsWith("@g")) completions.push("@git:diff", "@git:log", "@git:status", "@git:staged");
  if (partial.startsWith("@u")) completions.push("@url:");
  if (partial.startsWith("@c")) completions.push("@codebase");
  if (partial.startsWith("@d")) {
    completions.push("@diff:");
    if (partial.startsWith("@diff:")) {
      // Dateipfad-Completion
      const pathPart = partial.slice(6);
      const dir = pathPart.includes("/") ? resolve(cwd, pathPart.replace(/\/[^/]*$/, "")) : cwd;
      try {
        for (const entry of readdirSync(dir).slice(0, 20)) {
          if (entry.startsWith(".") || entry === "node_modules") continue;
          const full = join(dir, entry);
          const rel = relative(cwd, full);
          try {
            if (statSync(full).isDirectory()) completions.push(`@diff:${rel}/`);
            else completions.push(`@diff:${rel}`);
          } catch {}
        }
      } catch {}
    }
  }
  if (partial.startsWith("@t")) completions.push("@tree");

  return completions;
}

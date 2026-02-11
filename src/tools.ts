import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, relative, join } from "node:path";
import { glob } from "glob";
import { trackChange, captureBeforeState } from "./undo.js";
import type { ToolResult } from "./types.js";

const MAX_OUTPUT = 15000; // truncate long outputs

// ─── Stats Tracking ───
export const toolStats = {
  calls: 0,
  byTool: {} as Record<string, number>,
  filesRead: 0,
  filesWritten: 0,
  filesEdited: 0,
  filesDeleted: 0,
  bashCommands: 0,
};

function countTool(tool: string): void {
  toolStats.calls++;
  toolStats.byTool[tool] = (toolStats.byTool[tool] || 0) + 1;
}

function truncate(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n...[truncated, ${s.length - max} chars omitted]`;
}

// ─── Read File ───
export function readFile(filePath: string, cwd: string): ToolResult {
  countTool("read");
  try {
    const abs = resolve(cwd, filePath);
    if (!existsSync(abs)) return { tool: "read", result: `Datei nicht gefunden: ${filePath}`, success: false };
    const content = readFileSync(abs, "utf-8");
    const lines = content.split("\n").map((l, i) => `${String(i + 1).padStart(4)} | ${l}`).join("\n");
    toolStats.filesRead++;
    return { tool: "read", result: truncate(lines), success: true };
  } catch (e) {
    return { tool: "read", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── Write File ───
export function writeFile(filePath: string, content: string, cwd: string): ToolResult {
  countTool("write");
  try {
    const abs = resolve(cwd, filePath);
    const dir = dirname(abs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

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
    toolStats.filesWritten++;
    return { tool: "write", result: `Datei geschrieben: ${filePath} (${content.length} Zeichen)`, success: true };
  } catch (e) {
    return { tool: "write", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── Edit File (find & replace) ───
export function editFile(filePath: string, oldStr: string, newStr: string, cwd: string): ToolResult {
  countTool("edit");
  try {
    const abs = resolve(cwd, filePath);
    if (!existsSync(abs)) return { tool: "edit", result: `Datei nicht gefunden: ${filePath}`, success: false };
    const content = readFileSync(abs, "utf-8");
    if (!content.includes(oldStr)) {
      return { tool: "edit", result: `String nicht gefunden in ${filePath}. Keine Aenderung.`, success: false };
    }

    // Track for undo
    trackChange({
      type: "edit",
      filePath: abs,
      previousContent: content,
      newContent: content.replace(oldStr, newStr),
      timestamp: new Date().toISOString(),
      description: `edit ${filePath}`,
    });

    const newContent = content.replace(oldStr, newStr);
    writeFileSync(abs, newContent, "utf-8");
    toolStats.filesEdited++;
    return { tool: "edit", result: `Datei bearbeitet: ${filePath}`, success: true, diff: { filePath, oldStr, newStr } };
  } catch (e) {
    return { tool: "edit", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── Delete File ───
export function deleteFile(filePath: string, cwd: string): ToolResult {
  countTool("delete");
  try {
    const abs = resolve(cwd, filePath);
    if (!existsSync(abs)) return { tool: "delete", result: `Datei nicht gefunden: ${filePath}`, success: false };

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
    return { tool: "delete", result: `Datei geloescht: ${filePath}`, success: true };
  } catch (e) {
    return { tool: "delete", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── Bash Execution ───
export function bash(command: string, cwd: string): ToolResult {
  countTool("bash");
  toolStats.bashCommands++;
  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { tool: "bash", result: truncate(output || "(kein Output)"), success: true };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    const output = (err.stdout || "") + (err.stderr || "") || err.message;
    return { tool: "bash", result: truncate(output), success: false };
  }
}

// ─── Grep (Content Search) ───
export function grepSearch(pattern: string, cwd: string, fileGlob?: string): ToolResult {
  countTool("grep");
  try {
    const cmd = fileGlob
      ? `grep -rn --include="${fileGlob}" "${pattern}" . 2>/dev/null | head -50`
      : `grep -rn "${pattern}" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.py" --include="*.go" --include="*.rs" --include="*.java" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -50`;
    const output = execSync(cmd, { cwd, encoding: "utf-8", timeout: 10000, maxBuffer: 1024 * 512 });
    if (!output.trim()) return { tool: "grep", result: "Keine Treffer.", success: true };
    return { tool: "grep", result: truncate(output), success: true };
  } catch {
    return { tool: "grep", result: "Keine Treffer.", success: true };
  }
}

// ─── Glob (File Search) ───
export async function globSearch(pattern: string, cwd: string): Promise<ToolResult> {
  countTool("glob");
  try {
    const files = await glob(pattern, { cwd, ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"], nodir: true });
    if (files.length === 0) return { tool: "glob", result: "Keine Dateien gefunden.", success: true };
    const sorted = files.sort().slice(0, 100);
    return { tool: "glob", result: sorted.join("\n") + (files.length > 100 ? `\n...(+${files.length - 100} weitere)` : ""), success: true };
  } catch (e) {
    return { tool: "glob", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── List Directory ───
export function listDir(dirPath: string, cwd: string): ToolResult {
  countTool("ls");
  try {
    const abs = resolve(cwd, dirPath || ".");
    if (!existsSync(abs)) return { tool: "ls", result: `Verzeichnis nicht gefunden: ${dirPath}`, success: false };
    const entries = readdirSync(abs).map((name) => {
      const full = join(abs, name);
      try {
        const stat = statSync(full);
        return stat.isDirectory() ? `  ${name}/` : `  ${name} (${formatSize(stat.size)})`;
      } catch {
        return `  ${name}`;
      }
    });
    return { tool: "ls", result: entries.join("\n") || "(leer)", success: true };
  } catch (e) {
    return { tool: "ls", result: `Fehler: ${(e as Error).message}`, success: false };
  }
}

// ─── Git Status ───
export function gitStatus(cwd: string): ToolResult {
  countTool("git");
  try {
    const status = execSync("git status --short && echo '---' && git log --oneline -5", {
      cwd, encoding: "utf-8", timeout: 5000,
    });
    const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
    return { tool: "git", result: `Branch: ${branch}\n${status}`, success: true };
  } catch (e) {
    return { tool: "git", result: `Git Fehler: ${(e as Error).message}`, success: false };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

// ─── Parse & Execute Tool Calls from AI Response ───
export async function executeToolCalls(response: string, cwd: string): Promise<{ results: ToolResult[]; cleanResponse: string }> {
  const results: ToolResult[] = [];
  // Strip <br> tags that some models inject between tool calls
  response = response.replace(/<br\s*\/?>/gi, "\n");
  let cleanResponse = response;

  // Parse <tool> blocks: <tool:name>args</tool> or <tool:name>args</tool:name>
  const toolRegex = /<tool:(\w+)>([\s\S]*?)<\/tool(?::\w+)?>/g;
  let match;

  while ((match = toolRegex.exec(response)) !== null) {
    const [fullMatch, toolName, args] = match;
    let result: ToolResult;

    try {
      switch (toolName) {
        case "read": {
          result = readFile(args.trim(), cwd);
          break;
        }
        case "write": {
          const pathMatch = args.match(/^([^\n]+)\n([\s\S]*)$/);
          if (pathMatch) {
            result = writeFile(pathMatch[1].trim(), pathMatch[2], cwd);
          } else {
            // Model sent <tool:write>path</tool> without content — smart fallback
            let filePath = args.trim();
            const afterTool = response.slice((match.index ?? 0) + fullMatch.length);

            // Check if there's a filename between </tool> and the code block (e.g. "index.html\n```html\n...")
            const codeWithNameMatch = afterTool.match(/^\s*\n?([\w][\w.\-]*\.\w+)\s*\n```\w*\n([\s\S]*?)```/);
            // Check for ```lang\n...\n``` code blocks (allow whitespace/newlines before)
            const codeMatch = afterTool.match(/^\s*```\w*\n([\s\S]*?)```/);
            // Check for <code>\n...\n</code> blocks (some models use this)
            const codeTagMatch = afterTool.match(/^\s*<code>\n?([\s\S]*?)<\/code>/);

            if (codeWithNameMatch) {
              // Append the filename to the path (e.g. /tmp/snake-game + index.html)
              const extraName = codeWithNameMatch[1];
              filePath = filePath.endsWith("/") ? filePath + extraName : filePath + "/" + extraName;
              const dir = dirname(resolve(cwd, filePath));
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              result = writeFile(filePath, codeWithNameMatch[2], cwd);
              cleanResponse = cleanResponse.replace(codeWithNameMatch[0], "");
            } else if (codeMatch) {
              const dir = dirname(resolve(cwd, filePath));
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              result = writeFile(filePath, codeMatch[1], cwd);
              cleanResponse = cleanResponse.replace(codeMatch[0], "");
            } else if (codeTagMatch) {
              // <code>...</code> blocks
              const dir = dirname(resolve(cwd, filePath));
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              result = writeFile(filePath, codeTagMatch[1], cwd);
              cleanResponse = cleanResponse.replace(codeTagMatch[0], "");
            } else if (!filePath.includes(".")) {
              // Path has no extension — treat as mkdir (model meant to create directory)
              const abs = resolve(cwd, filePath);
              if (!existsSync(abs)) mkdirSync(abs, { recursive: true });
              result = { tool: "write", result: `Verzeichnis erstellt: ${filePath}`, success: true };
            } else {
              result = { tool: "write", result: `Format: pfad\\ninhalt`, success: false };
            }
          }
          break;
        }
        case "edit": {
          const editMatch = args.match(/^([^\n]+)\n<<<\n([\s\S]*?)\n>>>\n([\s\S]*)$/);
          if (!editMatch) { result = { tool: "edit", result: "Format: pfad\\n<<<\\nold\\n>>>\\nnew", success: false }; break; }
          result = editFile(editMatch[1].trim(), editMatch[2], editMatch[3], cwd);
          break;
        }
        case "delete": {
          result = deleteFile(args.trim(), cwd);
          break;
        }
        case "bash": {
          result = bash(args.trim(), cwd);
          break;
        }
        case "grep": {
          const grepParts = args.trim().split("\n");
          result = grepSearch(grepParts[0], cwd, grepParts[1]);
          break;
        }
        case "glob": {
          result = await globSearch(args.trim(), cwd);
          break;
        }
        case "ls": {
          result = listDir(args.trim(), cwd);
          break;
        }
        case "git": {
          result = gitStatus(cwd);
          break;
        }
        case "create":
        case "mkdir": {
          // Models sometimes use <tool:create>path</tool> — treat as mkdir -p
          const dirPath = args.trim().replace(/^.*?([\/~].+)$/, "$1"); // extract path from text
          if (dirPath.startsWith("/") || dirPath.startsWith("~")) {
            result = bash(`mkdir -p "${dirPath}"`, cwd);
            result.tool = "create";
          } else {
            result = { tool: "create", result: `Kein gültiger Pfad: ${args.trim()}`, success: false };
          }
          break;
        }
        default:
          result = { tool: toolName, result: `Unbekanntes Tool: ${toolName}`, success: false };
      }
    } catch (e) {
      result = { tool: toolName, result: `Fehler: ${(e as Error).message}`, success: false };
    }

    results.push(result);
    cleanResponse = cleanResponse.replace(fullMatch, "");
  }

  // ─── Unclosed Tool Tags: <tool:write>path\n```lang\ncontent\n``` (no </tool>) ───
  if (results.length === 0) {
    const unclosedWriteRegex = /<tool:write>([^\n<]+)\n```\w*\n([\s\S]*?)```/g;
    let uwMatch;
    while ((uwMatch = unclosedWriteRegex.exec(response)) !== null) {
      const [fullBlock, filePath, content] = uwMatch;
      const trimmedPath = filePath.trim();
      if (!trimmedPath) continue;
      try {
        const abs = resolve(cwd, trimmedPath);
        const dir = dirname(abs);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const r = writeFile(trimmedPath, content, cwd);
        results.push(r);
      } catch (e) {
        results.push({ tool: "write", result: `Fehler: ${(e as Error).message}`, success: false });
      }
      cleanResponse = cleanResponse.replace(fullBlock, "");
    }

    // Also handle unclosed <tool:bash>command (no </tool>)
    const unclosedBashRegex = /<tool:bash>([^\n<]+)(?:\n|$)/g;
    let ubMatch;
    while ((ubMatch = unclosedBashRegex.exec(response)) !== null) {
      const [fullBlock, command] = ubMatch;
      const trimmed = command.trim();
      if (!trimmed) continue;
      try {
        const r = bash(trimmed, cwd);
        results.push(r);
      } catch (e) {
        results.push({ tool: "bash", result: `Fehler: ${(e as Error).message}`, success: false });
      }
      cleanResponse = cleanResponse.replace(fullBlock, "");
    }
  }

  // ─── Auto-Execute Code Blocks (for models that don't use <tool:> tags) ───
  if (results.length === 0) {
    const codeBlockRegex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
    const pyBlockRegex = /```python\n([\s\S]*?)```/g;
    let cbMatch;

    while ((cbMatch = codeBlockRegex.exec(response)) !== null) {
      const [fullBlock, code] = cbMatch;
      const trimmed = code.trim();
      if (!trimmed) continue;
      // Skip code blocks that contain tool tags (already handled above)
      if (/<tool:\w+>/.test(trimmed)) continue;
      try {
        const result = bash(trimmed, cwd);
        results.push({ ...result, tool: "auto-bash" });
      } catch (e) {
        results.push({ tool: "auto-bash", result: `Fehler: ${(e as Error).message}`, success: false });
      }
      cleanResponse = cleanResponse.replace(fullBlock, "");
    }

    while ((cbMatch = pyBlockRegex.exec(response)) !== null) {
      const [fullBlock, code] = cbMatch;
      const trimmed = code.trim();
      if (!trimmed) continue;
      // Skip code blocks that contain tool tags
      if (/<tool:\w+>/.test(trimmed)) continue;
      // Write to temp file and execute (avoids shell escaping issues)
      const tmpFile = `/tmp/morningstar_auto_${Date.now()}.py`;
      try {
        writeFileSync(tmpFile, trimmed, "utf-8");
        const result = bash(`python3 "${tmpFile}"`, cwd);
        results.push({ ...result, tool: "auto-python" });
        try { unlinkSync(tmpFile); } catch {}
      } catch (e) {
        results.push({ tool: "auto-python", result: `Fehler: ${(e as Error).message}`, success: false });
        try { unlinkSync(tmpFile); } catch {}
      }
      cleanResponse = cleanResponse.replace(fullBlock, "");
    }
  }

  return { results, cleanResponse: cleanResponse.trim() };
}

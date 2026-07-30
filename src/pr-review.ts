// ─── Smart PR Review ───────────────────────────────────
// Fetch, analyze, and review GitHub Pull Requests via gh CLI.

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, basename } from "node:path";

// ─── Types ───────────────────────────────────────────────

export interface PRData {
  number: number;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  additions: number;
  deletions: number;
  files: PRFile[];
}

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | "renamed";
}

export interface PRAnalysis {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  filesByType: Record<string, number>;
  hasTests: boolean;
  hasConfigChanges: boolean;
  largeDiffs: string[];
  diffChunks: DiffChunk[];
}

export interface DiffChunk {
  file: string;
  content: string;
  additions: number;
  deletions: number;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "suggestion" | "info";
}

// ─── Constants ───────────────────────────────────────────

const GH_TIMEOUT = 15_000;
const MAX_DIFF_CHARS = 20_000;
const LARGE_DIFF_LINES = 500;

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /_test\.go$/, /test_.*\.py$/,
  /.*_test\.py$/, /__tests__\//, /\/tests?\//i,
];

const CONFIG_PATTERNS = [
  /^\.env/, /^\.github\//, /dockerfile/i, /docker-compose/i,
  /^tsconfig/, /^package\.json$/, /^package-lock\.json$/, /^yarn\.lock$/,
  /^Makefile$/, /^\.eslintrc/, /^\.prettierrc/,
];

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".svg",
  ".woff", ".woff2", ".ttf", ".eot", ".zip", ".tar", ".gz",
  ".pdf", ".mp3", ".mp4", ".exe", ".dll", ".so", ".wasm",
]);

// ─── Helpers ─────────────────────────────────────────────

function ghInstalled(): boolean {
  try { execSync("gh --version", { stdio: "pipe", timeout: 5000 }); return true; } catch { return false; }
}

function isGitRepo(cwd: string): boolean {
  try { execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "pipe", timeout: 5000 }); return true; } catch { return false; }
}

function runGh(args: string, cwd: string): string {
  return execSync(`gh ${args}`, { cwd, encoding: "utf-8", timeout: GH_TIMEOUT, stdio: ["pipe", "pipe", "pipe"] }).trim();
}

function parsePRNumber(ref: string): number {
  const t = ref.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const pullMatch = t.match(/\/pull\/(\d+)/);
  if (pullMatch) return parseInt(pullMatch[1], 10);
  const hashMatch = t.match(/#(\d+)$/);
  if (hashMatch) return parseInt(hashMatch[1], 10);
  throw new Error(`Ungueltige PR-Referenz: "${t}". Erwartet: Nummer, URL oder owner/repo#123.`);
}

function mapStatus(s: string): PRFile["status"] {
  switch (s.toLowerCase()) {
    case "added": return "added";
    case "removed": case "deleted": return "deleted";
    case "renamed": case "copied": return "renamed";
    default: return "modified";
  }
}

// ─── 1. Fetch PR Data ───────────────────────────────────

export function fetchPRData(prUrl: string, cwd: string): { prData: PRData; diff: string } {
  if (!ghInstalled()) throw new Error("GitHub CLI (gh) nicht installiert. Installation: https://cli.github.com/");
  if (!isGitRepo(cwd)) throw new Error(`"${cwd}" ist kein Git-Repository.`);

  const prNumber = parsePRNumber(prUrl);

  let rawJson: string;
  try {
    rawJson = runGh(`pr view ${prNumber} --json title,body,headRefName,baseRefName,additions,deletions,changedFiles,files`, cwd);
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    throw new Error(`PR #${prNumber} nicht gefunden: ${msg}`);
  }

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(rawJson); } catch { throw new Error("Ungueltige JSON-Antwort von gh CLI."); }

  const ghFiles = (parsed.files as Array<Record<string, unknown>>) ?? [];
  const files: PRFile[] = ghFiles.map(f => ({
    path: String(f.path ?? ""),
    additions: Number(f.additions ?? 0),
    deletions: Number(f.deletions ?? 0),
    status: mapStatus(String(f.status ?? "modified")),
  }));

  const prData: PRData = {
    number: prNumber,
    title: String(parsed.title ?? ""),
    body: String(parsed.body ?? ""),
    headBranch: String(parsed.headRefName ?? ""),
    baseBranch: String(parsed.baseRefName ?? ""),
    additions: Number(parsed.additions ?? 0),
    deletions: Number(parsed.deletions ?? 0),
    files,
  };

  let diff: string;
  try { diff = runGh(`pr diff ${prNumber}`, cwd); } catch (e) {
    throw new Error(`Fehler beim Abrufen des PR-Diffs: ${(e as Error).message.slice(0, 200)}`);
  }

  return { prData, diff };
}

// ─── 2. Analyze Diff ────────────────────────────────────

export function analyzePRDiff(diff: string): PRAnalysis {
  const chunks: DiffChunk[] = [];
  const filesByType: Record<string, number> = {};
  const largeDiffs: string[] = [];
  let hasTests = false;
  let hasConfigChanges = false;

  // Split by "diff --git" headers
  const sections = diff.split(/^diff --git .+$/m).filter(Boolean);
  const headers = diff.match(/^diff --git .+$/gm) || [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const body = sections[i + 1] || "";
    const fileMatch = header.match(/b\/(.+)$/);
    if (!fileMatch) continue;
    const filePath = fileMatch[1];

    const ext = extname(filePath).toLowerCase() || "(none)";
    filesByType[ext] = (filesByType[ext] ?? 0) + 1;

    if (TEST_PATTERNS.some(p => p.test(filePath))) hasTests = true;
    if (CONFIG_PATTERNS.some(p => p.test(filePath) || p.test(basename(filePath)))) hasConfigChanges = true;

    let additions = 0, deletions = 0;
    for (const line of body.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    if (additions + deletions > LARGE_DIFF_LINES) largeDiffs.push(filePath);

    const isBinary = BINARY_EXTS.has(ext) || body.includes("Binary files");
    chunks.push({
      file: filePath,
      content: isBinary ? `[Binaerdatei: ${filePath}]` : body,
      additions,
      deletions,
    });
  }

  return {
    totalFiles: chunks.length,
    totalAdditions: chunks.reduce((s, c) => s + c.additions, 0),
    totalDeletions: chunks.reduce((s, c) => s + c.deletions, 0),
    filesByType, hasTests, hasConfigChanges, largeDiffs, diffChunks: chunks,
  };
}

// ─── 3. Generate Review Prompt ──────────────────────────

export function generateReviewPrompt(prData: PRData, analysis: PRAnalysis): string {
  const parts: string[] = [];

  parts.push(`# Pull Request Code Review\n`);
  parts.push(`**PR #${prData.number}**: ${prData.title}`);
  parts.push(`**Branch**: \`${prData.headBranch}\` -> \`${prData.baseBranch}\``);
  parts.push(`**Umfang**: ${analysis.totalFiles} Dateien, +${analysis.totalAdditions} / -${analysis.totalDeletions}\n`);

  if (prData.body) {
    const body = prData.body.length > 1000 ? prData.body.slice(0, 1000) + "\n...(gekuerzt)" : prData.body;
    parts.push(`## Beschreibung\n\n${body}\n`);
  }

  parts.push("## Geaenderte Dateien\n");
  for (const f of prData.files) {
    const icon = f.status === "added" ? "+" : f.status === "deleted" ? "-" : "~";
    parts.push(`- [${icon}] \`${f.path}\` (+${f.additions} / -${f.deletions})`);
  }

  const flags: string[] = [];
  if (!analysis.hasTests) flags.push("KEINE Tests vorhanden");
  if (analysis.hasTests) flags.push("Tests vorhanden");
  if (analysis.hasConfigChanges) flags.push("Konfigurationsaenderungen enthalten");
  if (analysis.largeDiffs.length > 0) flags.push(`Grosse Diffs: ${analysis.largeDiffs.join(", ")}`);
  if (flags.length > 0) {
    parts.push(`\n## Hinweise\n`);
    flags.forEach(f => parts.push(`- ${f}`));
  }

  // Truncated diffs
  parts.push("\n## Diffs\n");
  let remaining = MAX_DIFF_CHARS;
  const sorted = [...analysis.diffChunks].sort((a, b) => a.content.length - b.content.length);
  for (const chunk of sorted) {
    if (remaining <= 0) { parts.push(`### ${chunk.file}\n\n[Budget erschoepft]\n`); continue; }
    const content = chunk.content.length <= remaining ? chunk.content
      : chunk.content.slice(0, chunk.content.lastIndexOf("\n", remaining) || remaining);
    remaining -= content.length;
    parts.push(`### ${chunk.file} (+${chunk.additions} / -${chunk.deletions})\n\n\`\`\`diff\n${content}\n\`\`\`\n`);
  }

  parts.push("\n## Aufgabe\n");
  parts.push(
    "Fuehre ein Code Review durch. Analysiere auf:\n" +
    "1. **Bugs**: Logikfehler, Edge Cases, Null-Checks\n" +
    "2. **Sicherheit**: Injection, XSS, Secrets\n" +
    "3. **Performance**: N+1, unnoetige Kopien, Complexity\n" +
    "4. **Code-Qualitaet**: Lesbarkeit, Naming, DRY\n" +
    "5. **Vorschlaege**: Bessere Patterns, fehlende Tests\n\n" +
    "Formatiere: [CRITICAL], [WARNING], [SUGGESTION], [INFO] mit Datei:Zeile.\n" +
    "Beende mit Gesamturteil: Approve, Request Changes, oder Comment.\n"
  );

  return parts.join("\n");
}

// ─── 4. Format Review Result ────────────────────────────

const SEVERITY_BADGES: Record<string, string> = {
  critical: "\u{1F534} CRITICAL",
  warning: "\u{1F7E1} WARNING",
  suggestion: "\u{1F7E2} SUGGESTION",
  info: "\u2139\uFE0F INFO",
};

export function formatReviewResult(review: string): string {
  return review
    .replace(/\[CRITICAL\]/gi, SEVERITY_BADGES.critical)
    .replace(/\[WARNING\]/gi, SEVERITY_BADGES.warning)
    .replace(/\[SUGGESTION\]/gi, SEVERITY_BADGES.suggestion)
    .replace(/\[INFO\]/gi, SEVERITY_BADGES.info);
}

export function parseReviewComments(review: string): ReviewComment[] {
  const comments: ReviewComment[] = [];
  const regex = /\[(CRITICAL|WARNING|SUGGESTION|INFO)\]\s*`?([^\s:`]+?)(?::(\d+)|\s*\((?:line\s*)?(\d+)\))?`?\s*[-—:]\s*(.+)/gi;
  let match;
  while ((match = regex.exec(review)) !== null) {
    comments.push({
      path: match[2],
      line: parseInt(match[3] ?? match[4] ?? "0", 10),
      body: match[5].trim(),
      severity: match[1].toLowerCase() as ReviewComment["severity"],
    });
  }
  return comments;
}

// ─── 5. Post Review Comments ────────────────────────────

export function postReviewComments(prNumber: number, comments: ReviewComment[], cwd: string): { posted: number; errors: string[] } {
  if (!ghInstalled()) throw new Error("GitHub CLI (gh) nicht installiert.");
  if (comments.length === 0) return { posted: 0, errors: [] };

  const errors: string[] = [];
  let posted = 0;

  let commitSha: string;
  try {
    const prJson = runGh(`pr view ${prNumber} --json headRefOid`, cwd);
    commitSha = String(JSON.parse(prJson).headRefOid ?? "");
  } catch (e) { throw new Error(`HEAD-Commit fuer PR #${prNumber} nicht ermittelbar: ${(e as Error).message.slice(0, 100)}`); }

  const reviewComments = comments.filter(c => c.line > 0 && c.path).map(c => ({
    path: c.path, line: c.line,
    body: `${SEVERITY_BADGES[c.severity]} ${c.body}`,
  }));

  const generalComments = comments.filter(c => c.line <= 0 || !c.path)
    .map(c => `${SEVERITY_BADGES[c.severity]} ${c.path ? `\`${c.path}\`: ` : ""}${c.body}`);

  const reviewBody = generalComments.length > 0
    ? "## Review Kommentare\n\n" + generalComments.join("\n\n")
    : "Automatisiertes Code Review abgeschlossen.";

  const hasCritical = comments.some(c => c.severity === "critical");
  const payload = {
    body: reviewBody,
    event: hasCritical ? "REQUEST_CHANGES" : "COMMENT",
    commit_id: commitSha,
    comments: reviewComments,
  };

  try {
    execSync(`gh api repos/{owner}/{repo}/pulls/${prNumber}/reviews --method POST --input -`, {
      cwd, input: JSON.stringify(payload), encoding: "utf-8", timeout: GH_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    posted = comments.length;
  } catch (e) {
    errors.push(`Review-Post fehlgeschlagen: ${(e as Error).message.slice(0, 150)}`);
    // Fallback: einfacher PR-Kommentar
    try {
      const body = `## Code Review\n\n${reviewBody}\n\n` +
        reviewComments.map(c => `**\`${c.path}:${c.line}\`**: ${c.body}`).join("\n\n");
      runGh(`pr comment ${prNumber} --body '${body.replace(/'/g, "'\\''")}'`, cwd);
      posted = comments.length;
    } catch (e2) {
      errors.push(`Fallback-Kommentar fehlgeschlagen: ${(e2 as Error).message.slice(0, 100)}`);
    }
  }

  return { posted, errors };
}

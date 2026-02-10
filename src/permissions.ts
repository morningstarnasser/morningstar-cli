import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type PermissionMode = "auto" | "ask" | "strict";
export type ToolCategory = "safe" | "moderate" | "dangerous";

const CONFIG_DIR = join(homedir(), ".morningstar");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  read: "safe",
  ls: "safe",
  glob: "safe",
  grep: "safe",
  git: "safe",
  write: "moderate",
  edit: "moderate",
  delete: "moderate",
  bash: "dangerous",
};

export function getToolCategory(tool: string): ToolCategory {
  return TOOL_CATEGORIES[tool] || "dangerous";
}

export function shouldAskPermission(tool: string, mode: PermissionMode): boolean {
  if (mode === "auto") return false;
  const cat = getToolCategory(tool);
  if (mode === "strict") return true;
  // ask mode: moderate + dangerous
  return cat === "moderate" || cat === "dangerous";
}

export function getPermissionMode(): PermissionMode {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      if (data.permissionMode && ["auto", "ask", "strict"].includes(data.permissionMode)) {
        return data.permissionMode;
      }
    }
  } catch {}
  return "auto";
}

export function setPermissionMode(mode: PermissionMode): void {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    let data: Record<string, unknown> = {};
    try { if (existsSync(CONFIG_FILE)) data = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")); } catch {}
    data.permissionMode = mode;
    writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export function formatPermissionPrompt(tool: string, args: string): string {
  const cat = getToolCategory(tool);
  const icon = cat === "dangerous" ? "\u26a0\ufe0f" : cat === "moderate" ? "\u270f\ufe0f" : "\u2139\ufe0f";
  const preview = args.length > 80 ? args.slice(0, 77) + "..." : args;
  return `${icon} [${tool}] ${preview}`;
}

export function getCategoryColor(cat: ToolCategory): string {
  switch (cat) {
    case "safe": return "#10b981";
    case "moderate": return "#f59e0b";
    case "dangerous": return "#ef4444";
  }
}

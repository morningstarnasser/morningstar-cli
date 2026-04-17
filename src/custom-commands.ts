import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "./frontmatter.js";

export interface CustomCommand {
  name: string;
  description: string;
  content: string;
  source: "global" | "project";
  agent?: string;
}

interface CommandFrontmatter {
  description?: string;
  agent?: string;
}

function loadCommandsFromDir(dir: string, source: "global" | "project"): CustomCommand[] {
  const commands: CustomCommand[] = [];
  if (!existsSync(dir)) return commands;

  try {
    const files = readdirSync(dir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      try {
        const filePath = join(dir, file);
        const raw = readFileSync(filePath, "utf-8");
        const name = basename(file, ".md");

        // Try frontmatter first (ECC format), fallback to first-line description
        const { frontmatter, content } = parseFrontmatter<CommandFrontmatter>(raw);
        let description: string;

        if (frontmatter.description) {
          description = frontmatter.description as string;
        } else {
          const lines = content.split("\n");
          const descLine = lines.find(l => l.trim().length > 0) || name;
          description = descLine.replace(/^#+\s*/, "").trim();
        }

        commands.push({
          name,
          description,
          content,
          source,
          agent: frontmatter.agent as string | undefined,
        });
      } catch {}
    }
  } catch {}

  return commands;
}

export function loadCustomCommands(cwd: string): CustomCommand[] {
  const globalDir = join(homedir(), ".morningstar", "commands");
  const projectDir = join(cwd, ".morningstar", "commands");

  const globalCmds = loadCommandsFromDir(globalDir, "global");
  const projectCmds = loadCommandsFromDir(projectDir, "project");

  // Project commands override global commands with same name
  const merged = new Map<string, CustomCommand>();
  for (const cmd of globalCmds) merged.set(cmd.name, cmd);
  for (const cmd of projectCmds) merged.set(cmd.name, cmd);

  return Array.from(merged.values());
}

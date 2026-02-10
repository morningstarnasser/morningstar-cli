import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, basename } from "node:path";
export function detectProject(cwd) {
    const projectName = basename(cwd);
    let language = null;
    let framework = null;
    let gitBranch = null;
    let hasGit = false;
    // Git
    try {
        if (existsSync(join(cwd, ".git"))) {
            hasGit = true;
            gitBranch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
        }
    }
    catch { }
    // Package.json
    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
        language = "TypeScript/JavaScript";
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            if (deps["next"])
                framework = "Next.js";
            else if (deps["react"])
                framework = "React";
            else if (deps["vue"])
                framework = "Vue";
            else if (deps["svelte"])
                framework = "Svelte";
            else if (deps["express"])
                framework = "Express";
            else if (deps["fastify"])
                framework = "Fastify";
        }
        catch { }
    }
    // Python
    if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) {
        language = "Python";
        if (existsSync(join(cwd, "manage.py")))
            framework = "Django";
        else if (existsSync(join(cwd, "app.py")) || existsSync(join(cwd, "main.py"))) {
            try {
                const content = readFileSync(join(cwd, existsSync(join(cwd, "app.py")) ? "app.py" : "main.py"), "utf-8");
                if (content.includes("FastAPI"))
                    framework = "FastAPI";
                else if (content.includes("Flask"))
                    framework = "Flask";
            }
            catch { }
        }
    }
    // Go
    if (existsSync(join(cwd, "go.mod"))) {
        language = "Go";
    }
    // Rust
    if (existsSync(join(cwd, "Cargo.toml"))) {
        language = "Rust";
    }
    // Java
    if (existsSync(join(cwd, "pom.xml")) || existsSync(join(cwd, "build.gradle"))) {
        language = "Java";
    }
    // Top-level files
    let files = [];
    try {
        files = readdirSync(cwd)
            .filter((f) => !f.startsWith(".") && f !== "node_modules" && f !== "dist" && f !== ".next" && f !== "__pycache__")
            .slice(0, 50);
    }
    catch { }
    return { cwd, projectName, language, framework, files, gitBranch, hasGit };
}
export function buildSystemPrompt(ctx) {
    const parts = [
        `Du bist Morningstar AI, ein extrem faehiger Terminal-basierter Coding-Assistant.`,
        `Du hilfst dem User beim Programmieren: Code schreiben, Bugs fixen, Architektur planen, Dateien bearbeiten.`,
        ``,
        `Aktuelles Verzeichnis: ${ctx.cwd}`,
        `Projekt: ${ctx.projectName}`,
        ctx.language ? `Sprache: ${ctx.language}` : null,
        ctx.framework ? `Framework: ${ctx.framework}` : null,
        ctx.hasGit ? `Git Branch: ${ctx.gitBranch || "unknown"}` : null,
        ctx.files.length > 0 ? `Dateien: ${ctx.files.join(", ")}` : null,
        ``,
        `Du hast Zugriff auf folgende Tools. Nutze sie indem du <tool:name>args</tool> in deine Antwort schreibst:`,
        ``,
        `<tool:read>pfad/zur/datei</tool> - Datei lesen`,
        `<tool:write>pfad/zur/datei`,
        `dateiinhalt hier</tool> - Datei schreiben/erstellen`,
        `<tool:edit>pfad/zur/datei`,
        `<<<`,
        `alter text`,
        `>>>`,
        `neuer text</tool> - Text in Datei ersetzen`,
        `<tool:delete>pfad/zur/datei</tool> - Datei loeschen`,
        `<tool:bash>befehl hier</tool> - Shell-Befehl ausfuehren`,
        `<tool:grep>suchmuster`,
        `optionaler-dateiglob</tool> - In Dateien suchen`,
        `<tool:glob>**/*.ts</tool> - Dateien nach Pattern finden`,
        `<tool:ls>verzeichnis</tool> - Verzeichnis auflisten`,
        `<tool:git></tool> - Git Status anzeigen`,
        ``,
        `Regeln:`,
        `- Lies IMMER zuerst relevante Dateien bevor du sie aenderst`,
        `- Erklaere kurz was du tust, dann fuehre die Tools aus`,
        `- Schreibe sauberen, sicheren Code`,
        `- Antworte auf Deutsch wenn der User Deutsch spricht`,
        `- Sei direkt und effizient, kein unnuetzes Gerede`,
    ];
    return parts.filter(Boolean).join("\n");
}
//# sourceMappingURL=context.js.map
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { execSync } from "node:child_process";
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", ".venv", "venv", "build", ".cache", "coverage", ".turbo"]);
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".swift", ".kt", ".c", ".cpp", ".h"]);
function walkDir(dir, base, files, maxDepth = 6, depth = 0) {
    if (depth > maxDepth || files.length > 500)
        return;
    try {
        for (const entry of readdirSync(dir)) {
            if (entry.startsWith(".") && entry !== ".env.example")
                continue;
            if (IGNORE_DIRS.has(entry))
                continue;
            const full = join(dir, entry);
            try {
                const stat = statSync(full);
                if (stat.isDirectory())
                    walkDir(full, base, files, maxDepth, depth + 1);
                else if (stat.isFile() && stat.size < 500000)
                    files.push(relative(base, full));
            }
            catch { }
        }
    }
    catch { }
}
function getLanguage(ext) {
    const map = {
        ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
        ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java",
        ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".kt": "Kotlin",
        ".c": "C", ".cpp": "C++", ".h": "C/C++", ".css": "CSS", ".scss": "SCSS",
        ".html": "HTML", ".vue": "Vue", ".svelte": "Svelte", ".md": "Markdown",
        ".json": "JSON", ".yaml": "YAML", ".yml": "YAML", ".toml": "TOML",
        ".sql": "SQL", ".sh": "Shell", ".bash": "Shell",
    };
    return map[ext] || "Other";
}
export function getRepoStats(cwd) {
    const files = [];
    walkDir(cwd, cwd, files);
    const languages = {};
    const fileSizes = [];
    let totalLines = 0;
    for (const file of files) {
        const ext = extname(file);
        const lang = getLanguage(ext);
        languages[lang] = (languages[lang] || 0) + 1;
        if (CODE_EXTS.has(ext)) {
            try {
                const content = readFileSync(join(cwd, file), "utf-8");
                const lines = content.split("\n").length;
                totalLines += lines;
                fileSizes.push({ path: file, lines });
            }
            catch { }
        }
    }
    fileSizes.sort((a, b) => b.lines - a.lines);
    return {
        totalFiles: files.length,
        totalLines,
        languages,
        largestFiles: fileSizes.slice(0, 10),
    };
}
export function getRepoMap(cwd) {
    const files = [];
    walkDir(cwd, cwd, files);
    const signatures = [];
    for (const file of files) {
        const ext = extname(file);
        if (!CODE_EXTS.has(ext))
            continue;
        if (signatures.length >= 200)
            break;
        try {
            const content = readFileSync(join(cwd, file), "utf-8");
            const lines = content.split("\n");
            const exports = [];
            const imports = [];
            for (const line of lines) {
                // Exports
                const expMatch = line.match(/export\s+(?:default\s+)?(?:function|class|interface|type|const|let|enum)\s+(\w+)/);
                if (expMatch)
                    exports.push(expMatch[1]);
                // Named export
                const namedExp = line.match(/export\s+\{\s*([^}]+)\s*\}/);
                if (namedExp)
                    exports.push(...namedExp[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean));
                // Imports
                const impMatch = line.match(/(?:import|from)\s+["']([^"']+)["']/);
                if (impMatch)
                    imports.push(impMatch[1]);
                // Python
                const pyImp = line.match(/^(?:import|from)\s+(\S+)/);
                if (ext === ".py" && pyImp)
                    imports.push(pyImp[1]);
                // Python def/class
                const pyDef = line.match(/^(?:def|class)\s+(\w+)/);
                if (ext === ".py" && pyDef)
                    exports.push(pyDef[1]);
            }
            if (exports.length > 0 || lines.length > 20) {
                signatures.push({ path: file, exports: [...new Set(exports)], imports: [...new Set(imports)], lines: lines.length });
            }
        }
        catch { }
    }
    signatures.sort((a, b) => b.exports.length - a.exports.length);
    return signatures;
}
export function getRepoMapCompact(cwd) {
    const sigs = getRepoMap(cwd).slice(0, 80);
    return sigs.map(s => {
        const exps = s.exports.slice(0, 6).join(", ") + (s.exports.length > 6 ? ", ..." : "");
        return `${s.path}: ${exps || "(no exports)"} (${s.lines}L)`;
    }).join("\n");
}
export function generateOnboarding(cwd) {
    const stats = getRepoStats(cwd);
    const sigs = getRepoMap(cwd);
    const lines = [];
    // Project name
    let projectName = basename(cwd);
    try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
        projectName = pkg.name || projectName;
    }
    catch { }
    // Detect language & framework
    const topLang = Object.entries(stats.languages).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
    let framework = "";
    try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
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
    lines.push(`PROJEKT: ${projectName}`);
    lines.push(`SPRACHE: ${topLang} (${stats.totalFiles} Dateien, ${stats.totalLines.toLocaleString()} Zeilen)`);
    if (framework)
        lines.push(`FRAMEWORK: ${framework}`);
    lines.push("");
    // Structure
    lines.push("STRUKTUR:");
    try {
        const dirs = readdirSync(cwd).filter(d => {
            if (d.startsWith(".") || IGNORE_DIRS.has(d))
                return false;
            try {
                return statSync(join(cwd, d)).isDirectory();
            }
            catch {
                return false;
            }
        });
        for (const d of dirs.slice(0, 10)) {
            const dirFiles = [];
            walkDir(join(cwd, d), join(cwd, d), dirFiles, 1);
            lines.push(`  ${d}/ (${dirFiles.length} Dateien)`);
        }
    }
    catch { }
    lines.push("");
    // Key files
    lines.push("KEY FILES:");
    for (const sig of sigs.slice(0, 8)) {
        const exps = sig.exports.slice(0, 4).join(", ");
        lines.push(`  ${sig.path} (${sig.lines}L) — ${exps || "entry point"}`);
    }
    lines.push("");
    // Scripts
    try {
        const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
        if (pkg.scripts) {
            lines.push("SCRIPTS:");
            for (const [name, cmd] of Object.entries(pkg.scripts).slice(0, 8)) {
                lines.push(`  npm run ${name}: ${cmd}`);
            }
            lines.push("");
        }
        // Dependencies
        if (pkg.dependencies) {
            const deps = Object.keys(pkg.dependencies).slice(0, 12);
            lines.push(`DEPENDENCIES (${Object.keys(pkg.dependencies).length}):`);
            lines.push(`  ${deps.join(", ")}`);
            lines.push("");
        }
    }
    catch { }
    // Git
    try {
        const branch = execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
        const commitCount = execSync("git rev-list --count HEAD", { cwd, encoding: "utf-8", timeout: 3000 }).trim();
        lines.push(`GIT: Branch ${branch}, ${commitCount} commits`);
    }
    catch { }
    return lines.join("\n");
}
export function generateProjectScore(cwd) {
    let quality = 50, testCoverage = 0, typeSafety = 0, documentation = 0, security = 50;
    const quickWins = [];
    const files = [];
    walkDir(cwd, cwd, files);
    // Quality
    if (files.some(f => f.includes("eslint") || f.includes(".eslintrc")))
        quality += 15;
    else
        quickWins.push("+15 Quality: ESLint konfigurieren");
    if (files.some(f => f.includes("prettier") || f.includes(".prettierrc")))
        quality += 10;
    else
        quickWins.push("+10 Quality: Prettier hinzufuegen");
    // Test coverage
    const testFiles = files.filter(f => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__"));
    const srcFiles = files.filter(f => CODE_EXTS.has(extname(f)) && !f.includes("test") && !f.includes("spec"));
    testCoverage = srcFiles.length > 0 ? Math.min(100, Math.round((testFiles.length / srcFiles.length) * 100)) : 0;
    if (testCoverage < 30)
        quickWins.push(`+${30 - testCoverage} Tests: Mehr Tests schreiben (${testFiles.length}/${srcFiles.length})`);
    // Type safety
    const tsFiles = files.filter(f => f.endsWith(".ts") || f.endsWith(".tsx"));
    const jsFiles = files.filter(f => f.endsWith(".js") || f.endsWith(".jsx"));
    if (tsFiles.length > jsFiles.length)
        typeSafety = 70;
    if (existsSync(join(cwd, "tsconfig.json"))) {
        typeSafety += 20;
        try {
            const tsconfig = readFileSync(join(cwd, "tsconfig.json"), "utf-8");
            if (tsconfig.includes('"strict": true') || tsconfig.includes('"strict":true'))
                typeSafety += 10;
        }
        catch { }
    }
    // Check for "any" usage
    let anyCount = 0;
    for (const f of tsFiles.slice(0, 50)) {
        try {
            const content = readFileSync(join(cwd, f), "utf-8");
            anyCount += (content.match(/:\s*any\b/g) || []).length;
        }
        catch { }
    }
    if (anyCount > 10) {
        typeSafety = Math.max(0, typeSafety - 20);
        quickWins.push(`+20 TypeSafety: ${anyCount}x "any" entfernen`);
    }
    // Documentation
    if (files.some(f => f === "README.md"))
        documentation += 30;
    else
        quickWins.push("+30 Docs: README.md erstellen");
    if (files.some(f => f.includes("CHANGELOG") || f.includes("changelog")))
        documentation += 15;
    if (files.some(f => f.includes("CONTRIBUTING")))
        documentation += 15;
    // Check for JSDoc
    let hasJsdoc = false;
    for (const f of tsFiles.slice(0, 20)) {
        try {
            if (readFileSync(join(cwd, f), "utf-8").includes("/**")) {
                hasJsdoc = true;
                break;
            }
        }
        catch { }
    }
    if (hasJsdoc)
        documentation += 20;
    else
        quickWins.push("+20 Docs: JSDoc zu public Funktionen");
    // Security
    if (files.some(f => f === ".env.example" || f === ".env.template"))
        security += 10;
    if (files.some(f => f === ".gitignore"))
        security += 10;
    // Check for hardcoded secrets
    let secretsFound = 0;
    for (const f of files.filter(ff => CODE_EXTS.has(extname(ff))).slice(0, 30)) {
        try {
            const content = readFileSync(join(cwd, f), "utf-8");
            if (content.match(/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i))
                secretsFound++;
        }
        catch { }
    }
    if (secretsFound > 0) {
        security -= 30;
        quickWins.push(`+30 Security: ${secretsFound} Dateien mit moeglichen Secrets`);
    }
    typeSafety = Math.min(100, Math.max(0, typeSafety));
    documentation = Math.min(100, Math.max(0, documentation));
    quality = Math.min(100, Math.max(0, quality));
    security = Math.min(100, Math.max(0, security));
    const overall = Math.round((quality + testCoverage + typeSafety + documentation + security) / 5);
    return { quality, testCoverage, typeSafety, documentation, security, overall, quickWins: quickWins.slice(0, 5) };
}
export function generateCodeRoast(cwd) {
    const roasts = [];
    const files = [];
    walkDir(cwd, cwd, files);
    let score = 7;
    // Any usage
    let anyCount = 0;
    for (const f of files.filter(ff => ff.endsWith(".ts") || ff.endsWith(".tsx")).slice(0, 50)) {
        try {
            anyCount += (readFileSync(join(cwd, f), "utf-8").match(/:\s*any\b/g) || []).length;
        }
        catch { }
    }
    if (anyCount > 0) {
        roasts.push(`${anyCount}x "any" gefunden. TypeScript ist kein JavaScript mit Extra-Schritten — es hat einen Sinn.`);
        score -= 1;
    }
    // console.log in src
    let consoleLogs = 0;
    for (const f of files.filter(ff => CODE_EXTS.has(extname(ff)) && !ff.includes("test")).slice(0, 50)) {
        try {
            consoleLogs += (readFileSync(join(cwd, f), "utf-8").match(/console\.log/g) || []).length;
        }
        catch { }
    }
    if (consoleLogs > 5) {
        roasts.push(`${consoleLogs}x console.log im Produktionscode. Das ist kein Debugging, das ist Hoffnung.`);
        score -= 1;
    }
    // No tests
    const testFiles = files.filter(f => f.includes(".test.") || f.includes(".spec."));
    if (testFiles.length === 0) {
        roasts.push("Keine Tests gefunden. Mutig. Ihr testet in Production wie echte Helden.");
        score -= 2;
    }
    // TODOs
    let todoCount = 0;
    for (const f of files.filter(ff => CODE_EXTS.has(extname(ff))).slice(0, 50)) {
        try {
            todoCount += (readFileSync(join(cwd, f), "utf-8").match(/\/\/\s*TODO/gi) || []).length;
        }
        catch { }
    }
    if (todoCount > 3) {
        roasts.push(`${todoCount} TODOs gefunden. Das T steht fuer "Tomorrow". Oder "Traumwelt".`);
        score -= 0.5;
    }
    // Large files
    for (const f of files.filter(ff => CODE_EXTS.has(extname(ff))).slice(0, 100)) {
        try {
            const lines = readFileSync(join(cwd, f), "utf-8").split("\n").length;
            if (lines > 500) {
                roasts.push(`${f} hat ${lines} Zeilen. Das ist kein File, das ist ein Roman. Refactoring waere nett.`);
                score -= 0.5;
                break;
            }
        }
        catch { }
    }
    // .env in git
    if (files.includes(".env")) {
        roasts.push(".env Datei im Projekt. Hoffentlich nicht im Git. Bitte .gitignore pruefen.");
        score -= 1;
    }
    // No .gitignore
    if (!files.includes(".gitignore")) {
        roasts.push("Keine .gitignore? Das ist wie ein Haus ohne Tuer. node_modules sagt Danke.");
        score -= 1;
    }
    // No README
    if (!files.some(f => f.toLowerCase() === "readme.md")) {
        roasts.push("Kein README.md. Wie soll jemand wissen was dieses Projekt macht? Hellsehen?");
        score -= 0.5;
    }
    score = Math.max(1, Math.min(10, Math.round(score)));
    const verdict = {
        1: "Loeschen und von vorne anfangen.",
        2: "Das ist kein Code, das ist ein Hilferuf.",
        3: "Es funktioniert... irgendwie. Meistens.",
        4: "Durchschnittlich. Wie Leitungswasser.",
        5: "Solide Basis, aber da geht mehr.",
        6: "Nicht schlecht! Mit etwas Arbeit wird das was.",
        7: "Guter Code! Ein paar Kleinigkeiten noch.",
        8: "Beeindruckend. Fast zu gut fuer ein Side Project.",
        9: "Exzellent. Die Senior Devs waeren stolz.",
        10: "Perfekt. Bist du ein KI?",
    };
    let output = "CODE ROAST\n\n";
    for (const roast of roasts)
        output += `  - ${roast}\n`;
    if (roasts.length === 0)
        output += "  Hmm... eigentlich sieht das recht gut aus. Respekt.\n";
    output += `\n  SCORE: ${score}/10 — "${verdict[score] || "Kein Kommentar."}"`;
    return output;
}
//# sourceMappingURL=repo-map.js.map
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname, resolve, basename } from "node:path";

export interface DepNode {
  path: string;
  shortName: string;
  imports: string[];
  importedBy: string[];
}

export interface DepGraph {
  nodes: DepNode[];
  edges: Array<{ from: string; to: string }>;
}

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "out", "__pycache__", ".turbo"]);

function parseImports(content: string, filePath: string, cwd: string): string[] {
  const imports: string[] = [];
  const patterns = [
    /import\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    /import\s+["']([^"']+)["']/g,
    /require\(["']([^"']+)["']\)/g,
    /export\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(content)) !== null) {
      const imp = match[1];
      if (!imp.startsWith(".")) continue;

      const dir = dirname(filePath);
      let resolved = resolve(dir, imp);

      // Strip .js extension (common in ESM imports that map to .ts files)
      if (resolved.endsWith(".js")) {
        const tsPath = resolved.replace(/\.js$/, ".ts");
        const tsxPath = resolved.replace(/\.js$/, ".tsx");
        if (existsSync(tsPath)) { resolved = tsPath; }
        else if (existsSync(tsxPath)) { resolved = tsxPath; }
      }

      // Try adding extensions if no extension present
      if (!extname(resolved) || !existsSync(resolved)) {
        let found = false;
        for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
          const full = resolved + ext;
          if (existsSync(full)) { resolved = full; found = true; break; }
        }
        if (!found) {
          // Try index files
          for (const ext of ["/index.ts", "/index.tsx", "/index.js"]) {
            const full = resolved + ext;
            if (existsSync(full)) { resolved = full; found = true; break; }
          }
        }
        if (!found && !existsSync(resolved)) continue;
      }

      imports.push(relative(cwd, resolved));
    }
  }
  return [...new Set(imports)];
}

function scanProject(cwd: string, maxFiles = 80): string[] {
  const files: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 6 || files.length >= maxFiles) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry) || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (CODE_EXTS.has(extname(entry))) {
        files.push(full);
        if (files.length >= maxFiles) return;
      }
    }
  }

  // Prefer src/ directory if it exists
  const srcDir = join(cwd, "src");
  if (existsSync(srcDir)) walk(srcDir, 0);
  else walk(cwd, 0);

  return files;
}

export function buildDepGraph(cwd: string): DepGraph {
  const files = scanProject(cwd);
  const nodeMap = new Map<string, DepNode>();
  const edges: Array<{ from: string; to: string }> = [];

  // Create nodes
  for (const file of files) {
    const relPath = relative(cwd, file);
    const name = basename(relPath, extname(relPath));
    nodeMap.set(relPath, { path: relPath, shortName: name, imports: [], importedBy: [] });
  }

  // Parse imports and build edges
  for (const file of files) {
    const relPath = relative(cwd, file);
    const node = nodeMap.get(relPath);
    if (!node) continue;

    let content: string;
    try { content = readFileSync(file, "utf-8"); } catch { continue; }

    const imports = parseImports(content, file, cwd);
    for (const imp of imports) {
      if (nodeMap.has(imp)) {
        node.imports.push(imp);
        nodeMap.get(imp)!.importedBy.push(relPath);
        edges.push({ from: relPath, to: imp });
      }
    }
  }

  return { nodes: [...nodeMap.values()], edges };
}

// Assign layers: nodes with no imports → layer 0, others based on max import depth
function assignLayers(graph: DepGraph): Map<string, number> {
  const layers = new Map<string, number>();
  const nodesByPath = new Map(graph.nodes.map(n => [n.path, n]));

  function getLayer(path: string, visited: Set<string>): number {
    if (layers.has(path)) return layers.get(path)!;
    if (visited.has(path)) return 0; // cycle
    visited.add(path);

    const node = nodesByPath.get(path);
    if (!node || node.imports.length === 0) {
      layers.set(path, 0);
      return 0;
    }

    let maxChildLayer = 0;
    for (const imp of node.imports) {
      maxChildLayer = Math.max(maxChildLayer, getLayer(imp, visited));
    }
    const layer = maxChildLayer + 1;
    layers.set(path, layer);
    return layer;
  }

  for (const node of graph.nodes) {
    getLayer(node.path, new Set());
  }

  return layers;
}

export function renderDepGraphAscii(graph: DepGraph, maxWidth = 80): string {
  if (graph.nodes.length === 0) return "  (keine Dateien gefunden)";

  const layers = assignLayers(graph);
  const maxLayer = Math.max(...layers.values());

  // Group nodes by layer (highest layer = top of graph)
  const layerGroups: DepNode[][] = [];
  for (let l = maxLayer; l >= 0; l--) {
    const group = graph.nodes
      .filter(n => layers.get(n.path) === l)
      .sort((a, b) => b.importedBy.length - a.importedBy.length);
    if (group.length > 0) layerGroups.push(group);
  }

  const lines: string[] = [];
  const boxWidth = Math.min(22, Math.floor((maxWidth - 6) / 3));

  for (let gi = 0; gi < layerGroups.length; gi++) {
    const group = layerGroups[gi];
    const maxPerRow = Math.floor(maxWidth / (boxWidth + 4));
    const rows = [];
    for (let i = 0; i < group.length; i += maxPerRow) {
      rows.push(group.slice(i, i + maxPerRow));
    }

    for (const row of rows) {
      // Top border
      let topLine = "  ";
      let nameLine = "  ";
      let infoLine = "  ";
      let botLine = "  ";

      for (let i = 0; i < row.length; i++) {
        const node = row[i];
        const name = node.shortName.length > boxWidth - 4
          ? node.shortName.slice(0, boxWidth - 7) + "..."
          : node.shortName;
        const info = `${node.imports.length} dep${node.imports.length !== 1 ? "s" : ""}`;
        const inner = boxWidth - 2;
        const pad = (s: string) => {
          const left = Math.floor((inner - s.length) / 2);
          const right = inner - s.length - left;
          return " ".repeat(Math.max(0, left)) + s + " ".repeat(Math.max(0, right));
        };

        const sep = i < row.length - 1 ? "  " : "";
        topLine += "\u250C" + "\u2500".repeat(inner) + "\u2510" + sep;
        nameLine += "\u2502" + pad(name) + "\u2502" + sep;
        infoLine += "\u2502" + pad(`(${info})`) + "\u2502" + sep;
        botLine += "\u2514" + "\u2500".repeat(inner) + "\u2518" + sep;
      }

      lines.push(topLine, nameLine, infoLine, botLine);

      // Draw connectors to next layer
      if (gi < layerGroups.length - 1) {
        let connectorLine = "  ";
        for (let i = 0; i < row.length; i++) {
          const node = row[i];
          const mid = Math.floor(boxWidth / 2);
          const hasChildren = node.imports.some(imp =>
            layerGroups[gi + 1]?.some(n => n.path === imp)
          );
          const connector = " ".repeat(mid) + (hasChildren ? "\u2502" : " ") + " ".repeat(boxWidth - mid - 1);
          connectorLine += connector + (i < row.length - 1 ? "  " : "");
        }
        const arrowLine = connectorLine.replace(/\u2502/g, "\u25BC");
        lines.push(connectorLine, arrowLine);
      }
    }
  }

  return lines.join("\n");
}

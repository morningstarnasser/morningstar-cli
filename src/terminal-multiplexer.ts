// ─── Terminal Multiplexer ──────────────────────────────
// Layout-Management fuer Ink 5 Split-Pane-Ansichten.
// Reine Berechnungslogik ohne React-Komponenten.

// ─── Types ───────────────────────────────────────────────

export interface Pane {
  id: string;
  type: "chat" | "code-preview" | "tools" | "diff" | "terminal" | "custom";
  title: string;
  width: number;   // Prozent 0-100
  height: number;  // Prozent 0-100
  visible: boolean;
  content: string;
  scrollOffset: number;
}

export interface Layout {
  id: string;
  name: string;
  panes: Pane[];
  arrangement: "horizontal" | "vertical" | "grid";
}

export interface MultiplexerState {
  layout: Layout;
  termWidth: number;
  termHeight: number;
  focusedPane: string;
  paneContents: Map<string, string>;
}

export interface PanePosition {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  focused: boolean;
}

export interface BorderFrame {
  lines: string[];
  width: number;
  height: number;
}

// ─── Box Drawing ─────────────────────────────────────────

const BOX = {
  topLeft: "\u250C", topRight: "\u2510", bottomLeft: "\u2514", bottomRight: "\u2518",
  horizontal: "\u2500", vertical: "\u2502",
  teeRight: "\u251C", teeLeft: "\u2524", teeDown: "\u252C", teeUp: "\u2534", cross: "\u253C",
  // Fokussierte Varianten (doppelt)
  focusTopLeft: "\u2554", focusTopRight: "\u2557", focusBottomLeft: "\u255A", focusBottomRight: "\u255D",
  focusHorizontal: "\u2550", focusVertical: "\u2551",
};

// ─── Predefined Layouts ──────────────────────────────────

function makePane(type: Pane["type"], title: string, width: number, height: number): Pane {
  return { id: `pane-${type}-${Math.random().toString(36).slice(2, 6)}`, type, title, width, height, visible: true, content: "", scrollOffset: 0 };
}

const LAYOUTS: Record<string, () => Layout> = {
  default: () => ({
    id: "default", name: "Standard (Einzelpanel)",
    panes: [makePane("chat", "Chat", 100, 100)],
    arrangement: "horizontal",
  }),
  split: () => ({
    id: "split", name: "Geteilt (Chat + Code)",
    panes: [makePane("chat", "Chat", 60, 100), makePane("code-preview", "Code-Vorschau", 40, 100)],
    arrangement: "horizontal",
  }),
  triple: () => ({
    id: "triple", name: "Dreifach (Chat + Code + Tools)",
    panes: [
      makePane("chat", "Chat", 50, 100),
      makePane("code-preview", "Code-Vorschau", 50, 50),
      makePane("tools", "Werkzeuge", 50, 50),
    ],
    arrangement: "grid",
  }),
  quad: () => ({
    id: "quad", name: "Vierfach (Chat + Code + Diff + Terminal)",
    panes: [
      makePane("chat", "Chat", 50, 50),
      makePane("code-preview", "Code-Vorschau", 50, 50),
      makePane("diff", "Diff-Ansicht", 50, 50),
      makePane("terminal", "Terminal", 50, 50),
    ],
    arrangement: "grid",
  }),
};

export function getAvailableLayouts(): Layout[] {
  return Object.values(LAYOUTS).map(fn => fn());
}

export function getLayout(id: string): Layout | null {
  const fn = LAYOUTS[id];
  return fn ? fn() : null;
}

// ─── Multiplexer State ──────────────────────────────────

export function createMultiplexer(termWidth: number, termHeight: number): MultiplexerState {
  const layout = LAYOUTS.default!();
  return {
    layout,
    termWidth: Math.max(40, termWidth),
    termHeight: Math.max(10, termHeight),
    focusedPane: layout.panes[0]?.id ?? "",
    paneContents: new Map(),
  };
}

export function setLayout(mux: MultiplexerState, layoutId: string): MultiplexerState {
  const fn = LAYOUTS[layoutId];
  if (!fn) return mux;
  const layout = fn();
  return { ...mux, layout, focusedPane: layout.panes[0]?.id ?? mux.focusedPane };
}

export function resizePane(mux: MultiplexerState, paneId: string, delta: { width?: number; height?: number }): MultiplexerState {
  const panes = mux.layout.panes.map(p => {
    if (p.id !== paneId) return p;
    return {
      ...p,
      width: Math.max(10, Math.min(90, p.width + (delta.width ?? 0))),
      height: Math.max(10, Math.min(90, p.height + (delta.height ?? 0))),
    };
  });
  return { ...mux, layout: { ...mux.layout, panes } };
}

export function togglePane(mux: MultiplexerState, paneId: string): MultiplexerState {
  const panes = mux.layout.panes.map(p => p.id === paneId ? { ...p, visible: !p.visible } : p);
  let focused = mux.focusedPane;
  const toggled = panes.find(p => p.id === paneId);
  if (toggled && !toggled.visible && focused === paneId) {
    focused = panes.find(p => p.visible)?.id ?? focused;
  }
  return { ...mux, layout: { ...mux.layout, panes }, focusedPane: focused };
}

export function updatePaneContent(mux: MultiplexerState, paneId: string, content: string): MultiplexerState {
  const contents = new Map(mux.paneContents);
  contents.set(paneId, content);
  const panes = mux.layout.panes.map(p => p.id === paneId ? { ...p, content } : p);
  return { ...mux, layout: { ...mux.layout, panes }, paneContents: contents };
}

export function scrollPane(mux: MultiplexerState, paneId: string, lines: number): MultiplexerState {
  const panes = mux.layout.panes.map(p => {
    if (p.id !== paneId) return p;
    return { ...p, scrollOffset: Math.max(0, p.scrollOffset + lines) };
  });
  return { ...mux, layout: { ...mux.layout, panes } };
}

export function focusPane(mux: MultiplexerState, paneId: string): MultiplexerState {
  const pane = mux.layout.panes.find(p => p.id === paneId && p.visible);
  if (!pane) return mux;
  return { ...mux, focusedPane: paneId };
}

export function focusNext(mux: MultiplexerState): MultiplexerState {
  const visible = mux.layout.panes.filter(p => p.visible);
  if (visible.length <= 1) return mux;
  const idx = visible.findIndex(p => p.id === mux.focusedPane);
  const next = visible[(idx + 1) % visible.length];
  return { ...mux, focusedPane: next.id };
}

// ─── Calculate Pane Positions ───────────────────────────

export function calculatePanePositions(mux: MultiplexerState): PanePosition[] {
  const { layout, termWidth, termHeight, focusedPane } = mux;
  const visible = layout.panes.filter(p => p.visible);
  if (visible.length === 0) return [];

  // Nutzbare Flaeche (mit 1px Rand pro Seite)
  const usableW = termWidth - 2;
  const usableH = termHeight - 2;

  const positions: PanePosition[] = [];

  if (layout.arrangement === "horizontal") {
    // Alle Panes nebeneinander
    const totalW = visible.reduce((s, p) => s + p.width, 0);
    let x = 1;
    for (const pane of visible) {
      const w = Math.max(10, Math.round((pane.width / totalW) * usableW));
      positions.push({
        id: pane.id, title: pane.title,
        x, y: 1, width: w, height: usableH,
        visible: true, focused: pane.id === focusedPane,
      });
      x += w + 1;
    }
  } else if (layout.arrangement === "vertical") {
    // Alle Panes uebereinander
    const totalH = visible.reduce((s, p) => s + p.height, 0);
    let y = 1;
    for (const pane of visible) {
      const h = Math.max(3, Math.round((pane.height / totalH) * usableH));
      positions.push({
        id: pane.id, title: pane.title,
        x: 1, y, width: usableW, height: h,
        visible: true, focused: pane.id === focusedPane,
      });
      y += h + 1;
    }
  } else {
    // Grid: 2-Spalten
    const colW = Math.floor(usableW / 2);
    const rows = Math.ceil(visible.length / 2);
    const rowH = Math.max(3, Math.floor(usableH / rows));

    for (let i = 0; i < visible.length; i++) {
      const pane = visible[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      positions.push({
        id: pane.id, title: pane.title,
        x: 1 + col * (colW + 1), y: 1 + row * (rowH + 1),
        width: colW, height: rowH,
        visible: true, focused: pane.id === focusedPane,
      });
    }
  }

  return positions;
}

// ─── Render Borders ─────────────────────────────────────

// Richtungs-Bitmasken
const DIR_UP = 1, DIR_DOWN = 2, DIR_LEFT = 4, DIR_RIGHT = 8;

function boxCharFromDirs(dirs: number): string {
  switch (dirs) {
    case DIR_LEFT | DIR_RIGHT: return BOX.horizontal;
    case DIR_UP | DIR_DOWN: return BOX.vertical;
    case DIR_DOWN | DIR_RIGHT: return BOX.topLeft;
    case DIR_DOWN | DIR_LEFT: return BOX.topRight;
    case DIR_UP | DIR_RIGHT: return BOX.bottomLeft;
    case DIR_UP | DIR_LEFT: return BOX.bottomRight;
    case DIR_UP | DIR_DOWN | DIR_RIGHT: return BOX.teeRight;
    case DIR_UP | DIR_DOWN | DIR_LEFT: return BOX.teeLeft;
    case DIR_LEFT | DIR_RIGHT | DIR_DOWN: return BOX.teeDown;
    case DIR_LEFT | DIR_RIGHT | DIR_UP: return BOX.teeUp;
    case DIR_UP | DIR_DOWN | DIR_LEFT | DIR_RIGHT: return BOX.cross;
    default:
      if (dirs & (DIR_LEFT | DIR_RIGHT)) return BOX.horizontal;
      if (dirs & (DIR_UP | DIR_DOWN)) return BOX.vertical;
      return " ";
  }
}

function toFocusChar(c: string): string {
  switch (c) {
    case BOX.horizontal: return BOX.focusHorizontal;
    case BOX.vertical: return BOX.focusVertical;
    case BOX.topLeft: return BOX.focusTopLeft;
    case BOX.topRight: return BOX.focusTopRight;
    case BOX.bottomLeft: return BOX.focusBottomLeft;
    case BOX.bottomRight: return BOX.focusBottomRight;
    default: return c;
  }
}

export function renderBorders(positions: PanePosition[], termWidth: number, termHeight: number): BorderFrame {
  const dirMap: number[][] = Array.from({ length: termHeight }, () => new Array(termWidth).fill(0));
  const focusMap: boolean[][] = Array.from({ length: termHeight }, () => new Array(termWidth).fill(false));
  const titles: Array<{ topY: number; leftX: number; rightX: number; width: number; title: string; focused: boolean }> = [];

  const safeOr = (cy: number, cx: number, dir: number, focused: boolean) => {
    if (cy >= 0 && cy < termHeight && cx >= 0 && cx < termWidth) {
      dirMap[cy][cx] |= dir;
      if (focused) focusMap[cy][cx] = true;
    }
  };

  for (const pos of positions) {
    if (!pos.visible) continue;
    const left = pos.x - 1, right = pos.x + pos.width, top = pos.y - 1, bottom = pos.y + pos.height;

    for (let cx = left + 1; cx < right; cx++) { safeOr(top, cx, DIR_LEFT | DIR_RIGHT, pos.focused); safeOr(bottom, cx, DIR_LEFT | DIR_RIGHT, pos.focused); }
    for (let cy = top + 1; cy < bottom; cy++) { safeOr(cy, left, DIR_UP | DIR_DOWN, pos.focused); safeOr(cy, right, DIR_UP | DIR_DOWN, pos.focused); }
    safeOr(top, left, DIR_RIGHT | DIR_DOWN, pos.focused);
    safeOr(top, right, DIR_LEFT | DIR_DOWN, pos.focused);
    safeOr(bottom, left, DIR_RIGHT | DIR_UP, pos.focused);
    safeOr(bottom, right, DIR_LEFT | DIR_UP, pos.focused);

    if (pos.title) titles.push({ topY: top, leftX: left, rightX: right, width: pos.width, title: pos.title, focused: pos.focused });
  }

  const canvas: string[][] = dirMap.map((row, y) =>
    row.map((dirs, x) => {
      if (dirs === 0) return " ";
      const base = boxCharFromDirs(dirs);
      return focusMap[y][x] ? toFocusChar(base) : base;
    })
  );

  // Titel einfuegen
  for (const t of titles) {
    const maxW = Math.max(0, t.width - 4);
    if (maxW <= 0) continue;
    const display = t.title.length > maxW ? t.title.slice(0, maxW - 1) + "\u2026" : t.title;
    const label = t.focused ? ` [${display}] ` : ` ${display} `;
    const start = t.leftX + 1 + Math.floor((t.width - label.length) / 2);
    for (let i = 0; i < label.length; i++) {
      const cx = start + i;
      if (cx > t.leftX && cx < t.rightX && t.topY >= 0 && t.topY < termHeight && cx >= 0 && cx < termWidth) {
        canvas[t.topY][cx] = label[i];
      }
    }
  }

  return { lines: canvas.map(row => row.join("")), width: termWidth, height: termHeight };
}

// ─── Content Fitting ────────────────────────────────────

export function fitContentToPane(content: string, width: number, height: number, scrollOffset: number): string[] {
  if (!content) return Array(height).fill(" ".repeat(width));

  const lines = content.split("\n");
  const wrapped: string[] = [];

  for (const line of lines) {
    if (line.length <= width) {
      wrapped.push(line.padEnd(width));
    } else {
      // Wort-basierter Umbruch
      let remaining = line;
      while (remaining.length > 0) {
        if (remaining.length <= width) { wrapped.push(remaining.padEnd(width)); break; }
        let breakAt = remaining.lastIndexOf(" ", width);
        if (breakAt <= 0) breakAt = width;
        wrapped.push(remaining.slice(0, breakAt).padEnd(width));
        remaining = remaining.slice(breakAt).trimStart();
      }
    }
  }

  const scrolled = wrapped.slice(scrollOffset, scrollOffset + height);
  while (scrolled.length < height) scrolled.push(" ".repeat(width));
  return scrolled;
}

// ─── Formatting ─────────────────────────────────────────

export function formatLayoutList(): string {
  const layouts = getAvailableLayouts();
  const lines = ["Verfuegbare Layouts:", ""];
  for (const l of layouts) {
    const paneList = l.panes.map(p => `${p.title} (${p.width}%\u00D7${p.height}%)`).join(", ");
    lines.push(`  ${l.id.padEnd(12)} ${l.name}`);
    lines.push(`${"".padEnd(15)}${l.arrangement} \u00B7 ${l.panes.length} Panes: ${paneList}`);
  }
  return lines.join("\n");
}

export function formatPaneList(mux: MultiplexerState): string {
  const positions = calculatePanePositions(mux);
  const lines = [`Layout: ${mux.layout.name} (${mux.layout.id})`, `Terminal: ${mux.termWidth}\u00D7${mux.termHeight}`, ""];
  for (const pos of positions) {
    const focus = pos.focused ? " [FOKUS]" : "";
    lines.push(`  ${pos.title} (${pos.width}\u00D7${pos.height} @ ${pos.x},${pos.y})${focus}`);
  }
  return lines.join("\n");
}

export function formatStatusLine(mux: MultiplexerState): string {
  const panes = mux.layout.panes.filter(p => p.visible);
  const labels = panes.map(p => p.id === mux.focusedPane ? `${p.title}*` : p.title);
  return `[${mux.layout.id}] ${labels.join(" \u2502 ")}`;
}

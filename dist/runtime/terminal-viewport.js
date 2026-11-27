import xterm from "@xterm/headless";
import unicode from "@xterm/addon-unicode-graphemes";
import { copyText } from "./clipboard.js";
import { findTerminalMatches } from "./terminal-search.js";
const CSI = "\x1b[";
function style(cell) {
    const codes = ["0"];
    for (const [on, code] of [[cell.isBold(), 1], [cell.isDim(), 2], [cell.isItalic(), 3], [cell.isUnderline(), 4], [cell.isInverse(), 7], [cell.isInvisible(), 8], [cell.isStrikethrough(), 9]])
        if (on)
            codes.push(String(code));
    for (const background of [false, true]) {
        const value = background ? cell.getBgColor() : cell.getFgColor();
        if (background ? cell.isBgRGB() : cell.isFgRGB())
            codes.push(`${background ? 48 : 38};2;${value >> 16 & 255};${value >> 8 & 255};${value & 255}`);
        else if (background ? cell.isBgPalette() : cell.isFgPalette())
            codes.push(`${background ? 48 : 38};5;${value}`);
    }
    return `${CSI}${codes.join(";")}m`;
}
/** Mirrors actual terminal output. Read mode freezes a snapshot while Ink keeps working. */
export class TerminalViewport {
    options;
    terminal;
    snapshot = [];
    paintedRows = [];
    top = 0;
    anchor = null;
    end = null;
    dragging = false;
    notice = "";
    detailTitle = "";
    pendingUpdates = 0;
    footerTimer;
    disposed = false;
    searching = false;
    searchQuery = "";
    searchMatches = [];
    searchIndex = -1;
    active = false;
    constructor(options) {
        this.options = options;
        this.terminal = new xterm.Terminal({ cols: options.columns, rows: options.rows, scrollback: options.scrollback ?? 20_000, allowProposedApi: true, convertEol: true, logLevel: "off" });
        this.terminal.loadAddon(new unicode.UnicodeGraphemesAddon());
    }
    feed(data) {
        if (this.disposed)
            return;
        this.terminal.write(data);
        if (this.active) {
            this.pendingUpdates++;
            if (!this.footerTimer)
                this.footerTimer = setTimeout(() => {
                    this.footerTimer = undefined;
                    if (this.active && !this.disposed)
                        this.paint();
                }, 100);
        }
    }
    flush() { return new Promise(resolve => this.terminal.write("", resolve)); }
    lines(terminal = this.terminal, start = 0, end = terminal.buffer.active.length) {
        const buffer = terminal.buffer.active, lines = [];
        for (let y = start; y < Math.min(end, buffer.length); y++) {
            const line = buffer.getLine(y);
            const cells = [];
            for (let x = 0; x < line.length; x++) {
                const cell = line.getCell(x);
                cells.push({ text: cell.getChars() || " ", width: cell.getWidth(), style: style(cell) });
            }
            lines.push({ cells, wrapped: line.isWrapped });
        }
        return lines;
    }
    /** Project the dynamic Ink region against the bottom without adding padding
     * to Ink's Static history. A completed/shorter response must not lift input. */
    liveFrame(includeHistory = false) {
        const buffer = this.terminal.buffer.active;
        const height = Math.min(this.terminal.rows - 1, Math.max(0, Math.ceil(this.options.dockHeight?.() ?? 0)));
        if (!height) {
            const offset = includeHistory ? 0 : buffer.baseY;
            return { lines: this.lines(this.terminal, offset), top: buffer.baseY - offset, cursorY: buffer.cursorY, cursorX: buffer.cursorX };
        }
        const cursor = buffer.baseY + buffer.cursorY;
        const dynamicStart = Math.max(0, cursor - height);
        let bodyEnd = dynamicStart;
        // Ink can leave the erased tall streaming region between a completed Static
        // answer and its now-short composer. Fill that gap with the latest answer,
        // rather than projecting an empty page above the live input.
        while (bodyEnd > 0 && !buffer.getLine(bodyEnd - 1)?.translateToString(true).trim())
            bodyEnd--;
        const bodyRows = this.terminal.rows - 1 - (cursor - dynamicStart);
        const start = includeHistory ? 0 : Math.max(0, bodyEnd - bodyRows);
        const lines = this.lines(this.terminal, start, bodyEnd);
        const gap = Math.max(0, bodyRows - lines.length);
        lines.push(...Array.from({ length: gap }, () => ({ cells: [], wrapped: false })), ...this.lines(this.terminal, dynamicStart, cursor), { cells: [], wrapped: false });
        return { lines, top: Math.max(0, lines.length - this.terminal.rows), cursorY: this.terminal.rows - 1, cursorX: buffer.cursorX };
    }
    async renderLive() {
        if (this.disposed)
            return;
        await this.flush();
        if (this.active || this.disposed)
            return;
        const live = this.liveFrame();
        this.options.write(this.frame(live.lines, live.top, false) + `${CSI}0m${CSI}${live.cursorY + 1};${Math.min(this.terminal.cols, live.cursorX + 1)}H${CSI}?25l`);
    }
    /** Align the first short frame if Morningstar started below an existing shell prompt. */
    async alignCursor(row) {
        if (this.options.dockHeight?.())
            return;
        await this.flush();
        const buffer = this.terminal.buffer.active, offset = row - 1 - buffer.cursorY;
        if (!buffer.baseY && offset > 0 && offset < this.terminal.rows) {
            this.feed(`${CSI}H${CSI}${offset}L${CSI}${row};${buffer.cursorX + 1}H`);
            await this.flush();
        }
    }
    async enter() {
        if (this.active || this.disposed)
            return;
        await this.flush();
        if (this.active || this.disposed)
            return;
        const live = this.liveFrame(true);
        this.snapshot = live.lines;
        this.top = live.top;
        this.active = true;
        this.notice = "";
        this.pendingUpdates = 0;
        this.paintedRows = [];
        this.options.write(`${CSI}?1049h${CSI}?25l`);
    }
    async scroll(amount, x) {
        if (this.options.workspace?.active) {
            this.options.workspace.scroll(amount, x);
            this.paint();
            return;
        }
        if (!this.active && amount > 0) {
            await this.renderLive();
            return;
        }
        await this.enter();
        // A completed mouse selection must not trap the user in old scrollback.
        if (!this.dragging) {
            this.anchor = this.end = null;
            this.notice = "";
        }
        if (!this.modal && !this.dragging) {
            await this.flush();
            this.snapshot = this.liveFrame(true).lines;
        }
        this.top = Math.max(0, Math.min(this.snapshot.length - this.terminal.rows, this.top + amount));
        if (!this.detailTitle && !this.searching && amount > 0 && this.top >= this.snapshot.length - this.terminal.rows && !this.dragging && !this.anchor) {
            await this.leave();
            return;
        }
        this.paint();
    }
    async page(direction) { await this.scroll(direction * Math.max(1, this.terminal.rows - 3)); }
    get modal() { return Boolean(this.options.workspace?.active) || this.searching || Boolean(this.detailTitle); }
    get pinnedHeight() { return this.modal ? 0 : Math.min(this.terminal.rows - 3, Math.max(0, Math.ceil(this.options.liveHeight?.() ?? 0))); }
    isLiveRow(y) { return this.active && !this.modal && y > this.terminal.rows - 1 - this.pinnedHeight && y < this.terminal.rows; }
    async home() { await this.enter(); this.top = 0; this.paint(); }
    async find(query = "") {
        await this.enter();
        this.searching = true;
        this.anchor = this.end = null;
        this.searchQuery = query.slice(0, 256);
        this.updateSearch();
    }
    updateSearch() {
        this.searchMatches = findTerminalMatches(this.snapshot, this.searchQuery);
        this.searchIndex = this.searchMatches.length ? 0 : -1;
        this.showSearchMatch();
    }
    showSearchMatch() {
        const match = this.searchMatches[this.searchIndex];
        if (match)
            this.top = Math.max(0, Math.min(this.snapshot.length - this.terminal.rows + 1, match.start.row - 2));
        this.paint();
    }
    async searchInput(input) {
        if (input === "\x1b" || input === "\x03") {
            await this.leave();
            return;
        }
        if (["\r", "\n", "\x07", "\x1b[13~", "\x1b[B"].includes(input)) {
            if (this.searchMatches.length)
                this.searchIndex = (this.searchIndex + 1) % this.searchMatches.length;
            this.showSearchMatch();
            return;
        }
        if (["\x1b[13;2u", "\x1b[27;2;13~", "\x1b[13;2~", "\x1b[A"].includes(input)) {
            if (this.searchMatches.length)
                this.searchIndex = (this.searchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
            this.showSearchMatch();
            return;
        }
        if (input === "\x7f" || input === "\x08")
            this.searchQuery = [...this.searchQuery].slice(0, -1).join("");
        else if (input === "\x15")
            this.searchQuery = "";
        else {
            const pasted = input.replace(/\x1b\[20[01]~/g, "");
            if (/[\x00-\x1f\x7f]/.test(pasted))
                return;
            this.searchQuery = (this.searchQuery + pasted).slice(0, 256);
        }
        this.updateSearch();
    }
    async leave() {
        this.options.workspace?.close();
        if (!this.active)
            return;
        await this.flush();
        if (this.disposed)
            return;
        this.active = false;
        this.snapshot = [];
        this.anchor = this.end = null;
        this.dragging = false;
        this.detailTitle = "";
        this.searching = false;
        this.searchMatches = [];
        this.options.write(`${CSI}?1049l`);
        this.paintedRows = [];
        await this.renderLive();
    }
    point(x, y) {
        const row = Math.max(0, Math.min(this.snapshot.length - 1, this.top + y - 1));
        let column = Math.max(0, Math.min(this.terminal.cols, x - 1));
        if (this.snapshot[row]?.cells[column]?.width === 0)
            column = Math.max(0, column - 1);
        return { row, column };
    }
    async openClickedDocument(point) {
        if (!this.options.links || !this.options.workspace || this.searching || this.detailTitle)
            return false;
        const start = Math.max(0, point.row - 5), end = Math.min(this.snapshot.length - 1, point.row + 5);
        let text = "", offset = 0;
        for (let row = start; row <= end; row++) {
            const cells = this.snapshot[row].cells;
            const line = cells.filter(c => c.width).map(c => c.text).join("").trimEnd();
            if (row < point.row)
                offset += line.length + 1;
            if (row === point.row)
                offset += cells.slice(0, point.column).filter(c => c.width).map(c => c.text).join("").length;
            text += line + "\n";
        }
        const link = this.options.links.hit(text, offset);
        if (!link)
            return false;
        void this.options.workspace.openDocument(link.href);
        this.paint();
        return true;
    }
    async openClickedDetail(point) {
        if (this.searching || this.detailTitle || !this.options.detail)
            return false;
        const cells = this.snapshot[point.row]?.cells ?? [];
        const line = cells.map(c => c.width ? c.text : "").join("");
        const offset = cells.slice(0, point.column).map(c => c.width ? c.text : "").join("").length;
        const match = [...line.matchAll(/▸ (?:Details|\+\d+ Zeilen) \[([a-zA-Z0-9_-]+)\]/g)].find(m => offset >= m.index && offset < m.index + m[0].length);
        const detail = match && this.options.detail(match[1]);
        if (!detail)
            return false;
        const page = new xterm.Terminal({ cols: this.terminal.cols, rows: this.terminal.rows, scrollback: 100000, allowProposedApi: true, convertEol: true, logLevel: "off" });
        page.loadAddon(new unicode.UnicodeGraphemesAddon());
        try {
            await new Promise(resolve => page.write(`${detail.title}\n\n${detail.body}\n`, resolve));
            if (this.disposed)
                return false;
            this.snapshot = this.lines(page);
            this.top = 0;
            this.anchor = this.end = null;
            this.dragging = false;
            this.notice = "";
            this.detailTitle = detail.title;
            this.paint();
            return true;
        }
        finally {
            page.dispose();
        }
    }
    async pointer(kind, x, y) {
        if (this.options.workspace?.active) {
            if (kind === "up") {
                await this.options.workspace.click(x, y);
                if (!this.options.workspace.active)
                    await this.leave();
                else
                    this.paint();
            }
            return;
        }
        if (this.active && kind === "down" && y >= this.terminal.rows) {
            if (!this.searching)
                await this.leave();
            return;
        }
        if (kind === "down") {
            await this.enter();
            this.anchor = this.end = this.point(x, y);
            this.dragging = true;
            this.notice = "";
        }
        else if (this.dragging) {
            if (kind === "move" && y <= 1)
                this.top = Math.max(0, this.top - 1);
            else if (kind === "move" && y >= this.terminal.rows)
                this.top = Math.min(this.snapshot.length - this.terminal.rows, this.top + 1);
            this.end = this.point(x, y);
            if (kind === "up") {
                this.dragging = false;
                if (this.selectedText())
                    await this.copy();
                else if (this.anchor && (await this.openClickedDocument(this.anchor) || await this.openClickedDetail(this.anchor)))
                    return;
                else
                    this.anchor = this.end = null;
            }
        }
        this.paint();
    }
    bounds() {
        if (!this.anchor || !this.end)
            return null;
        return this.anchor.row < this.end.row || this.anchor.row === this.end.row && this.anchor.column <= this.end.column ? [this.anchor, this.end] : [this.end, this.anchor];
    }
    selectedText() {
        const range = this.bounds();
        if (!range)
            return "";
        const [start, end] = range;
        let text = "";
        for (let row = start.row; row <= end.row; row++) {
            const line = this.snapshot[row];
            const from = row === start.row ? start.column : 0, to = row === end.row ? end.column : this.terminal.cols;
            const part = line.cells.slice(from, to).filter(c => c.width > 0).map(c => c.text).join("").trimEnd();
            text += (row > start.row && !line.wrapped ? "\n" : "") + part;
        }
        return text;
    }
    async copy() {
        const text = this.selectedText();
        if (!text)
            return;
        try {
            await (this.options.copy ?? copyText)(text);
            this.notice = "Kopiert";
        }
        catch {
            this.notice = "Kopieren fehlgeschlagen · Ctrl+C erneut versuchen";
        }
        if (this.active)
            this.paint();
    }
    frame(lines, top, overlay) {
        const range = overlay ? this.bounds() : null;
        let result = "";
        const rows = [];
        const visible = this.terminal.rows - (overlay ? 1 + this.pinnedHeight : 0);
        const matchesByRow = new Map();
        if (overlay && this.searching)
            for (const match of this.searchMatches) {
                for (let row = Math.max(top, match.start.row); row <= Math.min(top + visible - 1, match.end.row); row++) {
                    const matches = matchesByRow.get(row) ?? [];
                    matches.push(match);
                    matchesByRow.set(row, matches);
                }
            }
        for (let y = 0; y < visible; y++) {
            result = `${CSI}${y + 1};1H${CSI}0m`;
            let previous = "";
            const cells = lines[top + y]?.cells ?? [];
            for (let x = 0; x < Math.min(cells.length, this.terminal.cols); x++) {
                const cell = cells[x];
                if (!cell.width)
                    continue;
                const row = top + y;
                const selected = range && (row > range[0].row || row === range[0].row && x >= range[0].column) && (row < range[1].row || row === range[1].row && x < range[1].column);
                const inMatch = (match) => (row > match.start.row || row === match.start.row && x >= match.start.column) && (row < match.end.row || row === match.end.row && x < match.end.column);
                const current = overlay && this.searching && this.searchMatches[this.searchIndex] && inMatch(this.searchMatches[this.searchIndex]);
                const found = matchesByRow.get(row)?.some(inMatch);
                const appearance = selected ? `${CSI}0;38;2;16;23;24;48;2;142;205;248m` : current ? `${CSI}0;30;48;2;244;194;122m` : found ? `${CSI}0;38;2;244;194;122;48;2;62;51;30m` : cell.style;
                if (previous !== appearance) {
                    result += appearance;
                    previous = appearance;
                }
                result += cell.text;
            }
            if (cells.length < this.terminal.cols)
                result += `${CSI}0m${CSI}K`;
            rows.push(result);
        }
        if (overlay) {
            const live = this.pinnedHeight ? this.liveFrame() : undefined;
            for (let y = visible; y < this.terminal.rows - 1; y++) {
                result = `${CSI}${y + 1};1H${CSI}0m`;
                const cells = live?.lines[(live?.top ?? 0) + y]?.cells ?? [];
                for (const cell of cells)
                    if (cell.width)
                        result += cell.style + cell.text;
                if (cells.length < this.terminal.cols)
                    result += `${CSI}0m${CSI}K`;
                rows.push(result);
            }
            rows.push(this.footer());
        }
        const changes = rows.filter((row, index) => row !== this.paintedRows[index]).join("");
        this.paintedRows = rows;
        return changes ? `${CSI}?2026h${CSI}?25l${changes}${CSI}0m${CSI}?2026l` : "";
    }
    footer() {
        if (this.searching) {
            const count = `${this.searchIndex + 1}/${this.searchMatches.length}${this.searchMatches.length === 5000 ? "+" : ""}`;
            const hints = this.terminal.cols < 65 ? "↑↓ Treffer · Esc" : "Enter/↓ weiter · ↑ zurück · Esc live";
            const suffix = `  ${count} · ${hints}`;
            const query = this.searchQuery.slice(-Math.max(1, this.terminal.cols - suffix.length - 10));
            return `${CSI}${this.terminal.rows};1H${CSI}0;38;2;16;23;24;48;2;142;205;248m${CSI}2K${`Suche: ${query}▏${suffix}`.slice(0, this.terminal.cols - 1)}${CSI}0m`;
        }
        const live = this.terminal.cols < 55 ? "↓ Neueste" : "↓ Neueste (scrollen/Klick/Ende)";
        const hint = this.notice || (this.selectedText() ? "Markiert" : this.detailTitle ? "Details" : "Verlauf");
        const updates = this.pendingUpdates ? ` · ${this.pendingUpdates} neue Updates` : " · Mausrad scrollt";
        const text = `${live} · ${hint}${updates}`;
        return `${CSI}${this.terminal.rows};1H${CSI}0;7m${CSI}2K${text.slice(0, this.terminal.cols - 1)}${CSI}0m`;
    }
    paint() {
        if (!this.active || this.disposed)
            return;
        if (this.options.workspace?.active) {
            const rows = this.options.workspace.frame(this.terminal.cols, this.terminal.rows).map((row, i) => `${CSI}${i + 1};1H${CSI}0m${row}${CSI}0m${CSI}K`);
            const changes = rows.filter((row, i) => row !== this.paintedRows[i]).join("");
            this.paintedRows = rows;
            if (changes)
                this.options.write(`${CSI}?2026h${CSI}?25l${changes}${CSI}?2026l`);
        }
        else
            this.options.write(this.frame(this.snapshot, this.top, true));
    }
    resize(columns, rows) {
        if (this.disposed)
            return;
        this.paintedRows = [];
        if (this.active)
            this.options.write(`${CSI}?1049l`);
        this.active = false;
        this.snapshot = [];
        this.anchor = this.end = null;
        this.dragging = false;
        this.detailTitle = "";
        this.searching = false;
        this.searchMatches = [];
        // xterm 6 flushes pending writes synchronously before reflow. Resize must run
        // before Ink's resize listener emits its first frame at the new dimensions.
        const dockHeight = Math.ceil(this.options.dockHeight?.() ?? 0);
        if (dockHeight) {
            const buffer = this.terminal.buffer.active;
            // Ink redraws its dynamic region after resize. Erase it before xterm can
            // reflow old full-width borders into orphan rows above the new composer.
            this.terminal.write(`\x1b7${CSI}${Math.max(1, buffer.cursorY - dockHeight + 1)};1H${CSI}J\x1b8`);
        }
        this.terminal.resize(columns, rows);
        if (this.options.workspace?.active) {
            this.active = true;
            this.options.write(`${CSI}?1049h`);
            this.paint();
        }
        else
            void this.renderLive();
    }
    dispose() {
        this.options.workspace?.close();
        if (this.disposed)
            return;
        if (this.active)
            this.options.write(`${CSI}?1049l`);
        if (this.footerTimer)
            clearTimeout(this.footerTimer);
        this.active = false;
        this.disposed = true;
        this.terminal.dispose();
    }
}
//# sourceMappingURL=terminal-viewport.js.map
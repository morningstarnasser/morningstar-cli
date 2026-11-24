/** Literal, case-insensitive search over terminal cells, joining only soft wraps. */
export function findTerminalMatches(lines, query) {
    const needle = query.toLowerCase();
    if (!needle)
        return [];
    const matches = [];
    for (let row = 0; row < lines.length && matches.length < 5000;) {
        let text = "";
        const points = [];
        do {
            const cells = lines[row].cells;
            let length = cells.length;
            if (!lines[row + 1]?.wrapped)
                while (length > 0 && !cells[length - 1].text.trim())
                    length--;
            for (let column = 0; column < length; column++) {
                const cell = cells[column];
                if (!cell.width)
                    continue;
                const value = cell.text.toLowerCase();
                text += value;
                for (let offset = 0; offset < value.length; offset++)
                    points.push({ start: { row, column }, end: { row, column: column + cell.width } });
            }
            row++;
        } while (lines[row]?.wrapped);
        for (let from = 0; matches.length < 5000;) {
            const index = text.indexOf(needle, from);
            if (index < 0)
                break;
            matches.push({ start: points[index].start, end: points[index + needle.length - 1].end });
            from = index + Math.max(1, needle.length);
        }
    }
    return matches;
}
/** Ctrl+F, or Super/Cmd+F when a terminal forwards CSI-u / modifyOtherKeys. */
export function isFindShortcut(input) {
    return ["\x06", "\x1b[102;9u", "\x1b[102;5u", "\x1b[27;9;102~", "\x1b[27;5;102~"].includes(input);
}
//# sourceMappingURL=terminal-search.js.map
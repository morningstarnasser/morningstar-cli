import { execFile } from "node:child_process";
/** stdin only; copied text is never interpreted by a shell. */
export async function copyText(text, platform = process.platform) {
    const commands = platform === "darwin" ? [["pbcopy", []]]
        : platform === "win32" ? [["clip.exe", []]]
            : process.env.WAYLAND_DISPLAY ? [["wl-copy", []], ["xclip", ["-selection", "clipboard"]]] : [["xclip", ["-selection", "clipboard"]]];
    let last;
    for (const [cmd, args] of commands) {
        try {
            await new Promise((resolve, reject) => {
                const child = execFile(cmd, args, { timeout: 5000 }, error => error ? reject(error) : resolve());
                child.stdin?.on("error", reject);
                child.stdin?.end(text);
            });
            return;
        }
        catch (error) {
            last = error;
        }
    }
    throw new Error(`Zwischenablage nicht verfuegbar: ${last?.message ?? "unbekannt"}`);
}
//# sourceMappingURL=clipboard.js.map
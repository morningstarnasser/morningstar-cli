// ─── Chrome Integration ──────────────────────────────────
// Chrome DevTools Protocol Client for browser automation
import { spawn } from "node:child_process";
const DEFAULT_CONFIG = {
    debugPort: 9222,
    host: "localhost",
};
let config = { ...DEFAULT_CONFIG };
/**
 * Check if Chrome is running with debugging port.
 */
export async function isChromeRunning() {
    try {
        const res = await fetch(`http://${config.host}:${config.debugPort}/json/version`);
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Launch Chrome with debugging port.
 */
export function launchChrome(url) {
    const targetUrl = normalizeChromeUrl(url);
    if (!targetUrl) {
        return { success: false, message: "Ungueltige URL. Erlaubt sind http://, https:// und about:blank." };
    }
    try {
        const platform = process.platform;
        let executable;
        if (platform === "darwin") {
            executable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        }
        else if (platform === "linux") {
            executable = "google-chrome";
        }
        else {
            return { success: false, message: `Chrome-Start nicht unterstuetzt auf ${platform}` };
        }
        const child = spawn(executable, [`--remote-debugging-port=${config.debugPort}`, targetUrl], { detached: true, stdio: "ignore" });
        child.once("error", () => {
            // The launch result below already reports a missing PID synchronously;
            // later process errors must not become unhandled gateway exceptions.
        });
        if (!child.pid) {
            return { success: false, message: "Chrome-Start fehlgeschlagen: Prozess konnte nicht gestartet werden." };
        }
        child.unref();
        return { success: true, message: `Chrome gestartet auf Port ${config.debugPort}` };
    }
    catch (e) {
        return { success: false, message: `Chrome-Start fehlgeschlagen: ${e.message}` };
    }
}
/** Validate a user-supplied launch target before it reaches Chrome argv. */
export function normalizeChromeUrl(url) {
    const candidate = (url || "about:blank").trim();
    if (candidate === "about:blank")
        return candidate;
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" || parsed.protocol === "https:"
            ? parsed.toString()
            : null;
    }
    catch {
        return null;
    }
}
/**
 * Get list of open Chrome tabs/pages.
 */
export async function getPages() {
    try {
        const res = await fetch(`http://${config.host}:${config.debugPort}/json`);
        const pages = await res.json();
        return pages
            .filter(p => p.type === "page")
            .map(p => ({ id: p.id, title: p.title, url: p.url }));
    }
    catch {
        return [];
    }
}
/**
 * Execute CDP command on a page.
 */
async function cdpCommand(pageId, method, params) {
    // Connect via WebSocket
    const wsUrl = `ws://${config.host}:${config.debugPort}/devtools/page/${pageId}`;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("CDP timeout")), 15000);
        // Use native WebSocket (Node 22+)
        try {
            const ws = new WebSocket(wsUrl);
            const id = Date.now();
            ws.onopen = () => {
                ws.send(JSON.stringify({ id, method, params: params || {} }));
            };
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(String(event.data));
                    if (data.id === id) {
                        clearTimeout(timeout);
                        ws.close();
                        if (data.error) {
                            reject(new Error(data.error.message));
                        }
                        else {
                            resolve(data.result);
                        }
                    }
                }
                catch { }
            };
            ws.onerror = (err) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${err}`));
            };
        }
        catch (e) {
            clearTimeout(timeout);
            reject(e);
        }
    });
}
/**
 * Navigate to a URL.
 */
export async function navigate(pageId, url) {
    try {
        await cdpCommand(pageId, "Page.navigate", { url });
        return { success: true, message: `Navigiert zu: ${url}` };
    }
    catch (e) {
        return { success: false, message: `Navigation fehlgeschlagen: ${e.message}` };
    }
}
/**
 * Take a screenshot.
 */
export async function screenshot(pageId) {
    try {
        const result = await cdpCommand(pageId, "Page.captureScreenshot", { format: "png" });
        return { success: true, data: result.data, message: "Screenshot aufgenommen" };
    }
    catch (e) {
        return { success: false, message: `Screenshot fehlgeschlagen: ${e.message}` };
    }
}
/**
 * Evaluate JavaScript on the page.
 */
export async function evaluate(pageId, expression) {
    try {
        const result = await cdpCommand(pageId, "Runtime.evaluate", {
            expression,
            returnByValue: true,
        });
        return { success: true, result: result.result?.value, message: "JavaScript ausgefuehrt" };
    }
    catch (e) {
        return { success: false, message: `Evaluate fehlgeschlagen: ${e.message}` };
    }
}
/**
 * Click on an element by selector.
 */
export async function click(pageId, selector) {
    try {
        await cdpCommand(pageId, "Runtime.evaluate", {
            expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
        });
        return { success: true, message: `Geklickt: ${selector}` };
    }
    catch (e) {
        return { success: false, message: `Klick fehlgeschlagen: ${e.message}` };
    }
}
/**
 * Type text into an element.
 */
export async function type(pageId, selector, text) {
    try {
        await cdpCommand(pageId, "Runtime.evaluate", {
            expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if(el) { el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', {bubbles:true})); } })()`,
        });
        return { success: true, message: `Text eingegeben in: ${selector}` };
    }
    catch (e) {
        return { success: false, message: `Type fehlgeschlagen: ${e.message}` };
    }
}
/**
 * Get Chrome integration status display.
 */
export async function getChromeStatus() {
    const running = await isChromeRunning();
    const lines = [
        "Chrome Integration:",
        `  Status:     ${running ? "Verbunden" : "Nicht verbunden"}`,
        `  Debug Port: ${config.debugPort}`,
    ];
    if (running) {
        const pages = await getPages();
        lines.push(`  Tabs:       ${pages.length}`);
        for (const page of pages.slice(0, 5)) {
            lines.push(`    ${page.title.slice(0, 50)} — ${page.url.slice(0, 60)}`);
        }
    }
    else {
        lines.push("");
        lines.push("  Chrome starten: /chrome launch [url]");
        lines.push("  Oder manuell:   google-chrome --remote-debugging-port=9222");
    }
    return lines.join("\n");
}
//# sourceMappingURL=chrome.js.map
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
/** Read only the standalone gateway's own settings; never import account tokens. */
function gatewaySettings() {
    try {
        const file = join(process.env.OFM_HOME || join(homedir(), ".our-free-model"), "settings.json");
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
            return {};
        const data = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
        return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    }
    catch {
        return {};
    }
}
export function getFreeModelsBaseUrl() {
    const port = gatewaySettings().standalonePort;
    const savedPort = Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65535 ? port : 18900;
    const configured = process.env.FREE_MODELS_BASE_URL?.trim();
    const url = new URL(configured || `http://127.0.0.1:${savedPort}/v1`);
    // The automatically loaded gateway secret must never leave this machine.
    if (!["http:", "https:"].includes(url.protocol)
        || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        || url.username || url.password || url.search || url.hash
        || !["", "/", "/v1", "/v1/"].includes(url.pathname)) {
        throw new Error("Free_Models requires a loopback gateway URL (http://127.0.0.1:18900/v1).");
    }
    url.pathname = "/v1";
    return url.href.replace(/\/$/, "");
}
export function getFreeModelsApiKey() {
    const key = process.env.FREE_MODELS_API_KEY || gatewaySettings().forwardKey;
    return typeof key === "string" && key.length <= 4096 && !/[\r\n\0]/.test(key) ? key : "";
}
//# sourceMappingURL=free-models.js.map
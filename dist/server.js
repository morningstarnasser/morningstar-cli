import { createServer } from "node:http";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamChat } from "./ai.js";
import { detectProvider } from "./providers.js";
import { analyzeImageFull } from "./vision.js";
import { generateImage, isSetupComplete } from "./image-gen.js";
export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = "0.0.0.0";
const startTime = Date.now();
function ts() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
function genId() {
    return "ms-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload) });
    res.end(payload);
}
function sendError(res, status, message) {
    sendJson(res, status, { error: { message, type: "server_error", code: status } });
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
}
export async function startServer(config) {
    const server = createServer(async (req, res) => {
        const t0 = performance.now();
        const method = req.method ?? "GET";
        const url = (req.url ?? "/").split("?")[0];
        if (config.corsEnabled) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        }
        if (method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        const route = `${method} ${url}`;
        try {
            // ─── GET / ─────────────────────────────────────
            if (route === "GET /") {
                sendJson(res, 200, {
                    name: "Morningstar API", version: "1.0.0",
                    model: config.cliConfig.model,
                    provider: config.cliConfig.provider ?? detectProvider(config.cliConfig.model),
                    endpoints: ["/v1/chat/completions", "/v1/vision/analyze", "/v1/images/generate", "/health"],
                });
                // ─── GET /health ───────────────────────────────
            }
            else if (route === "GET /health") {
                sendJson(res, 200, { status: "ok", uptime: Math.round((Date.now() - startTime) / 100) / 10, model: config.cliConfig.model });
                // ─── POST /v1/chat/completions ─────────────────
            }
            else if (route === "POST /v1/chat/completions") {
                const body = JSON.parse(await readBody(req));
                if (!body.messages?.length) {
                    sendError(res, 400, "messages required");
                    return;
                }
                const cfg = { ...config.cliConfig };
                if (body.temperature !== undefined)
                    cfg.temperature = body.temperature;
                if (body.max_tokens !== undefined)
                    cfg.maxTokens = body.max_tokens;
                const id = genId();
                const created = Math.floor(Date.now() / 1000);
                const model = body.model ?? config.cliConfig.model;
                if (body.stream) {
                    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
                    for await (const chunk of streamChat(body.messages, cfg)) {
                        if (chunk.type !== "content")
                            continue;
                        res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { content: chunk.text }, finish_reason: null }] })}\n\n`);
                    }
                    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
                else {
                    let content = "";
                    for await (const chunk of streamChat(body.messages, cfg)) {
                        if (chunk.type === "content")
                            content += chunk.text;
                    }
                    sendJson(res, 200, { id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } });
                }
                // ─── POST /v1/vision/analyze ───────────────────
            }
            else if (route === "POST /v1/vision/analyze") {
                const body = JSON.parse(await readBody(req));
                if (!body.image) {
                    sendError(res, 400, "image required (base64 or file path)");
                    return;
                }
                let imagePath;
                let tempFile = null;
                if (body.image.startsWith("/") || body.image.startsWith("~")) {
                    imagePath = body.image;
                }
                else {
                    tempFile = join(tmpdir(), `morningstar-vision-${Date.now()}.png`);
                    writeFileSync(tempFile, Buffer.from(body.image, "base64"));
                    imagePath = tempFile;
                }
                const t = performance.now();
                try {
                    const analysis = await analyzeImageFull(imagePath, body.prompt ?? "Describe this image in detail.", body.model ?? "moondream");
                    sendJson(res, 200, { analysis, model: body.model ?? "moondream", duration: Math.round((performance.now() - t) / 100) / 10 });
                }
                finally {
                    if (tempFile)
                        try {
                            unlinkSync(tempFile);
                        }
                        catch { }
                }
                // ─── POST /v1/images/generate ──────────────────
            }
            else if (route === "POST /v1/images/generate") {
                if (!(await isSetupComplete())) {
                    sendError(res, 503, "Image generation not set up. Run /imagine setup first.");
                    return;
                }
                const body = JSON.parse(await readBody(req));
                if (!body.prompt) {
                    sendError(res, 400, "prompt required");
                    return;
                }
                const result = await generateImage(body.prompt, {
                    model: body.model, steps: body.steps, width: body.width, height: body.height,
                    negativePrompt: body.negative_prompt, seed: body.seed,
                });
                sendJson(res, 200, { path: result.path, seed: result.seed, duration: result.duration, model: result.model, url: `file://${result.path}` });
            }
            else {
                sendError(res, 404, `Not found: ${method} ${url}`);
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[${ts()}] ERROR ${route} — ${msg}`);
            if (!res.headersSent)
                sendError(res, 500, msg);
        }
        const dur = performance.now() - t0;
        console.log(`[${ts()}] ${method} ${url} — ${res.statusCode} (${dur >= 1000 ? `${(dur / 1000).toFixed(1)}s` : `${Math.round(dur)}ms`})`);
    });
    return new Promise((resolve, reject) => {
        server.on("error", (err) => {
            reject(err.code === "EADDRINUSE" ? new Error(`Port ${config.port} belegt`) : err);
        });
        server.listen(config.port, config.host, () => {
            const addr = server.address();
            const port = typeof addr === "object" && addr ? addr.port : config.port;
            const host = config.host === "0.0.0.0" ? "localhost" : config.host;
            const url = `http://${host}:${port}`;
            console.log(`\n  Morningstar API Server v1.0.0`);
            console.log(`  ${"─".repeat(40)}`);
            console.log(`  URL:      ${url}`);
            console.log(`  Model:    ${config.cliConfig.model}`);
            console.log(`  Provider: ${config.cliConfig.provider ?? detectProvider(config.cliConfig.model)}`);
            console.log(`  CORS:     ${config.corsEnabled ? "enabled" : "disabled"}`);
            console.log(`  ${"─".repeat(40)}`);
            console.log(`  POST /v1/chat/completions   Chat`);
            console.log(`  POST /v1/vision/analyze     Vision`);
            console.log(`  POST /v1/images/generate    Image Gen`);
            console.log(`  GET  /health                Health\n`);
            resolve({ close: () => server.close(), port, url });
        });
    });
}
//# sourceMappingURL=server.js.map
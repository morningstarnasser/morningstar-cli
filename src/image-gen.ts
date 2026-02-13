import { execSync, spawn, ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, totalmem } from "node:os";

export const IMAGE_GEN_DIR = join(homedir(), ".morningstar", "image-gen");
export const IMAGE_OUTPUT_DIR = join(homedir(), "Downloads");
const SERVER_PORT = 7860;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const PID_FILE = join(IMAGE_GEN_DIR, "server.pid");

export const IMAGE_MODELS = [
  { id: "sdxl-turbo", name: "SDXL Turbo", size: "~7GB", description: "Blitzschnell (1-4 Steps), 512x512", steps: 1, resolution: "512x512" },
  { id: "sdxl", name: "Stable Diffusion XL", size: "~7GB", description: "Beste Qualitaet, 1024x1024", steps: 30, resolution: "1024x1024" },
  { id: "sd15", name: "Stable Diffusion 1.5", size: "~4GB", description: "Klassiker, leicht, laeuft ueberall", steps: 25, resolution: "512x512" },
] as const;

export const DEFAULT_IMAGE_MODEL = "sdxl-turbo";

// ─── Persistent Server Script ──────────────────────────────
// Loads model ONCE, keeps it in memory, handles requests via HTTP
const SERVER_SCRIPT = `#!/usr/bin/env python3
"""Morningstar Image Server — Persistent Stable Diffusion"""
import json, time, sys, os, signal
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = ${SERVER_PORT}
pipe = None
device = "cpu"
current_model = None

def load_model(model_id="sdxl-turbo"):
    global pipe, device, current_model
    import torch
    from diffusers import AutoPipelineForText2Image, StableDiffusionPipeline, StableDiffusionXLPipeline

    MODEL_MAP = {
        "sdxl-turbo": "stabilityai/sdxl-turbo",
        "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
        "sd15": "stable-diffusion-v1-5/stable-diffusion-v1-5",
    }
    model_name = MODEL_MAP.get(model_id, model_id)

    if torch.backends.mps.is_available():
        device, dtype = "mps", torch.float16
    elif torch.cuda.is_available():
        device, dtype = "cuda", torch.float16
    else:
        device, dtype = "cpu", torch.float32

    print(f"Loading {model_name} on {device}...", file=sys.stderr, flush=True)
    start = time.time()

    if model_id == "sdxl-turbo":
        pipe = AutoPipelineForText2Image.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    elif model_id == "sdxl":
        pipe = StableDiffusionXLPipeline.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    else:
        pipe = StableDiffusionPipeline.from_pretrained(model_name, torch_dtype=dtype)

    pipe = pipe.to(device)
    if hasattr(pipe, "safety_checker"): pipe.safety_checker = None
    if hasattr(pipe, "requires_safety_checker"): pipe.requires_safety_checker = False
    if hasattr(pipe, "enable_attention_slicing"): pipe.enable_attention_slicing()

    current_model = model_id
    print(f"Model ready in {time.time()-start:.1f}s on {device}", file=sys.stderr, flush=True)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass  # silent

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ready", "model": current_model, "device": device}).encode())
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path != "/generate":
            self.send_response(404)
            self.end_headers()
            return
        try:
            import torch
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))

            prompt = body.get("prompt", "")
            model_id = body.get("model", "sdxl-turbo")
            steps = body.get("steps", 1)
            width = body.get("width", 512)
            height = body.get("height", 512)
            seed_val = body.get("seed", -1)
            guidance = body.get("guidance", 0.0)
            negative = body.get("negative", "")
            output_path = body.get("output", "/tmp/out.png")

            if model_id != current_model:
                load_model(model_id)

            seed = seed_val if seed_val >= 0 else int(torch.randint(0, 2**32, (1,)).item())
            generator = torch.Generator(device="cpu").manual_seed(seed)

            start = time.time()
            kw = {"prompt": prompt, "num_inference_steps": steps, "width": width, "height": height, "generator": generator}
            kw["guidance_scale"] = guidance if guidance > 0 else (0.0 if model_id == "sdxl-turbo" else 7.5)
            if negative: kw["negative_prompt"] = negative

            image = pipe(**kw).images[0]

            # Detect black/blank images
            import numpy as np
            arr = np.array(image)
            if arr.mean() < 5:
                # Retry with higher guidance
                kw["guidance_scale"] = 2.0
                image = pipe(**kw).images[0]

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            image.save(output_path)
            duration = round(time.time() - start, 1)

            result = {"path": output_path, "seed": seed, "duration": duration, "model": model_id, "device": device}
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

def main():
    load_model(os.environ.get("MODEL", "sdxl-turbo"))
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Image server ready on port {PORT}", file=sys.stderr, flush=True)
    # Write PID for cleanup
    pid_path = os.path.join(os.path.expanduser("~"), ".morningstar", "image-gen", "server.pid")
    with open(pid_path, "w") as f: f.write(str(os.getpid()))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
    try:
        server.serve_forever()
    finally:
        try: os.remove(pid_path)
        except: pass

if __name__ == "__main__":
    main()
`;

// Also keep the old single-shot script for fallback
const GENERATE_SCRIPT = `#!/usr/bin/env python3
"""Morningstar Image Generator — Single-shot fallback"""
import argparse, json, time, sys, os

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--prompt", required=True)
    p.add_argument("--model", default="sdxl-turbo")
    p.add_argument("--steps", type=int, default=1)
    p.add_argument("--width", type=int, default=512)
    p.add_argument("--height", type=int, default=512)
    p.add_argument("--output", required=True)
    p.add_argument("--seed", type=int, default=-1)
    p.add_argument("--guidance", type=float, default=0.0)
    p.add_argument("--negative", default="")
    args = p.parse_args()

    MODEL_MAP = {
        "sdxl-turbo": "stabilityai/sdxl-turbo",
        "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
        "sd15": "stable-diffusion-v1-5/stable-diffusion-v1-5",
    }

    import torch
    from diffusers import AutoPipelineForText2Image, StableDiffusionPipeline, StableDiffusionXLPipeline

    model_name = MODEL_MAP.get(args.model, args.model)

    if torch.backends.mps.is_available():
        device, dtype = "mps", torch.float16
    elif torch.cuda.is_available():
        device, dtype = "cuda", torch.float16
    else:
        device, dtype = "cpu", torch.float32

    print(f"Loading {model_name} on {device}...", file=sys.stderr)
    start = time.time()

    if args.model == "sdxl-turbo":
        pipe = AutoPipelineForText2Image.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    elif args.model == "sdxl":
        pipe = StableDiffusionXLPipeline.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    else:
        pipe = StableDiffusionPipeline.from_pretrained(model_name, torch_dtype=dtype)

    pipe = pipe.to(device)
    if hasattr(pipe, "safety_checker"): pipe.safety_checker = None
    if hasattr(pipe, "requires_safety_checker"): pipe.requires_safety_checker = False
    if hasattr(pipe, "enable_attention_slicing"): pipe.enable_attention_slicing()

    seed = args.seed if args.seed >= 0 else int(torch.randint(0, 2**32, (1,)).item())
    generator = torch.Generator(device="cpu").manual_seed(seed)

    print(f"Generating ({args.steps} steps, {args.width}x{args.height})...", file=sys.stderr)

    kw = {"prompt": args.prompt, "num_inference_steps": args.steps, "width": args.width, "height": args.height, "generator": generator}
    kw["guidance_scale"] = args.guidance if args.guidance > 0 else (0.0 if args.model == "sdxl-turbo" else 7.5)
    if args.negative: kw["negative_prompt"] = args.negative

    image = pipe(**kw).images[0]

    # Detect black/blank images and retry
    import numpy as np
    arr = np.array(image)
    if arr.mean() < 5:
        kw["guidance_scale"] = 2.0
        image = pipe(**kw).images[0]

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    image.save(args.output)

    print(json.dumps({"path": args.output, "seed": seed, "duration": round(time.time() - start, 1), "model": args.model, "device": device}))

if __name__ == "__main__":
    main()
`;

// ─── Helpers ────────────────────────────────────────────────

function slugify(prompt: string): string {
  return prompt.toLowerCase().split(/\s+/).slice(0, 5).join("-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
}

function outputFilename(prompt: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${ts}_${slugify(prompt)}.png`;
}

function spawnAsync(cmd: string, args: string[], opts?: { timeout?: number; onData?: (s: string) => void }): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", killed = false;
    const timer = opts?.timeout ? setTimeout(() => { killed = true; child.kill("SIGKILL"); reject(new Error(`Timeout after ${opts.timeout}ms`)); }, opts.timeout) : null;
    child.stdout.on("data", (c: Buffer) => { const t = c.toString(); stdout += t; opts?.onData?.(t.trim()); });
    child.stderr.on("data", (c: Buffer) => { const t = c.toString(); stderr += t; opts?.onData?.(t.trim()); });
    child.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on("close", (code) => { if (timer) clearTimeout(timer); if (!killed) resolve({ stdout, stderr, code: code ?? 1 }); });
  });
}

// ─── Server Management ──────────────────────────────────────

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

export async function startImageServer(onProgress?: (s: string) => void): Promise<void> {
  if (await isServerRunning()) {
    onProgress?.("Server laeuft bereits.");
    return;
  }

  // Kill stale PID if exists
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, 0); // check if alive
    } catch {
      rmSync(PID_FILE, { force: true });
    }
  }

  onProgress?.("Starte Image Server (Model wird geladen)...");
  const python = join(IMAGE_GEN_DIR, "venv", "bin", "python");
  const serverScript = join(IMAGE_GEN_DIR, "server.py");
  writeFileSync(serverScript, SERVER_SCRIPT, { mode: 0o755 });

  const child = spawn(python, [serverScript], {
    stdio: ["ignore", "ignore", "pipe"],
    detached: true,
    env: { ...process.env, MODEL: DEFAULT_IMAGE_MODEL },
  });
  child.unref();

  // Wait for server to be ready (model loading)
  const maxWait = 120_000; // 2 min max for first model download
  const start = Date.now();
  let ready = false;
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 2000));
    if (await isServerRunning()) { ready = true; break; }
    const elapsed = Math.round((Date.now() - start) / 1000);
    onProgress?.(`Model wird geladen... (${elapsed}s)`);
  }
  if (!ready) throw new Error("Server konnte nicht gestartet werden. Evtl. Model-Download noch nicht fertig.");
  onProgress?.("Image Server bereit!");
}

export async function stopImageServer(): Promise<void> {
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, "SIGTERM");
      rmSync(PID_FILE, { force: true });
    } catch {}
  }
}

// ─── Public API ─────────────────────────────────────────────

export async function hasPython(): Promise<boolean> {
  try { execSync("python3 --version", { stdio: "ignore" }); return true; } catch { return false; }
}

export async function isSetupComplete(): Promise<boolean> {
  return existsSync(join(IMAGE_GEN_DIR, "venv", "bin", "python")) &&
    (existsSync(join(IMAGE_GEN_DIR, "server.py")) || existsSync(join(IMAGE_GEN_DIR, "generate.py")));
}

export async function setupImageGen(onProgress?: (s: string) => void): Promise<void> {
  if (!(await hasPython())) throw new Error("Python 3 nicht installiert. Installiere: brew install python3");

  mkdirSync(IMAGE_GEN_DIR, { recursive: true });

  onProgress?.("Erstelle Python venv...");
  const venv = await spawnAsync("python3", ["-m", "venv", join(IMAGE_GEN_DIR, "venv")]);
  if (venv.code !== 0) throw new Error(`venv Fehler: ${venv.stderr}`);

  onProgress?.("Installiere PyTorch + Diffusers (kann einige Minuten dauern)...");
  const pip = join(IMAGE_GEN_DIR, "venv", "bin", "pip");
  const install = await spawnAsync(pip, ["install", "--upgrade", "pip", "torch", "diffusers", "transformers", "accelerate", "safetensors"], {
    timeout: 600_000,
    onData: (s) => onProgress?.(s),
  });
  if (install.code !== 0) throw new Error(`pip install Fehler: ${install.stderr}`);

  onProgress?.("Schreibe Server-Scripts...");
  writeFileSync(join(IMAGE_GEN_DIR, "server.py"), SERVER_SCRIPT, { mode: 0o755 });
  writeFileSync(join(IMAGE_GEN_DIR, "generate.py"), GENERATE_SCRIPT, { mode: 0o755 });

  onProgress?.("Setup fertig! Starte Server mit: /imagine start");
}

export async function generateImage(
  prompt: string,
  options?: {
    model?: string; steps?: number; width?: number; height?: number;
    negativePrompt?: string; seed?: number; guidanceScale?: number;
  },
): Promise<{ path: string; model: string; steps: number; resolution: string; seed: number; duration: number }> {
  if (!(await isSetupComplete())) throw new Error("Image Generation nicht eingerichtet. Nutze /imagine setup");

  const modelId = options?.model ?? DEFAULT_IMAGE_MODEL;
  const modelCfg = IMAGE_MODELS.find(m => m.id === modelId);
  const steps = options?.steps ?? (modelCfg?.steps ?? 1);
  const [dw, dh] = (modelCfg?.resolution ?? "512x512").split("x").map(Number);
  const width = options?.width ?? dw;
  const height = options?.height ?? dh;
  const guidance = options?.guidanceScale ?? (modelId === "sdxl-turbo" ? 0.0 : 7.5);
  const seed = options?.seed ?? -1;

  mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
  const outPath = join(IMAGE_OUTPUT_DIR, outputFilename(prompt));

  // ── Auto-start server if not running ──
  if (!(await isServerRunning())) {
    await startImageServer();
  }

  // ── Use persistent server (fast path: ~2-5s) ──
  if (await isServerRunning()) {
    const res = await fetch(`${SERVER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt, model: modelId, steps, width, height,
        seed, guidance, negative: options?.negativePrompt || "",
        output: outPath,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const parsed = await res.json() as { path: string; seed: number; duration: number; model: string; device: string };
      return { path: parsed.path, model: modelId, steps, resolution: `${width}x${height}`, seed: parsed.seed, duration: parsed.duration };
    }
    const err = await res.json() as { error: string };
    throw new Error(err.error || "Server-Fehler");
  }

  // ── Fallback: single-shot (slow: ~30-60s, model reload each time) ──
  const args = [
    join(IMAGE_GEN_DIR, "generate.py"),
    "--prompt", prompt, "--model", modelId,
    "--steps", String(steps), "--width", String(width), "--height", String(height),
    "--output", outPath, "--seed", String(seed), "--guidance", String(guidance),
  ];
  if (options?.negativePrompt) args.push("--negative", options.negativePrompt);

  const result = await spawnAsync(join(IMAGE_GEN_DIR, "venv", "bin", "python"), args, { timeout: 300_000 });
  if (result.code !== 0) throw new Error(`Generierung fehlgeschlagen:\n${result.stderr}`);

  const lastLine = result.stdout.trim().split("\n").pop() ?? "";
  let parsed: { path: string; seed: number; duration: number };
  try { parsed = JSON.parse(lastLine); } catch { throw new Error(`Output parse error:\n${result.stdout}\n${result.stderr}`); }

  return { path: parsed.path, model: modelId, steps, resolution: `${width}x${height}`, seed: parsed.seed, duration: parsed.duration };
}

export async function cleanupImageGen(): Promise<void> {
  await stopImageServer();
  if (existsSync(IMAGE_GEN_DIR)) rmSync(IMAGE_GEN_DIR, { recursive: true, force: true });
}

export function getAvailableMemoryGB(): number {
  return Math.round((totalmem() / (1024 ** 3)) * 10) / 10;
}

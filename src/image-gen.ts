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
  { id: "gemini", name: "Nano Banana Pro (Gemini 3 Pro Image)", size: "API", description: "Allerbeste Qualitaet, Cloud (Standard)", steps: 0, resolution: "1408x1408" },
  { id: "gemini-flash", name: "Nano Banana (Gemini 2.5 Flash Image)", size: "API", description: "Schnell + hochwertig, Cloud", steps: 0, resolution: "1024x1024" },
  { id: "realvis", name: "RealVisXL V4.0", size: "~7GB", description: "Photorealistisch, lokal", steps: 40, resolution: "1024x1024" },
  { id: "sdxl", name: "Stable Diffusion XL", size: "~7GB", description: "Hohe Qualitaet, lokal", steps: 40, resolution: "1024x1024" },
  { id: "sdxl-turbo", name: "SDXL Turbo", size: "~7GB", description: "Schnell (1-4 Steps), lokal", steps: 4, resolution: "512x512" },
  { id: "sd15", name: "Stable Diffusion 1.5", size: "~4GB", description: "Klassiker, leicht, lokal", steps: 30, resolution: "512x512" },
] as const;

export const DEFAULT_IMAGE_MODEL = "gemini";

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
        "realvis": "SG161222/RealVisXL_V4.0",
        "sdxl-turbo": "stabilityai/sdxl-turbo",
        "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
        "sd15": "stable-diffusion-v1-5/stable-diffusion-v1-5",
    }
    XL_MODELS = {"realvis", "sdxl-turbo", "sdxl"}
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
    elif model_id in XL_MODELS:
        pipe = StableDiffusionXLPipeline.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    else:
        pipe = StableDiffusionPipeline.from_pretrained(model_name, torch_dtype=dtype)

    pipe = pipe.to(device)
    if hasattr(pipe, "safety_checker"): pipe.safety_checker = None
    if hasattr(pipe, "requires_safety_checker"): pipe.requires_safety_checker = False
    if hasattr(pipe, "enable_attention_slicing"): pipe.enable_attention_slicing()
    # Fix black images on MPS: VAE must run in float32 + tiling for large images
    if device == "mps" and hasattr(pipe, "vae"):
        pipe.vae = pipe.vae.to(torch.float32)
    if hasattr(pipe, "enable_vae_tiling"): pipe.enable_vae_tiling()
    if hasattr(pipe, "enable_vae_slicing"): pipe.enable_vae_slicing()

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

            # On MPS, generate at 512x512 and upscale to avoid black images
            target_w, target_h = width, height
            if device == "mps" and (width > 512 or height > 512):
                kw["width"] = 512
                kw["height"] = 512

            image = pipe(**kw).images[0]

            # Detect black/blank images
            import numpy as np
            arr = np.array(image)
            if arr.mean() < 5:
                kw["guidance_scale"] = 2.0
                image = pipe(**kw).images[0]

            # Upscale to target resolution with high-quality Lanczos
            if image.size[0] < target_w or image.size[1] < target_h:
                from PIL import Image as PILImage
                image = image.resize((target_w, target_h), PILImage.LANCZOS)

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            image.save(output_path, quality=95)
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
    load_model(os.environ.get("MODEL", "realvis"))
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
    p.add_argument("--model", default="realvis")
    p.add_argument("--steps", type=int, default=40)
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--height", type=int, default=1024)
    p.add_argument("--output", required=True)
    p.add_argument("--seed", type=int, default=-1)
    p.add_argument("--guidance", type=float, default=0.0)
    p.add_argument("--negative", default="")
    args = p.parse_args()

    MODEL_MAP = {
        "realvis": "SG161222/RealVisXL_V4.0",
        "sdxl-turbo": "stabilityai/sdxl-turbo",
        "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
        "sd15": "stable-diffusion-v1-5/stable-diffusion-v1-5",
    }
    XL_MODELS = {"realvis", "sdxl-turbo", "sdxl"}

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
    elif args.model in XL_MODELS:
        pipe = StableDiffusionXLPipeline.from_pretrained(model_name, torch_dtype=dtype, variant="fp16" if dtype == torch.float16 else None)
    else:
        pipe = StableDiffusionPipeline.from_pretrained(model_name, torch_dtype=dtype)

    pipe = pipe.to(device)
    if hasattr(pipe, "safety_checker"): pipe.safety_checker = None
    if hasattr(pipe, "requires_safety_checker"): pipe.requires_safety_checker = False
    if hasattr(pipe, "enable_attention_slicing"): pipe.enable_attention_slicing()
    # Fix black images on MPS: VAE must run in float32 + tiling for large images
    if device == "mps" and hasattr(pipe, "vae"):
        pipe.vae = pipe.vae.to(torch.float32)
    if hasattr(pipe, "enable_vae_tiling"): pipe.enable_vae_tiling()
    if hasattr(pipe, "enable_vae_slicing"): pipe.enable_vae_slicing()

    seed = args.seed if args.seed >= 0 else int(torch.randint(0, 2**32, (1,)).item())
    generator = torch.Generator(device="cpu").manual_seed(seed)

    print(f"Generating ({args.steps} steps, {args.width}x{args.height})...", file=sys.stderr)

    target_w, target_h = args.width, args.height
    kw = {"prompt": args.prompt, "num_inference_steps": args.steps, "width": args.width, "height": args.height, "generator": generator}
    # On MPS, generate at 512x512 and upscale
    if device == "mps" and (args.width > 512 or args.height > 512):
        kw["width"] = 512
        kw["height"] = 512
    kw["guidance_scale"] = args.guidance if args.guidance > 0 else (0.0 if args.model == "sdxl-turbo" else 7.5)
    if args.negative: kw["negative_prompt"] = args.negative

    image = pipe(**kw).images[0]

    # Detect black/blank images and retry
    import numpy as np
    arr = np.array(image)
    if arr.mean() < 5:
        kw["guidance_scale"] = 2.0
        image = pipe(**kw).images[0]

    # Upscale to target resolution
    if image.size[0] < target_w or image.size[1] < target_h:
        from PIL import Image as PILImage
        image = image.resize((target_w, target_h), PILImage.LANCZOS)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    image.save(args.output, quality=95)

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
    env: { ...process.env, MODEL: "realvis" },
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

// ─── Gemini Image Generation (Nano Banana quality) ──────────
function getGoogleApiKey(): string {
  // Check env vars
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  // Check stored config
  try {
    const cfgPath = join(homedir(), ".morningstar", "config.json");
    if (existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      if (cfg.apiKeys?.google) return cfg.apiKeys.google;
      if (cfg.apiKeys?.gemini) return cfg.apiKeys.gemini;
    }
  } catch {}
  return "";
}

async function generateWithGemini(prompt: string, outPath: string, modelVariant: string = "gemini"): Promise<{ path: string; seed: number; duration: number }> {
  const apiKey = getGoogleApiKey();
  if (!apiKey) throw new Error("Google API Key nicht gefunden.\n  Setze: export GOOGLE_API_KEY=dein_key\n  Oder:  morningstar → /config set apiKeys.google DEIN_KEY\n  Gratis: https://aistudio.google.com/apikey");

  const start = Date.now();
  const geminiModel = modelVariant === "gemini-flash" ? "gemini-2.5-flash-image" : "gemini-3-pro-image-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate a photorealistic, ultra high quality image: ${prompt}` }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          imageSize: "1024x1024",
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API Fehler (${res.status}): ${errBody}`);
  }

  const data = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.data);
  if (!imagePart?.inlineData) throw new Error("Gemini hat kein Bild generiert. Versuche einen anderen Prompt.");

  const imgBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
  writeFileSync(outPath, imgBuffer);

  return { path: outPath, seed: 0, duration: Math.round((Date.now() - start) / 1000) };
}

function hasGeminiKey(): boolean {
  return !!getGoogleApiKey();
}

export async function generateImage(
  prompt: string,
  options?: {
    model?: string; steps?: number; width?: number; height?: number;
    negativePrompt?: string; seed?: number; guidanceScale?: number;
  },
): Promise<{ path: string; model: string; steps: number; resolution: string; seed: number; duration: number }> {
  let modelId = options?.model ?? DEFAULT_IMAGE_MODEL;

  // Auto-fallback: if gemini requested but no API key, use local model
  if ((modelId === "gemini" || modelId === "gemini-flash") && !hasGeminiKey()) {
    modelId = "realvis";
  }

  // ── Gemini path (Nano Banana / Nano Banana Pro) ──
  if (modelId === "gemini" || modelId === "gemini-flash") {
    mkdirSync(IMAGE_OUTPUT_DIR, { recursive: true });
    const outPath = join(IMAGE_OUTPUT_DIR, outputFilename(prompt));
    try {
      const result = await generateWithGemini(prompt, outPath, modelId);
      const res = modelId === "gemini" ? "1408x1408" : "1024x1024";
      return { path: result.path, model: modelId, steps: 0, resolution: res, seed: result.seed, duration: result.duration };
    } catch {
      // Gemini refused (content filter etc.) → auto-fallback to local model
      modelId = "realvis";
    }
  }

  // ── Local model path ──
  if (!(await isSetupComplete())) throw new Error("Image Generation nicht eingerichtet. Nutze /imagine setup");
  const modelCfg = IMAGE_MODELS.find(m => m.id === modelId);
  const steps = options?.steps ?? (modelCfg?.steps ?? 40);
  const [dw, dh] = (modelCfg?.resolution ?? "1024x1024").split("x").map(Number);
  const width = options?.width ?? dw;
  const height = options?.height ?? dh;
  const guidance = options?.guidanceScale ?? (modelId === "sdxl-turbo" ? 0.0 : 7.0);
  const seed = options?.seed ?? -1;

  // Auto-enhance prompt for photorealistic quality
  const qualityTags = ", photorealistic, ultra detailed, 8k uhd, high quality, professional photography, sharp focus, natural lighting";
  const defaultNegative = "blurry, low quality, low resolution, pixelated, jpeg artifacts, deformed, ugly, bad anatomy, watermark, text, logo";
  const enhancedPrompt = modelId !== "sdxl-turbo" ? prompt + qualityTags : prompt;
  const enhancedNegative = options?.negativePrompt || defaultNegative;

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
        prompt: enhancedPrompt, model: modelId, steps, width, height,
        seed, guidance, negative: enhancedNegative,
        output: outPath,
      }),
      signal: AbortSignal.timeout(300_000),
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
    "--prompt", enhancedPrompt, "--model", modelId,
    "--steps", String(steps), "--width", String(width), "--height", String(height),
    "--output", outPath, "--seed", String(seed), "--guidance", String(guidance),
  ];
  args.push("--negative", enhancedNegative);

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

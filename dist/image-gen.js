import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, totalmem } from "node:os";
export const IMAGE_GEN_DIR = join(homedir(), ".morningstar", "image-gen");
export const IMAGE_OUTPUT_DIR = join(homedir(), "morningstar-images");
export const IMAGE_MODELS = [
    { id: "sdxl-turbo", name: "SDXL Turbo", size: "~7GB", description: "Blitzschnell (1-4 Steps), 512x512", steps: 1, resolution: "512x512" },
    { id: "sdxl", name: "Stable Diffusion XL", size: "~7GB", description: "Beste Qualitaet, 1024x1024", steps: 30, resolution: "1024x1024" },
    { id: "sd15", name: "Stable Diffusion 1.5", size: "~4GB", description: "Klassiker, leicht, laeuft ueberall", steps: 25, resolution: "512x512" },
];
export const DEFAULT_IMAGE_MODEL = "sdxl-turbo";
// ─── Embedded Python Script ─────────────────────────────────
const GENERATE_SCRIPT = `#!/usr/bin/env python3
"""Morningstar Image Generator — Local Stable Diffusion"""
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
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()

    seed = args.seed if args.seed >= 0 else int(torch.randint(0, 2**32, (1,)).item())
    generator = torch.Generator(device="cpu").manual_seed(seed)

    print(f"Generating ({args.steps} steps, {args.width}x{args.height})...", file=sys.stderr)

    kw = {"prompt": args.prompt, "num_inference_steps": args.steps, "width": args.width, "height": args.height, "generator": generator}
    if args.guidance > 0: kw["guidance_scale"] = args.guidance
    if args.negative: kw["negative_prompt"] = args.negative

    image = pipe(**kw).images[0]
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    image.save(args.output)

    print(json.dumps({"path": args.output, "seed": seed, "duration": round(time.time() - start, 1), "model": args.model, "device": device}))

if __name__ == "__main__":
    main()
`;
// ─── Helpers ────────────────────────────────────────────────
function slugify(prompt) {
    return prompt.toLowerCase().split(/\s+/).slice(0, 5).join("-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "image";
}
function outputFilename(prompt) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${ts}_${slugify(prompt)}.png`;
}
function spawnAsync(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "", stderr = "", killed = false;
        const timer = opts?.timeout ? setTimeout(() => { killed = true; child.kill("SIGKILL"); reject(new Error(`Timeout after ${opts.timeout}ms`)); }, opts.timeout) : null;
        child.stdout.on("data", (c) => { const t = c.toString(); stdout += t; opts?.onData?.(t.trim()); });
        child.stderr.on("data", (c) => { const t = c.toString(); stderr += t; opts?.onData?.(t.trim()); });
        child.on("error", (e) => { if (timer)
            clearTimeout(timer); reject(e); });
        child.on("close", (code) => { if (timer)
            clearTimeout(timer); if (!killed)
            resolve({ stdout, stderr, code: code ?? 1 }); });
    });
}
// ─── Public API ─────────────────────────────────────────────
export async function hasPython() {
    try {
        execSync("python3 --version", { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
export async function isSetupComplete() {
    return existsSync(join(IMAGE_GEN_DIR, "venv", "bin", "python")) && existsSync(join(IMAGE_GEN_DIR, "generate.py"));
}
export async function setupImageGen(onProgress) {
    if (!(await hasPython()))
        throw new Error("Python 3 nicht installiert. Installiere: brew install python3");
    mkdirSync(IMAGE_GEN_DIR, { recursive: true });
    onProgress?.("Erstelle Python venv...");
    const venv = await spawnAsync("python3", ["-m", "venv", join(IMAGE_GEN_DIR, "venv")]);
    if (venv.code !== 0)
        throw new Error(`venv Fehler: ${venv.stderr}`);
    onProgress?.("Installiere PyTorch + Diffusers (kann einige Minuten dauern)...");
    const pip = join(IMAGE_GEN_DIR, "venv", "bin", "pip");
    const install = await spawnAsync(pip, ["install", "--upgrade", "pip", "torch", "diffusers", "transformers", "accelerate", "safetensors"], {
        timeout: 600_000,
        onData: (s) => onProgress?.(s),
    });
    if (install.code !== 0)
        throw new Error(`pip install Fehler: ${install.stderr}`);
    onProgress?.("Schreibe generate.py...");
    writeFileSync(join(IMAGE_GEN_DIR, "generate.py"), GENERATE_SCRIPT, { mode: 0o755 });
    onProgress?.("Setup fertig!");
}
export async function generateImage(prompt, options) {
    if (!(await isSetupComplete()))
        throw new Error("Image Generation nicht eingerichtet. Nutze /imagine setup");
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
    const args = [
        join(IMAGE_GEN_DIR, "generate.py"),
        "--prompt", prompt, "--model", modelId,
        "--steps", String(steps), "--width", String(width), "--height", String(height),
        "--output", outPath, "--seed", String(seed), "--guidance", String(guidance),
    ];
    if (options?.negativePrompt)
        args.push("--negative", options.negativePrompt);
    const result = await spawnAsync(join(IMAGE_GEN_DIR, "venv", "bin", "python"), args, { timeout: 300_000 });
    if (result.code !== 0)
        throw new Error(`Generierung fehlgeschlagen:\n${result.stderr}`);
    const lastLine = result.stdout.trim().split("\n").pop() ?? "";
    let parsed;
    try {
        parsed = JSON.parse(lastLine);
    }
    catch {
        throw new Error(`Output parse error:\n${result.stdout}\n${result.stderr}`);
    }
    return { path: parsed.path, model: modelId, steps, resolution: `${width}x${height}`, seed: parsed.seed, duration: parsed.duration };
}
export async function cleanupImageGen() {
    if (existsSync(IMAGE_GEN_DIR))
        rmSync(IMAGE_GEN_DIR, { recursive: true, force: true });
}
export function getAvailableMemoryGB() {
    return Math.round((totalmem() / (1024 ** 3)) * 10) / 10;
}
//# sourceMappingURL=image-gen.js.map
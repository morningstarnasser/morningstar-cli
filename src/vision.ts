import { readFileSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";

const OLLAMA_BASE = "http://localhost:11434";

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg",
]);

const VISION_MODEL_PREFIXES = [
  "moondream", "llava", "bakllava", "llava-llama3", "llava-phi3", "minicpm-v",
];

export interface VisionModel {
  id: string;
  name: string;
  size: string;
  description: string;
}

export const VISION_MODELS: VisionModel[] = [
  { id: "moondream", name: "Moondream 2", size: "1.7GB", description: "Schnell & leicht, ideal fuer schnelle Analysen" },
  { id: "llava:7b", name: "LLaVA 7B", size: "4.7GB", description: "Gute Balance aus Qualitaet und Geschwindigkeit" },
  { id: "llava:13b", name: "LLaVA 13B", size: "8.0GB", description: "Beste Qualitaet, braucht mehr RAM" },
  { id: "llava-llama3", name: "LLaVA LLaMA3", size: "5.5GB", description: "Neuestes LLaVA auf LLaMA3-Basis" },
  { id: "bakllava", name: "BakLLaVA", size: "4.7GB", description: "Mistral-basiert, gut fuer Details" },
];

export const DEFAULT_VISION_MODEL = "moondream";

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

interface OllamaTagsResponse {
  models: { name: string; size: number }[];
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    return res.ok;
  } catch { return false; }
}

export async function isVisionModelInstalled(model: string = DEFAULT_VISION_MODEL): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return false;
    const data = (await res.json()) as OllamaTagsResponse;
    return data.models.some(m =>
      m.name === model || m.name === `${model}:latest` || m.name.startsWith(`${model}:`)
    );
  } catch { return false; }
}

export async function getInstalledVisionModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTagsResponse;
    return data.models
      .filter(m => VISION_MODEL_PREFIXES.some(p => m.name === p || m.name === `${p}:latest` || m.name.startsWith(`${p}:`)))
      .map(m => m.name);
  } catch { return []; }
}

export async function pullVisionModel(
  model: string = DEFAULT_VISION_MODEL,
  onProgress?: (status: string) => void,
): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });
  if (!res.ok) throw new Error(`Failed to pull '${model}': HTTP ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onProgress?.(JSON.parse(line).status); } catch {}
    }
  }
  if (buffer.trim()) try { onProgress?.(JSON.parse(buffer).status); } catch {}
}

export async function* analyzeImage(
  imagePath: string,
  prompt: string = "Describe this image in detail.",
  model: string = DEFAULT_VISION_MODEL,
): AsyncGenerator<string> {
  const resolved = resolve(imagePath);
  if (!existsSync(resolved)) throw new Error(`Image not found: ${resolved}`);
  if (!isImageFile(resolved)) throw new Error(`Unsupported format: ${extname(resolved)}`);

  const base64Image = readFileSync(resolved).toString("base64");

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, images: [base64Image], stream: true }),
  });
  if (!res.ok) throw new Error(`Vision API error: HTTP ${res.status}`);
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.response) yield chunk.response;
      } catch {}
    }
  }
  if (buffer.trim()) try { const c = JSON.parse(buffer); if (c.response) yield c.response; } catch {}
}

export async function analyzeImageFull(
  imagePath: string,
  prompt: string = "Describe this image in detail.",
  model: string = DEFAULT_VISION_MODEL,
): Promise<string> {
  const resolved = resolve(imagePath);
  if (!existsSync(resolved)) throw new Error(`Image not found: ${resolved}`);
  if (!isImageFile(resolved)) throw new Error(`Unsupported format: ${extname(resolved)}`);

  const base64Image = readFileSync(resolved).toString("base64");

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, images: [base64Image], stream: false }),
  });
  if (!res.ok) throw new Error(`Vision API error: HTTP ${res.status}`);

  const data = await res.json() as { response: string };
  return data.response;
}

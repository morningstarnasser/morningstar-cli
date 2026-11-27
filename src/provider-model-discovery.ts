// ─── Live provider model discovery ──────────────────────────────────────────
// Successful catalogs replace previous inventories, including empty lists.
// Credentials are used only for the provider that owns them and are never
// persisted or included in returned diagnostics.

import { createHash } from "node:crypto";
import { getOllamaBaseUrl } from "./runtime/ollama-endpoint.js";
const MODEL_CATALOG_TTL_MS = 30_000;
const MODEL_CATALOG_TIMEOUT_MS = 5_000;
const MAX_MODEL_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_MODELS_PER_PROVIDER = 2_000;

interface CachedCatalog {
  models: string[];
  fetchedAt: number;
  identity: string;
  endpoint: string;
}

interface DiscoverySpec {
  provider: string;
  url: string;
  requiresCredential: boolean;
  headers: (credential: string) => Record<string, string>;
}

export interface ProviderModelRefreshResult {
  provider: string;
  status: "updated" | "cached" | "skipped" | "failed";
  modelCount: number;
  error?: string;
}

export interface ProviderModelRefreshOptions {
  force?: boolean;
  fetchFn?: typeof fetch;
  now?: () => number;
  /** Trusted configured inference endpoint; never a model- or project-supplied URL. */
  ollamaBaseUrl?: string;
}

const catalogs = new Map<string, CachedCatalog>();
const refreshStatuses = new Map<string, ProviderModelRefreshResult["status"]>();
const requests = new Map<string, number>();
let sequence = 0;

const DISCOVERY_SPECS: DiscoverySpec[] = [
  { provider: "ollama", url: "http://127.0.0.1:11434/api/tags", requiresCredential: false, headers: () => ({}) },
  {
    provider: "anthropic",
    url: "https://api.anthropic.com/v1/models?limit=1000",
    requiresCredential: true,
    headers: (credential) => ({
      "x-api-key": credential,
      "anthropic-version": "2023-06-01",
    }),
  },
  {
    provider: "openai",
    url: "https://api.openai.com/v1/models",
    requiresCredential: true,
    headers: bearerHeaders,
  },
  {
    provider: "deepseek",
    url: "https://api.deepseek.com/v1/models",
    requiresCredential: true,
    headers: bearerHeaders,
  },
  {
    provider: "google",
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    requiresCredential: true,
    headers: (credential) => ({ "x-goog-api-key": credential }),
  },
  {
    provider: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/models",
    requiresCredential: true,
    headers: bearerHeaders,
  },
  {
    provider: "github-models",
    url: "https://models.github.ai/catalog/models",
    requiresCredential: true,
    headers: (credential) => ({
      ...bearerHeaders(credential),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    }),
  },
  {
    provider: "groq",
    url: "https://api.groq.com/openai/v1/models",
    requiresCredential: true,
    headers: bearerHeaders,
  },
  {
    provider: "openrouter",
    url: "https://openrouter.ai/api/v1/models",
    requiresCredential: false,
    headers: (credential) => credential ? bearerHeaders(credential) : {},
  },
];

function bearerHeaders(credential: string): Record<string, string> {
  return { Authorization: `Bearer ${credential}` };
}

function isSafeModelId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]*$/.test(value);
}

function isUsableGenerationModel(provider: string, model: string): boolean {
  const normalized = model.toLowerCase();
  if (provider === "anthropic") return normalized.startsWith("claude-");
  if (provider === "deepseek") return normalized.startsWith("deepseek-");
  if (provider === "google") return normalized.startsWith("gemini-");
  if (provider === "openai") {
    // /v1/models also returns image, realtime, speech, embedding, and
    // moderation models. Morningstar sends the selected model to
    // /v1/chat/completions, so exposing those entries would create a picker
    // option that can never complete a normal agent turn.
    const baseModel = normalized.startsWith("ft:")
      ? normalized.slice("ft:".length).split(":")[0] ?? ""
      : normalized;
    if (
      /(?:^|[-_.:/])(?:image|realtime|transcribe|audio|tts|whisper|embedding|moderation)(?:[-_.:/]|$)/
        .test(baseModel)
    ) {
      return false;
    }
    return /^(gpt-|chatgpt-|o[1-9](?:-|$)|codex)/.test(baseModel);
  }
  if (provider === "groq") {
    return !/(?:whisper|speech|tts|guard|moderation)/.test(normalized);
  }
  if (provider === "nvidia") {
    return !/(?:embed|embedding|rerank|retrieval)/.test(normalized);
  }
  return true;
}

function providerModelId(provider: string, model: string): string {
  if (provider === "nvidia") {
    return `nvidia/${model}`;
  }
  if (provider === "groq") {
    return `groq/${model}`;
  }
  if (provider === "github-models") {
    return `github/${model}`;
  }
  return model;
}

function parseProviderModels(
  provider: string,
  payload: unknown,
): string[] {
  let entries: unknown[] = [];
  if (provider === "github-models" && Array.isArray(payload)) {
    entries = payload;
  } else if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    if (["google", "ollama"].includes(provider) && Array.isArray(object.models)) {
      entries = object.models;
    } else if (!["google", "ollama"].includes(provider) && Array.isArray(object.data)) {
      entries = object.data;
    } else throw new Error("invalid model catalog");
    // Never treat an explicitly incomplete inventory as a complete replacement.
    if (object.has_more === true || object.nextPageToken) throw new Error("incomplete model catalog");
  } else throw new Error("invalid model catalog");

  const unique = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (provider === "google") {
      const methods = item.supportedGenerationMethods;
      if (Array.isArray(methods) && !methods.includes("generateContent")) continue;
    }
    if (provider === "github-models") {
      const outputs = item.supported_output_modalities;
      if (Array.isArray(outputs) && !outputs.includes("text")) continue;
    }

    const raw = provider === "ollama" ? (item.model ?? item.name) : provider === "google"
      ? (typeof item.baseModelId === "string"
          ? item.baseModelId
          : typeof item.name === "string"
            ? item.name.replace(/^models\//, "")
            : undefined)
      : item.id;
    if (!isSafeModelId(raw) || !isUsableGenerationModel(provider, raw)) continue;
    unique.add(providerModelId(provider, raw));
    if (unique.size > MAX_MODELS_PER_PROVIDER) throw new Error("model catalog exceeds limit");
  }
  return [...unique];
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") || "0");
  if (declaredLength > MAX_MODEL_RESPONSE_BYTES) {
    throw new Error("model catalog response is too large");
  }
  if (!response.body) throw new Error("model catalog response has no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_MODEL_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("model catalog response is too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

async function discoverOne(
  spec: DiscoverySpec,
  credential: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_CATALOG_TIMEOUT_MS);
  try {
    const response = await fetchFn(spec.url, {
      method: "GET",
      headers: spec.headers(credential),
      signal: controller.signal,
      // Never forward provider credentials to a redirect target. Catalog
      // endpoints are fixed and an unexpected redirect is safer to reject.
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`HTTP ${response.status} (redirect blocked)`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const models = parseProviderModels(
      spec.provider,
      await readBoundedJson(response),
    );
    return models;
  } finally {
    clearTimeout(timeout);
  }
}

export function getDiscoveredProviderModels(
  provider: string,
): string[] | undefined {
  const models = catalogs.get(provider)?.models;
  return models ? [...models] : undefined;
}

export function getProviderModelRefreshStatus(
  provider: string,
): ProviderModelRefreshResult["status"] | undefined {
  return refreshStatuses.get(provider);
}

export function getProviderModelEndpoint(provider: string): string | undefined {
  return catalogs.get(provider)?.endpoint;
}

export function ollamaCatalogUrl(baseUrl = getOllamaBaseUrl()): string {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("invalid Ollama endpoint");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "") + "/api/tags";
  url.search = ""; url.hash = "";
  return url.href;
}

export async function refreshProviderModelCatalogs(
  resolveCredential: (provider: string) => string,
  options: ProviderModelRefreshOptions = {},
): Promise<ProviderModelRefreshResult[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const record = (
    result: ProviderModelRefreshResult,
  ): ProviderModelRefreshResult => {
    refreshStatuses.set(result.provider, result.status);
    return result;
  };

  return Promise.all(DISCOVERY_SPECS.map(async (original) => {
    const request = ++sequence;
    requests.set(original.provider, request);
    let spec = original;
    const credential = resolveCredential(spec.provider) || "";
    const existing = catalogs.get(spec.provider);
    const identity = createHash("sha256").update(`${spec.provider}\0${credential}\0${spec.provider === "ollama" ? options.ollamaBaseUrl ?? getOllamaBaseUrl() : spec.url}`).digest("hex");
    if (spec.requiresCredential && !credential) {
      catalogs.delete(spec.provider);
      return record({ provider: spec.provider, status: "skipped", modelCount: 0 });
    }
    if (
      !options.force
      && existing
      && existing.identity === identity
      && now() - existing.fetchedAt < MODEL_CATALOG_TTL_MS
    ) {
      return record({
        provider: spec.provider,
        status: "cached" as const,
        modelCount: existing.models.length,
      });
    }
    try {
      if (spec.provider === "ollama") spec = { ...spec, url: ollamaCatalogUrl(options.ollamaBaseUrl) };
      const models = await discoverOne(spec, credential, fetchFn);
      if (requests.get(spec.provider) !== request) return { provider: spec.provider, status: "skipped", modelCount: 0 };
      catalogs.set(spec.provider, { models, fetchedAt: now(), identity, endpoint: spec.url });
      return record({
        provider: spec.provider,
        status: "updated" as const,
        modelCount: models.length,
      });
    } catch (error) {
      if (requests.get(spec.provider) !== request) return { provider: spec.provider, status: "skipped", modelCount: 0 };
      catalogs.delete(spec.provider);
      return record({
        provider: spec.provider,
        status: "failed" as const,
        modelCount: 0,
        error: /^(?:HTTP \d{3}(?: \(redirect blocked\))?|invalid (?:model catalog|Ollama endpoint)|incomplete model catalog|model catalog (?:exceeds limit|response (?:is too large|has no body)))$/.test((error as Error).message)
          ? (error as Error).message : "model catalog request failed",
      });
    }
  }));
}

/** Test helper; production refreshes naturally through the TTL. */
export function clearDiscoveredProviderModels(): void {
  catalogs.clear();
  refreshStatuses.clear();
  requests.clear();
}

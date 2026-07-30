import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectProvider,
  getModelDisplayName,
  getOllamaBaseUrl,
  isLocalOllamaHost,
  listInstalledOllamaModels,
  listOllamaManifestModels,
  listProviders,
  mergeOllamaModelSources,
  parseOllamaManifestPath,
  parseOllamaListOutput,
  resolveModelSelectionArg,
  resolveModelName,
} from "../src/providers.js";

test("Ollama list parser preserves tags and Hugging Face model paths", () => {
  const output = [
    "NAME ID SIZE MODIFIED",
    "qwen3.5:27b-int4 06964f 16 GB 1 hour ago",
    "hf.co/example/Local-Model-GGUF:BF16 abc123 19 GB 2 weeks ago",
    "",
  ].join("\n");
  assert.deepEqual(parseOllamaListOutput(output), [
    "qwen3.5:27b-int4",
    "hf.co/example/Local-Model-GGUF:BF16",
  ]);
});

test("Ollama manifest paths preserve namespaces, tags, and Hugging Face ids", () => {
  assert.equal(
    parseOllamaManifestPath("registry.ollama.ai/library/qwen3.5/27b-int4"),
    "qwen3.5:27b-int4",
  );
  assert.equal(
    parseOllamaManifestPath("registry.ollama.ai/example/hydra-ai/latest"),
    "example/hydra-ai:latest",
  );
  assert.equal(
    parseOllamaManifestPath("hf.co/huihui-ai/abliterated-GGUF/BF16"),
    "hf.co/huihui-ai/abliterated-GGUF:BF16",
  );
  assert.equal(parseOllamaManifestPath("../outside/model/latest"), null);
  assert.equal(parseOllamaManifestPath("library/model"), null);
  assert.equal(
    parseOllamaManifestPath("registry.ollama.ai/library/bad\u001b[31m/latest"),
    null,
  );
});

test("on-disk Ollama manifests are discoverable without a running daemon", (t) => {
  const modelsRoot = mkdtempSync(join(tmpdir(), "morningstar-ollama-"));
  t.after(() => rmSync(modelsRoot, { recursive: true, force: true }));

  const manifests = [
    "registry.ollama.ai/library/qwen3.5/27b-int4",
    "registry.ollama.ai/example/hydra-ai/latest",
    "hf.co/huihui-ai/abliterated-GGUF/BF16",
  ];
  for (const manifest of manifests) {
    const path = join(modelsRoot, "manifests", manifest);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "{}");
  }

  assert.deepEqual(listOllamaManifestModels(modelsRoot), [
    "example/hydra-ai:latest",
    "hf.co/huihui-ai/abliterated-GGUF:BF16",
    "qwen3.5:27b-int4",
  ]);
});

test("provider catalog exposes every currently installed Ollama model", () => {
  const installed = listInstalledOllamaModels();
  const ollama = listProviders().find(({ name }) => name === "ollama");
  assert.ok(ollama);

  if (installed.length === 0) {
    assert.ok(ollama.models[0].startsWith("("));
    return;
  }

  assert.deepEqual(ollama.models, installed);
  for (const model of installed) {
    assert.equal(detectProvider(model), "ollama");
    assert.match(getModelDisplayName(model), /^Ollama — /);
    assert.equal(ollama.modelMetadata?.[model]?.deployment, "local");
  }
});

test("explicit Groq model ids route before the generic provider/model fallback", () => {
  const model = "groq/llama-3.3-70b-versatile";
  assert.equal(detectProvider(model), "groq");
  assert.equal(resolveModelName(model, "groq"), "llama-3.3-70b-versatile");
});

test("every catalogued Groq model keeps an unambiguous provider prefix", () => {
  const groq = listProviders().find(({ name }) => name === "groq");
  assert.ok(groq);
  for (const model of groq.models) {
    assert.equal(detectProvider(model), "groq");
    assert.equal(resolveModelName(model, "groq").startsWith("groq/"), false);
  }
});

test("GitHub catalog ids retain both routing and publisher namespaces", () => {
  const github = listProviders().find(({ name }) => name === "github-models");
  assert.ok(github);
  for (const model of github.models) {
    assert.equal(detectProvider(model), "github-models");
    assert.match(resolveModelName(model, "github-models"), /^[^/]+\/[^/]+/);
  }
});

test("OLLAMA_HOST is normalized to the same OpenAI-compatible endpoint", () => {
  assert.equal(getOllamaBaseUrl(undefined), "http://localhost:11434/v1");
  assert.equal(
    getOllamaBaseUrl("192.0.2.10:11434"),
    "http://192.0.2.10:11434/v1",
  );
  assert.equal(
    getOllamaBaseUrl("https://ollama.example.test/base/"),
    "https://ollama.example.test/base/v1",
  );
  assert.equal(getOllamaBaseUrl("file:///tmp/ollama.sock"), "http://localhost:11434/v1");
});

test("remote Ollama catalogs never mix in local-only manifest models", () => {
  assert.equal(isLocalOllamaHost("localhost:11434"), true);
  assert.equal(isLocalOllamaHost("http://127.0.0.1:11434"), true);
  assert.equal(isLocalOllamaHost("https://ollama.example.test"), false);
  assert.deepEqual(
    mergeOllamaModelSources(
      ["remote/model:latest"],
      ["local/model:latest"],
      "https://ollama.example.test",
    ),
    ["remote/model:latest"],
  );
  assert.deepEqual(
    mergeOllamaModelSources(
      ["daemon/model:latest"],
      ["disk/model:latest"],
      "localhost:11434",
    ),
    ["daemon/model:latest", "disk/model:latest"],
  );
});

test("explicit provider/model input preserves ambiguous provider ownership", () => {
  assert.deepEqual(
    resolveModelSelectionArg("openrouter nvidia/meta/llama-4"),
    { provider: "openrouter", model: "nvidia/meta/llama-4" },
  );
  assert.deepEqual(
    resolveModelSelectionArg("groq groq/groq/compound"),
    { provider: "groq", model: "groq/groq/compound" },
  );
});

test("Hugging Face Ollama ids remain local before they have been pulled", () => {
  assert.equal(detectProvider("hf.co/example/not-installed-yet:Q4_K_M"), "ollama");
});

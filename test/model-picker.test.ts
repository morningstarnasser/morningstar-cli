import { test } from "node:test";
import assert from "node:assert/strict";
import {
  modelEmptyState,
  buildModelChoices,
  buildModelProviderGroups,
  filterModelChoices,
  filterModelProviderGroups,
  groupModelChoices,
} from "../src/components/ModelPicker.js";
import type { ProviderCatalogEntry } from "../src/providers.js";

const providers: ProviderCatalogEntry[] = [
  { name: "openai", models: ["gpt-4.1-mini", "gpt-4.1"], envKey: "OPENAI_API_KEY" },
  {
    name: "ollama",
    models: [
      "qwen3.5:27b-int4",
      "hf.co/example/Long-Local-Model:BF16",
    ],
    envKey: "(local)",
    modelMetadata: {
      "qwen3.5:27b-int4": {
        deployment: "local",
        availabilityHint: "Installed in Ollama",
      },
      "hf.co/example/Long-Local-Model:BF16": {
        deployment: "local",
        availabilityHint: "Installed in Ollama",
      },
    },
  },
  { name: "claude-cli", models: ["claude-cli"], envKey: "(subscription)" },
];

test("picker keeps provider groups contiguous and prioritizes the active model", () => {
  const choices = buildModelChoices(providers, "gpt-4.1");
  assert.equal(choices[0].model, "gpt-4.1");
  assert.deepEqual(
    choices.slice(0, 2).map(({ provider }) => provider),
    ["openai", "openai"],
  );
  assert.deepEqual(
    choices.slice(2, 4).map(({ model }) => model),
    ["qwen3.5:27b-int4", "hf.co/example/Long-Local-Model:BF16"],
  );
  assert.equal(choices[2].location, "local");
});

test("explicit current provider resolves duplicate catalog model ids", () => {
  const duplicated: ProviderCatalogEntry[] = [
    {
      name: "nvidia",
      models: ["nvidia/meta/llama-4"],
      envKey: "NVIDIA_NIM_API_KEY",
    },
    {
      name: "openrouter",
      models: ["nvidia/meta/llama-4", "anthropic/claude-opus"],
      envKey: "OPENROUTER_API_KEY",
    },
  ];
  const choices = buildModelChoices(
    duplicated,
    "nvidia/meta/llama-4",
    "openrouter",
  );

  assert.deepEqual(
    choices.slice(0, 2).map(({ provider }) => provider),
    ["openrouter", "openrouter"],
  );
  assert.equal(choices[0].model, "nvidia/meta/llama-4");
});

test("picker exposes visible provider sections in the same order as the rows", () => {
  const choices = buildModelChoices(providers, "gpt-4.1");
  const groups = groupModelChoices(choices);
  assert.deepEqual(groups.map(({ provider }) => provider), [
    "openai",
    "ollama",
    "claude-cli",
  ]);
  assert.deepEqual(groups[1].choices.map(({ model }) => model), [
    "qwen3.5:27b-int4",
    "hf.co/example/Long-Local-Model:BF16",
  ]);
});

test("provider dropdown retains providers with no selectable fallback model", () => {
  const catalog: ProviderCatalogEntry[] = [
    ...providers,
    {
      name: "openrouter",
      models: ["(Modell-ID manuell eingeben)"],
      envKey: "OPENROUTER_API_KEY",
    },
  ];
  const groups = buildModelProviderGroups(catalog, "gpt-4.1");
  const openrouter = groups.find((group) => group.provider === "openrouter");
  assert.ok(openrouter);
  assert.deepEqual(openrouter.choices, []);
});

test("provider dropdown search matches provider names and nested models", () => {
  const groups = groupModelChoices(buildModelChoices(providers, "gpt-4.1"));
  assert.deepEqual(
    filterModelProviderGroups(groups, "openai").map(({ provider }) => provider),
    ["openai"],
  );
  assert.deepEqual(
    filterModelProviderGroups(groups, "hf.co").map(({ provider }) => provider),
    ["ollama"],
  );
  assert.deepEqual(
    filterModelProviderGroups(groups, "subscription").map(({ provider }) => provider),
    ["claude-cli"],
  );
  assert.deepEqual(
    filterModelProviderGroups([
      {
        provider: "anthropic",
        label: "Anthropic",
        choices: [],
      },
      {
        provider: "openrouter",
        label: "OpenRouter",
        choices: [{
          model: "anthropic/claude-opus",
          provider: "openrouter",
          displayName: "Claude Opus",
          location: "hosted",
        }],
      },
    ], "anthropic").map(({ provider }) => provider),
    ["anthropic"],
  );
});

test("picker search matches provider, display name, location, and exact ids", () => {
  const choices = buildModelChoices(providers, "");
  assert.deepEqual(
    filterModelChoices(choices, "hf.co").map(({ model }) => model),
    ["hf.co/example/Long-Local-Model:BF16"],
  );
  assert.deepEqual(
    filterModelChoices(choices, "local").map(({ provider }) => provider),
    ["ollama", "ollama"],
  );
  assert.deepEqual(
    filterModelChoices(choices, "subscription").map(({ model }) => model),
    ["claude-cli"],
  );
});


test("empty Ollama state distinguishes installed-zero, unreachable and search",()=>{
 assert.match(modelEmptyState("ollama","","updated"),/keine Modelle installiert/);
 assert.match(modelEmptyState("ollama","","failed"),/nicht erreichbar/);
 assert.match(modelEmptyState("ollama","missing","updated"),/missing/);
 assert.match(modelEmptyState("openai","","skipped"),/API-Key/);
 assert.match(modelEmptyState("ollama","","updated",true),/abgerufen/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCostPerMessage,
  isFreeTier,
  resetSessionCosts,
  trackUsage,
} from "../src/cost-tracker.js";

test("unknown cloud models use the conservative paid fallback", () => {
  assert.equal(isFreeTier("new-cloud-model", "openai"), false);
  assert.equal(
    getCostPerMessage("new-cloud-model", 1_000_000, 1_000_000, "openai"),
    4,
  );
});

test("arbitrary local and subscription-backed models have no marginal token cost", () => {
  for (const provider of ["ollama", "hydra-local", "claude-cli"]) {
    assert.equal(isFreeTier("arbitrary-local-model", provider), true);
    assert.equal(
      getCostPerMessage("arbitrary-local-model", 1_000_000, 1_000_000, provider),
      0,
    );
  }
});

test("explicitly priced free cloud models remain free", () => {
  const model = "nvidia/moonshotai/kimi-k2.6";
  assert.equal(isFreeTier(model, "nvidia"), true);
  assert.equal(getCostPerMessage(model, 1_000_000, 1_000_000, "nvidia"), 0);
});

test("trackUsage applies provider-aware pricing", () => {
  resetSessionCosts();
  const local = trackUsage(
    "unlisted-ollama-model",
    "input",
    "output",
    1_000_000,
    1_000_000,
    "ollama",
  );
  assert.equal(local.cost, 0);

  const cloud = trackUsage(
    "unlisted-openai-model",
    "input",
    "output",
    1_000_000,
    1_000_000,
    "openai",
  );
  assert.equal(cloud.cost, 4);
  resetSessionCosts();
});

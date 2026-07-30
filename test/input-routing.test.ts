import test from "node:test";
import assert from "node:assert/strict";
import { classifyLocalInput } from "../src/input-routing.js";

test("interactive input keeps slash, bang, and bare-cd routing", () => {
  assert.equal(classifyLocalInput("/team delete example"), "slash");
  assert.equal(classifyLocalInput("!touch marker"), "bang");
  assert.equal(classifyLocalInput("cd /tmp"), "cd");
  assert.equal(classifyLocalInput("explain this code"), "prompt");
});

test("expanded custom commands are always prompts, never local commands", () => {
  const promptTemplate = { promptTemplate: true };

  assert.equal(
    classifyLocalInput("/team delete production\n\nreview the team", promptTemplate),
    "prompt",
  );
  assert.equal(
    classifyLocalInput("!touch /tmp/custom-command-pwned", promptTemplate),
    "prompt",
  );
  assert.equal(classifyLocalInput("cd /", promptTemplate), "prompt");
});

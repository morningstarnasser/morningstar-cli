import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { runPrintMode } from "../src/print-mode.js";

test("provider rejection returns a structured failure without a false completion", async () => {
  for (const outputFormat of ["stream-json", "json", "text"] as const) {
    let output = "";
    const code = await runPrintMode("test", "test assistant", {
      model: "opencode/example-free", provider: "opencode", apiKey: "", baseUrl: "", maxTokens: 20, temperature: 0,
      outputFormat, noSessionPersistence: true, autoKnowledge: false, selfImprovement: false,
    }, process.cwd(), [], {
      input: Readable.from([]), write: text => { output += text; },
      runnerOptions: { streamFn: async function* () { throw new Error("OpenCode (429): Free usage limit reached"); } },
    });
    assert.equal(code, 1);
    assert.match(output, /Free usage limit reached/);
    assert.doesNotMatch(output, /"type":"completion"|Uncaught|Auftrag beendet/);
    if (outputFormat !== "text") {
      const events = output.trim().split("\n").map(line => JSON.parse(line));
      assert.equal(events.at(-1).type, "error"); assert.equal(events.at(-1).is_error, true);
    }
  }
});

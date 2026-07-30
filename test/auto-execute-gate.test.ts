import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoExecuteEnabled, executeToolCalls } from "../src/tools.js";

const ENV = "MORNINGSTAR_AUTO_EXECUTE_CODE_BLOCKS";

function withEnv(value: string | undefined, fn: () => Promise<void> | void) {
  const previous = process.env[ENV];
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
  return (async () => {
    try { await fn(); } finally {
      if (previous === undefined) delete process.env[ENV];
      else process.env[ENV] = previous;
    }
  })();
}

test("plain bash code blocks are not executed by default", async () => {
  const marker = join(tmpdir(), `mcli_gate_${process.pid}_${Date.now()}.txt`);
  if (existsSync(marker)) unlinkSync(marker);
  const response = "Beispiel für ein Backup:\n\n```bash\ntouch " + marker + "\n```\n";

  await withEnv(undefined, async () => {
    const { results } = await executeToolCalls(response, process.cwd());
    assert.equal(results.length, 0, "no tool should run for prose code blocks");
    assert.equal(existsSync(marker), false, "the shell command must not have executed");
  });
  if (existsSync(marker)) unlinkSync(marker);
});

test("plain python code blocks are not executed by default", async () => {
  const marker = join(tmpdir(), `mcli_gate_py_${process.pid}_${Date.now()}.txt`);
  if (existsSync(marker)) unlinkSync(marker);
  const response = "```python\nopen(r'" + marker + "','w').write('x')\n```";

  await withEnv(undefined, async () => {
    const { results } = await executeToolCalls(response, process.cwd());
    assert.equal(results.length, 0);
    assert.equal(existsSync(marker), false, "the python block must not have executed");
  });
  if (existsSync(marker)) unlinkSync(marker);
});

test("auto execution runs only when explicitly enabled", async () => {
  const marker = join(tmpdir(), `mcli_gate_on_${process.pid}_${Date.now()}.txt`);
  if (existsSync(marker)) unlinkSync(marker);
  const response = "```bash\ntouch " + marker + "\n```";

  await withEnv("1", async () => {
    assert.equal(autoExecuteEnabled(), true);
    await executeToolCalls(response, process.cwd());
    assert.equal(existsSync(marker), true, "opt-in must still allow execution");
  });
  if (existsSync(marker)) unlinkSync(marker);
});

test("gate reads the env flag strictly", async () => {
  await withEnv(undefined, () => { assert.equal(autoExecuteEnabled(), false); });
  await withEnv("0", () => { assert.equal(autoExecuteEnabled(), false); });
  await withEnv("nope", () => { assert.equal(autoExecuteEnabled(), false); });
  await withEnv("true", () => { assert.equal(autoExecuteEnabled(), true); });
});

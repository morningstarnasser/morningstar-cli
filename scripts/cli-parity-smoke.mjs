// Real built-CLI tests with a synthetic loopback provider and isolated user state.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const fixture = mkdtempSync(join(tmpdir(), "morningstar-cli-parity-"));
const userHome = join(fixture, "user");
const project = join(fixture, "project");
mkdirSync(join(userHome, ".morningstar"), { recursive: true });
mkdirSync(project);
writeFileSync(join(project, "AGENTS.md"), "Synthetic guidance: preserve fixture contract.");
const requests = [];
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  const data = JSON.parse(body);
  requests.push(data);
  const prompt = data.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const delta = prompt === "attempt-tool"
    ? { tool_calls: [{ index: 0, id: "call_fixture", type: "function", function: { name: "bash", arguments: '{"command":"echo should-not-run"}' } }] }
    : { content: prompt === "bad-schema" ? '{"count":"invalid"}' : `answer:${prompt}` };
  response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  response.end("data: [DONE]\n\n");
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
writeFileSync(join(userHome, ".morningstar/config.json"), JSON.stringify({ model: "gpt-4.1", provider: "openai", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKeys: { openai: "fixture-not-a-real-key" } }), { mode: 0o600 });
const cli = resolve("dist/index.js");
const baseArgs = ["--dir", project, "--quiet"];
function start(args) {
  const child = spawn(process.execPath, [cli, ...baseArgs, ...args], { env: { PATH: process.env.PATH, HOME: userHome, LANG: "en_US.UTF-8", NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.on("error", () => {});
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  const completion = new Promise((resolve) => child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); }));
  return { child, completion, output: () => stdout };
}
async function run(args, input = "") {
  const process = start(args); process.child.stdin.end(input); return process.completion;
}
const evidence = [];
try {
  const first = await run(["-p", "first", "--name", "Parity fixture", "--output-format", "json"]);
  assert.equal(first.code, 0, first.stderr);
  const session = JSON.parse(first.stdout);
  assert.equal(session.result, "answer:first");
  assert.match(requests.at(-1).messages[0].content, /Synthetic guidance/);
  assert.equal(statSync(join(userHome, ".morningstar/history", `${session.session_id}.json`)).mode & 0o777, 0o600);
  const resumed = await run(["-c", "-p", "second", "--output-format", "json"]);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.ok(requests.at(-1).messages.some((m) => m.content === "answer:first"));
  assert.equal(JSON.parse(resumed.stdout).session_id, session.session_id);
  evidence.push("persist + resume + private permissions");

  const count = readdirSync(join(userHome, ".morningstar/history")).length;
  const slow = start(["-p", "suffix", "--no-session-persistence", "--output-format", "json"]);
  slow.child.stdin.write("slow-");
  await new Promise((resolve) => setTimeout(resolve, 200));
  slow.child.stdin.end("complete");
  const slowResult = await slow.completion;
  assert.equal(slowResult.code, 0, slowResult.stderr);
  assert.equal(JSON.parse(slowResult.stdout).result, "answer:slow-complete\n\nsuffix");
  assert.equal(readdirSync(join(userHome, ".morningstar/history")).length, count);
  evidence.push("slow pipe + no persistence");

  const stream = start(["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--no-session-persistence"]);
  stream.child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: "one" } }) + "\n");
  const deadline = Date.now() + 10000;
  while (!stream.output().includes('"type":"completion"') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(stream.output(), /"type":"completion"/, "response must arrive while stdin is open");
  stream.child.stdin.end(JSON.stringify({ type: "user", message: { role: "user", content: "two" } }) + "\n");
  const streamed = await stream.completion;
  assert.equal(streamed.code, 0, streamed.stderr);
  assert.equal(streamed.stdout.trim().split("\n").map(JSON.parse).filter((event) => event.type === "completion").length, 2);
  assert.ok(requests.at(-1).messages.some((message) => message.content === "answer:one"));
  evidence.push("bidirectional NDJSON with conversation continuity");

  const denied = await run(["-p", "attempt-tool", "--tools", "", "--dangerously-skip-permissions", "--max-turns", "1", "--output-format", "json", "--no-session-persistence"]);
  assert.equal(denied.code, 1, denied.stderr);
  assert.equal(JSON.parse(denied.stdout).is_error, true);
  evidence.push("empty tool allowlist blocks native call even with bypass");

  const schema = '{"type":"object","properties":{"count":{"type":"integer"}},"required":["count"]}';
  const invalid = await run(["-p", "bad-schema", "--json-schema", schema, "--output-format", "json", "--no-session-persistence"]);
  assert.equal(invalid.code, 1, invalid.stderr);
  assert.match(JSON.parse(invalid.stdout).structured_output_error, /integer/);
  evidence.push("schema failure yields nonzero status");

  const before = requests.length;
  const malformed = await run(["-p", "unused", "--settings", '{"permissions":{"deny":"Bash"}}']);
  assert.equal(malformed.code, 1);
  assert.equal(requests.length, before);
  evidence.push("invalid settings rejected before provider access");
  console.log(JSON.stringify({ passed: evidence.length, checks: evidence, providerRequests: requests.length, realProviderCalls: 0 }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(fixture, { recursive: true, force: true });
}

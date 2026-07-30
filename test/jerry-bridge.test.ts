import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askJerry,
  buildJerryCommand,
  validateRemoteAgentHost,
  type ExecFn,
} from "../src/jerry-bridge.js";

test("builds an ssh+hermes command with a base64-encoded prompt", () => {
  const [optionTerminator, host, remote] = buildJerryCommand("mach ein Bild", "remote-operator");
  assert.equal(optionTerminator, "--");
  assert.equal(host, "remote-operator");
  assert.ok(remote.includes("base64 -d"));
  assert.ok(remote.includes("hermes chat -Q -q"));
  assert.ok(!remote.includes("--yolo"));
  // The original text must NOT appear raw (it is base64-encoded to survive SSH).
  assert.ok(!remote.includes("mach ein Bild"));
  const b64 = Buffer.from("mach ein Bild", "utf-8").toString("base64");
  assert.ok(remote.includes(b64));
});

test("accepts only plain SSH hosts and aliases", () => {
  for (const host of [
    "remote-operator",
    "remote_operator.example",
    "10.0.0.5",
    "operator@remote.internal",
  ]) {
    assert.equal(validateRemoteAgentHost(host), host);
  }

  for (const host of [
    "",
    " remote-operator",
    "remote-operator ",
    "-oProxyCommand=payload",
    "remote operator",
    "remote;id",
    "remote$(id)",
    "remote`id`",
    "operator@-remote",
    "operator@@remote",
    "../../remote",
    "remote\n-oProxyCommand=payload",
  ]) {
    assert.throws(() => validateRemoteAgentHost(host), /plain SSH host|bridge disabled/);
  }
});

test("askJerry returns Jerry's trimmed reply via injected exec", async () => {
  const fakeExec: ExecFn = (cmd, args) => {
    assert.equal(cmd, "ssh");
    assert.deepEqual(args.slice(0, 2), ["--", "remote-operator"]);
    return "  Bild erstellt: /path/to/img.png\n";
  };
  assert.equal(
    await askJerry("erzeuge ein bild", 1000, fakeExec, "remote-operator"),
    "Bild erstellt: /path/to/img.png",
  );
});

test("askJerry is disabled when no trusted parent host is configured", async () => {
  const previous = process.env.MORNINGSTAR_REMOTE_AGENT_HOST;
  delete process.env.MORNINGSTAR_REMOTE_AGENT_HOST;
  try {
    await assert.rejects(
      () => askJerry("erzeuge ein bild", 1000, () => "unexpected"),
      /remote bridge disabled/,
    );
  } finally {
    if (previous === undefined) delete process.env.MORNINGSTAR_REMOTE_AGENT_HOST;
    else process.env.MORNINGSTAR_REMOTE_AGENT_HOST = previous;
  }
});

test("askJerry rejects an empty task", async () => {
  await assert.rejects(() => askJerry("   "));
});

test("askJerry propagates exec failures", async () => {
  const boom: ExecFn = () => { throw new Error("ssh down"); };
  await assert.rejects(() => askJerry("tu was", 1000, boom, "remote-operator"), /ssh down/);
});

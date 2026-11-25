import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, Box, Text } from "ink";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { AgentFooter } from "../src/components/AgentFooter.js";
import type { AgentBranch } from "../src/components/AgentTree.js";

test("footer shows actual running/waiting work and removes completed workers", async () => {
  const stdout = new PassThrough() as any; stdout.columns = 100; stdout.rows = 40; stdout.isTTY = false;
  const stdin = new PassThrough() as any; stdin.isTTY = false;
  let frame = ""; stdout.on("data", (chunk: Buffer) => { frame = stripVTControlCharacters(chunk.toString()); });
  const branches: AgentBranch[] = [
    { taskId: "inspect", agentId: "code", status: "running", detail: "read · example.ts", elapsedMs: 3000 },
    { taskId: "review", agentId: "review", status: "pending", detail: "Wartet auf inspect", elapsedMs: 0 },
    { taskId: "old-worker", agentId: "debug", status: "completed", detail: "Finished", elapsedMs: 2000 },
  ];
  const element = (items: AgentBranch[]) => React.createElement(Box, { flexDirection: "column" }, React.createElement(AgentFooter, { branches: items, selected: null, onSelect: () => {} }), React.createElement(Text, {}, "> draft stays available"));
  const app = render(element(branches), { stdout, stdin, stderr: stdout, debug: true, exitOnCtrlC: false });
  try {
    await new Promise(r => setTimeout(r, 50));
    assert.match(frame, /1 aktiv · 1 warten · 1\/3 fertig/); assert.match(frame, /read · example.ts/);
    assert.doesNotMatch(frame, /old-worker|\d+%/);
    app.rerender(element(branches.map(b => ({ ...b, status: "completed" }))));
    await new Promise(r => setTimeout(r, 50));
    assert.doesNotMatch(frame, /Subagenten|inspect|review/);
    assert.match(frame, /draft stays available/);
  } finally { app.unmount(); }
});

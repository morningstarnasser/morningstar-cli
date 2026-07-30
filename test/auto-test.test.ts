import test from "node:test";
import assert from "node:assert/strict";
import {
  planAgentTestRun,
  type AutoTestPlan,
  type AutoTestPlanner,
} from "../src/auto-test.js";

const TEST_PLAN: AutoTestPlan = {
  runner: "fixture",
  executable: "fixture-test",
  args: [],
  command: "fixture-test",
};

function countingPlanner(): {
  planner: AutoTestPlanner;
  calls: () => number;
} {
  let callCount = 0;
  return {
    planner: () => {
      callCount += 1;
      return TEST_PLAN;
    },
    calls: () => callCount,
  };
}

test("agent without bash cannot plan an implicit auto-test", () => {
  const fixture = countingPlanner();

  const plan = planAgentTestRun(
    "/workspace",
    "test/example.test.ts",
    ["write"],
    fixture.planner,
  );

  assert.equal(plan, null);
  assert.equal(fixture.calls(), 0);
});

test("agent with bash can plan an implicit auto-test", () => {
  const fixture = countingPlanner();

  const plan = planAgentTestRun(
    "/workspace",
    undefined,
    ["write", "BASH"],
    fixture.planner,
  );

  assert.equal(plan, TEST_PLAN);
  assert.equal(fixture.calls(), 1);
});

test("omitted and empty allowlists preserve unrestricted runner semantics", () => {
  for (const toolAllowlist of [undefined, []] as const) {
    const fixture = countingPlanner();

    assert.equal(
      planAgentTestRun(
        "/workspace",
        undefined,
        toolAllowlist,
        fixture.planner,
      ),
      TEST_PLAN,
    );
    assert.equal(fixture.calls(), 1);
  }
});
